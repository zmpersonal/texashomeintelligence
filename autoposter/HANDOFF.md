# HANDOFF.md — THI Autoposter

Current full context for a fresh session. Overwritten at each stopping point.
**Last updated: 2026-09-06, end of Phase 0.**

---

## Where this project lives

**Inside the THI site repo**, at `autoposter/`, on branch `autoposter/phase-0`.

This reverses the strategy package's decision C ("separate private repo") on the owner's
explicit instruction. The consequences of that reversal are load-bearing, so they are
written here rather than left to be rediscovered:

- **Rule 0 boundary.** Only `autoposter/**` is writable. The rest of the repo is read-only.
  Every commit's file list must be *entirely* under `autoposter/`. Anything outside it —
  a Worker route, an ingest change, a workflow file — is a 🔴: stop, show the exact diff,
  wait. Never "just this one small file".
- **The repo is PUBLIC.** Blast radius is no longer contained by repo separation, so it is
  contained by the folder rule and by secret scoping instead. See "Secrets" below.
- **`main` auto-deploys the live site.** Merging is deploying (`SECURITY.md`). Branch + PR
  only; merge on the owner's explicit command.
- **There is no staging surface.** `SECURITY.md`: workers.dev and the live domain are the
  same deployment. The harness's 🟡 REVIEW template ("staging URL + screenshots") degrades
  to "diff + locally-rendered output" for anything site-side.

## Secrets — the rule, given a public repo

**No secret is ever committed here, in any form, on any branch.** They live only in GitHub
Secrets / the environment. `.gitignore` blocks `.env`, `.env.*`, `*.env`, `*.env.txt`
(the `.env.txt` trap from social-autoposter step 7).

Two extra hazards this repo's shape creates:
1. **Secrets on this repo are visible to the site's own workflows.** Repo-level secrets are
   readable by any job in `.github/workflows/`, including the daily ingestion run. Scope
   them to a GitHub **Environment** named `autoposter` so only jobs declaring
   `environment: autoposter` can read them.
2. **Public-repo Actions logs are world-readable.** No step may echo a webhook, a key, or a
   post payload that carries one.

## Build state

| Phase | State |
|---|---|
| 0 — Orient + reconcile | ✅ done, prove-gate met (RUNLOG 2026-09-06) |
| Pinned-ID guard | ✅ built + tested (15/15) + verified against the live workspace |
| 1 — Data history | ✅ answered in Phase 0: history IS retained; grain is the blocker |
| 2 — Movers engine | ⏸ HELD — needs the re-uploaded `MOVERS-ENGINE.md` |
| 3 — Validator | 🟡 gates land + pass 7/7; G5 freshness + media-resolve still TODO |
| 4 — Article engine | ⏸ HELD — needs `ARTICLE-ENGINE`'s missing siblings + `VOICE-GUIDE.md` |
| 5 — Reels engine | ⏸ **PARKED** until after 2026-09-22 (see below) |
| 6 — Producers | ⏸ blocked on Blotato plan confirmation + a pinned YouTube channel |
| 7 — Orchestrate | ⏸ |
| 8 — Go live | ⏸ |

**Near-term scope (owner, 2026-09-06):** Phases 1–4, the article stream, at metro grain,
plus the pinned-ID guard. Reels parked.

## What is in `autoposter/` now

```
config.yaml                    central config; every Phase 0 amendment marked `# PHASE 0:`
schema/social-feed.schema.json the data contract (unmodified from the package)
src/channel_guard.py           pinned-target allowlist — NEW, the posting-side twin of the
                               article engine's domain self-id guard
src/validator.py               content-quality gates (unmodified from the package)
tests/test_channel_guard.py    15 tests, all passing
tests/test_validator.py        7 tests, all passing
data/                          artifact output dir (empty; nothing generated yet)
RUNLOG.md LEARNINGS.md HANDOFF.md
```

Deliberately **not** landed yet: `movers_engine.py`, `orchestrator.py`, `publisher.py`. They
are Phase 2+ material and `movers_engine.surprise_score()` needs the metro-grain rewrite
before it is honest to commit. Held rather than landed-and-immediately-edited.

## The two things blocking Phase 2

1. **Re-upload of the spec files.** `VOICE-GUIDE.md`, `ROTATION.md`, `MOVERS-ENGINE.md`,
   `REELS-ENGINE.md`, `VALIDATOR.md` were not in the upload. The owner has them and is
   re-uploading. **Do not reconstruct any of them** — `VOICE-GUIDE.md` especially, since it
   is the sole input to the one model call and a reconstruction would be a guess wearing a
   spec's clothes.
2. **The public-repo state question** (owner deciding). See RUNLOG 2026-09-06 §11.

## Decisions as they now stand

| # | Package said | Actual |
|---|---|---|
| A | weekly Claude Code session, not a cron | unchanged, confirmed against the repo |
| B | Worker JSON route preferred | **autoposter-local generator**; route NOT built |
| C | separate private repo | **reversed** — `autoposter/` in the public THI repo |
| D | Descript MCP + Blotato | **Descript absent**; Blotato-clipping fallback from day one |
| E | appraisal ~2 weeks out | **indefinite**; and `insurance_trend` corrected to `false` |
| F | FB live, YT pending | FB ✅ pinned; YT connected but to an unrelated property |
| G | 4 posts, ≥2 cycles | **confirmed unchanged** |
| H | $20/mo Claude usage only | unchanged |
| 1 | area-grain movers | **metro grain**; two cross-area weights dropped, reels parked |

## Owner seams (🔴 — agent stubs, human executes)

- Create Slack `#thi-autoposter`.
- Set `SLACK_WEBHOOK_URL` (commands in the RUNLOG). `ANTHROPIC_API_KEY` and
  `BLOTATO_API_KEY` are **probably not needed** — under decision A both the model call and
  Blotato scheduling happen in-session, not in CI. Set them only if that changes.
- Connect a real THI YouTube channel in Blotato, then pin its id in `config.yaml`.
  **Until pinned, YouTube is un-postable by construction** — that is the guard working.
- Confirm whether the Blotato `starter` plan includes video render + scheduling (before Ph.6).
- Delete the stale remote branch `claude/thi-autoposter-phase-0-y7rgw6` (this session's
  token got 403 on delete-ref).
- Decide the public-repo state question (RUNLOG §11).

## The invariants, restated

- The model writes copy. **Selection, ranking, counting, validation, scheduling are code.**
  One model call per cycle. If token spend rises, something migrated from code into
  reasoning — push it back.
- **Validate before produce.** No render, edit or schedule of an unvalidated piece.
- **Guard before post.** `channel_guard.assert_post_target()` runs on every outbound piece.
  A missing pin means do not post, never "use the default".
- **Two-lock publish** for articles: editorial spec names the target; target self-identifies
  its domain; both must agree or HALT.
- **Every numeral comes from the feed in code.** A poppy hook is fine; poppy *data* ends the
  brand and ends the citations that are KPI #1.
