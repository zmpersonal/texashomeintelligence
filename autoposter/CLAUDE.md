# CLAUDE.md — THI Autoposter

Project config for `autoposter/`. Read this, then `RUNLOG.md`, `LEARNINGS.md`, `HANDOFF.md`,
before doing anything (agent-harness Meta-Rule 1). Skills: `agent-harness` → `social-autoposter`
→ `build-loop`, in that order.

> **Scope note.** This file governs `autoposter/` only. The repo-root `CLAUDE.md` governs the THI
> site and is **outside this project's write boundary** — read it, never edit it.

## Rule 0 — the repo boundary (hard)
This project lives at `autoposter/` inside `zmpersonal/texashomeintelligence`, which also holds
the live THI site. Read the rest of the repo freely; **write nothing outside `autoposter/`**.
Every commit's file list must be *entirely* under this folder — not "mostly", not "plus one
small fix". Anything outside it is 🔴: stop, show the exact diff, wait. Branch + PR only;
`main` auto-deploys the live site, so merging is deploying.

## Rule 1 — surface, don't assume
Every rule, KPI, cost limit and permission here is flag-and-decide, not a frozen lock. When a
task pulls against one, state the conflict, the tradeoff, and a recommendation — then wait.
Don't silently comply and don't silently refuse.

## Publication standard (standing rule — this repo is PUBLIC)
**Candor about state and timing; never a public inventory of exploitable weaknesses.**

THI's #1 KPI is being cited by AI answer engines. A candid, sourced, well-structured account of
where THI's data is weak is *more* extractable than most of the site, and it is exactly what an
engine would surface if asked what THI cannot do. That is a KPI problem, not a security one.

- **Publish:** status, timing, direction, decisions and the reasoning behind them.
  *"County-grain drought is below the 4-week minimum until 2026-09-22"* — fine.
- **Do not publish:** per-feed status inventories, enumerated join failures, named unimplemented
  fetchers, field-level gaps in third-party data, the Blotato multi-brand account map.
- **Where the detail goes:** `autoposter/private/` (gitignored, never committed), plus an
  in-session report to the owner. **Not** an unmerged branch — in a public repo a branch is
  still publicly readable through the UI and API; obscure is not private.
- Applies to `RUNLOG.md`, `LEARNINGS.md`, `HANDOFF.md`, code comments, and commit messages
  alike. Established 2026-09-06 (RUNLOG §17); applied retroactively to the Phase 0 entry.

## Secrets
Never in this repo, in any form, on any branch. GitHub Secrets / the environment only, scoped to
the **`autoposter` Environment** so the site's own workflows cannot read them. `.gitignore`
blocks `.env`, `.env.*`, `*.env`, `*.env.txt`. Anything ever pasted into chat, a commit, or
Slack is burned and must be regenerated.

## Drafts
Article drafts and claim ledgers live on an unmerged working branch and are deleted after
publish. They never reach `main`. (Owner-approved carve-out, 2026-09-06.)

## The architecture invariant
**The model writes copy. Nothing else.** Selection, ranking, counting, dedup, validation,
scheduling and posting are deterministic code. One model call per cycle. If you are about to let
the model decide what is interesting or produce a number, stop — that belongs in code, and it is
what protects both the $20 ceiling and the brand's accuracy. Every numeral in a published piece
comes from `social-feed.json`; pop lives in the hook and framing, never in the data.

## The gates that must never be relaxed
- **Validate before produce** — `validator.py` passes before any render, edit or schedule.
- **Guard before post** — `channel_guard.assert_post_target()` on every outbound piece. A
  missing pin means *do not post*, never "use the workspace default".
- **Two-lock publish** for articles — the editorial spec names its target, the target
  self-identifies its domain, both must agree or HALT.
- On a gate failure: retry once at most, then **halt**. Never publish a degraded version, never
  skip to keep a run alive. When the model wants a value a rule forbids, supply the figure in
  code — never loosen the rule.

## Harness config
- **Slack:** `#thi-autoposter` (webhook in the `autoposter` GitHub Environment).
- **Cost ceiling:** $20/mo of Claude usage only — Blotato and Descript subscriptions are
  separate and pre-existing. Flag at 80%, STOP at 100%.
- **Tiers:** posting to a live channel before its autonomy gate = 🟡. Anything outside
  `autoposter/` = 🔴. Secrets / account connections / go-live / flip-to-autonomous = 🔴.
  Ranking code, dedup sweeps, runlog entries, rendering to a branch = 🟢.
- **Retro:** when a `LEARNINGS.md` entry reaches `validated`, or on request.

## Current scope (2026-09-06)
Phases 1–4 — the **article stream at metro grain** — plus the pinned-ID guard. **Reels (Phase 5)
are parked** until after 2026-09-22. Facebook is the only postable channel.
