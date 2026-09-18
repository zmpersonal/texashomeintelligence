"""
run_autopilot.py — the entrypoint the scheduled workflow calls. Wires real IO to the driver.

`autopilot.py` holds the decision logic and takes every side effect as an injected function, so
it can be proven without touching GitHub, Cloudflare, Facebook or Slack. This file is the other
half: the real implementations, and nothing else. Keep decisions out of here.

FAIL CLOSED IS THE DEFAULT EVERYWHERE BELOW. Every function in this file either does the thing
or raises with a reason. None of them returns a shrug, because the driver treats a raise as a
gate failure and a shrug as nothing at all.

⚠️ THE POSTING PATH IS AN OWNER SEAM (see HANDOFF.md).
config.yaml has recorded since Phase 0 that the runner is a Claude Code session *because MCP
tools are session-only* (decision A). A GitHub Actions cron cannot call the Blotato MCP tool.
So `blotato_publisher` speaks to Blotato's HTTP API with `BLOTATO_API_KEY`, and without that
secret it RAISES — the cycle then skips and notifies, which is the correct outcome for "I cannot
post" and is much better than a run that silently believes it posted.
"""

from __future__ import annotations

import copy
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import article_engine as engine          # noqa: E402
import autopilot                         # noqa: E402
import run_article                       # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
TIMEOUT = 15

# How long to wait for GitHub to compute a fresh PR's mergeability. Seconds, not minutes: this
# is a server-side race, and anything longer than this is a real problem, not a slow answer.
MERGE_ATTEMPTS = 10
MERGE_POLL_SECONDS = 3
PR_BODY = ("Opened and merged automatically by the THI autoposter after a clean gate sweep.\n\n"
           "This PR is the audit record of what the machine published and when. It is not "
           "waiting on a review — it is merged by the same cycle that opened it.")


# --------------------------------------------------------------------------- Slack

def slack_notifier(webhook: str | None):
    """Post the notice. A notice that cannot be delivered is LOUD, not swallowed.

    If Slack is unreachable the run fails visibly rather than publishing into silence — the
    whole point of full auto being observable is that the observation actually arrives.
    """
    def notify(message: str) -> None:
        if not message:
            return
        if not webhook:
            print("[notice, no webhook configured]\n" + message)
            return
        body = json.dumps({"text": message}).encode()
        request = urllib.request.Request(
            webhook, data=body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            if response.status >= 300:
                raise RuntimeError(f"Slack returned HTTP {response.status}")
        print("[notified]\n" + message)
    return notify


# --------------------------------------------------------------------------- resolution

def http_opener(url: str) -> tuple[bool, str]:
    """A real HEAD from the runner. Actions can reach the live domain; this session cannot,
    which is exactly why the cycle belongs on a runner (LEARNINGS L13)."""
    try:
        request = urllib.request.Request(url, method="HEAD",
                                         headers={"User-Agent": "THI-autoposter"})
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            code = response.status
            return (200 <= code < 400), f"resolved {code}"
    except urllib.error.HTTPError as exc:
        return False, f"HTTP {exc.code}"
    except Exception as exc:                        # noqa: BLE001
        return False, f"unreachable: {type(exc).__name__}: {exc}"


# One success is not a deploy. Cloudflare serves from many edges and they do not flip together,
# so the first 200 can be followed seconds later by a 404 from a node that has not caught up.
# That is not a hypothesis: on 2026-09-18 this returned after ~60s, the post-deploy check 404'd
# four seconds later, and the URL resolved 90 seconds after that. An earlier run took the same
# path in 75s and passed. Same code, same timing, opposite result — a race, not a defect.
DEPLOY_STABLE_HITS = 2


def wait_for_deploy(url: str, *, attempts: int = 30, delay: int = 20,
                    stable: int = DEPLOY_STABLE_HITS) -> None:
    """Block until the article is actually served, CONSISTENTLY. Raises if it never appears.

    Requires `stable` consecutive successes, because a single one only proves that one edge has
    the new build. The streak resets on any failure, so a flapping URL is treated as not ready
    rather than as ready-with-a-blip.

    Every poll is logged with what it SAW. The previous version discarded the reason
    (`ok, _reason = ...`), so when it returned too early there was no way to tell what it had
    been looking at — the third swallowed-diagnostics gap in this project, after git's stderr
    and the notifier's.
    """
    streak = 0
    for attempt in range(1, attempts + 1):
        ok, reason = http_opener(url)
        streak = streak + 1 if ok else 0
        print(f"[deploy] {attempt}/{attempts} {url} — {reason}"
              f"{f' (streak {streak}/{stable})' if ok else ''}", flush=True)
        if streak >= stable:
            return
        if attempt < attempts:
            time.sleep(delay)
    raise RuntimeError(f"{url} never resolved {stable}x consecutively within "
                       f"{attempts * delay}s of the merge")


# --------------------------------------------------------------------------- the site write

class CommandFailed(RuntimeError):
    """A subprocess that failed, carrying WHAT IT SAID. Not just its exit status.

    This class exists because of a week of red runs. `_git` used to raise the bare
    `CalledProcessError`, whose message is only "returned non-zero exit status 1" — git's actual
    words were captured and thrown away. The halt notice, the job log and the Slack message all
    said exit status 1, and the real reason (a non-fast-forward rejection) was unreadable from
    any of them. An error that cannot say why is an error you debug by guessing.
    """


def _run(cmd: list[str], *, cwd: Path | None = None) -> str:
    """Run a command, return stdout, and on failure raise with the tool's OWN message.

    stderr is captured rather than inherited so it can be put INTO the exception — which means
    it reaches the halt notice and Slack, not just the job log. Both matter: the log is where a
    human looks, the notice is what wakes them up.
    """
    result = subprocess.run(cmd, cwd=cwd or REPO, capture_output=True, text=True)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip().replace("\n", " ⏎ ")
        raise CommandFailed(f"`{' '.join(cmd)}` exited {result.returncode}: "
                            f"{detail[:600] or '(no output)'}")
    return result.stdout.strip()


def _git(*args: str) -> str:
    return _run(["git", *args])


def _gh(*args: str) -> str:
    return _run(["gh", *args])


def branch_name(slug: str, env: dict | None = None) -> str:
    """A branch name unique to THIS RUN, so a retry can never meet its own leftover.

    The old name was `autoposter/auto-<slug>` — stable across runs. When a cycle pushed that
    branch and then failed at the next step, every later cycle rebuilt the same article from a
    main that had moved on, and pushed a history whose parent was no longer the remote tip: a
    non-fast-forward, rejected, daily, forever. The slug is stable by design (a recurring builder
    picks the same period until the data gains a month), so the collision was with ITSELF.

    Fixed structurally rather than with `--force`: a unique suffix means there is nothing to
    collide with, no history is ever rewritten, and a failed attempt leaves a branch that is
    obviously one attempt rather than a booby trap for the next one.
    """
    env = os.environ if env is None else env
    stamp = (env.get("GITHUB_RUN_ID")
             or datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S"))
    return f"autoposter/auto-{slug}-{stamp}"


# The three directories the renderer writes into, and the only three a dry run restores.
CARD_DIRS = ("site/src/data/analysis", "site/src/data/og-cards", "site/public/images/og")


def site_renderer():
    """Draw the article and its card into the WORKING TREE. No commit, no push, no deploy.

    This runs BEFORE the gate sweep, not at merge time, because the card gate (C5) and the media
    gate both read the rendered sidecar. Rendering late meant a first-time article could never
    clear its own gates — the cycle skipped every day with "no rendered card". Fail-closed, but
    a machine that cannot publish anything is not a machine.

    The card comes from the SITE's own generator, the same one a human runs. If it refuses —
    overflow, a font that will not decode — this raises, the card gate fails, and the cycle
    skips. That is the intended path, not an accident.
    """
    def render(article) -> None:
        slug = article["slug"]
        analysis = REPO / "site" / "src" / "data" / "analysis" / f"{slug}.md"
        analysis.parent.mkdir(parents=True, exist_ok=True)
        analysis.write_text(article["frontmatter"] + "\n" + article["body"])
        subprocess.run(["npm", "run", "og-cards"], cwd=REPO / "site", check=True)
    return render


def restore_card_dirs() -> None:
    """Put the three card directories back exactly as checked out. Used after a DRY RUN.

    Scoped to those three paths and nothing else: a dry run must not be able to delete a file it
    did not create. Tracked changes are checked out; untracked files are removed. Failures here
    are reported and swallowed — a tidy-up that cannot tidy must not turn a clean dry run red.
    """
    for directory in CARD_DIRS:
        if not (REPO / directory).exists():
            continue
        for args in (["checkout", "--", directory], ["clean", "-fd", "--", directory]):
            result = subprocess.run(["git", *args], cwd=REPO, capture_output=True, text=True)
            if result.returncode != 0:
                print(f"[warn] could not restore {directory}: {result.stderr.strip()}")


def site_merger():
    """Commit the ALREADY-RENDERED article + card, open a PR, merge it. THE AUTO-MERGE.

    It merges something that has already passed every gate — the driver does not call this until
    the sweep is clean. It never skips a check to proceed. The files it commits are the exact
    ones the gates just judged, because `site_renderer` wrote them before the sweep and nothing
    has touched them since.

    The PR is created even though it is merged immediately: it is the audit record of what the
    machine published and when, and it costs nothing.
    """
    def merge(decision) -> None:
        article = decision.article
        slug = article["slug"]
        branch = branch_name(slug)
        _git("checkout", "-B", branch)
        _git("add", f"site/src/data/analysis/{slug}.md",
             f"site/src/data/og-cards/{slug}.json", f"site/public/images/og/{slug}.png")
        _git("commit", "-m", f"site: {article['title']}\n\nPublished by the THI autoposter "
                             f"after a clean gate sweep.")
        _git("push", "-u", "origin", branch)
        decision.pr_url = open_and_merge_pr(branch, title=f"site: {article['title']}")
    return merge


def open_and_merge_pr(branch: str, *, title: str, body: str | None = None) -> str:
    """Open the PR, then merge it. NO HUMAN STEP, by construction.

    The PR is the audit record — it exists so there is a reviewable trail of what the machine
    published and when. It is never waiting on anybody: `gh pr merge` runs in the same function,
    seconds later, in the same cycle.

    The one wait is GitHub's own. Straight after creation a PR's mergeability is UNKNOWN while
    the server computes it, and `gh pr merge` refuses an unknown state. That is a race, not an
    approval, so it is polled briefly rather than escalated to a person.
    """
    url = _gh("pr", "create", "--base", "main", "--head", branch,
              "--title", title, "--body", body or PR_BODY)
    for attempt in range(MERGE_ATTEMPTS):
        state = _gh("pr", "view", branch, "--json", "mergeable", "--jq", ".mergeable")
        if state == "MERGEABLE":
            break
        if state == "CONFLICTING":
            raise CommandFailed(f"{url} conflicts with main and cannot be auto-merged")
        time.sleep(MERGE_POLL_SECONDS)             # UNKNOWN: still being computed
    _gh("pr", "merge", branch, "--merge", "--delete-branch")
    return url


LEDGER_RELATIVE = "autoposter/data/published-posts.json"
STATE_RELATIVE = "autoposter/data/autopilot-state.json"
CONFIRM_ATTEMPTS = 5
CONFIRM_DELAY = 3


@dataclass
class MainFile:
    """One file this cycle needs to leave behind ON MAIN, and how to tell that it got there.

    `build` receives the value currently on main and returns the value that should replace it.
    `present` receives a value read back from main and answers the only question that matters:
    is the change there? Success is defined by `present`, never by the commit having run.
    """
    relative: str
    default: object
    build: object
    present: object


def _json_on_main(relative: str, default: object) -> object:
    """A file AS IT IS ON MAIN — read from the ref, never from the working tree.

    THE REGRESSION THIS EXISTS FOR. `publish_with_verification` appends the new row to the
    CHECKOUT's copy of the ledger before the commit step runs, and `git checkout -B <branch>
    origin/main` does not discard an uncommitted change — so the row rode along into the new
    branch. The dedupe read the file, found the row it had just written ITSELF, and reported
    "already recorded; nothing to commit": green, with nothing on main. The post stayed
    unrecorded and looked like a never-promoted orphan, primed to go out a second time.

    The working tree is dirty by construction on every cycle: the renderer writes into `site/`
    and the article writer into `autoposter/articles/`, both tracked paths. So this is not an
    edge case to guard, it is the normal state. Reading from the ref removes it entirely.

    A git failure that is not "the file is not on main yet" is re-raised. An unknown file must
    never read as an empty one, because empty means "nothing is recorded" and that is
    permission to post.
    """
    try:
        raw = _git("show", f"origin/main:{relative}")
    except CommandFailed as exc:
        if "does not exist" in str(exc) or "exists on disk" in str(exc):
            return copy.deepcopy(default)          # genuinely not on main yet
        raise
    return json.loads(raw) if raw.strip() else copy.deepcopy(default)


def _confirm_on_main(files: list, sleep_fn=time.sleep) -> None:
    """Every file's change is ON MAIN, or this RAISES. Nothing else counts as success.

    THE CLASS FIX, and the one that matters more than any single bug it catches. Every earlier
    version defined success as "the code path completed without an exception". That is what let
    the committer return green while the post it was recording stayed unrecorded and
    re-postable — the one failure mode that defeats a hands-off machine, because every other
    failure this thing has had was loud and that one was silent.

    So the check is on the OUTCOME, and it runs on every path: the one that commits, and the
    one that decides there is nothing to commit. "Nothing to commit" is a claim about main, so
    it is checked against main.

    The retries absorb GitHub's replication lag between `pr merge` returning and the ref being
    fetchable — not a missing change. When they are spent this raises into `run_cycle`, which
    reports `posted_unconfirmed`: red, clock unmoved, and a notice saying the post is live,
    unrecorded, and will be re-posted unless a human reconciles.
    """
    missing: list = []
    for attempt in range(CONFIRM_ATTEMPTS):
        if attempt:
            sleep_fn(CONFIRM_DELAY)
        _git("fetch", "origin", "main")
        missing = [f for f in files if not f.present(_json_on_main(f.relative, f.default))]
        if not missing:
            print(f"[main] confirmed on main: {', '.join(f.relative for f in files)}")
            return
    raise CommandFailed(
        f"the post IS LIVE but {', '.join(f.relative for f in missing)} did not reach main "
        f"after {CONFIRM_ATTEMPTS} checks. The orphan finder and the cadence floor both read "
        f"main, so this article can be published or posted AGAIN.")


def commit_to_main(files: list, *, slug: str, kind: str, sleep_fn=time.sleep) -> str:
    """Put every file's change on main in ONE commit, then prove all of them landed.

    ONE implementation, deliberately. The ledger row and the cadence clock are the same
    operation — "a fact this cycle learned, which has to outlive the container" — and giving
    them separate implementations is how the second one ends up missing the lesson the first
    one paid for. The next piece of durable state adds a `MainFile`, not a code path.

    One commit rather than one per file: the row and the clock describe the same event, so
    landing one without the other is a state nothing else in the system expects.
    """
    _git("fetch", "origin", "main")
    current = {f.relative: _json_on_main(f.relative, f.default) for f in files}
    pending = [f for f in files if not f.present(current[f.relative])]

    url = ""
    if not pending:
        # Already on main — a retry, or a row that landed from another run. Re-committing would
        # make the ledger lie about how many times this was posted. A legitimate no-op, and NOT
        # the end of the story: the confirmation below still runs on every file.
        print(f"[main] already on main; nothing to commit for {slug}")
    else:
        branch = f"autoposter/{kind}-{slug}-{os.environ.get('GITHUB_RUN_ID', 'local')}"
        _git("checkout", "-B", branch, "origin/main")
        for f in pending:
            path = REPO / f.relative
            path.parent.mkdir(parents=True, exist_ok=True)
            # Built from MAIN's value, never the working tree's — see `_json_on_main`. The
            # checkout above carries the dirty copy over; this overwrites it, so the commit's
            # diff is exactly the change this cycle intends.
            path.write_text(json.dumps(f.build(current[f.relative]), indent=2,
                                       ensure_ascii=False) + "\n")
        _git("add", *[f.relative for f in pending])
        _git("commit", "-m", f"autoposter: record {kind} for {slug}\n\n"
                             f"Written by the cycle that published it, so the duplicate gate, "
                             f"the orphan finder and the cadence floor can see it next run.")
        _git("push", "-u", "origin", branch)
        url = open_and_merge_pr(branch, title=f"autoposter: record {kind} for {slug}")

    _confirm_on_main(files, sleep_fn)
    return url


def bookkeeping_committer(sleep_fn=time.sleep):
    """Commit the ledger row AND the cadence clock to main, so both outlive the runner.

    WHY THIS EXISTS. The runner is destroyed when the job ends, and three separate facts were
    being written only to it:

    * the LEDGER ROW. Post #2 went out cleanly and its row died with the container. The
      duplicate gate and the orphan finder both read that ledger, so the next cycle saw a
      never-promoted article and would have posted it a SECOND time.
    * the CADENCE CLOCK. `autopilot-state.json` has never existed on main, so every run loaded
      `{"last_article_at": None}` and `due()` returned "no article recorded yet" — the 3-day
      floor never engaged once in production. Observed live: a cycle offered a new article
      hours after one had been published.

    Both are now one commit on main, and neither is believed until it is read back from main.
    """
    def commit(record: dict, state: dict) -> str:
        files = [
            MainFile(
                relative=LEDGER_RELATIVE, default=[],
                build=lambda rows: rows + [record],
                present=lambda rows: any(_same_destination(e, record) for e in rows),
            ),
            MainFile(
                relative=STATE_RELATIVE, default={},
                # The clock only ever moves forward. If another run advanced it further while
                # this cycle was posting, keep theirs: a floor that goes BACKWARDS would let a
                # third article out early, which is the failure this file exists to prevent.
                build=lambda on_main: {**on_main, **state,
                                       "last_article_at": max(
                                           [d for d in (state.get("last_article_at"),
                                                        (on_main or {}).get("last_article_at"))
                                            if d] or [None])},
                present=lambda on_main: bool(state.get("last_article_at")) and
                (on_main or {}).get("last_article_at", "") >= state["last_article_at"],
            ),
        ]
        # A promotion does not move the clock, so it has no state change to land and must not
        # be held to one. Its ledger row is still mandatory.
        if not state.get("last_article_at"):
            files = files[:1]
        return commit_to_main(files, slug=record.get("article_slug", "post"),
                              kind="bookkeeping", sleep_fn=sleep_fn)
    return commit


# Kept under its old name because the cadence workflow and every caller say "ledger". It now
# lands the clock too; the name would be a lie if it landed less, not if it lands more.
ledger_committer = bookkeeping_committer


def _same_destination(entry: dict, record: dict) -> bool:
    """Two rows for the same link on the same platform. Uses the duplicate gate's own
    normaliser, so the ledger and the gate can never disagree about what counts as the same."""
    import publish_gate
    return (publish_gate.normalise(entry.get("article_url", ""))
            == publish_gate.normalise(record.get("article_url", ""))
            and entry.get("platform") == record.get("platform"))


# --------------------------------------------------------------------------- posting

def blotato_publisher(api_key: str | None, config: dict):
    """Post to the PINNED Facebook page over Blotato's HTTP API.

    ⚠️ OWNER SEAM. Without `BLOTATO_API_KEY` this raises, the gate fails, the cycle skips and
    Slack says why. That is deliberate: the alternative is a scheduled run that believes it
    posted. See the module docstring on decision A — the MCP path is session-only and is not
    available to a cron.

    The target comes from `channel_guard`'s pinned allowlist, never from a default and never
    from anything in the post itself.
    """
    import channel_guard

    def publish(post: dict) -> dict:
        # THE SECOND LOCK, and it takes the POST — not the platform name. Passing the string
        # "facebook" here type-crashed the first real cycle (`'str' object has no attribute
        # 'get'`) and, worse, would have skipped the check entirely if it had not: the guard's
        # whole job is to compare what the POST says it is addressed to against the pin.
        target = channel_guard.assert_post_target(post, config)
        if not api_key:
            raise RuntimeError(
                "BLOTATO_API_KEY is not set, so this runner cannot post. config.yaml decision A "
                "records that the MCP posting path is session-only; a cron needs the HTTP API "
                "credential instead. Nothing was published.")
        payload = {
            "post": {
                "accountId": target["account_id"],
                "target": {"targetType": "facebook", "pageId": target["page_id"]},
                "content": {"text": post["caption"], "platform": "facebook",
                            "mediaUrls": [post["media_url"]]},
            }
        }
        request = urllib.request.Request(
            "https://backend.blotato.com/v2/posts", data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json", "blotato-api-key": api_key})
        with urllib.request.urlopen(request, timeout=30) as response:
            body = json.loads(response.read())
        submission = body.get("postSubmissionId") or body.get("id")
        if not submission:
            raise RuntimeError(f"Blotato accepted the request but returned no submission id: "
                               f"{body}")
        return {"post_url": body.get("postUrl") or f"blotato:{submission}",
                "submission_id": submission}
    return publish


# --------------------------------------------------------------------------- main

def main() -> int:
    config = engine.load_config()
    env = dict(os.environ)
    dry_run = str(env.get("DRY_RUN", "")).lower() in {"1", "true", "yes"}
    notify = slack_notifier(env.get("SLACK_WEBHOOK_URL"))

    decision = autopilot.run_cycle(
        config,
        today=datetime.now(timezone.utc).date(),
        notify_fn=notify,
        dry_run=dry_run,
        merge_fn=site_merger(),
        deploy_wait_fn=wait_for_deploy,
        publish_fn=blotato_publisher(env.get("BLOTATO_API_KEY"), config),
        render_fn=site_renderer(),
        ledger_commit_fn=ledger_committer(),
        # The article's URL and its card are created BY the deploy, so their resolution checks
        # cannot run in the pre-deploy sweep. They move to `run_cycle`'s post-deploy stage.
        defer_resolution=True,
        verify_opener=http_opener,
        write_fn=run_article.write,
        build_claims_fn=run_article.build_claims,
        articles=run_article.TOPIC_ARTICLES,
        captions=run_article.TOPIC_CAPTIONS,
        link_opener=http_opener,
        media_opener=http_opener,
        env=env,
    )
    print(f"[autopilot] {decision.action}: {decision.reason}")
    for verdict in decision.verdicts:
        print("  " + verdict.line())
    # The live verdicts are a separate stage and print as one, so the log shows the same two
    # halves the FYI reports rather than making a reader infer the post-deploy result.
    for verdict in decision.live_verdicts:
        print("  " + verdict.line())
    if dry_run:
        # The sweep rendered into `site/`. Nothing was committed; put the tree back anyway, so
        # a dry run is exactly as side-effect-free as it claims to be.
        restore_card_dirs()
        if decision.action == "would_publish":
            notify(decision.notice())
    # A skipped or paused cycle is a NORMAL outcome, not a failed job — otherwise a quiet week
    # looks like a broken pipeline and the alert stops meaning anything.
    #
    # `is_broken` is the exception, and it owns the whole list so the rule lives in one place:
    # a halt at merge or deploy, a crash in the publisher, or a post that went out without
    # being recorded. Each goes red AND notified on its way out, so the badge and the Slack
    # message always agree. A post withheld because a live URL did not resolve stays green — it
    # is the accepted safe outcome, not a fault.
    return 1 if decision.is_broken else 0


if __name__ == "__main__":
    sys.exit(main())
