"""The merge path — the code that had ZERO coverage until it failed in production seven times.

`run_cycle` returns at the `dry_run` branch before `merge_fn` is called, and every other test
passes a stub lambda for it. So `site_merger`, `_git`, `_gh` and `open_and_merge_pr` had never
executed outside the live cadence. These tests execute them against a fake subprocess layer, so
the SEQUENCE and the ERROR HANDLING are covered here; whether the real token may perform those
operations is what `tools/preflight-merge-path.py` proves, because only a real call can.

Run: python3 tests/test_merge_path.py
"""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import run_autopilot as ra                        # noqa: E402


class FakeRun:
    """Stands in for subprocess.run. Records argv, replays scripted results."""

    def __init__(self, script=None):
        self.calls, self.script = [], script or {}

    def __call__(self, cmd, **kwargs):
        self.calls.append(list(cmd))
        key = " ".join(cmd[:3])
        # ONE handler per command. An earlier version ran the exact match AND every prefix
        # match, so a scripted side effect (a merge, a counter) fired twice for one command and
        # the test saw a sequence the code never produced.
        result = self.script.get(key)
        if result is None:
            for match, scripted in self.script.items():
                if " ".join(cmd).startswith(match):
                    result = scripted
        rc, out, err = (result(cmd) if callable(result) else result) if result else (0, "", "")
        return subprocess.CompletedProcess(cmd, rc, out, err)

    def argv(self, prefix):
        return [c for c in self.calls if " ".join(c).startswith(prefix)]


# Captured BEFORE anything patches it. `_restore` used to read `subprocess.run` at restore
# time — but `ra.subprocess` IS this module's `subprocess`, so by then the name already held
# the fake and "restoring" assigned the fake onto itself. Every patching test in this file had
# been leaking its fake into the next one since the file was written. It went unnoticed while
# no test needed real git; the first two that did failed with a missing row on main, which
# reads exactly like the production bug they exist to catch.
_REAL_RUN = subprocess.run


def _patch(fake):
    ra.subprocess.run = fake


class FakeRepo:
    """Point `ra.REPO` at a throwaway tree holding a ledger, and model MAIN separately.

    `ledger_committer` writes the ledger file for real — only the git calls are faked — so
    without this the tests append junk rows to the REPOSITORY'S OWN ledger. They did, on the
    first run: three rows for `https://s/a/`, `/b/` and `/c/` landed in the file the duplicate
    gate reads. Same mistake as the test that once edited `site/`, and worse here, because junk
    in the ledger can block a real post.

    THE WORKING TREE AND MAIN ARE TWO DIFFERENT WORLDS, and this models them as two, because
    conflating them is the whole of the defect being fixed. `main_rows` is what `git show
    origin/main:<path>` returns; `rows()` is what is on disk. A merge is what moves one into the
    other, and until `gh pr merge` runs they are allowed to disagree — which is exactly the
    state a real cycle is in when the committer starts.
    """

    LEDGER = "autoposter/data/published-posts.json"
    STATE = "autoposter/data/autopilot-state.json"
    LEDGER_REF = f"git show origin/main:{LEDGER}"
    STATE_REF = f"git show origin/main:{STATE}"

    def __init__(self, entries=None, main=None, state=None):
        self.root = Path(tempfile.mkdtemp())
        self.ledger = self.root / self.LEDGER
        self.ledger.parent.mkdir(parents=True)
        self.ledger.write_text(json.dumps(entries or []))
        # Default: main agrees with the tree. Pass `main=` to make them differ.
        self.main_files = {self.LEDGER: list(entries or []) if main is None else list(main),
                           self.STATE: dict(state or {})}
        self.merged = 0

    @property
    def main_rows(self):
        return self.main_files[self.LEDGER]

    @main_rows.setter
    def main_rows(self, value):
        self.main_files[self.LEDGER] = value

    def script(self, extra=None):
        """The git/gh answers that make this fake behave like a repo with a real main."""
        def show(cmd):
            return (0, json.dumps(self.main_files[cmd[2].split(":", 1)[1]]), "")

        def merge(cmd):
            # A merge is what makes the branch's content main's content — for every file the
            # branch actually touched, and only those.
            self.merged += 1
            for relative in self.main_files:
                path = self.root / relative
                if path.exists():
                    self.main_files[relative] = json.loads(path.read_text())
            return (0, "", "")

        base = {self.LEDGER_REF: show,
                self.STATE_REF: show,
                "gh pr view": (0, "MERGEABLE", ""),
                "gh pr create": (0, "https://github.com/o/r/pull/1", ""),
                "gh pr merge": merge}
        base.update(extra or {})
        return base

    def __enter__(self):
        self._real, ra.REPO = ra.REPO, self.root
        return self

    def __exit__(self, *exc):
        ra.REPO = self._real
        return False

    def rows(self):
        return json.loads(self.ledger.read_text())


def _restore():
    ra.subprocess.run = _REAL_RUN


# ===================================================== C: the error must say what went wrong

def test_a_failed_command_carries_the_tools_OWN_words():
    """THE REGRESSION. The old helper raised CalledProcessError, whose message is only
    'returned non-zero exit status 1' — git's explanation was captured and discarded, so seven
    days of red runs said nothing useful anywhere."""
    _patch(FakeRun({"git push": (1, "", "! [rejected] main -> main (non-fast-forward)")}))
    try:
        ra._git("push", "-u", "origin", "some-branch")
        assert False, "the failing push should have raised"
    except ra.CommandFailed as exc:
        assert "non-fast-forward" in str(exc), str(exc)
        assert "exited 1" in str(exc)
    finally:
        _restore()


def test_the_gh_policy_refusal_is_readable_in_the_exception():
    """The actual production failure, as GitHub worded it. It must survive into the message a
    human reads, because that sentence names the fix."""
    refusal = ("pull request create failed: GraphQL: GitHub Actions is not permitted to "
               "create or approve pull requests (createPullRequest)")
    _patch(FakeRun({"gh pr create": (1, "", refusal)}))
    try:
        ra._gh("pr", "create", "--base", "main")
        assert False, "the refused PR create should have raised"
    except ra.CommandFailed as exc:
        assert "not permitted to create or approve pull requests" in str(exc)
    finally:
        _restore()


def test_stdout_is_used_when_a_tool_writes_its_error_there_instead():
    _patch(FakeRun({"git push": (128, "everything I know is on stdout", "")}))
    try:
        ra._git("push")
        assert False
    except ra.CommandFailed as exc:
        assert "everything I know is on stdout" in str(exc)
    finally:
        _restore()


def test_a_command_that_fails_SILENTLY_still_names_itself():
    _patch(FakeRun({"git push": (1, "", "")}))
    try:
        ra._git("push", "-u", "origin", "b")
        assert False
    except ra.CommandFailed as exc:
        assert "git push -u origin b" in str(exc) and "no output" in str(exc)
    finally:
        _restore()


# ===================================================== B: a retry cannot meet its own leftover

def test_the_branch_name_is_unique_per_run():
    """The collision that caused runs 7-12. The slug is deliberately stable across runs, so a
    branch named only after the slug is a trap the next run walks into."""
    a = ra.branch_name("some-slug", env={"GITHUB_RUN_ID": "111"})
    b = ra.branch_name("some-slug", env={"GITHUB_RUN_ID": "222"})
    assert a != b, "two runs of the same article produced the same branch name"
    assert a.startswith("autoposter/auto-some-slug-")
    assert "111" in a and "222" in b


def test_the_branch_name_is_still_unique_without_a_run_id():
    """Locally there is no GITHUB_RUN_ID. It must not silently fall back to the old colliding
    shape — that would reintroduce the bug on exactly the surface used to reproduce it."""
    name = ra.branch_name("some-slug", env={})
    assert name != "autoposter/auto-some-slug"
    assert name.startswith("autoposter/auto-some-slug-") and len(name) > len("autoposter/auto-some-slug-")


def test_the_merge_NEVER_force_pushes_or_rewrites_history():
    """Uniqueness is the fix; force is not. A bot that force-pushes is one bad slug away from
    destroying something a human cared about."""
    fake = FakeRun({"gh pr view": (0, "MERGEABLE", ""),
                    "gh pr create": (0, "https://github.com/o/r/pull/1", "")})
    _patch(fake)
    try:
        ra.site_merger()(_decision())
        flat = [" ".join(c) for c in fake.calls]
        assert not any("--force" in c or "-f " in c for c in flat), flat
        assert not any("reset --hard" in c or "rebase" in c for c in flat), flat
    finally:
        _restore()


# ===================================================== the auto-merge: no human in the loop

class _Article(dict):
    pass


def _decision():
    class D:
        article = {"slug": "a-slug", "title": "A Title",
                   "canonical_url": "https://texashomeintelligence.com/analysis/a-slug/"}
        pr_url = ""
    return D()


def test_the_cycle_opens_the_pr_AND_merges_it_in_the_same_call():
    """The owner's requirement, asserted rather than described: nothing waits on a person."""
    fake = FakeRun({"gh pr view": (0, "MERGEABLE", ""),
                    "gh pr create": (0, "https://github.com/o/r/pull/7", "")})
    _patch(fake)
    try:
        decision = _decision()
        ra.site_merger()(decision)
        order = [" ".join(c[:3]) for c in fake.calls]
        assert "gh pr create" in order, order
        assert "gh pr merge" in order, order
        assert order.index("gh pr create") < order.index("gh pr merge")
        assert decision.pr_url == "https://github.com/o/r/pull/7"
        merge = fake.argv("gh pr merge")[0]
        assert "--merge" in merge and "--delete-branch" in merge, merge
    finally:
        _restore()


def test_nothing_in_the_merge_path_asks_for_a_review_or_an_approval():
    """A guard against a future 'helpful' change that adds a reviewer and quietly reintroduces
    a human step into a flow the owner requires to be hands-off."""
    fake = FakeRun({"gh pr view": (0, "MERGEABLE", ""),
                    "gh pr create": (0, "https://github.com/o/r/pull/7", "")})
    _patch(fake)
    try:
        ra.site_merger()(_decision())
        flat = " ".join(" ".join(c) for c in fake.calls)
        for forbidden in ("--reviewer", "--draft", "--auto", "pr ready", "pr review"):
            assert forbidden not in flat, f"{forbidden!r} puts a human back in the loop: {flat}"
    finally:
        _restore()


def test_an_UNKNOWN_mergeability_is_waited_out_not_escalated():
    """Straight after creation GitHub reports UNKNOWN while it computes. That is a race, not an
    approval, so it is polled — but it must still converge rather than loop forever."""
    states = iter(["UNKNOWN", "UNKNOWN", "MERGEABLE"])

    class Polling(FakeRun):
        def __call__(self, cmd, **kwargs):
            if " ".join(cmd[:3]) == "gh pr view":
                self.calls.append(list(cmd))
                return subprocess.CompletedProcess(cmd, 0, next(states), "")
            return super().__call__(cmd, **kwargs)

    fake = Polling({"gh pr create": (0, "https://github.com/o/r/pull/9", "")})
    _patch(fake)
    sleeps = []
    real_sleep, ra.time.sleep = ra.time.sleep, sleeps.append
    try:
        ra.open_and_merge_pr("b", title="t")
        assert len(fake.argv("gh pr view")) == 3
        assert fake.argv("gh pr merge"), "it polled but never merged"
        assert sleeps, "it should have waited between polls"
    finally:
        ra.time.sleep = real_sleep
        _restore()


def test_a_CONFLICTING_pr_halts_instead_of_being_forced_through():
    fake = FakeRun({"gh pr view": (0, "CONFLICTING", ""),
                    "gh pr create": (0, "https://github.com/o/r/pull/9", "")})
    _patch(fake)
    try:
        ra.open_and_merge_pr("b", title="t")
        assert False, "a conflicting PR must not be merged"
    except ra.CommandFailed as exc:
        assert "conflicts with main" in str(exc)
        assert not fake.argv("gh pr merge"), "it merged a conflicting PR"
    finally:
        _restore()


def test_a_refused_pr_create_never_reaches_the_merge():
    """The production failure, replayed through the real function: if the PR cannot be created,
    nothing must pretend it was merged."""
    fake = FakeRun({"gh pr create": (1, "", "GitHub Actions is not permitted to create or "
                                            "approve pull requests")})
    _patch(fake)
    try:
        ra.open_and_merge_pr("b", title="t")
        assert False
    except ra.CommandFailed:
        assert not fake.argv("gh pr merge")
    finally:
        _restore()



# ===================================================== the ledger commit uses the proven path

NO_SLEEP = lambda *_: None

# The committer now lands the ledger row AND the cadence clock. These tests are about the
# ledger, so they pass an empty state — the shape a PROMOTION produces, which moves no clock.
NO_STATE = {}


def test_the_ledger_commit_branches_from_FRESH_main_not_the_stale_checkout():
    """The runner's checkout can be minutes old by the time a post lands. Committing the whole
    file from it would silently drop any row added in between."""
    try:
      with FakeRepo() as repo:
        fake = FakeRun(repo.script()); _patch(fake)
        ra.ledger_committer(NO_SLEEP)({"article_slug": "x", "article_url": "https://s/a/",
                                       "platform": "facebook"}, NO_STATE)
        order = [" ".join(c[:4]) for c in fake.calls]
        assert "git fetch origin main" in order, order
        checkout = fake.argv("git checkout")[0]
        assert "origin/main" in checkout, checkout
        assert order.index("git fetch origin main") < order.index(" ".join(checkout[:4]))
    finally:
        _restore()


def test_the_ledger_commit_uses_the_same_push_and_merge_path_as_the_article():
    """Same operation class that took a week to get working, so it must not grow a second
    implementation with its own bugs."""
    try:
      with FakeRepo() as repo:
        fake = FakeRun(repo.script({"gh pr create": (0, "https://github.com/o/r/pull/4", "")}))
        _patch(fake)
        url = ra.ledger_committer(NO_SLEEP)({"article_slug": "x", "article_url": "https://s/b/",
                                             "platform": "facebook"}, NO_STATE)
        assert url == "https://github.com/o/r/pull/4"
        merge = fake.argv("gh pr merge")[0]
        assert "--merge" in merge and "--delete-branch" in merge
        flat = " ".join(" ".join(c) for c in fake.calls)
        assert "--force" not in flat and "reset --hard" not in flat
    finally:
        _restore()


def test_a_PUSH_FAILURE_on_the_ledger_commit_RAISES_rather_than_being_swallowed():
    """It must reach run_cycle so the cycle can report posted_unconfirmed. A swallowed push
    failure here recreates the exact duplicate risk this commit exists to remove."""
    try:
      with FakeRepo() as repo:
        _patch(FakeRun(repo.script({"git push": (1, "", "! [remote rejected] main (protected branch)")})))
        ra.ledger_committer(NO_SLEEP)({"article_slug": "x", "article_url": "https://s/c/",
                                       "platform": "facebook"}, NO_STATE)
        assert False, "a failed ledger push was swallowed"
    except ra.CommandFailed as exc:
        assert "remote rejected" in str(exc)
    finally:
        _restore()


def test_an_ALREADY_RECORDED_row_is_not_committed_twice():
    """A retry must not make the ledger claim the link was posted twice."""
    existing = {"article_slug": "already", "platform": "facebook",
                "article_url": "https://texashomeintelligence.com/analysis/already/"}
    try:
        with FakeRepo([existing]) as repo:
            fake = FakeRun(repo.script()); _patch(fake)
            url = ra.ledger_committer(NO_SLEEP)(dict(existing, article_slug="retry"), NO_STATE)
            assert url == "", "it opened a PR for a row the ledger already carries"
            assert not fake.argv("git commit"), "it committed a duplicate row"
            assert len(repo.main_rows) == 1, "main grew a second row for the same link"
    finally:
        _restore()


def test_a_NEW_row_is_appended_without_disturbing_the_existing_ones():
    existing = {"article_slug": "first", "platform": "facebook",
                "article_url": "https://texashomeintelligence.com/analysis/first/"}
    try:
        with FakeRepo([existing]) as repo:
            _patch(FakeRun(repo.script()))
            ra.ledger_committer(NO_SLEEP)({"article_slug": "second", "platform": "facebook",
                                           "article_url": "https://texashomeintelligence.com/analysis/second/"}, NO_STATE)
            rows = repo.main_rows
            assert len(rows) == 2 and rows[0] == existing
            assert rows[1]["article_slug"] == "second"
    finally:
        _restore()


# ============================================ the dedupe reads MAIN, never the working tree

def test_the_dedupe_IGNORES_the_row_this_cycle_wrote_into_the_working_tree():
    """THE REGRESSION, in the fake world. `publish_with_verification` appends the row to the
    checkout before the committer runs, so by the time the dedupe looks, the working tree
    ALWAYS already contains it. Reading the tree meant every row matched itself, printed
    "already recorded; nothing to commit", and returned green with nothing on main. Post #3
    went out that way and stayed an orphan, primed to be posted a second time."""
    record = {"article_slug": "sa", "platform": "facebook",
              "article_url": "https://texashomeintelligence.com/analysis/sa/"}
    try:
        # The tree carries the row (publish wrote it). Main does not. Only main may decide.
        with FakeRepo([record], main=[]) as repo:
            fake = FakeRun(repo.script()); _patch(fake)
            url = ra.ledger_committer(NO_SLEEP)(dict(record), NO_STATE)
            assert fake.argv("git commit"), "it read the working tree and committed NOTHING"
            assert url, "no PR was opened for a row that is not on main"
            assert len(repo.main_rows) == 1, f"the row never reached main: {repo.main_rows}"
    finally:
        _restore()


def test_the_commit_is_written_from_MAINS_content_not_the_dirty_trees():
    """The tree's copy is whatever this cycle left behind — possibly a row main already has,
    possibly stale. Committing it whole would duplicate or drop rows. The commit must be main
    plus exactly one row."""
    on_main = {"article_slug": "kept", "platform": "facebook",
               "article_url": "https://texashomeintelligence.com/analysis/kept/"}
    record = {"article_slug": "new", "platform": "facebook",
              "article_url": "https://texashomeintelligence.com/analysis/new/"}
    try:
        # A dirty tree that has LOST main's row and gained the new one — the shape a cycle
        # working from a stale checkout produces.
        with FakeRepo([record], main=[on_main]) as repo:
            _patch(FakeRun(repo.script()))
            ra.ledger_committer(NO_SLEEP)(dict(record), NO_STATE)
            slugs = [r["article_slug"] for r in repo.main_rows]
            assert slugs == ["kept", "new"], f"main's own row was dropped: {slugs}"
    finally:
        _restore()


def test_an_UNREADABLE_main_ledger_RAISES_rather_than_reading_as_empty():
    """Empty means "nothing is recorded", and nothing recorded is permission to post. A git
    failure that is not "the file is not there yet" must never be flattened into that."""
    record = {"article_slug": "x", "platform": "facebook", "article_url": "https://s/x/"}
    try:
        with FakeRepo() as repo:
            _patch(FakeRun(repo.script({FakeRepo.LEDGER_REF: (128, "", "fatal: bad object")})))
            ra.ledger_committer(NO_SLEEP)(record, NO_STATE)
            assert False, "an unreadable ledger was treated as an empty one"
    except ra.CommandFailed as exc:
        assert "bad object" in str(exc)
    finally:
        _restore()


def test_a_MISSING_ledger_on_main_is_a_legitimately_empty_one():
    """First post ever: the file genuinely does not exist on main yet."""
    record = {"article_slug": "first-ever", "platform": "facebook", "article_url": "https://s/1/"}
    try:
        with FakeRepo() as repo:
            repo.main_rows = []
            missing = (128, "", "fatal: path 'x' does not exist in 'origin/main'")
            calls = {"n": 0}

            def show(cmd):
                # Missing until the merge lands, then present — the real first-post sequence.
                calls["n"] += 1
                return missing if not repo.merged else (0, json.dumps(repo.main_rows), "")

            _patch(FakeRun(repo.script({FakeRepo.LEDGER_REF: show})))
            ra.ledger_committer(NO_SLEEP)(record, NO_STATE)
            assert repo.main_rows and repo.main_rows[0]["article_slug"] == "first-ever"
    finally:
        _restore()


# ======================================= success is the ROW BEING ON MAIN, and nothing else

def test_a_COMMIT_THAT_NEVER_LANDS_raises_instead_of_returning_green():
    """THE CLASS FIX. The committer ran every step without error and the row still was not on
    main. Before this, that returned success. A persistence step that cannot confirm its own
    result must not report success — its caller turns the raise into posted_unconfirmed."""
    record = {"article_slug": "lost", "platform": "facebook", "article_url": "https://s/lost/"}
    try:
        with FakeRepo() as repo:
            # Every command succeeds; the merge simply never changes main. Silent loss.
            _patch(FakeRun(repo.script({"gh pr merge": (0, "", "")})))
            ra.ledger_committer(NO_SLEEP)(record, NO_STATE)
            assert False, "a row that never reached main was reported as recorded"
    except ra.CommandFailed as exc:
        assert "IS LIVE" in str(exc) and "AGAIN" in str(exc), str(exc)
        assert "published-posts.json" in str(exc), "the raise does not name the file"
    finally:
        _restore()


def test_NOTHING_TO_COMMIT_is_confirmed_against_main_before_it_counts_as_success():
    """"Already recorded" is a claim about main, so it is checked against main. This is the
    exact sentence the broken run printed while main carried no such row."""
    record = {"article_slug": "claimed", "platform": "facebook", "article_url": "https://s/c/"}
    try:
        with FakeRepo([record], main=[]) as repo:
            # Force the no-op branch the way the bug did — the dedupe sees it, main does not.
            seen = {"n": 0}

            def show(cmd):
                seen["n"] += 1
                return (0, json.dumps([record] if seen["n"] == 1 else []), "")

            _patch(FakeRun(repo.script({FakeRepo.LEDGER_REF: show})))
            ra.ledger_committer(NO_SLEEP)(record, NO_STATE)
            assert False, "'nothing to commit' passed as success with main carrying no row"
    except ra.CommandFailed as exc:
        assert "did not reach main" in str(exc), str(exc)
    finally:
        _restore()


def test_the_confirmation_RE_FETCHES_rather_than_trusting_the_ref_it_already_had():
    """The merge lands server-side after the last fetch. Confirming against a stale ref would
    be confirming against the state that existed BEFORE the thing being confirmed."""
    record = {"article_slug": "x", "platform": "facebook", "article_url": "https://s/x/"}
    try:
        with FakeRepo() as repo:
            fake = FakeRun(repo.script()); _patch(fake)
            ra.ledger_committer(NO_SLEEP)(record, NO_STATE)
            order = [" ".join(c[:4]) for c in fake.calls]
            merge = next(i for i, c in enumerate(fake.calls) if c[:3] == ["gh", "pr", "merge"])
            after = [i for i, c in enumerate(fake.calls) if " ".join(c[:4]) == "git fetch origin main"]
            assert any(i > merge for i in after), "it never re-fetched after the merge"
    finally:
        _restore()


def test_the_confirmation_RETRIES_replication_lag_without_tolerating_a_missing_row():
    """GitHub can take a moment to serve a just-merged ref. That is lag, not a missing row, so
    it is waited out — a bounded number of times, and then it is red."""
    record = {"article_slug": "laggy", "platform": "facebook", "article_url": "https://s/l/"}
    slept = []
    try:
        with FakeRepo() as repo:
            look = {"n": 0}

            def show(cmd):
                look["n"] += 1
                # Absent for the dedupe AND the first two confirmations, then it appears.
                return (0, json.dumps(repo.main_rows if look["n"] > 3 else []), "")

            _patch(FakeRun(repo.script({FakeRepo.LEDGER_REF: show})))
            ra.ledger_committer(slept.append)(record, NO_STATE)
            assert slept, "it did not wait out the lag at all"
            assert len(slept) < ra.CONFIRM_ATTEMPTS, "it waited more times than it may"
    finally:
        _restore()


# ======================================= the CADENCE CLOCK lands on main, like the row does

def test_the_CLOCK_lands_on_main_in_the_SAME_commit_as_the_row():
    """`autopilot-state.json` has never existed on main. Every run loaded "no article recorded
    yet", so the 3-day floor never engaged once in production — observed live, a cycle offered
    a new article hours after one had been published. Both facts describe the same event, so
    landing one without the other is a state nothing else expects: one commit, both files."""
    record = {"article_slug": "x", "platform": "facebook", "article_url": "https://s/x/"}
    state = {"last_article_at": "2026-09-18", "cycles": 7}
    try:
        with FakeRepo() as repo:
            fake = FakeRun(repo.script()); _patch(fake)
            ra.bookkeeping_committer(NO_SLEEP)(record, state)
            added = " ".join(fake.argv("git add")[0])
            assert "autoposter/data/published-posts.json" in added, added
            assert "autoposter/data/autopilot-state.json" in added, added
            assert len(fake.argv("git commit")) == 1, "it made more than one commit"
    finally:
        _restore()


def test_a_CLOCK_THAT_NEVER_LANDS_is_as_red_as_a_row_that_never_lands():
    """A lost clock is not a lost statistic either: the floor stops holding and the machine
    publishes again tomorrow. Same discipline, same raise, same posted_unconfirmed."""
    record = {"article_slug": "x", "platform": "facebook", "article_url": "https://s/x/"}
    state = {"last_article_at": "2026-09-18"}
    try:
        with FakeRepo() as repo:
            def merge(cmd):
                # The row lands; the clock is silently dropped. Half a success is a failure.
                repo.merged += 1
                repo.main_rows = repo.rows()
                return (0, "", "")
            _patch(FakeRun(repo.script({"gh pr merge": merge})))
            ra.bookkeeping_committer(NO_SLEEP)(record, state)
            assert False, "a dropped clock was reported as recorded"
    except ra.CommandFailed as exc:
        assert "autopilot-state.json" in str(exc), str(exc)
        assert "published-posts.json" not in str(exc), "it blamed the file that DID land"
    finally:
        _restore()


def test_the_clock_NEVER_MOVES_BACKWARDS_when_another_run_got_there_first():
    """A floor that goes backwards lets the next article out early — the exact thing the file
    exists to prevent. If main already holds a later date, main's stands and the row still
    lands: the clock is a high-water mark, not a last-writer-wins field."""
    record = {"article_slug": "x", "platform": "facebook", "article_url": "https://s/x/"}
    try:
        with FakeRepo(state={"last_article_at": "2026-09-20"}) as repo:
            _patch(FakeRun(repo.script()))
            ra.bookkeeping_committer(NO_SLEEP)(record, {"last_article_at": "2026-09-18"})
            clock = repo.main_files[FakeRepo.STATE]["last_article_at"]
            assert clock == "2026-09-20", f"the floor was dragged backwards to {clock}"
            assert len(repo.main_rows) == 1, "the row was dropped along with the clock"
    finally:
        _restore()


def test_a_PROMOTION_lands_its_row_and_is_not_held_to_a_clock_it_never_moved():
    """Promoting an already-published article does not move the cadence floor, so it has no
    clock change to land — and must not be failed for the absence of one."""
    record = {"article_slug": "promo", "platform": "facebook", "article_url": "https://s/p/"}
    try:
        with FakeRepo() as repo:
            fake = FakeRun(repo.script()); _patch(fake)
            ra.bookkeeping_committer(NO_SLEEP)(record, {"cycles": 3})
            added = " ".join(fake.argv("git add")[0])
            assert "published-posts.json" in added
            assert "autopilot-state.json" not in added, "a promotion moved the clock"
    finally:
        _restore()


# ============================ the SAME path, against a real git repo with a DIRTY working tree

def _real_repo():
    """A genuine git repo with a bare `origin`, so `checkout -B` and `show` behave like git.

    The fake harness cannot reproduce the defect's MECHANISM: `git checkout -B <branch>
    origin/main` carrying an uncommitted file over into the new branch. Only real git does
    that, and only a dirty tree triggers it — which is why every earlier test passed while the
    first live run failed. This builds the exact condition a cycle is in when a post lands.
    """
    root = Path(tempfile.mkdtemp())
    origin, work = root / "origin.git", root / "work"
    subprocess.run(["git", "init", "--bare", "-b", "main", str(origin)], check=True,
                   capture_output=True)
    subprocess.run(["git", "clone", str(origin), str(work)], check=True, capture_output=True)
    for k, v in (("user.email", "t@t"), ("user.name", "t"), ("commit.gpgsign", "false")):
        subprocess.run(["git", "-C", str(work), "config", k, v], check=True, capture_output=True)
    return root, origin, work


def _seed_main(work, entries):
    ledger = work / "autoposter" / "data" / "published-posts.json"
    ledger.parent.mkdir(parents=True, exist_ok=True)
    ledger.write_text(json.dumps(entries, indent=2) + "\n")
    for cmd in (["add", "-A"], ["commit", "-m", "seed"], ["push", "-u", "origin", "main"]):
        subprocess.run(["git", "-C", str(work), *cmd], check=True, capture_output=True)
    return ledger


def _merge_on_origin(work, origin):
    """Stand in for `gh pr merge` with real git: the branch becomes main on the bare origin."""
    def merge(branch, *, title, body=None):
        subprocess.run(["git", "-C", str(work), "push", "origin", f"{branch}:main"],
                       check=True, capture_output=True)
        return "https://github.com/o/r/pull/9"
    return merge


def test_the_commit_lands_on_main_from_a_DIRTY_working_tree_against_REAL_git():
    """THE CONDITION THAT BROKE IT, reproduced exactly: real git, real `checkout -B`, and a
    ledger file modified-but-uncommitted the way `publish_with_verification` leaves it."""
    on_main = {"article_slug": "old", "platform": "facebook", "article_url": "https://s/old/"}
    record = {"article_slug": "sa", "platform": "facebook", "article_url": "https://s/sa/"}
    root, origin, work = _real_repo()
    ledger = _seed_main(work, [on_main])
    real_repo, real_pr = ra.REPO, ra.open_and_merge_pr
    try:
        ra.REPO, ra.open_and_merge_pr = work, _merge_on_origin(work, origin)
        # Exactly what publish leaves behind: the row appended to the tree, NOT committed.
        ledger.write_text(json.dumps([on_main, record], indent=2) + "\n")
        assert subprocess.run(["git", "-C", str(work), "status", "--porcelain"],
                              capture_output=True, text=True).stdout.strip(), "tree is not dirty"

        ra.ledger_committer(NO_SLEEP)(dict(record), NO_STATE)

        on_main_now = json.loads(subprocess.run(
            ["git", "-C", str(work), "show", "origin/main:autoposter/data/published-posts.json"],
            capture_output=True, text=True, check=True).stdout)
        slugs = [r["article_slug"] for r in on_main_now]
        assert slugs == ["old", "sa"], f"the row did not land on main: {slugs}"
    finally:
        ra.REPO, ra.open_and_merge_pr = real_repo, real_pr


def test_a_DIRTY_tree_does_not_make_the_dedupe_think_the_row_is_already_recorded():
    """THE EXACT LIVE FAILURE, against real git. The tree says recorded; main says nothing.
    Main decides. Before the fix this returned "" and committed nothing, and the run went green
    while the post stayed an orphan."""
    record = {"article_slug": "sa", "platform": "facebook", "article_url": "https://s/sa/"}
    root, origin, work = _real_repo()
    ledger = _seed_main(work, [])
    real_repo, real_pr = ra.REPO, ra.open_and_merge_pr
    try:
        ra.REPO, ra.open_and_merge_pr = work, _merge_on_origin(work, origin)
        ledger.write_text(json.dumps([record], indent=2) + "\n")   # dirty: the row, uncommitted

        ra.ledger_committer(NO_SLEEP)(dict(record), NO_STATE)

        on_main_now = json.loads(subprocess.run(
            ["git", "-C", str(work), "show", "origin/main:autoposter/data/published-posts.json"],
            capture_output=True, text=True, check=True).stdout)
        assert len(on_main_now) == 1, f"the row never reached main: {on_main_now}"
    finally:
        ra.REPO, ra.open_and_merge_pr = real_repo, real_pr


def test_REAL_git_confirmation_raises_when_the_merge_silently_does_nothing():
    """Real git, every step succeeding, and a "merge" that does not move main. Red."""
    record = {"article_slug": "lost", "platform": "facebook", "article_url": "https://s/lost/"}
    root, origin, work = _real_repo()
    ledger = _seed_main(work, [])
    real_repo, real_pr = ra.REPO, ra.open_and_merge_pr
    try:
        ra.REPO = work
        ra.open_and_merge_pr = lambda branch, *, title, body=None: "https://github.com/o/r/pull/9"
        ledger.write_text(json.dumps([record], indent=2) + "\n")
        ra.ledger_committer(NO_SLEEP)(dict(record), NO_STATE)
        assert False, "a merge that did nothing was reported as a recorded row"
    except ra.CommandFailed as exc:
        assert "IS LIVE" in str(exc) and "AGAIN" in str(exc), str(exc)
        assert "published-posts.json" in str(exc), "the raise does not name the file"
    finally:
        ra.REPO, ra.open_and_merge_pr = real_repo, real_pr


if __name__ == "__main__":
    fns = [f for n, f in sorted(globals().items()) if n.startswith("test_")]
    ok = 0
    for f in fns:
        try:
            f(); ok += 1; print("PASS", f.__name__)
        except AssertionError as e:
            print("FAIL", f.__name__, str(e)[:300])
        except Exception as e:                     # noqa: BLE001
            print("ERROR", f.__name__, f"{type(e).__name__}: {str(e)[:250]}")
    print(f"{ok}/{len(fns)} passed")
    sys.exit(0 if ok == len(fns) else 1)
