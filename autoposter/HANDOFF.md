# HANDOFF.md — THI Autoposter

Current full context for a fresh session. Overwritten at each stopping point.
**Last updated: 2026-09-06, end of Phase 4 (held at the prove-gate).**

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
| Local generator | ✅ `thi_source.py` reads `site/**` read-only; 17 series, 4 data traps closed |
| Threshold calibration | ✅ 0.55 approved, kept `status: proposed`; revisit after 2026-09-22 |
| 2 — Movers engine | ✅ prove-gate MET — real feed, 15 stories, schema-valid; held for review |
| 3 — Validator | ✅ prove-gate MET — G5 + media resolution wired, 4 spec gaps closed, 78/78 |
| 4 — Article engine | ✅ prove-gate MET — article + ledger produced, guard halts, 1 model call |
| Site-side publish | 🔴 BLOCKED at the Rule 0 boundary — THI has no article collection (see below) |
| 5 — Reels engine | ⏸ **PARKED** until after 2026-09-22 (see below) |
| 6 — Producers | ⏸ blocked on Blotato plan confirmation + a pinned YouTube channel |
| 7 — Orchestrate | ⏸ |
| 8 — Go live | ⏸ |

**Near-term scope (owner, 2026-09-06):** Phases 1–4, the article stream, at metro grain,
plus the pinned-ID guard. Reels parked.

## What is in `autoposter/` now

```
CLAUDE.md                      project rules incl. the PUBLICATION STANDARD
config.yaml                    central config; amendments marked `# PHASE 0:` / `# PHASE 2`
schema/social-feed.schema.json the data contract (amended: areas[].type gained metro, state)
src/thi_source.py              READ-ONLY reader of site/src/data/generated/**; 17 series
src/movers_engine.py           metro-grain scoring; cross-area terms REMOVED, guarded
src/build_feed.py              signals -> figures -> ranked stories -> validated artifact
src/calibrate.py               walk-forward replay used to set quiet_week_threshold
src/minischema.py              dependency-free schema validator; unknown keyword -> raise
src/channel_guard.py           pinned-target allowlist (enabled AND pinned, both required)
src/validator.py               the full gate suite — G1-G9 + baseline, G5 and media wired
src/media.py                   fail-closed media resolution; indeterminate != pass
src/post_template.py           deterministic code-filled pieces (NOT the caption generator)
specs/                         VALIDATOR, MOVERS-ENGINE, VOICE-GUIDE, REELS-ENGINE (committed)
src/publish_target.py          the two-lock guard — proven halting on six paths
src/claim_ledger.py            claim tiers; `external` can never be stated unhedged
src/topic_scorer.py            deterministic topic scoring; data_strength is MEASURED
src/article_engine.py          the shared process + the enforced one-model-call budget
src/run_article.py             build_claims (code) + write (THE one model call)
article_topics.yaml            candidate topics + owner-tunable priors
articles/<slug>/               article.md, claim-ledger.md, facebook-promo.json, site patch
tests/                         99 tests across 6 suites, all passing
data/social-feed.json          the real artifact
private/                       GITIGNORED — owner-only detail + ROTATION.md (see below)
RUNLOG.md LEARNINGS.md HANDOFF.md
```

Still **not** landed: `orchestrator.py`, `publisher.py` — Phase 6/7 material.

## Open for the owner
1. **🟡 `ROTATION.md` is in `private/`, not `specs/`.** It is the only spec file that fails the
   publication standard: it maps the whole network of domains, names which are parked or carry
   unreliable data, and describes internal-linking them for cluster authority. Published, that
   is both a competitor's map and a public description of a cross-domain link scheme, on the
   repo of the property whose #1 KPI is citation. The other four are committed to `specs/`.
   Owner's call to move it.
2. **The angle taxonomy** in `build_feed.ANGLE_BY_METRIC` is still a marked placeholder. The
   real four-angle taxonomy is in `specs/VOICE-GUIDE.md` and gets wired in Phase 4, on the
   owner's go-ahead — not before.
3. **Live media resolution is unproven from this surface.** A HEAD from this container is not
   evidence; prove it on the runner's own path in Phase 6 (SOP step 9).
4. **🔴 The article cannot be published without THI-repo changes.** THI has no article/analysis
   collection and no `/analysis/` route. Publishing needs `site/src/content.config.ts`, a new
   `site/src/data/analysis/` directory, and two route files — all outside `autoposter/`. The
   exact diff and three decisions (URL shape, file location, nav) are in
   `articles/are-texas-electricity-prices-still-going-up/SITE-PATCH-PROPOSAL.md`. Nothing under
   `site/` has been touched.

## Phase 4 readiness

1. **All five spec files ARRIVED 2026-09-06** and are in `specs/` (`ROTATION.md` in `private/`,
   pending the owner's call). Nothing was reconstructed. Phase 4 is now unblocked on inputs but
   **still held on the owner's explicit go-ahead**, which they asked to give after confirming
   the files are in.
2. ~~The public-repo state question~~ — **decided 2026-09-06.** Stay in the public repo with two
   carve-outs: drafts/claim ledgers on an unmerged branch, deleted after publish; the runlog
   de-specified per the publication standard in `CLAUDE.md`. Full detail lives in the gitignored
   `private/`, **not** on a branch — a branch in a public repo is readable, obscure is not
   private.

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
| 1 | area-grain movers | **metro grain**; cross-area terms removed from the code, reels parked |
| — | schema `zip\|county` | amended to add `metro`, `state` (🟡, RUNLOG §23) |
| — | `quiet_week_threshold` 0.45 | **0.55 proposed** from a 46-cycle walk-forward replay |

## Owner seams (🔴 — agent stubs, human executes)

- Create Slack `#thi-autoposter`.
- ~~Set `SLACK_WEBHOOK_URL`~~ — **done 2026-09-06**, in the `autoposter` Environment. The
  Anthropic and Blotato keys were correctly left unset; nothing headless reads them.
- Connect a real THI YouTube channel in Blotato, then pin its id in `config.yaml`.
  **Until pinned, YouTube is un-postable by construction** — that is the guard working.
- Confirm whether the Blotato `starter` plan includes video render + scheduling (before Ph.6).
- ~~Delete the stale `claude/…` remote branch~~ — done by the owner.
- Decide where `ROTATION.md` lives, and give the Phase 4 go-ahead when ready.

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
