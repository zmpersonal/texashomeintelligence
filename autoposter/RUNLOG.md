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

Measured depth, today 2026-09-06: the archive spans **two dozen-plus dataset files** across
the two metros, and the ones the article stream needs carry **a year or more of readings**
(weekly drought back to 2025-08, monthly trade-permit activity back to 2025-09, monthly climate
back to 2020). A minority of registered feeds are still seeded placeholders rather than live
fetches — expected at this stage of THI's own build, and tracked in THI's `HANDOFF.md` Seam 1,
not here.

> **Redacted per the publication standard (§17).** The per-feed status/depth inventory that was
> here is owner-private. Candor about timing and status stays; a public table of exactly which
> feeds are thin is an inventory of weaknesses on a repo whose whole KPI is being cited.

### 4. THE REAL BLOCKER IS **GRANULARITY**, NOT RETENTION
`config.movers.history_min_weeks: 4` is met in *depth* but not at the *grain the engine and the
schema assume*. `social-feed.schema.json` `areas[].type` is `zip|county`; `surprise_weights`
spend **0.35 of the score** on `rank_extremity` (0.15) + `neighbor_divergence` (0.20), both of
which require several comparable areas with comparable history.

What THI actually resolves below metro level, with ≥4 weeks:

- **Drought at county grain:** two counties carry **more than a year** of weekly readings. Four
  more were added to the county breakdown on **2026-08-25** and are therefore below the 4-week
  minimum until **2026-09-22**; backfill will not accelerate that, because the fetch window runs
  forward from the last observation rather than re-requesting history.
- **Everything else is metro-grain or coarser.** Some feeds are statewide; the richest
  record-level feed carries no ZIP or county field; one county-resolved feed is episodic rather
  than a weekly series. Specifics are owner-private (§17).
- The ZIP-to-area crosswalk covers 231 ZIPs / 13 counties / 2 areas — but it is a *mapping*, not
  a data grain. `site/src/pages/data/stress-index/[area].json.ts` states it outright: *"the
  reading is per-metro, so any covered ZIP yields the same one."* (That file is public on the
  live site; quoting it discloses nothing new.)

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
- **E (gate the money angles):** **CONFIRMED, and further out than the package estimated.**
  `config.gated_metrics` correctly has `appraisal_change.available: false`, but the "~2 weeks
  from 2026-08-28" timeline does not hold: a THI probe round in early September established that
  the parcel dataset cannot yet be joined to an address at all. **Treat appraisal as indefinitely
  gated**, and revisit only when THI's own parcel work reports a join. The blocking detail lives
  in THI's own audit docs; it is not restated here (§17).
  Separately: `config.gated_metrics.insurance_trend.available: **true**` is **wrong** — no
  insurance feed is live. Left as-is it lets an insurance angle generate with no backing data,
  the exact failure G6 exists to prevent. Must flip to `false` in Phase 2.
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
THI's data is thin. It is *more* extractable than most of the site, and it is exactly the
material an answer engine would surface if asked what THI cannot do. The harness asks for candid logs and is silent on who reads them.

**Recommendation: stay in `autoposter/` in the public repo.** The operational state is all
non-sensitive and derived from already-public data, so a private store would add a credential
and a failure mode to protect nothing — and D5's whole value is that the breadcrumb commits
cheaply in the same repo before posting. Two carve-outs instead of a repo move:
1. **Drafts and claim ledgers stay on an unmerged branch** and are deleted after publish, so
   unverified prose never sits on `main`.
2. **The runlog stays candid but stops naming exploitable specifics** — "county-grain drought
   history is below the 4-week minimum until 2026-09-22" is fine; a per-feed status table is
   an inventory of weaknesses. **Owner approved 2026-09-06; applied retroactively — see §17.**

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
- `gated_metrics.insurance_trend.available: true → **false**` (no insurance feed is live).
  Left true it defeats G6.
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

### 17. Publication standard — applied retroactively to this entry (owner-approved 2026-09-06)
**Standing rule, now in `autoposter/CLAUDE.md`:** *candor about state and timing, never a public
inventory of exploitable weaknesses.*

This runlog is committed to a **public** repo whose project's #1 KPI is being cited by AI answer
engines. A candid, sourced, well-structured account of where THI's data is weak is more
extractable than most of the site — and it is precisely the material an engine would surface if
asked what THI cannot do. That is a KPI problem, not a security one, and the fix is editorial.

What stays: status, timing, direction, and the decisions that follow from them ("county-grain
drought is below the 4-week minimum until 2026-09-22"). What goes: per-feed status inventories,
enumerated join failures, named unimplemented fetchers, field-level gaps in third-party datasets.

**Recorded rather than silently applied.** The harness's File Conventions make `RUNLOG.md`
append-only, and this is a retroactive edit of the 2026-09-06 Phase 0 entry on the owner's
explicit instruction. Redacted: the §3 per-feed depth/status table, the §4 field-level
granularity findings, the §5E parcel-join specifics, and two restatements in §11/§12. Nothing
about a *decision* changed — only the supporting detail's audience. The prior text is in this
branch's git history; if the owner wants it gone from history too, that is a force-push and a
separate 🔴 decision.

**A correction to the owner's premise, surfaced not worked around.** The instruction allowed the
full detail to live in "HANDOFF on an unmerged working branch." In a **public** repo an unmerged
branch is still publicly readable through the GitHub UI and API — it is obscure, not private. So
the full detail is NOT parked on a branch. It lives in `autoposter/private/`, which `.gitignore`
excludes from every commit, and it has already been reported in-session. `HANDOFF.md` is written
to the same public standard as the runlog.

### 18. Owner decisions applied this round
Public repo approved with both carve-outs (drafts/claim ledgers on an unmerged branch, deleted
after publish, never on `main`; runlog de-specified). Private state store declined — correct
call. Secrets: `autoposter` Environment created with `SLACK_WEBHOOK_URL` only; the Anthropic and
Blotato keys deliberately not set, since nothing headless reads them under decision A. Stale
`claude/…` remote branch deleted by the owner.

---

## 2026-09-06 — Phase 2: movers engine at metro grain + the local generator

**Round:** BUILD-PLAN Phase 2 (🟢) · **Objective:** a real `social-feed.json` from THI's actual
data that validates against the schema, with a sane ranked `stories[]` at metro grain and a
recalibrated quiet-week threshold. **Out of scope:** anything consuming the undelivered spec
files; Phase 3 onward; reels (parked). **Model spend:** no generation calls — this whole layer
is deterministic code by design. **Cost:** ~$0 against the $20 ceiling.

### 19. Still missing, and NOT reconstructed
`MOVERS-ENGINE.md` was named as re-uploaded but did not arrive; nor did `VOICE-GUIDE.md`,
`ROTATION.md`, `REELS-ENGINE.md` or `VALIDATOR.md`. The only file uploaded this round was a
`config.yaml` revision (§20).

The engine was therefore built against the two artifacts that ARE authoritative — the package's
`movers_engine.py` scoring math and `social-feed.schema.json` — plus the owner's explicit
decisions. **Nothing was reconstructed from guesswork**, and one place where the missing spec
actually bites is flagged in code rather than papered over: `build_feed.ANGLE_BY_METRIC` assigns
the four angles (reveal/verdict/wager/warning) by metric family, and the real taxonomy lives in
`VOICE-GUIDE.md`. It is marked as a placeholder that **must be confirmed before any caption is
generated**. It affects no figure and no ranking.

### 20. The re-uploaded `config.yaml` is a DIFFERENT REVISION — surfaced, not merged blindly
It carries the pinned-ID idea and the folder-in-repo decision independently, but predates the
Phase 0 amendments: old weights, `insurance_trend.available: true`, `data_source: TODO_CONFIRM`,
no reels park. Taking it wholesale would have silently reverted three approved decisions.

Resolution: the amended config stays canonical (the owner's message this round re-states the
reweighting as the thing to build against), and the re-upload's one genuine addition was folded
in — a per-channel **`enabled`** switch alongside `pinned`. Both are now required:
`channel_guard` halts unless a channel is **enabled AND pinned**. Either switch alone stops a
post; neither alone authorises one. Two new tests cover each direction. Channel `status` values
adopted the re-upload's `not_configured` wording.

### 21. The local generator (`src/thi_source.py`) — READ-ONLY
Decision B as re-decided: reads THI's committed datasets directly, writes only inside
`autoposter/`. **Seventeen usable (area, metric) series** now load — two metros plus statewide —
after four data traps were found and closed. Each was capable of producing a confident,
wrong, published number:

1. **Partial trailing periods.** Monthly series' latest period was the running month, measured
   over a few days. Left in, September's part-month reads as an ~80% collapse in every trade.
   Incomplete trailing months (and the running week, for any weekly-max series) are dropped.
2. **A composition break.** The drought feed reported one county per metro until 2026-08-25,
   then several. Aggregating over "counties present this week" makes a metro appear to jump when
   only *coverage* changed. Each metro is pinned to the one anchor county present for the whole
   series, which also preserves the full 55-week history.
3. **Interleaved record types.** The climate file carries twelve 1991-2020 monthly *normals*
   alongside real monthly *actuals*, in one array, with the normals dated to 2020. Blended, every
   delta is noise. Only `monthly-actual` enters the series — and because the dataset's own source
   string names both, the source is overridden to the actuals' source, so a post never credits
   data that is not in the figure.
4. **Thin series scored anyway.** Air quality has ~3 weeks of real dailies → 2 complete weekly
   points. Below four readings there is no baseline to be surprised against. Series under
   `history_min_weeks` are **dropped, not scored with a shrug** (Meta-Rule 5). Both AQI series
   are excluded today and will qualify on their own.

### 22. Metro-grain rewrite
`rank_extremity` and `neighbor_divergence` are **removed from `surprise_score()`**, not zeroed
and left in place — a term multiplied by a config value is a term someone can silently
re-enable without the data behind it. `assert_weights()` now raises if the config carries either
non-zero, and raises again if the additive weights stop summing to 1.0 (that would rescale every
score and quietly change what the calibrated threshold means). Both are unit-tested.

Named thresholds are only recognised where a **real external standard** exists — the U.S. Drought
Monitor's own D1–D4 category boundaries. "Crossed into Severe Drought (D2)" is citable; "crossed
1,000 permits" would be a number we invented to sound important, and `crossed_threshold()`
returns nothing for metrics without a published standard.

**A ranking defect the first real run exposed, and its fix.** `self_deviation` scores the LEVEL
while `magnitude` scores the MOVE, so a reading that had sat unchanged for months at an unusual
level ranked 8th of 17 with the figure "unchanged at D2" beside a `why` claiming it was outside
the area's range. Both statements were true and together they were incoherent — and this is the
*movers* engine. A standing level is a state, not a mover: it is now suppressed unless it crossed
a named threshold, and `_why()` can no longer assert movement beside a figure reading
"unchanged". 17 stories → 15, and the top of the ranking is cleaner for it.

### 23. Schema amendment (🟡 — please confirm)
`areas[].type` enum was `["zip","county"]`. THI resolves at metro grain and electricity only
statewide, so **`metro` and `state` were added**. The alternative — labelling a statewide price
as county-level — is false precision, which the honesty gate forbids. The grain is now stated
rather than flattened. This is a contract change to a file both engines depend on; flagged for
approval rather than assumed.

### 24. Validation without a new dependency
`jsonschema` is not installed and adding a dependency is 🟡. `src/minischema.py` implements the
subset the schema actually uses, with the property that makes a subset validator safe: **an
unrecognised keyword raises.** A validator that silently ignores what it does not implement
reports PASS for constraints it never checked. If the schema grows a keyword, validation fails
loudly and someone consciously adopts `jsonschema`. Unit-tested in both directions.

### 25. Quiet-week threshold — RECALIBRATED (proposal, pending approval)
`src/calibrate.py` replays THI's real history walk-forward: for each calendar week, truncate
every series to the readings that existed then, score exactly as the live engine would, record
the week's top score. No lookahead.

**46 weekly cycles (2025-09 → 2026-08). Weekly top score: min 0.340 · median 0.658 · max 0.927.**

Those 46 are not 46 independent observations — most series are monthly, so one reading stays
"latest" for about four weeks and each story is counted roughly four times. Collapsing
consecutive runs gives **18 distinct top-story events**: min 0.340 · median 0.669 · max 0.927,
p20 0.571.

| threshold | evergreen rate (18 distinct events) |
|---|---|
| 0.45 (inherited, uncalibrated) | 5.6% |
| **0.55 (proposed)** | **11.1%** |
| 0.60 | 22.2% |

**Proposed: 0.55.** It sits just under the p20–p25 band, so it flags the two genuinely weak
cycles without demoting real ones — 0.60 would send a +20% mover to evergreen, and 0.45 fires so
rarely that the quiet-week branch would be untested dead code. Set in config as
`quiet_week_threshold_status: proposed`, **not treated as final**. Today's feed is unaffected
either way (top story 0.658).

**The honest caveat.** Taking the max of ~15 series makes the weekly top score high almost by
construction, so this threshold does little work at metro grain. The live editorial risk is not
"no story" but "a top-ranked *boring* story" — which wants a separate quality floor, not a higher
threshold here. Recommend leaving that until the article engine shows what actually reads badly.

### 26. Prove-gate — MET
A real `data/social-feed.json` from THI's actual data: **3 areas, 15 ranked stories,
`week_mode=live`**, validating clean against the schema, every story carrying `figure` + `source`
+ `as_of`. Gated metrics never reach `stories[]` (asserted). Sweep: **44/44 tests** across three
suites, byte-identical output on repeat runs, zero files touched outside `autoposter/`.

**Stopping at the gate as instructed.** Phase 3 not begun.

### 27. Friction
The engine's shape was easy; the data's honesty was not. Four of the traps in §21 would each have
produced a plausible, confident, wrong number, and none was visible from the schema or the
package — only from reading the actual arrays. That is the Phase 0 lesson (L1) recurring one
level down: the spec is right about process and silent about data, and every hour spent staring
at real rows paid for itself. Candidate for `LEARNINGS.md` if it recurs in Phase 4.

---

## 2026-09-06 — Phase 3: validator integration (G5, media resolution, spec reconciliation)

**Round:** BUILD-PLAN Phase 3 (🟢) · **Objective:** wire the two integration TODOs and prove the
full gate suite against the real `social-feed.json`. **Out of scope:** Phase 4 (held). **Model
spend:** no generation calls. **Cost:** ~$0.

### 28. The five spec files arrived — Phase 4 boundary flagged
`VALIDATOR.md`, `MOVERS-ENGINE.md`, `VOICE-GUIDE.md`, `REELS-ENGINE.md` and `ROTATION.md` all
landed this round. Phase 3 was built against the real `VALIDATOR.md` rather than inferred from
code, which is why §29 lists gaps rather than confirmations.

**Phase 4 is NOT started.** The owner asked to confirm the files are in before anything consuming
them is built, and the angle taxonomy in `build_feed.ANGLE_BY_METRIC` stays a marked placeholder
until that confirmation. `VOICE-GUIDE.md` is now used in exactly one read-only way — its exemplars
are test fixtures (§31) — which validates the gates rather than generating anything.

**🟡 `ROTATION.md` is in `private/`, not `specs/`.** It is the only one of the five that fails the
publication standard: it maps the owner's whole network of domains, names which are parked and
which carry unreliable data, and describes internal-linking them so search and AI engines read the
cluster as one authority. Published, that is a competitor's map of the network *and* a public
description of a cross-domain link scheme, on the repo of the property whose #1 KPI is being cited.
The other four are methodology and read as an asset if anyone finds them. **Owner's call** — say
the word and it moves to `specs/`; until then the build reads it from `private/`.

### 29. Four gaps between the shipped gates and `VALIDATOR.md`, now closed
The inherited `validator.py` implemented most of the spec. Reading the real file found four
places where it did not, each of which would have passed something the spec rejects:

- **G2 checked one surface, the spec requires two.** "Source + timestamp present ON THE PIECE —
  the caption AND the on-screen card." The code searched the concatenation of both, so a source
  in the caption alone passed while the card — the thing that survives atomization — carried
  nothing. Now checked separately, for `source` and `as_of` independently.
- **G9 rejected bad asks but did not require a good one.** The spec says a post with *no*
  participation ask is a reject; the code only caught generic bait, and its own comment deferred
  the rest to "template + spot-check". Now a real local ask (guess / defend / tag / save /
  "which street") is required.
- **G7 had no calm-action half.** The spec rejects "any risk claim without a paired calm action".
  Now a piece naming hail/storm/drought/outage/premium must also say what to calmly do.
- **The baseline card check was missing entirely** — "rendered card has zero body rows / a
  comparison or ranking card with no numeric cells". This is the gate that catches the failure
  mode the SOP's changelog was written about (81 blank posts published by the inherited account).
  Now wired.

Also added: a minimum caption length, and a reject for an **unknown platform** — previously an
unrecognised platform simply had no character limit to check and sailed through the gate.

### 30. G5 freshness — wired, and it rejects rather than shrugs
`as_of` is parsed and compared against `config.staleness_hours`, with a longest-prefix rule so
one `permit_activity_` entry covers every trade. Three decisions worth recording:

- **A metric with no configured bound is REJECTED, not passed.** No bound means nobody decided
  how stale is too stale; publishing on an unanswered question is exactly the guess the honesty
  gate forbids. Bounds for the metrics the generator actually emits were added to config, each
  set to its source's own publication rhythm plus lag — a monthly series cannot be fresher than
  monthly.
- **A future `as_of` is rejected too** (clock or feed error), which the spec does not mention but
  is the same class of fault.
- Every one of the 15 real stories passes G5 at today's clock; that is asserted, not assumed.

### 31. Media resolution — wired, fail-closed, with an honest indeterminate case
`src/media.py`. Absent, unsupported-scheme, zero-length, and placeholder-sized media all reject;
`data:` URIs and local files are checked for a real payload (a 512-byte floor — a real 1080×1080
card is tens of kilobytes, so anything smaller is a truncated write or a placeholder pixel).

The subtle part is the network case. THI's own probe workflow records that **this container's
egress allowlist is narrower than the Actions runner's**, so a failed HEAD from here is not
evidence the media is missing. A definite server answer (404, 403, zero-length) is therefore a
hard reject, while a failure to *reach* the host is reported as **UNVERIFIED** with the reason
attached — never silently passed, and never silently blamed on the media. Resolution is
injectable so the gate is testable without a network. **Live HTTP resolution still has to be
proven on the runner's own path in Phase 6** (SOP step 9); that is recorded in the module.

### 32. The brand's own copy is now a test fixture
`tests/test_voice_guide_exemplars.py` runs `VOICE-GUIDE.md`'s Reveal, Warning and Verdict
exemplars through the full suite. This exists because tightening G7 and G9 immediately produced
**two false positives against real brand copy** — "get looked at" and "Send to a neighbor" were
rejected by regexes that demanded "get *it* looked at" and "send *this* to". A gate that rejects
the brand's own reference copy gets switched off by whoever it blocks, and a switched-off gate
protects nothing. Both patterns were broadened, and a companion test asserts the scam-voice
version of the same exemplar is still rejected — loose enough for the real voice, not loose
enough for the fake one.

The Warning exemplar also failed G5 at first, because its illustrative `as_of` is a week before
the test clock and the hail bound is 48h. That one was the gate working correctly: the test's
clock moved, the bound did not.

### 33. Two package fixtures updated — the gates bit them, correctly
`tests/test_validator.py`'s "good" post used `media_url: "x"` (unresolvable) and an `as_of` four
months before the clock. Both now reject. The **fixture** was updated, not the gates, and the file
says so at the top so nobody later reads it as the gates having been relaxed.

### 34. Reconciled Phase 2 against the now-available `MOVERS-ENGINE.md`
Two contract fields the spec requires were being computed and then dropped: `crossed[]` on each
metric, and the optional `county` on a story. Both are now emitted — `county` matters because a
metro's drought reading is literally its anchor county's, and naming it is more honest than
letting a metro id imply metro-wide.

Three deliberate divergences, all downstream of the approved metro-grain decision, recorded so
they are not later read as drift:
- The spec's `why` example (`"#1 in Austin metro · neighbors flat"`) uses rank and neighbour
  comparison, which do not exist at n=2. Ours describes move, level and money instead.
- `vs_neighbors` is not emitted, for the same reason.
- Glitch suppression by *reversal on the next run* is not built: it needs run-to-run story
  history, which is the D5 breadcrumb in Phase 7. The other two suppressions (big-but-boring,
  repeat-without-acceleration) are live.

### 35. Prove-gate — MET
**78/78 tests green across five suites**, up from 44:

| suite | tests | what it proves |
|---|---|---|
| `test_gates_against_feed.py` | 30 | every one of the 15 REAL stories produces a passing piece; then each gate proved to bite via one mutation at a time |
| `test_movers.py` | 20 | engine, reader and artifact |
| `test_channel_guard.py` | 17 | pinned-target allowlist |
| `test_validator.py` | 7 | the package's brand-critical fixtures |
| `test_voice_guide_exemplars.py` | 4 | the brand's own copy passes its own gates |

G5 verified against every real `as_of` in the feed. Zero files touched outside `autoposter/`.

**Stopping at the gate as instructed.** Phase 4 not begun.

### 36. Friction
The gate suite is only as good as its false-positive rate, and nothing in the SOP measures that.
Every gate here was easy to write strict and would have been shipped strict — it took running the
brand's own exemplars through it to find that two of them rejected valid copy. A suite that only
ever tests known-bad input cannot discover it is over-strict, and an over-strict gate does not
fail loudly: it gets disabled. Candidate for `LEARNINGS.md`.
