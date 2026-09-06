# RUNLOG.md — THI Autoposter

Append-only. One entry per round. Never edited retroactively (agent-harness, File Conventions).

---

## 2026-09-06 — Phase 0: Orient + reconcile

**Round:** BUILD-PLAN.md Phase 0 (🟢) · **Objective:** reconcile every package DECISION (A–H)
against the live THI repo and report what matches vs. contradicts. **Explicitly out of scope:**
any build logic, any tool wiring, any commit outside `autoposter/`.

**Surfaces used:** Claude Code (repo read, package read, two read-only MCP preflight calls).
**Model spend:** one orientation session, no generation calls. **Cost:** ~$0 against the $20
ceiling (decision H).

### 0. What was read
Skills `agent-harness` → `social-autoposter` → `build-loop`, in that order. Then the uploaded
package: `README-START-HERE.md`, `CLAUDE.md`, `BUILD-PLAN.md`, `SETUP.md`, `config.yaml`,
`social-feed.schema.json`, `ARTICLE-ENGINE.md`, `ARTICLE-ENGINE.thi.md`, `PUBLISH-TARGET.thi.md`,
`validator.py`, `movers_engine.py`, `orchestrator.py`, `publisher.py`, `test_validator.py`.
Then the live repo: root governance docs, `.github/workflows/*`, `site/package.json`,
`site/astro.config.mjs`, `site/src/ingest/*`, `site/src/data/generated/**`,
`site/src/data/zip-area-crosswalk.csv`, `site/src/pages/**`, `SECURITY.md`,
`docs/audits/round-16c-parcel-join-probe.md`.

### 1. Package files that were NOT delivered
`README-START-HERE.md` references these; none are in the upload:
`MOVERS-ENGINE.md`, `REELS-ENGINE.md`, `ROTATION.md`, `VOICE-GUIDE.md`, `VALIDATOR.md`,
`RUNLOG.md`/`LEARNINGS.md`/`HANDOFF.md` stubs, `social-feed.example.json`, `requirements.txt`,
`.env.example`, `.gitignore`.
Impact: `VOICE-GUIDE.md` is the sole input to the one model call (decision D) and `ROTATION.md`
is the cadence map — Phase 5 (reels) and the caption step cannot be built without them.
`MOVERS-ENGINE.md` and `VALIDATOR.md` are recoverable: their substance is reconstructible from
`movers_engine.py` + `validator.py` + `config.yaml`. Flagged to owner.

### 2. Package claims that were VERIFIED TRUE
- `test_validator.py` — **7/7 pass**, run in a scratch copy. Not taken on trust.
- `movers_engine.py` self-test runs; scoring, suppression, ranking and `decide_week_mode`
  produce sane output on the built-in fixture.
- Repo is `zmpersonal/texashomeintelligence`; Astro app under `site/`; Cloudflare Worker via
  Wrangler; `main` auto-deploys (matches `PUBLISH-TARGET.thi.md`'s expected shape).
- Blotato subscription **active** (live read-only call, no key printed).
- Facebook is connected and a page literally named **"Texas Home Intelligence"** exists and is
  the account's default `pageId`. Decision F confirmed for Facebook.

### 3. THE PHASE 1 CRITICAL PATH — does THI's ingest retain history? **YES.**
`site/src/ingest/merge.ts` `mergeObservations()` is an **append-only** merge, keyed by
observation `key`: an existing key is replaced in place (a correction), a new key appends.
Its own comment: *"Never truncates, never drops history to make room for new rows."*
`computeFetchWindow()` runs incrementally from the last `observedAt`. Each dataset file carries
`observations[]` plus `status` / `lastAttemptAt` / `lastSuccessAt` / `lastError` / `source`.
**The package's stated #1 fear — "deltas are impossible if state is overwritten" — does not
apply. No THI-repo change is needed to create history retention.**

Measured depth (28 dataset files under `site/src/data/generated/`), today 2026-09-06:

| dataset | grain | status | obs | span |
|---|---|---|---|---|
| usdm-drought | county (inside metro file) | live | 59 | 2025-08-19 → 2026-09-01 |
| municipal-permits | per-permit, city | live | 1,956 / 5,223 | 2025-08-25 → 2026-09-04 |
| permit-trade-activity | metro × trade × month | live | 65 / 91 | 2025-09 → 2026-09 |
| noaa-storm-events | county, episodic | live | 65 / 63 | → **2026-05-26 (3mo stale)** |
| swdi-nx3hail | lat/lon cells | live | 222 / 135 | 2026-08-10 → 2026-08-29 |
| eia-electricity | **texas only** | live | 13 | 2025-08 → 2026-08 |
| noaa-climate | metro, monthly | live | 23 | 2020-01 → 2026-07 |
| airnow | city, daily | live | 25 / 26 | 2026-07-01 → 2026-09-06 |
| austin-water-stage | austin only | live | 8 | 2026-08-30 → 2026-09-06 |
| ercot, fema-nfhl, tdi-losses, tx-forest-service | — | **sample** | 1 | `fetchRaw()` not implemented |

### 4. THE REAL BLOCKER IS **GRANULARITY**, NOT RETENTION
`config.movers.history_min_weeks: 4` is met in *depth* but not at the *grain the engine and the
schema assume*. `social-feed.schema.json` `areas[].type` is `zip|county`; `surprise_weights`
spend **0.35 of the score** on `rank_extremity` (0.15) + `neighbor_divergence` (0.20), both of
which require several comparable areas with comparable history.

What THI actually resolves below metro level, with ≥4 weeks:

- **Drought, county grain:** Travis (fips 48453) and Bexar (48029) have **55 weekly readings**
  (2025-08-19 →). Hays, Williamson, Comal, Guadalupe were added **2026-08-25** and have **2**.
  The other 7 crosswalk counties have none. Backfill will not fix the four: `computeFetchWindow`
  runs forward from the last `observedAt`, so the missing county-weeks are not re-requested.
  **They reach 4 weeks on 2026-09-22 by simply continuing to run.**
- **Everything else is metro-grain or coarser.** `eia-electricity` and `ercot` are `texas`.
  `municipal-permits` records carry `permitType`/`workDescription`/`status`/`valuationUsd` and
  **no ZIP or county field**. `swdi-nx3hail` has lat/lon but no committed area rollup.
  `noaa-storm-events` is county-resolved across 15 counties but is **event-episodic and 3 months
  stale**, not a weekly series.
- The crosswalk (`site/src/data/zip-area-crosswalk.csv`) has 231 ZIPs / 13 counties / 2 areas —
  but it is a *mapping*, not a data grain. `site/src/pages/data/stress-index/[area].json.ts`
  states it outright: *"the reading is per-metro, so any covered ZIP yields the same one."*

**Consequence:** with 2 metros and (from 2026-09-22) 6 drought counties, a ranking of ~15 areas
does not exist. Phase 5's reels batch — "10–15 metric-anchored ranking segments" — has no
substrate today. Movers scoring at metro grain across n=2 makes `rank_extremity` and
`neighbor_divergence` degenerate. This is the Meta-Rule 5 gate and it does not currently pass
for the reels stream. Escalated to owner as 🔴 with three options (see report).

The one dense, genuinely rankable series THI already has is **permit-trade-activity**:
5 trades × 13 months × 2 metros, unbroken. It ranks *trades*, not *places*. Note that
CLAUDE.md forbids any price/cost reading of permit data in either metro — counts, timing and
seasonality only.

### 5. Decision-by-decision reconciliation
- **A (weekly Claude Code session, not a cron):** consistent with the repo. Existing workflows are
  `schedule` + `workflow_dispatch` only; no `push` trigger anywhere. No conflict. One caveat:
  `.github/workflows/tcad-probe.yml` documents that **this container's egress allowlist is
  narrower than the Actions runner's** (`traviscad.org` and even `data.austintexas.gov` answer
  `connect_rejected` here while the runner fetches them daily). Any session-run producer must be
  proven from *this* surface, not assumed from the runner's success.
- **B (data path):** **CONTRADICTED in its preference, not its shape.** A build-time JSON route is
  precedented and would work (`[area].json.ts` is exactly that pattern under `output: "static"`).
  But (i) it is a file under `site/src/pages/`, i.e. **outside `autoposter/` → 🔴 under Rule 0**,
  and (ii) `SECURITY.md` confirms **there is no staging environment** — workers.dev and the live
  domain are the same deployment — so the route cannot be tested without deploying it live.
  A generator script inside `autoposter/` that reads `site/src/data/generated/**` (read-only) and
  writes `autoposter/data/social-feed.json` produces the identical artifact, needs zero THI-code
  change, and stays entirely inside the Rule 0 boundary. Recommended to owner.
- **C (separate private repo):** **CONTRADICTED by the owner's Rule 0** (work inside `autoposter/`
  in this repo, branch + PR). Owner's instruction wins; `SETUP.md` §1 is void. Consequence to
  record: blast radius is no longer contained by repo separation, so it must be contained by the
  folder rule and by secrets scoping instead. Also: this repo is **public** — decision C assumed
  private. No secret may ever be committed here, and the D5 breadcrumb / seen-ids state will be
  publicly visible.
- **D (tool boundary):** **Blotato MCP present. Descript MCP is NOT available in this session** —
  not in the tool roster. The documented fallback (Blotato clipping; `vidiq_generate_clips` is
  also present) therefore applies from day one. Recorded as a downgrade, not a blocker, per D.
- **E (gate the money angles):** **CONFIRMED AND WORSE THAN STATED.** `config.gated_metrics`
  correctly has `appraisal_change.available: false`, but the "~2 weeks from 2026-08-28" estimate
  is not on track: `docs/audits/round-16c-parcel-join-probe.md` (2026-09-04) establishes that
  Travis CAD's `improvement_detail` has **no situs/street/city/ZIP field at all** and is
  component-grain, not property-grain — so it cannot even be joined to an address yet. Treat
  appraisal as indefinitely gated, not two weeks out.
  Separately: `config.gated_metrics.insurance_trend.available: **true**` is **wrong**. There is no
  insurance feed in `site/src/data/generated/`; `tdi-losses` is `status: sample` with
  `fetchRaw()` unimplemented. Left as-is it lets an insurance angle generate with no backing
  data — exactly the failure mode G6 exists to prevent. Must flip to `false` in Phase 2.
- **F (channels):** Facebook ✅ (THI page present + default). YouTube: an account IS connected,
  but it is **"Support Team (In A Universe Where)"** — a different property, not THI. Package's
  "pending owner setup" is confirmed. Instagram / Pinterest / TikTok are all connected as
  **`inhousewellness`** — a different brand entirely.
  **New risk not anticipated by the package:** the Blotato workspace is shared across ~9 Facebook
  pages and several non-THI accounts. A wrong `accountId`/`pageId` publishes THI content to a
  sauna or wellness page. This needs the same treatment as the article engine's domain self-id
  guard: pin the exact THI ids in `config.yaml` and assert them in code before any post.
- **G (autonomy fan-out):** unanswered — open flag, escalated.
- **H ($20/mo Claude usage only):** no repo conflict. Note `COST.md` governs the *site*, not this
  project; the two ceilings are separate and should stay that way.

### 6. Other reconciliations worth recording
- **Branch:** this session was assigned `claude/thi-autoposter-phase-0-y7rgw6`; Rule 0 asks for an
  `autoposter/*` branch. Conflict surfaced, not resolved unilaterally; work continued on the
  assigned branch.
- **`config.coverage.metros`** = `[austin_metro, san_antonio_metro]` matches the site's two areas
  (`austin`, `san_antonio`). Concrete county/ZIP lists are available from the crosswalk when
  Phase 2 needs them.
- **`config.staleness_hours`** references metrics THI does not currently emit under those names
  (`hail_window`, `grid_stress`, `permit_signal`, `energy_cost_est`). A metric-name mapping from
  THI dataset ids → feed metric names is a Phase 2 deliverable; without it G5 cannot be wired.
- **Slack `#thi-autoposter` does not exist** (searched public + private). 🔴 human step.
- **No staging surface** (`SECURITY.md`) means the harness's 🟡 REVIEW template ("staging URL +
  screenshots") degrades to "diff + locally-rendered screenshots" for anything site-side.

### 7. Deviations from plan / friction
No deviation: Phase 0 was executed as written and stopped at its prove-gate. Two read-only MCP
calls (`blotato_get_user`, `blotato_list_accounts`) were made rather than deferring to Phase 6,
because decision F was cheaply falsifiable and turned out to be half wrong — that was the right
trade.

**Friction:** the package's single most important architectural assumption (area-grain movers with
neighbor comparison) is the one thing it could not check, and it is the one thing that does not
hold. Six of the eight decisions survived contact; the schema's core `areas[]` grain did not.
Nothing downstream of the movers engine can be scoped until the owner picks a grain.

### 8. Prove-gate
BUILD-PLAN Phase 0 gate — *"a written RUNLOG entry stating what in the repo matches/contradicts
the package"* — **MET** by this entry. Phase 1 is **HELD** pending the 🔴 answers below.

### 9. Open for the owner (blocking)
1. Movers grain (§4) — metro-only / wait for county depth / reframe reels to trade-ranking.
2. Data path (§5.B) — `autoposter/`-local generator vs. a 🔴 THI Worker route.
3. Branch name (§6).
4. Decision G fan-out definition.
5. `SETUP.md` items: Slack channel, GitHub Secrets, YouTube/THI account connection.
