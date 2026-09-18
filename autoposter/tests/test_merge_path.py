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
        rc, out, err = self.script.get(key, (0, "", ""))
        for match, result in self.script.items():
            if " ".join(cmd).startswith(match):
                rc, out, err = result
        return subprocess.CompletedProcess(cmd, rc, out, err)

    def argv(self, prefix):
        return [c for c in self.calls if " ".join(c).startswith(prefix)]


def _patch(fake):
    ra.subprocess.run = fake


class FakeRepo:
    """Point `ra.REPO` at a throwaway tree holding a ledger.

    `ledger_committer` writes the ledger file for real — only the git calls are faked — so
    without this the tests append junk rows to the REPOSITORY'S OWN ledger. They did, on the
    first run: three rows for `https://s/a/`, `/b/` and `/c/` landed in the file the duplicate
    gate reads. Same mistake as the test that once edited `site/`, and worse here, because junk
    in the ledger can block a real post.
    """

    def __init__(self, entries=None):
        self.root = Path(tempfile.mkdtemp())
        self.ledger = self.root / "autoposter" / "data" / "published-posts.json"
        self.ledger.parent.mkdir(parents=True)
        self.ledger.write_text(json.dumps(entries or []))

    def __enter__(self):
        self._real, ra.REPO = ra.REPO, self.root
        return self

    def __exit__(self, *exc):
        ra.REPO = self._real
        return False

    def rows(self):
        return json.loads(self.ledger.read_text())


def _restore():
    ra.subprocess.run = subprocess.run


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

def test_the_ledger_commit_branches_from_FRESH_main_not_the_stale_checkout():
    """The runner's checkout can be minutes old by the time a post lands. Committing the whole
    file from it would silently drop any row added in between."""
    fake = FakeRun({"gh pr view": (0, "MERGEABLE", ""),
                    "gh pr create": (0, "https://github.com/o/r/pull/3", "")})
    _patch(fake)
    try:
      with FakeRepo():
        ra.ledger_committer()({"article_slug": "x", "article_url": "https://s/a/", "platform": "facebook"})
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
    fake = FakeRun({"gh pr view": (0, "MERGEABLE", ""),
                    "gh pr create": (0, "https://github.com/o/r/pull/4", "")})
    _patch(fake)
    try:
      with FakeRepo():
        url = ra.ledger_committer()({"article_slug": "x", "article_url": "https://s/b/",
                                     "platform": "facebook"})
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
    fake = FakeRun({"git push": (1, "", "! [remote rejected] main (protected branch)")})
    _patch(fake)
    try:
      with FakeRepo():
        ra.ledger_committer()({"article_slug": "x", "article_url": "https://s/c/", "platform": "facebook"})
        assert False, "a failed ledger push was swallowed"
    except ra.CommandFailed as exc:
        assert "remote rejected" in str(exc)
    finally:
        _restore()


def test_an_ALREADY_RECORDED_row_is_not_committed_twice():
    """A retry must not make the ledger claim the link was posted twice."""
    fake = FakeRun({"gh pr view": (0, "MERGEABLE", ""),
                    "gh pr create": (0, "https://github.com/o/r/pull/5", "")})
    _patch(fake)
    existing = {"article_slug": "already", "platform": "facebook",
                "article_url": "https://texashomeintelligence.com/analysis/already/"}
    try:
        with FakeRepo([existing]) as repo:
            url = ra.ledger_committer()(dict(existing, article_slug="retry"))
            assert url == "", "it opened a PR for a row the ledger already carries"
            assert not fake.argv("git commit"), "it committed a duplicate row"
            assert len(repo.rows()) == 1, "the ledger grew a second row for the same link"
    finally:
        _restore()


def test_a_NEW_row_is_appended_without_disturbing_the_existing_ones():
    fake = FakeRun({"gh pr view": (0, "MERGEABLE", ""),
                    "gh pr create": (0, "https://github.com/o/r/pull/6", "")})
    _patch(fake)
    existing = {"article_slug": "first", "platform": "facebook",
                "article_url": "https://texashomeintelligence.com/analysis/first/"}
    try:
        with FakeRepo([existing]) as repo:
            ra.ledger_committer()({"article_slug": "second", "platform": "facebook",
                                   "article_url": "https://texashomeintelligence.com/analysis/second/"})
            rows = repo.rows()
            assert len(rows) == 2 and rows[0] == existing
            assert rows[1]["article_slug"] == "second"
    finally:
        _restore()


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
