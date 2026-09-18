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

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
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


def wait_for_deploy(url: str, *, attempts: int = 30, delay: int = 20) -> None:
    """Block until the article is actually served. Raises if it never appears.

    A deploy that has not landed is indistinguishable from a deploy that failed, and the driver
    re-verifies the URL after this returns anyway — so this is about waiting long enough to give
    the Worker build a fair chance, not about deciding.
    """
    for _ in range(attempts):
        ok, _reason = http_opener(url)
        if ok:
            return
        time.sleep(delay)
    raise RuntimeError(f"{url} did not come up within {attempts * delay}s of the merge")


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
