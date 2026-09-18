#!/usr/bin/env python3
"""
preflight-merge-path.py — prove the token can actually push, open a PR, MERGE it, and clean up.

WHY THIS EXISTS
Seven consecutive scheduled runs failed in production while every dry run and all 240 tests
were green. The reason is structural, not incidental: `run_cycle` returns at the `dry_run`
branch BEFORE `merge_fn` is ever called, and every test passes a stub lambda for `merge_fn`. So
`site_merger` — the only code that pushes or invokes `gh` — had never executed anywhere except
the live cadence. The first time it ran, GitHub answered:

    pull request create failed: GraphQL: GitHub Actions is not permitted to
    create or approve pull requests (createPullRequest)

A capability nobody exercised is a capability nobody has. That is L13 and L17 a third time, so
this script is the standing answer: it performs the REAL operations against the REAL token, on
a scratch branch, and removes everything it made.

WHAT IT PROVES, in order — each step is a capability that has its own way of being denied:
  1. push            → `contents: write` on the token
  2. pr create       → the repo/org "Allow GitHub Actions to create and approve pull requests"
                       policy, which is SEPARATE from `pull-requests: write` and was the fault
  3. pr merge        → merging to main is permitted (no protection rule, no required review)
  4. branch delete   → `--delete-branch` works, so the namespace does not silt up
  5. revert + merge  → and the no-op is removed again, so main ends where it started

WHAT IT TOUCHES
One file under `autoposter/data/preflight/`, added by one PR and removed by the next. Nothing
under `site/`, so neither merge changes a single byte the site serves. Both merges do trigger a
Workers build, which is the honest cost of proving a real merge really works.

Exit 0 means the whole chain works. Any other exit names the step that failed, in the tool's own
words. Run it from `autoposter/`.
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import run_autopilot as ra                        # noqa: E402

REPO = ra.REPO
STEPS: list[tuple[str, str]] = []


def step(name: str, detail: str = "") -> None:
    STEPS.append((name, detail))
    print(f"  PASS  {name}" + (f" — {detail}" if detail else ""), flush=True)


def _cleanup(branch: str) -> None:
    """Best effort. A preflight that fails must not also leave litter, but a tidy-up that
    cannot tidy must not mask the failure it is tidying up after."""
    for cmd in (["push", "origin", "--delete", branch], ["checkout", "main"]):
        try:
            ra._git(*cmd)
        except Exception as exc:                   # noqa: BLE001
            print(f"  [warn] cleanup `{' '.join(cmd)}`: {exc}", flush=True)


def main() -> int:
    run_id = os.environ.get("GITHUB_RUN_ID") or datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    marker = REPO / "autoposter" / "data" / "preflight" / f"{run_id}.txt"
    rel = f"autoposter/data/preflight/{run_id}.txt"
    add_branch = f"autoposter/preflight-{run_id}"
    rm_branch = f"autoposter/preflight-cleanup-{run_id}"

    print(f"[preflight] proving the merge path end to end as run {run_id}\n", flush=True)
    ra._git("config", "user.name", "thi-autoposter")
    ra._git("config", "user.email", "noreply@texashomeintelligence.com")

    try:
        # ---- 1 & 2 & 3 & 4: add a no-op, push, PR, merge, delete branch.
        marker.parent.mkdir(parents=True, exist_ok=True)
        marker.write_text(f"THI autoposter merge-path preflight, run {run_id}, "
                          f"{datetime.now(timezone.utc).isoformat()}\n"
                          f"This file is removed by the second half of the same preflight.\n")
        ra._git("checkout", "-B", add_branch)
        ra._git("add", rel)
        ra._git("commit", "-m", f"preflight: prove the autoposter merge path ({run_id})")
        ra._git("push", "-u", "origin", add_branch)
        step("push", f"{add_branch} reached origin — the token has contents: write")

        url = ra.open_and_merge_pr(
            add_branch,
            title=f"preflight: prove the autoposter merge path ({run_id})",
            body="Automated preflight. Adds one no-op file under `autoposter/data/preflight/` "
                 "and merges it, to prove the token can push, open a PR and merge. The next PR "
                 "in this same run removes the file.")
        step("pr create", f"{url} — Actions IS permitted to create pull requests")
        step("pr merge", "merged to main by the same run that opened it, with no human step")
        step("branch delete", f"{add_branch} removed by --delete-branch")

        # ---- 5: put main back. The proof is only complete if it leaves no trace.
        ra._git("fetch", "origin", "main")
        ra._git("checkout", "-B", rm_branch, "origin/main")
        ra._git("rm", rel)
        ra._git("commit", "-m", f"preflight: remove the no-op marker ({run_id})")
        ra._git("push", "-u", "origin", rm_branch)
        cleanup_url = ra.open_and_merge_pr(
            rm_branch,
            title=f"preflight: remove the no-op marker ({run_id})",
            body="Removes the file added by the preflight PR in this same run. Main ends "
                 "byte-identical to where it started.")
        step("cleanup merged", f"{cleanup_url} — the no-op is gone; main is back where it was")

        print(f"\n[preflight] {len(STEPS)}/5 PASS — the full merge path works under this token.")
        return 0

    except Exception as exc:                       # noqa: BLE001
        done = [n for n, _ in STEPS]
        failed = next((s for s in ("push", "pr create", "pr merge", "branch delete",
                                   "cleanup merged") if s not in done), "unknown")
        print(f"\n[preflight] FAILED at: {failed}", flush=True)
        print(f"  {type(exc).__name__}: {exc}", flush=True)
        print(f"  proven before the failure: {', '.join(done) or 'nothing'}", flush=True)
        for branch in (add_branch, rm_branch):
            _cleanup(branch)
        return 1


if __name__ == "__main__":
    sys.exit(main())
