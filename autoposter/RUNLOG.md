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

---

## 2026-09-06 — Phase 0 (cont.): owner decisions applied + pinned-ID guard built

**Round:** Phase 0 close-out (🟡 decisions applied, 🟢 guard built) · **Objective:** apply the
owner's five 🔴 answers, build the pinned-ID guard, and hold. **Out of scope:** anything
consuming the not-yet-re-uploaded spec files; Phase 2 onward.
**Model spend:** no generation calls. **Cost:** ~$0 against the $20 ceiling.

### 10. Pinned-ID guard — BUILT (`src/channel_guard.py`, 15/15 tests)
Built now rather than at Phase 6, per owner instruction. It is the posting-side twin of the
article engine's domain self-identification guard: a target is legitimate only when it matches
an id a human pinned in `config.yaml`.

Design decisions worth recording:
- **Every path out of `pinned_target()` is either a fully-specified target or an exception.**
  There is no third return value, so no caller can accidentally read "unpinned" as "allowed".
- **A missing pin HALTS.** `pinned: null` means do-not-post, never "use the workspace
  default". Asserted directly by `test_unpinned_channel_halts_even_though_connected`.
- **A missing `page_id` HALTS.** Blotato reports a *default* `pageId` in `requiredFields`;
  taking it is the exact route by which THI content reaches a sauna page. Never consulted.
- **`assert_live_accounts_match()` re-checks the pinned NAME against the live listing.**
  Pinning an id prevents choosing the wrong destination; it does not prevent the id itself
  being reassigned on Blotato's side. An id that now answers to a different name is a HALT.
- **int/str normalization.** YAML parses an unquoted `1335273942995805` as an int while
  Blotato returns a string. Un-normalized, the guard would reject a *correct* target — and a
  guard that cries wolf gets switched off, which is worse than no guard. Covered by
  `test_yaml_int_ids_normalize`.
- All failure reasons are collected and reported together, not just the first.

**Verified against the live workspace, not only fixtures** (harness Meta-Rule 7 — prove what
runs, not what compiles). Against the real `blotato_list_accounts` payload:
`postable_platforms → ['facebook']`; the THI page passes; a sibling page under the *same
account* (Sauna News Hub) HALTS; a post with no `page_id` HALTS; unpinned YouTube HALTS.

Pinned so far: **Facebook page "Texas Home Intelligence"** (`1335273942995805`, account
`49743`), owner-approved. Every other channel is `pinned: null` and therefore un-postable —
including the connected YouTube and Instagram accounts, which belong to other properties.

**Not committed:** the full Blotato account listing. It maps THI to the owner's other brands
and is business-disclosing in a public repo; only the THI ids are pinned in config.

### 11. Public repo — what state must persist, and is any of it sensitive
Answering the owner's hold-and-advise question. Confirmed first: **secrets will live only in
GitHub Secrets / the environment, never in-repo, on any branch.** `.gitignore` blocks `.env`,
`.env.*`, `*.env`, `*.env.txt`.

State this project must persist, and its exposure if public:

| State | Contents | Sensitive if public? |
|---|---|---|
| seen-ids / story history (dedup, G-suppression) | area + metric + date + rank | **No** — derived wholly from THI's already-public generated data |
| D5 breadcrumb (pre-post marker) | timestamp + intended piece id | **No** — reveals only that a post is imminent |
| autonomy streak / channel mode | per-channel counter + review/autonomous | **No** to read; not writable without push access |
| published-post ledger | post ids, URLs, timestamps | **No** — public by definition once posted |
| pinned target ids | THI FB account + page id | **No** — the page id is in the page's own public URL; it is an identifier, not a credential |
| full Blotato account listing | ~9 pages across the owner's brands | **YES — business-disclosing.** Not committed; only THI ids are pinned |
| article drafts + claim ledgers | pre-publication editorial | **Moderate** — an unverified claim is publicly readable *before* the verification gate passes |
| `RUNLOG.md` / `HANDOFF.md` | candid account of what the data cannot do | **Moderate, and non-obvious** — see below |

**The one I want the owner's call on.** THI's #1 KPI is being cited by AI answer engines. A
public `RUNLOG.md` is a sourced, well-structured, honestly-written account of exactly where
THI's data is thin — that appraisal data cannot be joined to an address, that four counties
have two weeks of history, that four feeds are still `sample`. It is *more* extractable than
most of the site. The harness asks for candid logs and is silent on who reads them.

**Recommendation: stay in `autoposter/` in the public repo.** The operational state is all
non-sensitive and derived from already-public data, so a private store would add a credential
and a failure mode to protect nothing — and D5's whole value is that the breadcrumb commits
cheaply in the same repo before posting. Two carve-outs instead of a repo move:
1. **Drafts and claim ledgers stay on an unmerged branch** and are deleted after publish, so
   unverified prose never sits on `main`.
2. **The runlog stays candid but stops naming exploitable specifics** — "county-grain drought
   history is below the 4-week minimum until 2026-09-22" is fine; a table of every `sample`
   feed is an inventory of weaknesses. From the next entry on, that detail moves to a
   sentence plus a pointer, unless the owner says keep it verbatim.

**Fallback if the owner judges that exposure unacceptable:** keep code, config, schema and
tests in the public `autoposter/` (none of it is sensitive) and move only the mutable state
and the runlog to a private store — a small private `thi-autoposter-state` repo or
Cloudflare KV. That is decision C's isolation without its cross-repo cost. I do not
recommend it unless the runlog exposure is the deciding factor; it buys little and costs a
credential.

**Also recorded, because Rule 0 created it:** repo-level secrets on this repo are readable by
the *site's* workflows, including the daily ingestion job. Decision C isolated secrets by
repo; that isolation is gone. Mitigation is a GitHub **Environment** named `autoposter` —
commands in §13.

### 12. Config amendments applied
- `gated_metrics.insurance_trend.available: true → **false**` (no feed exists; `tdi-losses`
  is `status: sample`). Left true it defeats G6.
- `gated_metrics.appraisal_change` — `review_after: null`, gated **indefinitely**, citing
  `docs/audits/round-16c-parcel-join-probe.md`.
- **Movers reweighted for metro grain.** `rank_extremity` and `neighbor_divergence` → `0.0`
  (kept as keys so `surprise_score()` runs unchanged today; Phase 2 removes the terms from
  the function). The freed 0.35 was **not** redistributed proportionally: with cross-area
  comparison gone, the only surviving way to say "surprising" is comparison to the area's own
  past, so `self_deviation` (.15→.30) and `magnitude` (.20→.28) absorb most of it,
  `threshold_crossed` (.15→.25) is the one editorial-grade binary, `audience_coverage` (.10)
  and `freshness` (.05→.07) keep small shares. Additive weights sum to 1.0 (asserted).
- **`quiet_week_threshold` flagged `calibrated: false`.** The reweighting changes the score
  distribution, so 0.45 no longer means what it meant. Not silently carried over; retune on a
  real feed in Phase 2 before trusting the live/evergreen split.
- `cadence.reels_enabled: false`, `reels_review_after: "2026-09-22"` — reels **parked, not
  cancelled**, with option (c) (ranking permit *trades*, counts/timing/seasonality only,
  never price) named in the config as the likely first format.
- `data_source.mode: local_generated`; Worker route explicitly `null` and marked not-built.
- Channel pins added; `project.repo_visibility: public` recorded.

### 13. `gh secret set` commands for the owner
Surfacing a discrepancy first: `SETUP.md` lists three secrets, but under decision A the one
model call and Blotato scheduling both happen **in-session**, not in CI. The GitHub Actions
side only does Slack digest, state commit, and the "run didn't happen" nudge. So **one secret
is certainly needed; the other two probably are not.** Setting a key that nothing reads adds
exposure for nothing.

Scoped to an Environment so the site's own workflows cannot read it:
```
gh api -X PUT repos/zmpersonal/texashomeintelligence/environments/autoposter
gh secret set SLACK_WEBHOOK_URL --repo zmpersonal/texashomeintelligence --env autoposter
```
Only if a headless job ever needs them (it does not today):
```
gh secret set ANTHROPIC_API_KEY --repo zmpersonal/texashomeintelligence --env autoposter
gh secret set BLOTATO_API_KEY   --repo zmpersonal/texashomeintelligence --env autoposter
```
Verify without printing values: `gh secret list --repo zmpersonal/texashomeintelligence --env autoposter`

The webhook is being copied out of Cloudflare. It must not be pasted into chat, a commit, or
Slack itself; anything ever pasted is burned and must be regenerated (Meta-Rule 4).

### 14. Branch
Renamed to `autoposter/phase-0` per Rule 0; pushed. Deleting the old remote branch
`claude/thi-autoposter-phase-0-y7rgw6` returned **HTTP 403** — this session's token lacks
delete-ref. Local copy deleted; the remote one needs one click from the owner. Flagged rather
than worked around.

### 15. Deviations / friction
No deviation. The five spec files remain un-uploaded, so nothing consuming them was written
and **none was reconstructed** — `VOICE-GUIDE.md` especially, where a reconstruction would be
a guess wearing a spec's clothes.

**Friction:** `movers_engine.py` could not be landed honestly. Committing it unmodified would
put a function on `main` whose weights contradict the config beside it; editing it is Phase 2
work that is held. Landed nothing rather than land-then-immediately-edit — but it means the
package scaffold is now split across two places until Phase 2 opens, which a fresh session
would find confusing without `HANDOFF.md` saying so. It does.

**Candidates raised:** L1 (grain/cardinality belongs in a data prove-gate), L2 (preflight must
verify the destination, not just the credential), L3 (a hand-set availability flag defeats its
own gate), L4 (dropping a signal is a reweighting decision), L5 (public repo is a content
decision, not only a secrets one). All `candidate` in `LEARNINGS.md`.

### 16. Prove-gate
Guard: 15/15 unit tests **plus** a live-workspace assertion run. Validator: 7/7 (re-run after
landing, not assumed). Config: additive weights sum to 1.0, asserted. Phase 0 **CLOSED**.

**HOLDING** for (1) the re-uploaded spec files and (2) the owner's answer on §11 before any
Phase 2 work.
