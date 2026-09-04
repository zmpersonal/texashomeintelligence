# HANDOFF.md — Seams reserved for you

This tracks exactly what's stubbed vs. real, so "ready for live traffic" =
you filling in the items below. Updated as each phase lands — current
through Phase 5 (ingestion framework) + the governance-layer refresh.

---

## ⚠️ Deploy-target correction (supersedes "Cloudflare Pages" below)

Older sections of this file say "Cloudflare Pages" — ground truth is a
**Cloudflare Worker deployed via Wrangler** (`site/wrangler.jsonc`, worker
name `texashomeintelligence`), built and deployed by the owner's
**Git-connected Workers Builds** (no GitHub Actions deploy workflow — do
not add one). Staging serves at the owner's `*.julian-0ef.workers.dev`
subdomain. Read every "Pages" mention below through that lens: "Pages
project settings" → the Worker's settings/bindings; "Pages env vars" →
Workers build-time environment variables in the Workers Builds config.

**Workers Builds settings the owner maintains (dashboard-side):**
- Root directory: `site` · Build command: `npm run build`
- Deploy command: `npx wrangler deploy --config dist/server/wrangler.json`
  (the build emits that fully-resolved config from `site/wrangler.jsonc` —
  verified locally with a `wrangler deploy --dry-run`; `npm run deploy`
  wraps the same two steps for manual deploys)
- Build-time env vars when analytics go live: `PUBLIC_GA4_MEASUREMENT_ID`,
  `PUBLIC_CF_BEACON_TOKEN`
- ~~Real KV/D1 namespace IDs substituted for the placeholder IDs in
  `wrangler.jsonc`~~ — **done, and the "placeholders" note was wrong.** All
  three committed IDs are the real ones, verified against the owner's
  Cloudflare account (that file's own comment records the check). Nothing
  needs swapping before a deploy.

## Open items — carried into the county/parity rounds

Recorded, not resolved. Each was verified against the code on 2026-08-30; none is a
decision, a plan, or a commitment to fix. They are the known gaps the first two rounds of
the approved sequence (county data model + score history, then San Antonio parity) will
run into.

- **`sanAntonioPermits.ts` discards every non-roofing permit at ingest.**
  `if (!haystack.includes("roof")) continue;` (line 131) filters on type + description, so
  SA plumbing and HVAC have no permit data at all — not sparse data, none.
- **SA permit observations carry no `valuationUsd`; Austin's do.** Measured: Austin
  1,923 observations / 501 with a valuation; San Antonio 5,148 / 0. **Cause unverified** —
  it could be the source field, the mapping, or the roofing filter interacting with it.
- **`census-acs`, `usda-soil` and `bls` have `austin.json` only.** No San Antonio file
  exists for any of the three.
- **NWS has no San Antonio feed.** `COORDS` in the NWS fetcher is typed
  `Record<"austin", …>` — San Antonio is excluded by the type, not just absent from the
  data, so there is no forecast or alert feed for it.
- **`compute.ts` keeps no score history.** Its own comment: "a recomputation, not a stored
  snapshot — we keep no score history." Every delta is recalculated from the archive at
  build time. A snapshot archive is planned (round 1 of the sequence).
- **225 ZIP dashboards are indexed, and per `COMPARE_UNAVAILABLE` every ZIP in a metro
  resolves to the same reading.** Every input is recorded at county or metro level, so a
  ZIP-vs-metro comparison would be modelled rather than measured, and none is published.
- **Cloudflare Bot Fight Mode / WAF has never been verified as not blocking citation
  crawlers at the edge.** `robots.txt` and `llms.txt` allow them; the edge has no
  obligation to agree. Still unverified now that the site is live. (Also described in the
  Cloudflare-gotcha block below.)
- **San Antonio's `WORK TYPE` is a construction-status flag, not a description.** Enumerated
  live (run #32): blank on 111,797 of 139,124 rows (80.4%), and otherwise only "New",
  "Existing" or "Other". `sanAntonioPermits.ts` resolves it as its `description` column
  because the resource has **no free-text scope-of-work field at all**, which is why
  `workDescription` is `""` on every San Antonio observation. Consequence worth stating
  separately: the roof filter is effectively matching on `PERMIT TYPE` alone for San
  Antonio, since the other half of its haystack is empty four times out of five. Not a
  mapping bug; there is no better column to point at.
- **San Antonio's `DECLARED VALUATION` is a commercial-only field, so SA cost pages cannot
  be anchored on permit valuation.** 97.78% null across the file, and the per-type split is
  close to binary: 0.00% on every residential and trade type (Mechanical 0/16,395, Re-Roof
  0/10,161, Electrical 0/13,977, Foundation Repair 0/5,243) against near-100% on commercial
  ones (Comm New Building 915/915, Comm Finish Out 258/258). The city requires a declared
  valuation only on commercial permits. This is a property of the source, not of
  `parseValuation`. **A different source is needed** for San Antonio cost figures — Austin's
  approach does not port, and publishing an SA cost page off these rows would mean
  publishing commercial construction values under a homeowner heading.
- **The local verification harness now survives a build - what it guarantees, and what it
  still does not.** Round 9. `wrangler dev` persists local D1 and KV to `.wrangler/state`
  **relative to cwd**, and the replays start the worker from `dist/server`, so state landed
  inside Astro's output directory and `npm run build` destroyed it every time. That cost
  three rounds of re-diagnosis. Two things fix it together:
  `site/scripts/local-worker.sh` starts the worker with `--persist-to site/.wrangler/state`
  (outside `dist/`, matched by `site/.gitignore`'s `.wrangler/` rule, so the test database is
  never committed), and `site/scripts/local-fixture.ts` rebuilds the fixture from nothing.
  **Guaranteed now:** migrations 0001-0004 and the four fixture accounts (POP, NOTRASH, SA,
  EMPTY) with home profiles, addresses, reminders and KV sessions are reproducible from an
  empty database; the script is idempotent (fixed ids, `INSERT OR REPLACE`, reminders
  re-created each run so a replay that snoozes them does not leave the fixture that way);
  session ids are written to `.wrangler/state/sessions.json` beside the database they
  describe, so the two cannot disagree; a missing fixture makes a replay exit(2) naming the
  script to run, instead of dying on `getComputedStyle(null)`; and the six durable replays
  now live in `site/scripts/replays/` rather than an ephemeral scratchpad that died with the
  session. The script cannot touch remote D1: every wrangler call is assembled in one place,
  always carries `--local`, never `--remote`, and is re-checked before execution against four
  refusal conditions (no `--local`, any remote-shaped argument, a persist path outside the
  repo, a persist path inside `dist/`). All four were exercised and refuse.
  **Operational constraint, discovered and now enforced:** the fixture must be applied while
  the worker is STOPPED. A running worker keeps local D1 in memory and flushes its own state
  back over anything written underneath it - measured: a `DELETE` applied while it was up
  left the row untouched. `local-fixture.ts` now refuses if anything is listening on the
  port, naming the fix. The order is: build, fixture, worker, replays.
  **Round 9b closed the dependency gap and one more cwd trap.** `playwright` is now a
  pinned devDependency (`1.62.1`, exact, dev-only), so the three RENDER replays run from a
  clean checkout - proved by a full cold start: `rm -rf .wrangler dist node_modules`,
  `npm ci`, `npm run build`, fixture, worker, all seven replays. It does **not** reach the
  Worker: `npm ls playwright --omit=dev` is empty, no file under `dist/` contains the string
  `playwright`, and all 402 built files are byte-identical to the pre-dependency build except
  Astro's per-build server-island `key`, which is freshly random on every build regardless
  (two consecutive builds off identical sources differ in exactly those 41 bytes).
  The BROWSER BINARY is separate: playwright 1.62.1 has no install script, so `npm ci`
  installs the driver and nothing else - `npx playwright install chromium` is a real second
  step, now stated in `site/scripts/replays/README.md`. `scripts/replays/browser.mjs` is the
  one place that resolves it (`$THI_CHROMIUM_PATH`, else `/opt/pw-browsers/chromium`, else
  playwright's own directory) and exits 2 naming that command when there is none. The sandbox
  image's Chromium is revision **1194** while playwright 1.62.1 looks for **1234**, so that
  path must be passed explicitly; playwright's own lookup would miss it.
  **The `.dev.vars` trap, same shape as the `--persist-to` one.** `wrangler dev` resolves
  `.dev.vars` relative to its cwd, and `local-worker.sh` runs it from `dist/server`, so
  `site/.dev.vars` was never being read - the file existed and the endpoint still 404'd.
  `/api/email/weekly-run/` returns 404 rather than 401 on a missing secret **by design** (it
  does not reveal itself to an unauthenticated caller), which made the omission look like a
  route bug. `local-worker.sh` now passes `--env-file "$SITE/.dev.vars"` when the file is
  present. With that, `r9render` is **18/18** for the first time; without the file it now
  exits 2 naming the two variables instead of dying on `JSON.parse("Not found")`.
  *Correction, Round 9c:* that diagnosis was right about wrangler and incomplete about the
  build. **The Astro Cloudflare adapter copies `site/.dev.vars` into `dist/server/` at build
  time**, so a rebuild AFTER creating the file would also have worked. The file has to exist
  before the build, or be passed with `--env-file`; the latter needs no rebuild, so it stays
  the fix. Worth knowing when reasoning about the local worker's environment: a stale
  `dist/server/.dev.vars` from an earlier build keeps supplying secrets after
  `site/.dev.vars` is gone, which confounded the first attempt to reproduce the stale-state
  case below.
  **Also enforced by documentation, not code:** re-apply the fixture between runs of the same
  replay. `r9render` turns the weekly-email toggle on, so a second run without a fresh
  `npm run fixture` fails "toggle persists across a reload" - replay-mutated state, not a
  regression.
  **NOT guaranteed:** the fixture does not reproduce the ARR per-ZIP address shards or the
  generated dataset files - those come from ingestion, and a replay asserting on them needs a
  prior `npm run ingest` or the committed data.

- **Round 11 seam: REMOTE D1 HAS NO MIGRATION LEDGER. The schema is correct; the record of
  how it got that way does not exist.** Verified 2026-09-04 by read-only query against
  `texas-home-intelligence-db` (`0b1f11b2-b8f4-4eeb-b36e-4debd9f5c956`): **all four migrations
  are applied** - all 22 objects (18 tables, 4 indexes) present, and the column-level DDL of
  every 0003 and 0004 table matches its migration file exactly. Nothing is outstanding to
  apply.
  **But `d1_migrations` does not exist.** Migrations were applied with raw
  `wrangler d1 execute --file`, which records nothing.
  **What that costs, concretely:** (1) no applied timestamps, anywhere, for any migration;
  (2) "which of these ran?" is answerable only by inspecting the schema, which cannot
  distinguish "the migration ran" from "objects of the same shape exist"; (3) the next
  migration has no baseline; and (4) the failure this round actually caught -
  `wrangler.jsonc`'s note claimed only 0001 was applied and went stale across three
  migrations with nothing to contradict it. A ledger would have made that note redundant
  instead of wrong.
  **The verification method that substitutes for a ledger**, until one exists: query
  `sqlite_master` on the remote database read-only, check every object each migration file
  creates, and compare column-level DDL for the tables the newest migrations touch. That is
  what was done here. It is sound for the CREATE-only migrations this project has, and it
  would NOT be sound for a migration that alters or backfills - such a change leaves no
  distinguishing object behind, so the ledger must exist BEFORE the first `ALTER` or data
  migration. That is the real deadline on this seam.

- **Round 13: steps 1 and 2 of the ledger adoption are DONE. Step 3 is the owner's, and the
  command is below.** Round 11 recommended four steps; this round did the two that are safe
  for an agent to do, and nothing was written to remote D1 (SECURITY.md 🔴).
  **Done — the hazard is removed.** `seed.sql` now lives at `site/fixtures/seed.sql`, outside
  `migrations_dir`. Before the move, `wrangler d1 migrations list --local` against a throwaway
  database listed it alongside 0001-0004 as unapplied; after, the same command lists exactly
  the four numbered migrations and zero occurrences of `seed.sql`. Its own header now explains
  why it is not in `migrations/`, so the move cannot be casually undone.
  *(Worth knowing: `scripts/local-fixture.ts` was never exposed to this. It selects migrations
  with `/^\d{4}_.*\.sql$/`, so the numeric prefix already excluded `seed.sql`. The hazard was
  wrangler's `**/*.sql` glob alone — the local harness was always safe.)*
  **Done — the config states its intent.** `wrangler.jsonc` now carries `"migrations_dir":
  "migrations"` and `"migrations_table": "d1_migrations"` on the `d1_databases` entry. Both are
  wrangler's own defaults, quoted from its config schema ("defaults to './migrations'",
  "defaults to 'd1_migrations'"), so behaviour is unchanged — what changes is that the
  directory whose contents get run against production is now explicit where someone would edit
  it. **The rule that keeps this safe: `migrations/` contains exactly the files wrangler may
  run against production, and nothing else.**

- **⚠️ OWNER ACTION — back-register the ledger. One command, run once.** This is a WRITE to the
  production database and therefore 🔴 owner-only; it was not run.
  **What it writes:** the `d1_migrations` table, and four rows naming the migrations already
  applied. **What it does not touch:** any application table, any row of homeowner data, any
  schema object. It creates one bookkeeping table and inserts four filenames.
  ```
  npx wrangler d1 execute texas-home-intelligence-db --remote --command \
    "CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT, \
     name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL); \
     INSERT OR IGNORE INTO d1_migrations (name) VALUES \
     ('0001_init.sql'), \
     ('0002_dashboard_launch_signups.sql'), \
     ('0003_accounts_home_reminders.sql'), \
     ('0004_weekly_email.sql');"
  ```
  The DDL is character-for-character what wrangler itself creates, read out of
  `node_modules/wrangler/wrangler-dist/cli.js` (v4.125) rather than from memory. `INSERT OR
  IGNORE` makes the whole command safe to re-run. **The four names must match the filenames
  exactly** — a typo silently leaves that migration recorded as unapplied, and the next
  `migrations apply --remote` would re-run it. (That would be a schema no-op today, since every
  statement in 0001-0004 is `CREATE ... IF NOT EXISTS` with no `ALTER`, `DROP` or `INSERT`
  among them — but it is not a habit to rely on.)
  **Then verify, read-only:**
  ```
  npx wrangler d1 migrations list texas-home-intelligence-db --remote
  ```
  **Expected: "No migrations to apply!"** A NON-EMPTY result means the back-registration did
  not take — most likely a mistyped filename, or the command was run against the wrong
  database. **Do not run `migrations apply` to "fix" it**; re-read the names first. If the list
  ever shows a file that is not one of the four numbered migrations, something has been put
  into `migrations/` that does not belong there.
  **One thing the ledger will not recover:** `applied_at` records the back-registration date,
  not when each migration was actually applied. Those dates were never recorded and are lost.
  The true state, verified 2026-09-04 by schema inspection, is in `wrangler.jsonc`'s comment.

- **Round 12: `/san-antonio/roofing/` joins the below-hero layer, and the round turned up a
  latent bug in the Round 10 component.** The page reuses `BelowHero.astro` unchanged in
  structure; three additions were needed and all three came from the data refusing to fit.
  **(1) SEASONALITY IS NOT THE TREND TEST, and the component had been conflating them.**
  Roofing is flat half-over-half — **+0.1%** against a ±5.0% noise floor — so no trend is
  reportable. But the window runs **634 permits in September 2025 and 270 in December**, a
  **2.3× spread at 12σ**. The old code asserted, whenever the trend failed to clear, that "the
  spread between the busiest and quietest month is narrow enough that we do not describe it as
  a season" — which here would have been **false by a factor of twelve**. `tradeActivity.ts`
  now computes `amplitude` (peak-minus-trough against √(peak+trough)) as a separate question
  from trend, and the page says both: flat across the year, and moving hard within it.
  **Only the non-clearing branch changed**, and HVAC (+37.7%) and plumbing (+5.0%) both clear,
  so neither Round 10 page moved a byte.
  **(2) BEXAR COUNTY RECORDED NO HAIL in the window, and the page says so.** The San Antonio
  storm file spans **eight counties**; all eleven hail events in it are in the surrounding
  ones. A hail reading built on the file total would have implied hail in Bexar that NOAA did
  not record. The reader counts the home county only and reports zero as a finding, noting
  that hail was recorded nearby — "a reason to check a roof, not evidence that one was hit".
  **(3) NCEI's publication lag is MEASURED, not asserted.** The page states the newest record's
  actual age (**101 days** at this build) rather than repeating the documented two-to-four
  months, and says it is the publisher's cadence rather than a stale feed. It uses `buildNow()`
  — a module-scope `new Date()` reads 1970 under the Workers runtime (Round 10b).

- **Round 12 finding: two THI pages count the same thing differently, and the page now says
  why.** `/data/san-antonio/roof-permits/` reports **5,148** re-roof permits; the new page
  reports **4,871**. Both are correct and both come from the same `Re-Roof Permit` type.
  `municipal-permits` is a **per-permit append-only archive** (5,054 rows ingested 2026-08-24,
  73 more on 08-30, 21 on 09-04) spanning 2025-08-25..2026-08-28; `permit-trade-activity` is a
  **rolling aggregate** over the last twelve complete calendar months, recomputed each run.
  Restricting the archive to the same months gives **4,945** — so ~203 of the gap is the wider
  window and **74 is the archive's late arrivals**, records the city published after the
  aggregate was last computed. Neither is wrong; they answer different questions. The page
  carries a reconciliation paragraph rather than leaving a reader to find two of our own
  numbers in conflict, which would be a citation liability. **Not fixed, and probably should
  not be** — the divergence is inherent to one feed being an archive and the other a window.

- **Round 13b: the TDLR citation was DEAD, and the flag is why anyone found out.** Round 12
  cited `https://www.tdlr.texas.gov/programs.htm` for "Texas does not license roofing
  contractors" and marked it `urlVerifiedByFetch: false` because the sandbox proxy would not
  load it. The owner opened it: **404**. It is now
  `https://www.tdlr.texas.gov/licenses.htm` — "Programs Licensed and Regulated by TDLR" —
  which carries both halves of the contrast on one page: its list includes Air Conditioning
  and Refrigeration, Electricians, and Mold Assessors and Remediators, and roofing appears
  nowhere on it. **The flag did its job**: an unverified link was found by review rather than
  by a reader, which is the whole point of recording the gap instead of glossing it. The
  replacement is **still `urlVerifiedByFetch: false`** — the proxy denies
  `www.tdlr.texas.gov` today as it did then (connect_rejected, confirmed against the proxy's
  own status endpoint), so nothing about the new URL has been checked *from here*. The owner
  opened it; the build has not.

- **Round 14: the owner opened all seven citations. TWO MORE WERE DEAD.** After Round 13b
  replaced the TDLR link, the owner checked the rest: five resolve and say what we cite them
  for; `irs.gov/newsroom/fs-2025-05` and `data.sanantonio.gov/dataset/permits-and-inspections`
  were 404s. **Three of seven citations were dead** by the time anyone looked. Both are
  replaced, and all seven now carry `checkedByHumanOn: "2026-09-04"`.
  **`checkedByHumanOn` is a NEW field, deliberately separate from `urlVerifiedByFetch`.** A
  person clicking a link and a build issuing a request are different evidence with different
  failure modes, and one must not stand in for the other. Every URL on this site is still
  `urlVerifiedByFetch: false` or unasserted — the proxy denies every host, so the build has
  never confirmed any of them. What changed is that a human has.

- **⚠️ OWNER ACTION — the 25C WORDING is unverified, and it may be materially wrong.** The
  HVAC page previously said the credit "terminated for property **placed in service** after
  December 31, 2025". That is a specific statutory test, and section 25C has historically
  treated an expenditure as made when the original **installation is completed** — a different
  test that gives a different answer for work spanning the cutoff. **Round 14 could not read
  the source to settle it**: the proxy denies `www.irs.gov`, so the FAQ text was never loaded.
  Rather than guess, the copy now states only what the owner confirmed — the December 31 2025
  end date and the absence of a grandfather provision — and sends the reader to the FAQ for
  the straddling case: *"the test that decides eligibility is set out in the IRS guidance
  linked below — read that rather than any summary of it, including this one."*
  The notice carries `wordingVerifiedAgainstSource: false`. **Read the FAQ and either restore
  a precise test or leave the pointer.** This is the failure mode a live link cannot catch: a
  URL that resolves under a paraphrase nobody checked.

- **⚠️ OWNER ACTION — the San Antonio dataset UUID could not be confirmed against our own
  code, and the brief that supplied it assumed otherwise.** The replacement URL is
  `data.sanantonio.gov/dataset/05012dcb-ba1b-4ade-b5f3-7403bc7f52eb`. The round brief said
  that UUID "is the package your own fetcher resolves every run". **It is not, as far as this
  repo can show.** Both fetchers resolve the package by SLUG —
  `package_show?id=building-permits` at `sanAntonioPermits.ts:50` and
  `permitTradeActivity.ts:149` — and the UUID appears **nowhere in the repository**. CKAN
  accepts either a name or an id for the same package, so the two very likely address the same
  dataset, but nothing here proves it and the proxy denies the host so it could not be checked.
  **Worth confirming once** that `/dataset/05012dcb-…` and `?id=building-permits` are the same
  package. If they ever diverge, the page would cite one dataset while the ingest reads another
  — and nothing would notice.
  **Recommended once someone touches the fetchers** (not done, it would be an ingest change):
  export the package id from `sanAntonioPermits.ts` and derive the citation URL from it, so the
  citation and the fetcher cannot drift apart by construction.

- **Round 14 BUILT the weekly citation link check** recommended in Round 13b —
  `.github/workflows/citation-check.yml` + `site/scripts/check-citations.ts`, no new dependency
  (Node's built-in fetch; the URLs come from the content config that already declares them).
  **What it does:** one HEAD per distinct cited URL — seven today — every Monday 14:00 UTC,
  retrying once on GET when a host answers HEAD with 403/405/501 (several government sites do).
  On failure it **opens a GitHub issue**, or comments on the existing open one rather than
  filing a new one every week. **It never fails a build or a deploy** — a red X on a scheduled
  job is a thing people stop seeing; an issue is a thing with an assignee.
  **Cost, against COST.md rule 3:** ~7 requests a week, ~364 a year, roughly one per site per
  week, on free Action minutes. No response body is read; nothing is stored. Rule 3 governs the
  INGESTION path, where request volume scales with data refresh and the result becomes a number
  on a page. This touches no dataset, runs on a fixed weekly clock regardless of traffic or
  commits, and its only output is an issue for a human. **If it never ran, no number on the
  site would change.**
  **Deliberately NOT in `npm run build`:** Workers Builds runs on every push to `main`, so a
  build that issues outbound requests would fail deploys for reasons unrelated to the commit —
  a government site down for maintenance would block a release — and would turn "check a few
  links" into polling at whatever rate anyone commits. It also cannot run in the agent sandbox,
  where every one of these hosts is proxy-denied; it would fail every local build.
  **What a pass means:** the URL responded that day. **NOT** that the page still says what we
  cite it for — TDLR could keep `/licenses.htm` alive and add roofing to it, and this stays
  green. That second question is `reviewEveryDays`, which fails the BUILD when a dated claim
  ages past its cadence. Two mechanisms, two questions, neither a substitute for the other.

- **Round 14 narrowed the roofing licensing claim to what one page supports.** It said "no
  other Texas agency licenses it either" — true, but TDLR's list shows what TDLR regulates, not
  what every Texas agency does. **Rewriting was chosen over adding a second source**, because
  the broader statement is a negative across every Texas agency and no single primary page
  establishes it, while the practical guidance for a homeowner is identical either way: there
  is no licence number to check. **The contrast is untouched and now fully sourced** — the
  heading reads "Texas licenses HVAC, electrical and mold work. It does not license roofing",
  and the body names the three trades that ARE on TDLR's list against roofing's absence from
  it, which is exactly what the one cited page shows.

- **Round 12 known cosmetic defect, left deliberately:** the `#data` caption on
  `/san-antonio/plumbing/` reads "plumbing permits issued by…" with a lowercase first word.
  Fixing it in the shared template also changed that page, and the round required the two
  Round 10 pages to stay byte-identical — so the fix is scoped to roofing via an optional
  `dataCaptionNoun`, and plumbing keeps the typo until a round is allowed to touch it.

- **Round 10b CLOSED that seam, and closing it turned up something worth knowing:
  `new Date()` DOES NOT WORK at module scope during an Astro build here.** Astro evaluates
  modules under the Cloudflare Workers runtime, which freezes the clock in global scope.
  Measured directly this round: a module-level `new Date().toISOString()` prints
  **`1970-01-01T00:00:00.000Z`** during `npm run build`. The first version of the review gate
  was written the obvious way, compared every review date against 1970, found nothing overdue,
  and **passed a build with a claim 156 days past its cadence** - it looked like a closed seam
  and was a decoration. That is the failure mode this whole feature exists to prevent, so it is
  written down rather than quietly fixed.
  The fix: `astro.config.mjs` injects `__THI_BUILD_TIME__` through Vite's `define`, read in
  real Node when the config loads - the same trick `newestDataUpdate()` in that file already
  uses. `buildNow()` in `serviceNotices.ts` prefers it and falls back to the system clock
  outside a Vite build (so `tsx` and the unit replay work unchanged).
  **Anything at build time that needs the real date must use `buildNow()` or its own injected
  constant.** A wall clock read at module scope is 1970.
  **What the gate does now:** `assertNoticesFresh()` runs at module load, so any page, build or
  `astro check` that reaches the notices reaches it first. A claim past `confirmedOn +
  reviewEveryDays` **stops the build** - hard, not a warning, because a warning in build output
  is the thing nobody reads on the run that matters. The error names the page, the claim, how
  many days overdue, the primary source to re-verify against, and says explicitly not to move
  the date without re-reading the source. Proved end to end: backdating `confirmedOn` to
  2026-01-01 failed the build with "156 days overdue"; restoring it passed.
  It applies to **any** dated volatile claim carrying `reviewEveryDays`, not just 25C - adding
  the field to a future notice opts it in. Malformed input (zero, negative, or an unparseable
  date) throws rather than being skipped.
  `scripts/replays/noticefreshunit.ts` (21 assertions) covers both edges - fires one day past
  the cadence, does NOT fire on the due date itself - and guards the clock injection against
  being silently removed, which is the one regression that would restore the 1970 behaviour
  invisibly.

- **Round 10b: the EIA electricity rate is RESTORED to `/san-antonio/hvac/`.** Round 10
  withheld it under a blanket reading of "no price figure" and flagged it; the owner's call is
  that a published, federally-collected utility rate is an observed fact of the same class as
  an air-quality index, and the no-price rule exists to stop **fabricated cost ranges** built
  on unusable permit valuation. It renders with its four-bucket label and dual dates like every
  other reading. **The rate and nothing else**: no monthly bill, no payback, no counterfactual -
  each needs this home's consumption, which we do not hold. The label says **Texas**, because
  the EIA series is statewide and presenting it as a San Antonio rate would be exactly the
  quiet overstatement the labelling rules exist to prevent. `saservicerender` asserts the rate
  block carries no quantity beyond the rate and its dates.

- **Round 10b: the footer's two QuoteReady links are gone; they were NOT "the last" ones.**
  Round 10's report said the footer held the last QuoteReady surfaces. That was wrong - it was
  based on checking only the two San Antonio pages. Removing `"All services" -> /services/` and
  `"Project Brief" -> /start/` from `Footer.astro` changes all 265 built HTML pages, and
  **the footer is the only thing that changed on 264 of them** (the 265th is
  `/san-antonio/hvac/`, which also gained the rate). Verified file by file across the whole
  build: 76 non-HTML byte-identical, 265 differing only inside `<footer>`, exactly one distinct
  footer variant, zero unexpected deltas.
  **`/start/` is still linked from seven other places**: the homepage CTA, `LocationHub` (x3),
  `PPCPage` (x2), `ServicePage`'s hero and closing CTA on the twelve Austin service pages, and
  `/brief/[project_id]` (which needs it - that is the resume path for an in-flight intake).
  `/services/` is still linked in-body from both location hubs and the twelve Austin service
  pages. So this round retired the CHROME, not the funnel. Retiring the rest is a real round.
  **Nothing was orphaned**: `/services/` keeps in-body inbound links from `/austin/`,
  `/san-antonio/` and twelve service pages - verified in the browser.

- **Round 10b recommendation on `/services/` and `/start/`: NEITHER should 301 this round.**
  - **`/services/`** is not QuoteReady at all. It is a config-generated hub - 39 links, zero
    QuoteReady mentions, indexed, canonical, in the sitemap - and its own docstring records
    that it was deliberately reinstated because without it "the 14 location x service pages
    were reachable only from each other and from one homepage strip, which is thin internal
    linking for a third of the indexed site." Redirecting it would destroy internal linking to
    a third of the indexed site to satisfy a rule aimed at a NAV ITEM. **Recommend: keep it
    indexed and reachable in-body; do not redirect.** If the owner wants the URL gone, the
    honest move is to rebuild that linking elsewhere first, not to 301 and hope.
  - **`/start/`** is already `noindex, follow`, absent from the sitemap, and carries the
    QuoteReady title. It has therefore never accumulated search equity, so a 301 buys nothing
    for SEO - and it would **break `/brief/[project_id]`'s resume link** for anyone with an
    in-flight intake. **Recommend: no redirect. Leave it noindexed and unlinked from chrome,
    and decide its fate when QuoteReady is formally decommissioned** - its four `/api/intake/*`
    routes and its D1 tables are still live, and the page, the endpoints and the tables should
    retire together rather than piecemeal.
  - Finding, unrelated to the funnel: **`/start/` has no `<h1>`.** Pre-existing, on a noindexed
    page, so low-stakes - but it is an accessibility defect, not just an SEO one.

- **Round 10 seam: the IRS 25C notice on `/san-antonio/hvac/` is a DATED FACT ON A REVIEW
  CADENCE.** The page states that the Energy Efficient Home Improvement Credit (IRC section
  25C) terminated for property placed in service after **December 31, 2025** under the One Big
  Beautiful Bill Act, with **no grandfather provision** for equipment bought before July 4,
  2025 and installed after. Cited to **IRS Fact Sheet 2025-05** (irs.gov) and nothing else -
  never an aggregator, a news write-up or an installer's page.
  **Confirmed 2026-09-04. Re-verify every 90 days** against the primary source. It lives in
  `site/src/data/serviceNotices.ts`, which carries `confirmedOn` and `reviewEveryDays` per
  notice; the page renders the confirmed date beside the citation, so a stale one is visible
  rather than silent. The statutory date itself will not drift, but IRS guidance on it can,
  and a successor credit would make the page wrong by omission rather than by error - which is
  the failure mode a cadence exists to catch. **Nothing in the build enforces this**: there is
  no check that fails when a notice ages past its cadence. That is the seam. A build-time
  assertion over `reviewEveryDays` would close it and was not in this round's scope.

- **Round 10: the San Antonio below-hero layer, and the three conflicts it had to resolve.**
  `/san-antonio/hvac/` and `/san-antonio/plumbing/` now render a data layer over
  `permit-trade-activity` - the Round 8 feed that until this round no page read at all.
  **(1) `services/*.yaml` is PER-SERVICE, shared by both metros.** The round lifted the copy
  freeze "for San Antonio" and separately said not to touch Austin's service pages. Editing
  the shared YAML cannot do both, so the YAML is untouched and San Antonio's replacement lives
  in `site/src/data/belowHero.ts`, keyed by location AND service. Austin's two pages are
  content-identical to HEAD (only the content-hashed stylesheet filename differs, because
  `global.css` gained the layer's rules).
  **(2) "No hero changes" vs "prove no QuoteReady copy survives".** The hero carried the
  QuoteReady pitch - eyebrow, H1, lede, microcopy and a "Build a Project Brief" CTA. Those
  cannot both hold. Resolved by reading the no-hero-changes constraint against its own stated
  reason ("the tools that belong there need parcel data San Antonio does not have"): the hero
  STRUCTURE is untouched - no tool, no address input, no layout change - and its COPY is
  replaced, because a retired funnel's pitch is not a thing to leave on an indexed page.
  **If the owner meant that literally, reverting is a one-file change** to the four hero
  ternaries in `ServicePage.astro`.
  **(3) QuoteReady survives in the FOOTER**, sitewide: a "Project Brief" link to `/start/` and
  an "All services" link to `/services/` - the latter against ROADMAP's "permanently removed
  from nav, do not re-add or link". Both are shared chrome on all 29 pages, so changing them is
  a sitewide edit this round did not have. The inline `/services/` link was removed from the
  two rebuilt pages; **Austin's twelve service pages still carry it**. Recorded as a finding.

- **Round 10: what the permit feed licensed, and what it did not.** Every figure on both pages
  is computed at build time from `src/data/generated/permit-trade-activity/san-antonio.json` -
  no number is a literal anywhere in the content config, and the render replay re-derives them
  from the archive rather than pinning them, so an assertion cannot pass by agreeing with a
  figure someone typed into a brief. Two figures in the round brief did not match the data and
  the data was used: **plumbing is nine MAPPED types, eight of which ISSUED** a permit in the
  window (`Plumbing MRFPSS Permit` issued none), and plumbing rose **5.0%** half-over-half
  against a ±2.2% threshold - it clears, so the page reports a small real increase rather than
  "flat". **The trend threshold is 100/√mean**, the Poisson counting noise on a monthly count;
  `lib/tradeActivity.ts` computes it and refuses the trend claim when a change does not clear
  it. It is the conservative form: the noise on a six-month sum is 1/√6 of it.
  **Four readings were omitted and are named ON THE PAGE**, not left as gaps - cooling degree
  days (the `noaa-climate` feed has no San Antonio file at all, and its Austin file is a
  one-observation SAMPLE; there is no San Antonio `nws-api` feed either), any parcel-derived
  percentile or pipe-era reading (no BCAD data), any cost figure (blocked, not unbuilt), and
  the **EIA Texas residential electricity rate**. That last one is a Rule 1 flag rather than a
  gap: the feed is live and current, and the round barred "any price figure". A published
  utility rate is not a project cost, and it was the HVAC page's existing `SERVICE_SIGNALS`
  reading before this round - so withholding it is a real loss of context. **Owner decision:
  does the no-price rule cover a published utility rate?**

- **Round 10 finding: `Article` schema omits `datePublished` and `mainEntityOfPage` sitewide.**
  Both are Google-recommended rather than required, and both pages validate without them.
  `datePublished` is absent by an existing deliberate policy in `Base.astro` ("omit rather than
  guess"); `mainEntityOfPage` is simply not emitted. Adding either is a sitewide `Base.astro`
  change, not a two-page one.

- **Round 10: the three specs the brief cited do not exist in the repo** - `page-brief.md`,
  `below-hero-content-spec.md`, `data-labeling-spec.md`. Searched repo-wide; nothing matches.
  The brief restated enough of each inline to proceed (block order, "#answer is the largest
  text after the H1", "Data through X, Confirmed Y", reuse `DataStatus`), so the round was
  built to those restatements. The consequence to know: the instruction "if
  below-hero-content-spec.md asks for a reading whose feed does not exist, omit it and list
  what it needed" could not be followed against the spec - the omitted list was derived from
  the live feeds instead, and may not match what that document actually asks for.

- **Round 9c: the fixture now carries a SYNTHETIC CONDITION, and `r7replay` is 68/68.** The
  three data-dependent assertions diagnosed in Round 9b are deterministic; nothing in the
  suite is red.
  **What the fixture guarantees that it did not before.** A fifth account, **FIRED**
  (`fired@fixture.local`), whose home carries the area **`fixture-condition`**. The logged-in
  dashboard reads `alerts[]` from the precomputed artifact keyed on `home.area_id`
  (`src/lib/account/readIndex.ts`), so a fixture area gets a fixture artifact and the two
  real areas are untouched. `npm run fixture` writes
  `dist/client/data/stress-index/fixture-condition.json` after the D1 work; `npm run build`
  clears `dist/`, so the order is unchanged - build, fixture, worker, replays.
  **How synthetic it actually is: barely.** `evaluateAlerts` fires the heat alert when the
  LATEST NWS observation forecasts a high at or above 100F. Austin's committed archive holds
  15 such readings; the most recent (2026-09-03T12:00Z, **102F**) is four observations old,
  and the current one reads **99F**. So the observation is real, committed, and really did
  cross the threshold - the only synthetic act is treating it as the current one. One degree
  and four hours. (That 99F also settles Round 9b's finding: there is genuinely no active
  Austin condition and no product bug; the heat alert is one degree from firing on its own.)
  **The copy is the product's, not the fixture's.** `scripts/fixture-condition.ts` EXTRACTS
  the heat alert's template literals from `src/lib/account/alerts.ts` and fills them the way
  the product would, on every fixture run. This is the load-bearing part: if the fixture
  wrote its own sentences, `r7replay` asserting "the card says area, never at your home"
  would only prove the FIXTURE says it. The extraction throws rather than falling back to its
  own words if the templates ever move.
  **PRODUCTION ISOLATION - four independent reasons, two of them enforced at runtime.**
  (1) The artifact is written into `dist/`, which `site/.gitignore:2` ignores, so it cannot be
  committed - and the generator runs `git check-ignore` and **refuses to write** if that ever
  stops being true (proved: unignoring `dist/` makes it refuse).
  (2) Production builds generate their own `dist/` from a fresh clone at a commit, so a file
  that cannot be committed cannot exist in that build.
  (3) `fixture-condition` is in no ZIP crosswalk and no `areaDefinitions()` entry, so the real
  build never emits an artifact by that name - and the generator **refuses** if the string
  ever appears in `zipAreas.ts` (proved).
  (4) Every real `home_profiles.area_id` is set from ZIP->area resolution at signup, so no real
  home can read it even if it somehow shipped.
  On top of those it is self-labelling: a `__fixture` block in the artifact and a
  `FIXTURE:`-prefixed `conditionKey`.
  **A new never-dormant guard: `scripts/replays/alertcopyunit.ts` (23 assertions).** It reads
  `src/lib/account/alerts.ts` and checks EVERY alert template - firing or not - frames its
  reading as area- or county-level, never claims the reading is about the reader's address
  (a negated mention like the freeze alert's "not a measurement at your home" is correctly
  allowed), describes a condition rather than damage, and names its source. It also proves
  the fixture's extraction reproduces the product's sentences. This is the guard that cannot
  go dormant: `r7replay`'s version only ever checks the one alert that happens to be
  rendering, which is how it sat red for three rounds.
  **Worth knowing:** `r7replay`'s `!/at your (home|address|house)/i` is blunter than the
  product's real standard - it would fail on the FREEZE alert, whose copy says "not a
  measurement at your home" and is *more* explicit about the same honesty point, not less.
  `alertcopyunit` encodes the rule properly. The FIRED home also renders "the San Antonio
  metro" in its precision note, because the page reads
  `areaId === "austin" ? "Austin" : "San Antonio"`; only the fixture account sees it, and the
  precision-note assertion runs against POP.
  **The geometry assertion is rewritten and can no longer break on a band change.** It pins
  what is structural - the signal card at 351px and the score row at 611px, neither of which
  depends on copy - then asserts the verdict FITS (no overflow, inside the row, within its
  62ch prose cap), and re-measures under all six band words the index can produce. Both
  `Elevated` (391px, the old pinned number) and `Moderate` (398px, today's) pass, along with
  Calm/Settled/Normal/Severe at 384px.
  **Item 3, the weekly-toggle state: the reset stays in the FIXTURE, not in a restore step.**
  `local-fixture.ts` already deletes `account_email_prefs`, `weekly_email_sends` and
  `email_suppressions` every run. A restore inside `r9render` would only run when the replay
  finishes, and this replay's history is of not finishing - measured: a run that completes all
  18 assertions ends by unsubscribing POP and is self-cleaning by accident, while a run that
  ABORTS at the unsubscribe section (no `.dev.vars`) leaves the toggle ON and fails both
  weekly assertions on the next run. Exactly the case a restore step cannot cover. Both
  assertions now carry `STALE FIXTURE? re-run: npm run fixture` in their failure note, so the
  wrong diagnosis is harder to reach.

- **Round 9b's three findings, for the record (all now closed by Round 9c):**
  - Two event-card assertions only pass while an Austin condition is active. There is none
    today: `[data-alert]` matches zero elements, so no card renders. The assertions are
    written as unconditional presence checks (`r.event && ...`), so absence reads as failure
    even though absence is correct. What they actually guard - that the card, WHEN it exists,
    says "area" and never "at your home", and states that it goes away when the condition
    does - is a copy-honesty guard that cannot fire with nothing to check.
  - The pixel-geometry assertion (`verdict 391px`) is **not** a CSS regression and is not
    traceable to a commit. `.dash-score-read` is a `flex: 0 1 auto` item, so its width is its
    widest child's max-content width, and that child is the verdict sentence itself:
    "Conditions across Austin scored 46 of 100 (Moderate)." The pinned 391px is the rendered
    width of that sentence with the band word **Elevated**; today's band word is
    **Moderate**, which measures 397.72px -> 398. Measured directly: every two-digit score
    renders identically, `(Elevated)` gives 391.13px and `(Moderate)` gives 397.72px. Austin's
    composite score is 46, and the band edge for Elevated is 50 (`stressIndex/config.ts:205`),
    so the score crossed a band edge downward since the assertion was written. The sibling
    `.signal-card` measurement in the same assertion is still exactly 351px - the layout did
    not move; one word in the copy got wider.

- **Round 8 stores trade-permit activity as MONTHLY AGGREGATES, not per-permit rows — an
  owner decision, with a known and recoverable cost.** Widening both cities to the seven
  trade categories at per-permit granularity was measured, from the Round 6 enumerations, at
  **98,835 San Antonio rows (71.0% of 139,124) and 41,436+ Austin rows (75.6% of 54,798)** —
  roughly **101,000 observations a year**, against the ~7,000 the archive holds today. That
  archive is append-only, committed to git by the daily cron, and loaded into the build's
  module graph by `import.meta.glob({eager:true})`, so the growth would land on repo size,
  build memory and build time together, against `COST.md` rule 5. The signal the owner
  specified is counts, timing and trend, none of which needs a row per permit.
  So `permit-trade-activity` stores **one observation per category per month** — about 170
  rows a year across both metros — while `municipal-permits` is untouched and keeps
  per-permit rows for roofing only, which is what `/data/{metro}/roof-permits/` publishes.
  **What is given up:** per-permit detail for the six non-roof categories — no permit
  numbers, no descriptions, no day-level dates, so no "50 most recent" table and no
  within-month timing for hvac, plumbing, electrical, foundation, solar or trees.
  **It is recoverable:** both cities publish the full history, and a future round can
  re-ingest at row level from source. Nothing is lost permanently; it is simply not being
  stored now.
  Every aggregate row carries `mappingVersion` (`trades-v1`), `mechanisms` and `sourceValues`
  so a count is never read without knowing which metro-native values produced it and whether
  the city assigned the trade or a text match inferred it — and so counts computed under
  different mappings are never silently compared.
- **Austin has no foundation and no tree permit source at all.** Its five `permit_type_desc`
  values and 29 `work_class` values contain neither, measured run #34. Both categories could
  in principle be text-matched out of `description`, but Round 6 never measured that and
  Round 8 classifies only from observed values, so they are recorded in
  `CATEGORIES_WITHOUT_SOURCE` as **absent, not zero**. A page must not render them as an
  empty chart for Austin — that would assert a measurement nobody made.

- **Permit valuation is unusable as a cost signal in BOTH metros.** Measured run #34; full
  tables in `docs/audits/round-6-permit-measurement.md`. San Antonio's `DECLARED VALUATION`
  is commercial-only: **0.00%** populated on Mechanical (0/16,395), Electrical General
  (0/13,977), Plumbing Irrigation (0/11,514), Re-Roof (0/10,161) and Foundation Repair
  (0/5,243), against 100% on Comm New Building (915/915) and Comm Finish Out (258/258).
  Exactly three non-commercial types carry anything at all — 13 rows between them (Plumbing
  General 4, Plumbing Gas 8, On Premise Sign 1). Austin's trade-named fields are worse than
  empty: they carry **whole-project construction values against a trade sub-permit** —
  `plumbing_valuation_remodel` median **$900,000** across its 81 usable values,
  `mechanical_valuation_remodel` median **$1,000,000** across 60. Austin's coalesced
  `valuationUsd` holds 5,893 positive values of which 4,594 are ≤ 10 — **median 1**. The one
  survivor is `electrical_valuation_remodel` restricted to Electrical Permits (7,088 of
  15,932, median $4,700, IQR $1,200–$15,000), and **there is no electrical vertical**, so it
  serves nothing today. Do not build a cost page, calculator or "typical spend" figure on
  permit valuation in either metro.
- **Austin has no roofing permit type; its roof count is a text match dominated by solar.**
  `work_class = "Roof"` has **one row** in 54,798, and none of the five `permit_type_desc`
  values mentions roofing, so essentially every match comes from free-text `description`. Of
  the 1,945 stored roof-matched observations, **633 (32.54%) mention solar, photovoltaic or
  PV**, and `work_class = "Auxiliary Power"` is **469 rows, 98.7% solar**. A hand-classified
  random sample of 40 came out 35% actually re-roofing, 32.5% roof-adjacent, 32.5%
  unrelated — the unrelated set including an event permit at a venue called "Moody Rooftop"
  and a sign permit for a business named Hargrove Roofing. `/data/austin/roof-permits/`
  labels this honestly today; the risk is a future round reading the count as roofing demand.
- **Austin and San Antonio roofing counts must NEVER be compared or shown side by side.**
  San Antonio counts a dedicated `Re-Roof Permit` type (10,161 rows, 100% roof); Austin runs
  a `%ROOF%` text search that discards 96.57% of permits and is a third solar. Normalised
  they differ **3.27×** (SA 6,140/365d vs Austin 1,878), or 16.78× against Austin's explicit
  re-roof floor of 366. That gap is a measurement-method artefact, not a demand difference,
  and two adjacent numbers on a page assert comparability whether or not the prose does.
- **Cross-metro plumbing comparison is classification-dependent — do not publish as demand.**
  SA's nine plumbing types aggregate to 41,277 → **24,945/365d** against Austin's single
  Plumbing Permit type at **14,801** (1.69×). Most of the gap is irrigation: SA Plumbing
  Irrigation is **6,958/365d** against Austin's `work_class = "Irrigation"` at **1,851**, a
  3.8× difference in a category where the two cities plausibly have different permitting
  rules rather than different plumbing. Excluding irrigation both sides gives ≈1.4×.
- **Mechanical is the one cross-metro comparison the data licenses.** SA aggregate
  (Mechanical 16,395 + LSR Mechanical 1,766 + Mechanical Completion 268 = 18,429) normalises
  to **11,137/365d** against Austin's measured **10,703** — **1.04×**. Two cities, two
  permitting systems, two independently written parsers, agreeing within 4%. That agreement
  is also the best evidence both feeds are being read correctly.

- **The two TEMP enumeration steps and their scripts were removed in Round 7**, their
  purpose served. Every measurement they produced is preserved in
  `docs/audits/round-6-permit-measurement.md` with the run number for each figure, and both
  scripts are recoverable from git history at the Round 6 commit if a re-measure is ever
  needed. One thing genuinely goes away with them: the Austin step cross-checked the
  server-side `%ROOF%` count against a local reproduction of `isRoofingRelated()` on every
  run — a live consistency check between the fetcher's SoQL predicate and its JavaScript
  one. It never failed, and nothing replaces it.

- **`fema-nfhl` is a working fetcher against a dead endpoint, and the run summary cannot
  say so.** Reported in Round 4c; **not fixed.** Three separate findings, all read off the
  code and the committed dataset files:
  1. **It is not a stub.** `femaFlood.ts` has a real `fetchRaw()` that builds and issues an
     ArcGIS query. It is nonetheless registered as `entry("stub", femaFlood)`
     (`registry.ts:64`) and grouped with the genuine stubs both here (the item below) and in
     `dataFreshness.ts`. The tier label and the implementation disagree, so "stub" in the run
     log does not mean "unimplemented" for this one dataset.
  2. **A dead endpoint and an untouched stub print the same word.** `failAttempt()` keeps
     `status: "sample"` when a dataset was never `live`, and reports the outcome as
     `sample-unchanged` whenever the file still holds its seeded row
     (`runIngestion.ts:141`). So a fetcher that ran, was refused, and changed nothing is
     summarised identically to one that never attempted anything. The evidence is not
     wholly lost — `lastError` **is** written into the dataset file and committed — but it
     is only visible by opening the JSON, never from the run summary.
  3. **The diagnostic detail regressed between runs, and the regression overwrote the
     useful message.** Run #30 recorded
     `FEMA NFHL query failed: HTTP 404 from …/NFHL/MapServer/28/query?…` — the server
     answered, so the path or the layer number is wrong (layer 28 was never verified live;
     the fetcher's own header says to list the service's layers rather than guess another
     number). Run #31 recorded a bare `fetch failed`, which is undici's wrapper for a
     transport failure — DNS, TLS, reset or timeout — meaning no HTTP response arrived at
     all. Those are different faults with different fixes, and the second is now the only
     one on record: `lastError` is a single overwritten field, so `main`'s copy of
     `fema-nfhl/austin.json` carries `"fetch failed"` and the 404 detail is gone.
     The cause is one line: `runIngestion.ts:118` does
     `err instanceof Error ? err.message : String(err)` and never reads `err.cause`, which
     is exactly where undici puts the real reason. Every transport-level failure in every
     fetcher therefore collapses to the same three words.
  Adjacent, noted while reading and also unfixed: when the query *succeeds* but returns no
  features, `femaFlood.ts` substitutes `floodZone: "X (unshaded)"` with a note calling it
  "FEMA's default outside a mapped hazard area." That is an inference presented in the same
  shape as a measurement. It cannot be reached today (no query has ever succeeded), but it
  is worth settling before this feed goes live.

- **The five stub datasets carry a placeholder freshness window.** `ercot`, `fema-nfhl`,
  `noaa-climate`, `tdi-losses` and `tx-forest-service` are set to 30 days in
  `site/src/lib/dataFreshness.ts` — a deliberately conservative placeholder, not a real
  cadence. Each is `sample`-status today, so the window is never reached; the moment one is
  wired to a live source its real publication cadence has to replace that 30 and the
  comment beside it says so. (The brief that raised this said "four" and listed five;
  there are five.)

### ✅ Resolved — `[skip ci]` suppressed every ingestion deployment

**Confirmed 2026-09-03 and fixed on the Round 1 branch.** Recorded here rather than
deleted, because the failure mode is worth remembering.

`[skip ci]` is a GitHub Actions convention, and **Cloudflare Workers Builds honors it
too.** The ingestion workflow put it in every commit message, so every scheduled data
commit landed on `main` and was never built. The live site kept serving whatever was baked
in at the last hand-authored merge while `main` accumulated fresh readings nobody could
see. Silent by construction: no error, no failed build — the Cloudflare build reported
"skipped".

Evidence: build `2d70ac3` ("Data ingestion: update generated datasets [skip ci]") shows
status **skipped**, and Version History contains **no version for any ingestion commit** —
only merges and dashboard secret changes.

Two things follow that are worth carrying forward:

1. **GitHub Pages did the opposite.** Pages ignores `[skip ci]` and rebuilt the legacy
   Jekyll site on every ingestion push — so the one surface that kept redeploying was the
   retired one. The owner is unpublishing Pages and clearing its custom domain by hand; the
   root `CNAME` (which re-established Pages' claim on the domain) is deleted on this branch.
2. **The fix is not verifiable before merge.** Removing `[skip ci]` is a one-word change,
   but the only real proof is a scheduled run producing an actual Cloudflare version instead
   of a skipped build. That can first be observed at the **next 09:17 UTC ingestion run
   after this merges**. Check Workers & Pages → `texashomeintelligence` → Deployments for a
   version whose commit is a `Data ingestion: update generated datasets` commit.
- **`BANNED_ACTION_PATTERNS` guards rendered dashboard actions and the weekly email only.**
  It is referenced from `signalActions.ts` and `email/weekly.ts` and nowhere else — page
  titles, headings and slugs are not checked against it.

---

## Seam 4 — Dashboard consent/PII capture (reserved; build round pending)

The dashboard's home-unlock (address + email → D1) requires, before
anything is stored: a consent checkbox + consent text, `consent` +
`consent_source` + timestamp columns in a new D1 migration, a server-only
capture route, and a published `/privacy/` page (none exists yet). ZIP-level
reads store nothing and need none of this. Owner owns the consent/legal
wording (TDPSA/TCPA review); the build round stubs it with a documented
TODO until supplied.

**Ratified 2026-08-29 (owner):** these tables are **separate from the
QuoteReady tables**, not extensions of them. `migrations/0001_init.sql`
(`projects`, `intake_responses`, `generated_briefs`, `contractor_requests`)
stays the QuoteReady intake schema and is now applied to the remote D1; the
dashboard's consent / home-profile / reminder tables get their own migration
and their own names. They share the database, not the schema — which is the
`CLAUDE.md` two-domain rule applied one level down: a homeowner who unlocks a
dashboard has not started a QuoteReady project, and collapsing the two would
make consent provenance ambiguous exactly where it must not be.

The exact columns are a **Round 5 deliverable and must be settled before the
first PII write** — consent provenance cannot be backfilled after the fact, so
the schema decision gates the capture route, not the other way round.

---

## Seam 5 — Transactional email (Resend) 🔴 owner-owned

The magic-link and alert paths send through `src/lib/email/transport.ts`. Two
things are yours and cannot be done from here:

1. **`wrangler secret put RESEND_API_KEY`** — a Worker secret. It is never in
   the repo, never in `wrangler.jsonc`, and never read into a constant or a log.
   The transport reads it per call, so setting it takes effect on the next
   request with no redeploy.
2. **SPF and DKIM on the sending domain.** The From address defaults to
   `accounts@texashomeintelligence.com` and can be overridden with the
   `EMAIL_FROM` var. It must be a verified THI domain — never a `resend.dev`
   sandbox address, which would put a third party's domain on mail that signs
   people into their own account.

Until the secret exists, the stub transport runs, logs what it would have sent,
and **reports itself**: the sign-in page tells the visitor delivery is not
switched on rather than showing a success message for an email that does not
exist.

**Every message goes to exactly one recipient — the person it is about.** No
bcc, no operator copy, no reply-to redirect. A magic link is a credential and an
alert is about someone's home. A lead-notification feed (Slack or otherwise) is
a separate path that must never be wired into this one.

**Round 9 adds the weekly email to this transport, unchanged in that respect.**
It uses the same single-recipient call, plus a `List-Unsubscribe` header pair.
It also introduces a second Worker secret that is yours:

**`wrangler secret put EMAIL_LINK_SIGNING_KEY`** — any long random string. It
signs the unsubscribe tokens, so that an unsubscribe link authorises exactly one
account's one preference and cannot be edited into someone else's. **Until it is
set, the weekly send refuses to run at all** and reports why (HTTP 409): an
email whose unsubscribe link cannot work is worse than no email. Sign-in links
and alerts are unaffected — they do not use it.

---

## Seam 11 — The weekly email's schedule lives in GitHub Actions 🟡

`@astrojs/cloudflare` 14.2.3 emits a Worker whose only export is the fetch
entry point. It has no `workerEntryPoint`/`scheduled` hook (verified against the
adapter's dist), so a native **Cloudflare Cron Trigger cannot reach a
`scheduled()` handler** without a build-config or dependency change — ask-first
under SECURITY.md, and not worth it for a weekly job.

So the clock is `.github/workflows/weekly-email.yml`, which POSTs to
`/api/email/weekly-run/` on the deployed Worker. The Worker does all the work;
the workflow only triggers it and prints counts. Moving to a native Cron Trigger
later replaces that file and changes no application code.

**What you set:**

| Where | Name | What |
|---|---|---|
| Worker secret | `WEEKLY_RUN_TOKEN` | Any long random string. **Without it the trigger endpoint is a 404** — an unconfigured deployment exposes nothing. |
| Repo secret | `WEEKLY_RUN_TOKEN` | The same value. |
| Repo variable | `WEEKLY_RUN_URL` | The Worker origin, e.g. `https://texashomeintelligence.<subdomain>.workers.dev`. Point it at staging first. |
| Worker secret | `RESEND_WEBHOOK_SECRET` | Resend's `whsec_…` signing secret, from the webhook you create pointing at `/api/email/resend-webhook/` (subscribe to `email.bounced` and `email.complained`). **Without it that endpoint is a 404**, and bounces simply are not recorded. |

**Consent — decided 2026-08-30, default OFF.** Migration
`0004_weekly_email.sql` ships `enabled` defaulting to 0 and nothing enrols
anyone automatically. The account-consent checkbox covers sign-in links and the
condition alerts; a weekly digest is neither, so it is asked for separately in
two places, both an explicit act by the person: a separate unticked checkbox on
the sign-in form (source `signup`), and a toggle on the dashboard beside the
alert preferences (source `dashboard`). The signed one-click link in every
weekly email revokes it (source `unsubscribe-link`).

Existing accounts are never enrolled retroactively, and an unticked box is not
a request to unsubscribe — so a subscriber who signs in again without
re-ticking keeps what they chose. The first run therefore has zero recipients
until people opt in, which is the intended shape, not a gap.

**Explicitly NOT built, and not to be built without you saying so:** a one-time
"the dashboard is live" mail to `dashboard_launch_signups`. Those addresses
asked to be told when the product was ready — that is a different message, a
different consent, and a different send. The weekly recipient query never joins
that table.

---

## ⚠️ Cloudflare gotcha — verify this yourself before go-live

Cloudflare's **Bot Fight Mode** / WAF / the dashboard "block AI bots"
toggle can silently override `robots.txt` at the edge. `site/public/robots.txt`
(final as of Phase 4) explicitly allows the citation/search crawlers
(OAI-SearchBot, ChatGPT-User, PerplexityBot, Perplexity-User,
Claude-SearchBot, Claude-User, Googlebot, Bingbot) and the training
crawlers (GPTBot, ClaudeBot, Google-Extended — kept in their own
commented block so you can toggle them off independently), and blocks two
low-value scrapers (CCBot, DataForSeoBot) — but that file has **no
authority over Cloudflare's edge security settings**. **You need to check
the Cloudflare dashboard directly** (Security → Bots, and Security → WAF)
once this app is on Cloudflare Pages, and confirm none of the citation/
training bot user agents above are being challenged or blocked at the
edge before relying on citation traffic. This is the single most common
way an otherwise-correct AI-citation setup silently fails — robots.txt
being right is not sufficient proof the edge agrees with it.

---

## Seam 6 — Austin Water stage scrape is fragile by construction 🟡

`site/src/ingest/fetchers/austinWaterStage.ts` reads the current drought stage
off an **HTML page**, not an API, because Austin Water does not publish the
stage in any queryable form. Every other fetcher in the registry reads JSON;
this one is the exception, and it was approved on the condition that it fails
closed.

`extractStage()` matches only the exact names in `WATER_STAGES` and throws when
the page states **zero** stages or **more than one** (a "we are leaving Stage 2
for Conservation Stage" announcement mentions both, and text alone cannot say
which is current). A throw is a failed attempt: the prior reading is preserved,
the dataset goes `stale`, and the dashboard then shows the last known stage
clearly marked stale with its date while withholding the watering day — because
which day goes with which street-number parity changes between stages.

**What this means for you:** if the city restructures that page, this feed goes
stale and *stays* stale until someone updates the parse. That is intended, not a
bug — but it is silent unless someone is watching the dataset's status. There is
deliberately no "assume it's still Conservation Stage" fallback.

---

## Seam 7 — The A/B recycling week has no calendar anchor 🟡

The city's dataset says which week (**A** or **B**) an address is on. It does
**not** say which letter the current calendar week is running. Without that
anchor we can publish the letter as a labelled fact, which is what the dashboard
does — but we cannot turn it into a date, and a wrong week is a missed pickup.

`matchCollection()` therefore returns `week` as a letter and nothing in the
render path converts it to a day. **Do not add that conversion until a sourced
anchor exists** — deriving one from a single observed pickup, or assuming the
year starts on A, is exactly the guess this round was built to avoid. When a
sourced anchor lands, the change is small: the letter plus the anchor gives the
date, and the card already has the slot for it.

---

## Seam 9 — HSE_SUFF directional ambiguity costs ~1.6% of address coverage 🟡 (deferred, owner-recorded)

Measured against the first real ingest: 175,189 of 178,060 Austin Resource
Recovery addresses (**98.4%**) round-trip through `parseAddressLine` to the
same key the city's own pre-parsed columns produce. The remaining **2,826**
are one recurring shape, and it is an ambiguity in the city's encoding rather
than a parser bug.

The city records a bare directional letter in `HSE_SUFF` where a reader would
take it as a street directional:

    "1147 E POQUITO ST"  →  city: HOUSE_NO 1147 | HSE_SUFF E | STREET_NAM POQUITO
                            ours: HOUSE_NO 1147 | ST_DIR   E | STREET_NAM POQUITO

Nobody typing that address means the letter as a house suffix, so our reading
is the more natural one — but the keys differ, so the match misses and the
dashboard withholds. That is the safe direction (an honest "not shown", never
a wrong day), which is why this is a coverage nicety and not a defect.

**The agreed fix, when it is worth doing:** index *both* readings at ingest —
emit the row under the suffix key and the directional key — and collapse to
`AMBIGUOUS` if the two would ever disagree about day or week. That keeps
exact-match-or-withhold intact at serve time; the ambiguity is resolved once,
in the emitter, exactly as duplicate-row disagreement already is.

**Do not** solve this by loosening the matcher. A fallback that retries with a
different interpretation when the first key misses is fuzzy matching wearing a
hat, and it reintroduces precisely the failure mode the strict rule exists to
prevent.

---

## Seam 8 — Austin Water service-area boundary blocks Tier 2 🟡

The dashboard states the watering rule **conditionally** — "if your home is an
Austin Water customer" — and never asserts that a given day applies to a given
home. That is deliberate. Austin Water's service area does not follow city or
county lines: plenty of 787xx addresses are served by a MUD, Wells Branch,
Manville WSC or West Travis County PUA, and applying Austin Water's rule to one
of those homes would produce a confidently wrong day.

Making it personal ("your watering day is Friday") is **Tier 2**, and it needs a
service-area boundary we do not have — most likely the Austin Water polygon from
Austin GeoHub, plus a geocoder to place the address in it. Both are additions
that need approval (a geocoder is a new external dependency with its own rate
limits and terms). Until then the conditional framing is the honest ceiling, and
`buildWateringView()`'s doc comment points back here.

---

## Seam 12 — Lead notification: how much of a person goes into Slack 🟡 YOUR DECISION

The notifier (`site/src/lib/ops/leadNotify.ts`) is built, wired at both capture
points, and ships sending **event · ZIP · timestamp — and no identifier.**

**`wrangler secret put SLACK_LEADS_WEBHOOK_URL`** is yours; without it the whole
path no-ops with a debug line and signups are unaffected. A webhook URL is a
credential — anyone holding it can post into the channel — so it is a secret,
never a `PUBLIC_` var, and it is never logged, not even on failure.

**Why the payload is deliberately thin.** The privacy page we serve says,
without qualification:

> We do not sell, rent, or share your email address with third parties,
> including contractors.

and, further down, "We do not send your email address, your ZIP, or any other
personal detail to an analytics provider." Posting a homeowner's email or street
address into Slack is sending a personal detail to a third-party vendor. The
usual answer is that a vendor is a *processor* rather than a recipient — but that
page has no service-providers clause, so as written it does not cover this. And
it is not reversible: once an address is in a Slack workspace it is in that
workspace's history, search and exports.

So the default answers the ops question ("is anyone signing up, and where?")
without an identifier, and you can look the person up in D1, where their record
already sits under a consent you do hold.

**To send more, two things move together** — one constant and one paragraph:

1. `LEAD_DETAIL` in `site/src/lib/ops/leadMessage.ts`: `"zip"` (default) →
   `"email"` → `"email+address"`. Both fuller levels are built and tested; the
   street address additionally requires that the homeowner ticked the box to
   store it at all, so it is two gates, not one.
2. A service-providers paragraph on `/privacy/`. Drafted, for you to approve,
   reject or rewrite — **not applied**:

   > **Tools we use to run the service.** A small number of vendors process
   > data on our behalf so the service can run: our email provider delivers
   > your sign-in links and any alerts you have asked for, and a signup
   > notification reaches our own internal channel so we know someone has
   > joined. They act on our instructions and may not use your data for their
   > own purposes. This is not selling, renting or sharing your details with
   > contractors or advertisers, which we do not do.

Flipping the constant without shipping the paragraph would make our own privacy
page false. The comment on `LEAD_DETAIL` says so at the point of change.

## Seam 10 — Google Sheet mirror of the same leads 🟡 not built

You mentioned wanting the leads mirrored into a spreadsheet. Not built, and
deliberately not guessed at: what a sheet should hold is a different question
from what a Slack ping should say (a sheet is a durable record, so Seam 12's
decision applies to it with more force, not less).

The extension point exists. `DESTINATIONS` in `leadNotify.ts` is an array; a
second entry — a Google Apps Script Web App URL in a `GSHEET_WEBAPP_URL`
secret — inherits the isolation, the no-op-when-unconfigured behaviour and the
per-destination error containment for free, and nothing else in the file
changes. The round that adds it owns the column decision.

---

## Seam 1 — Live data APIs ✅ ingestion framework built (Phase 5), every fetch is yours to implement

Built: the normalized schema, the merge/backfill/stale pipeline (real,
not stubbed), the GitHub Actions cron, and one fetcher module per feed —
all 15 with the exact same interface, so implementing one doesn't require
touching the pipeline around it. **Every single `fetchRaw()` body is an
unimplemented TODO stub that throws** — that's the entire content of
this seam. Nothing here fabricates a value; every dataset file currently
on disk is honestly marked `"sample"`.

### Framework files (real, not stubs — read before touching a fetcher)

| File | What it does |
|---|---|
| `site/src/ingest/types.ts` | The normalized shape every feed conforms to: `Observation<T>`, `DatasetFile<T>`, `FetcherModule<T>`, `FetchContext`. `FeedStatus` (`"sample" \| "live" \| "stale" \| "error"`) matches `DataStatus.astro`'s contract exactly. |
| `site/src/ingest/merge.ts` | `computeFetchWindow()` — real backfill logic: a dataset with no observations yet gets a full trailing window (default 365 days), everything after that is incremental. `mergeObservations()` — real append-only merge: a new `key` appends, a repeated `key` updates in place (a correction), nothing is ever dropped. |
| `site/src/ingest/runIngestion.ts` | `runIngestion(fetcher, filePath)` — orchestrates one fetcher: checks `requiredEnvVars`, calls `fetchRaw`, merges the result, writes the file. On any failure (missing env var, thrown error, or today, always — every `fetchRaw` throws), it preserves whatever's on disk and only moves status `"live"/"stale"` → `"stale"`; a dataset that's still `"sample"` (never yet lived) stays `"sample"` rather than being marked `"error"`. |
| `site/src/ingest/seed.ts` | One-time, idempotent seeding (`seedIfMissing`/`seedAll`) — generates the illustrative SAMPLE historical series each dataset file starts with. Deterministic (seeded PRNG), and skips any file that already exists — it never resets real accumulated history. |
| `site/src/ingest/registry.ts` | `REGISTRY` — the one array mapping every fetcher to its output file path (`src/data/generated/{datasetId}/{location}.json`) and its tier (`"deep"` vs `"stub"`, see below). |
| `site/scripts/ingest.ts` | The CLI entrypoint (`npm run ingest`, via `tsx`) that `.github/workflows/data-ingestion.yml` runs: seeds anything missing, then runs every registered fetcher. |
| `.github/workflows/data-ingestion.yml` | Daily cron (`workflow_dispatch` too) that runs `npm run ingest` and commits+pushes anything that changed under `site/src/data/generated/`. Cloudflare Pages auto-deploys on push to `main` — the push itself is the "trigger a rebuild" step, nothing separate needed. |

### What you do for every fetcher, regardless of tier

1. Get the credential (if the table below lists one) and add it as a
   **GitHub Actions repository secret** (Settings → Secrets and variables
   → Actions) with the exact name shown — `.github/workflows/data-ingestion.yml`
   already passes each one through as an env var. (This is separate from
   Cloudflare Pages env vars — ingestion runs in GitHub Actions, not on
   Cloudflare, so nothing here needs a Cloudflare-side env var.)
2. Replace the body of that fetcher's `fetchRaw()` with a real HTTP
   call, returning `Observation<T>[]` in the shape already defined at the
   top of the file. Each file's doc-comment names the real endpoint to
   start from and the specific gotcha to check (format changes, which
   platform a city's open-data portal actually runs on, etc.).
3. Delete that fetcher's now-unused `notImplemented(...)` import/call.
4. That's it — `runIngestion` picks it up automatically next cron run
   (or `npm run ingest` locally). No registry, schema, or pipeline change
   needed.

### Deep tier — real backfill/merge/stale logic already exercised end-to-end on sample data

| Feed | Fetcher file | `fetchRaw()` | Env var(s) | Generated file(s) |
|---|---|---|---|---|
| NOAA Storm Events ✅ **implemented, verified live** | `site/src/ingest/fetchers/noaaStormEvents.ts` | `makeFetcher("austin"\|"san-antonio")` → exports `noaaStormEventsAustin`, `noaaStormEventsSanAntonio` | none (NOAA bulk data is keyless) | `noaa-storm-events/austin.json`, `noaa-storm-events/san-antonio.json` |
| Austin municipal permits (Socrata) ✅ **implemented** | `site/src/ingest/fetchers/austinPermits.ts` | exports `austinPermits` | `SOCRATA_APP_TOKEN` (optional — raises the anonymous rate limit, not required to fetch at all) | `municipal-permits/austin.json` |
| San Antonio municipal permits (CKAN) ✅ **implemented** | `site/src/ingest/fetchers/sanAntonioPermits.ts` | exports `sanAntonioPermits` | none (keyless CKAN, not Socrata) | `municipal-permits/san-antonio.json` |
| EIA TX residential electricity price ✅ **implemented** | `site/src/ingest/fetchers/eiaElectricityPrice.ts` | exports `eiaElectricityPrice` | `EIA_API_KEY` (free instant signup) | `eia-electricity/texas.json` |

Verified for real (not just written): a standalone test run of
`runIngestion` against a fake fetcher proved the full state machine —
first successful fetch → `"live"`; a second successful fetch with one
more row → `"live"` with the new row **appended**, the first row
byte-for-byte unchanged; a simulated failure after that → `"stale"`,
observations preserved exactly, `lastError` recorded. `npm run ingest`
run twice in a row against the real (stubbed) fetchers confirmed the
seeded sample files are untouched aside from `lastAttemptAt`/`lastError`
— no data reset, no duplication.

The Austin roofing data-detail page (`site/src/pages/data/austin/roofing/index.astro`)
now imports `noaa-storm-events/austin.json` directly and computes its
metrics (trailing-12-month event count, largest hail size, the events
table) from real observations instead of hand-typed numbers — the moment
`noaaStormEventsAustin.fetchRaw()` is implemented and a cron run
succeeds, that page's `SAMPLE` badge becomes `LIVE` with no code change.
Permits and EIA electricity price don't have a data-detail page yet — no
page reads `municipal-permits/*.json` or `eia-electricity/texas.json`
yet; building those pages is a Phase 2-style template addition, not part
of this seam.

**Austin permits** (Socrata SODA, dataset `3syk-w9eu` "Issued Construction
Permits"): filters via a `$where` SoQL clause matching `work_class` /
`permit_type_desc` / `description` against "roof", paginated 5,000 rows
at a time, keyed by `permit_number`. `PermitValue` gained an optional
`valuationUsd` field (backward-compatible — existing seeded sample rows
don't set it). Column names are Austin's documented Socrata schema but
**not independently verified live** (sandbox network policy blocks
`data.austintexas.gov`) — if the first live run comes back empty, check
these column names first.

**San Antonio permits** (CKAN, NOT Socrata, keyless): resolves
`package_show?id=building-permits`, finds the resource named "Permits
Issued", downloads and parses its CSV (shared parser, see below). Since
the CSV's real header spelling isn't confirmed live, header resolution
tries several plausible spellings per logical field (permit number,
type, description, status, issue date, valuation) and uses whichever is
actually present — same defensive posture as NOAA's county-field risk,
for the same reason.

**Shared CSV parser extracted**: `site/src/ingest/csv.ts` now holds the
RFC4180-ish parser (quoted fields, embedded commas/quotes/newlines) that
NOAA Storm Events originally had inline — San Antonio permits needs the
identical logic, so it's a shared module now, not two copies.

### Round 2 — nine more feeds wired (real `fetchRaw()`, not stubs)

All nine below were implemented from documented API shapes but **could
not be verified against a live response from this sandbox** — its
network policy blocks every one of these hosts. Each file's doc comment
says exactly what to check first if the first live GitHub Actions run
comes back empty for that feed, rather than guessing blind a second
time. `ercot.ts`, `tdiLosses.ts`, `txForestService.ts`, and
`noaaClimate.ts` remain untouched TODO stubs (endpoint unconfirmed, or
need a key not yet provided).

| Feed | Fetcher file | Real fetch | Env var(s) | Notes |
|---|---|---|---|---|
| NWS forecast/alerts | `nws.ts` | `/points` → forecast periods + `/alerts/active` | none (needs descriptive `User-Agent`, not a token) | Current-conditions feed, doesn't backfill the window — one observation per run |
| FEMA / NFHL flood zone | `femaFlood.ts` | ArcGIS REST point-in-polygon query, layer 28 ("Flood Hazard Zones") | none | Layer id not verified live; static per-point data, one observation per calendar month |
| USDA Soil Data Access | `usdaSoil.ts` | SDA Tabular `POST` query (`SDA_Get_Mukey_from_intersection_with_WktWgs84`) | none | `shrinkSwellPotential` deliberately left `undefined` — the real interpretation-table join isn't confirmed; only `soilType`/`drainageClass` (verified SSURGO columns) are populated |
| AirNow AQI ✅ **now Austin + San Antonio** | `airnow.ts` | current-observation endpoint by zip, worst pollutant reported | `AIRNOW_API_KEY` (required) | Expanded from Austin-only per this round's ask; new registry entries `airnowAustin`/`airnowSanAntonio` |
| Census ACS housing stock | `censusAcs.ts` | ACS 5-year detailed table, Travis County | `CENSUS_API_KEY` (optional) | Vintage pinned to 2023 as a constant — TODO(owner): bump yearly once the next vintage is confirmed released |
| BLS OEWS trade wages | `blsWages.ts` | Public Data API v2, plumbers median hourly wage, Austin MSA | `BLS_API_KEY` (optional) | **Highest-uncertainty fetcher in this batch** — the OEWS series id (`OEUM001242000000047215208`) is assembled from documented series-id conventions, not confirmed against a live response. If status isn't `REQUEST_SUCCEEDED` or the series is empty, look up the real id at https://data.bls.gov/PDQWeb/oe before re-guessing |
| U.S. Drought Monitor ✅ **replaces the TWDB/TexMesonet stub** | `usdm.ts` (new; `twdbDrought.ts` deleted) | `GetDroughtSeverityStatisticsByAreaPercent`, county FIPS (Travis 48453, Bexar 48029) | none | Dataset id renamed `twdb-texmesonet` → `usdm-drought`; now two locations (`usdm-drought/austin.json`, `usdm-drought/san-antonio.json`); reduces each week's D0-D4 percent-of-area breakdown to a single worst-category label — documented simplification, not fabrication |

### Round 2 verified live on a real Actions run — 7 of 9 confirmed working

The next real cron run confirmed (with actual returned values, not just "no
error"): **NWS, USDA Soil, AirNow (both cities), Census ACS, BLS, and EIA**
are all genuinely live and returning plausible real data (e.g. BLS: $30.20/hr
median plumber wage; NWS: a real active Heat Advisory alert; USDA Soil:
"Urban land, 0 to 6 percent slopes" — a real SSURGO map unit name). Two came
back needing fixes, both applied:

1. **`usdm.ts` (U.S. Drought Monitor)** ✅ **fixed and verified live** —
   two bugs, both real, both confirmed against live Actions runs rather
   than guessed: (a) errored with `Unexpected token '<'` (an HTML page,
   not JSON) — the *data* API lives on a different host than the
   informational site,
   `usdmdataservices.unl.edu/api/CountyStatistics/GetDroughtSeverityStatisticsByAreaPercent`,
   not `droughtmonitor.unl.edu/DmData/...`, and needed an explicit
   `Accept: application/json` header plus the `aoi` param (not `area`);
   (b) after that fix, the request succeeded but silently returned 0
   parsed rows every time — the real API's JSON is **camelCase**
   (`mapDate`, `d0`-`d4`), not the PascalCase (`MapDate`, `D0`-`D4`)
   originally assumed, and `mapDate` is a full datetime string, not the
   `YYYYMMDD` form assumed. Both counties are now genuinely `"live"`
   with 54 weeks of real history (e.g. Travis: D2 Severe Drought, 10% of
   county; Bexar: D1 Moderate Drought, 32% of county).
2. **Austin/San Antonio permits** ✅ **fixed and verified live** — three
   real bugs, each found by capturing real evidence from a live Actions
   run rather than guessing twice:
   - **Austin**: every run threw HTTP 400. The Socrata error body (once
     actually logged instead of just the status code) named the real
     column list — the date column is `issue_date`, not `issued_date` as
     originally guessed, a one-character typo. Fixed with a project-wide
     find/replace. Verified live: 1,881 real roofing permits fetched,
     1,893 total after merge.
   - **San Antonio, header mismatch**: the real CSV header is `DATE
     ISSUED` (word order reversed from the original `ISSUE DATE`/`ISSUED
     DATE` guesses), and there's no free-text description or status
     column at all — `WORK TYPE`/`PROJECT NAME` are the closest
     scope-of-work proxies, and every row in the "Permits Issued"
     resource is issued by definition, so status now defaults to
     `"Issued"`. Fixed by adding the real header spellings to the
     candidate lists. Also fixed a latent bug spotted along the way:
     `new Date(rawDate).toISOString()` threw a `RangeError` on any
     unparseable date instead of being skipped like the surrounding
     checks intend — now checks `isNaN` first.
   - **San Antonio, wrong resource**: after the header fix, every run
     still came back with 0 matches in the trailing-365-day window, with
     18,777 real roofing-permit rows found but all older than the
     window. Two rounds of diagnostic logging (per-stage counts, sample
     matches, then a max-parsed-date tracker across every match) proved
     this wasn't a parsing bug — the newest matching permit was
     genuinely dated 2024-12-31. The real root cause: the CKAN
     `building-permits` package has **two** resources whose name matches
     a loose "permits issued" pattern — `"PERMITS ISSUED 2020-2024"` (a
     frozen historical archive) and `"PERMITS ISSUED"` (the actually-
     current one, `last_modified` within the same week as the query).
     `findPermitsIssuedCsvUrl()`'s `.find()` was silently picking
     whichever came first in the API's resource array, which happened to
     be the archive. Fixed by collecting every name match and picking the
     one with the latest `last_modified` instead of the first regex
     match. Verified live: 5,077 real roofing permits fetched, 5,082
     total after merge.
3. **`femaFlood.ts`** — HTTP 404 on the NFHL MapServer layer 28 query,
   meaning layer 28 isn't "Flood Hazard Zones" on this MapServer instance
   (or the whole path is wrong). **Not fixed yet** — flagged for the next
   round.
4. **`blsWages.ts`** — new finding: on the incremental (post-first-run)
   window it threw `returned no data points for 2026-2026` and got
   demoted `live` → `stale`. OEWS is annual with a real publication lag
   (no 2026 estimates exist yet, only through 2025) — the underlying
   feed is fine, but `fetchRaw` throws on an empty result instead of
   returning `[]`, so a normal "nothing new yet" period looks like a
   failure. EIA's fetcher handles the identical situation correctly
   (returns `[]`, stays `live`). **Not fixed yet** — flagged for the
   next round.

**`/austin/` and `/san-antonio/` hub pages showed SAMPLE regardless of
real data** ✅ **fixed**. Their "Current Homeowner Conditions" cards read
straight from the static `locations/*.yaml` content collection
(`conditions[].value.status`), hardcoded to `sample` back in Phase 1 and
never revisited once real fetchers went live — those two pages were
structurally incapable of showing LIVE no matter what the ingestion
pipeline produced. `LocationHub.astro` now maps each condition label,
per city, to the real generated dataset file that backs it (when one
exists for that city) and overrides status/asOf/source at render time.
**⚠️ If the live site still shows stale/SAMPLE data after this and the
drought/permits fixes above are on `main`**: check that Cloudflare Pages
is actually auto-deploying on push to `main` (Pages dashboard →
Deployments → confirm the latest deployment's commit hash matches
`main`'s HEAD) — this is an owner-side setup item CLAUDE.md already
flags as unconfirmed, and every fix in this file only reaches the live
site through that auto-deploy.

**Hero drought map** ✅ **fixed and verified live**. The originally
hotlinked `current_tx.png` alias never existed, and the first
self-hosting attempt assumed the wrong reference day: it computed the
most recent *Thursday* (USDM's release day) and got a real HTTP 404 on
all 8 weekly attempts on a live Actions run — not a network block, the
pattern itself was wrong. Rather than guess again, a temporary
diagnostic version of `scripts/fetch-drought-map.ts` probed the bare
directory listing plus a matrix of filename variants and logged every
attempt; the real Actions run's log showed the directory listing
directly (autoindex is enabled) — confirming the file is
`{YYYYMMDD}_TX_trd.png` (the suffix guess was right) but the directory
is dated to the most recent **Tuesday** (USDM's data-valid/cutoff date),
not Thursday. Fixed and collapsed back to the one real URL; the same
run's log confirmed a match (`20260818_TX_trd.png`, 67,498 bytes,
verified real PNG magic bytes) and the file is committed at
`site/public/images/drought/current_tx.png`, which `DroughtMapHero.astro`
points at.

A related regression also surfaced and was fixed: the workflow's
`git add src/data/generated/ public/images/drought/` hard-failed (exit
128, "pathspec did not match any files") whenever the drought-map step
hadn't written anything yet, which aborted the *entire* commit step —
silently dropping every real dataset update from that run too (this bit
two runs in a row before being caught). Fixed by only `git add`-ing the
drought image path when the directory actually exists.

**NOAA Storm Events `fetchRaw()` is now real, not a stub** — the endpoint
that was corrected in this round (the original stub referenced the
retired `ncdc.noaa.gov` path; it now hits NCEI's actual bulk archive:
`https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/`, keyless).
It parses the directory listing (picking each year's latest `c`-dated
revision), downloads and gunzips the year files the backfill/incremental
window actually needs, parses the CSV (hand-rolled RFC4180-ish parser —
NOAA's narrative fields contain embedded commas/quotes/newlines a naive
`split(",")` would corrupt), and filters to Travis/Bexar + each one's
bordering counties, Texas only, and hail/wind/tornado/flood event types.
Keyed by NOAA's own `EVENT_ID` — stable across re-ingestion, so a
corrected magnitude updates in place per the existing merge logic
(untouched). Verified via a full mocked-network test (realistic synthetic
CSV data matching NOAA's real schema, multi-year window spanning, an
intentionally-stale duplicate-year revision to confirm "latest `c` wins,"
cross-county/cross-state/wrong-event-type rows to confirm scoping, and
all three real failure modes — network error, listing HTTP 500, a listed
year file 404ing — confirmed to throw rather than silently return empty
or fabricated data) — every case passed. **Verified live** on a GitHub
Actions run against the real NCEI endpoint: 65 (Austin) / 63 (San
Antonio) real Travis/Bexar-area hail/wind/tornado/flood records fetched
and merged in alongside the original seeded sample rows, status
legitimately `"live"`.

The first live run surfaced two bugs, both fixed:
1. `runIngestion.ts` flipped status to `"live"` whenever `fetchRaw()`
   succeeded, even with 0 raw records — so a dataset with only seeded
   SAMPLE data and a network 403 (this sandbox blocks `ncei.noaa.gov`) or
   a narrow-window zero-result was incorrectly reported live. Fixed: a
   0-record success now only sets `"live"` if the dataset already had
   prior live/stale evidence; otherwise status is left unchanged.
2. `merge.ts`'s `computeFetchWindow()` dated the incremental `since`
   window from the last **seeded sample** observation's timestamp
   whenever any observations existed — producing a ~3-week window on the
   very first live attempt instead of a real 365-day backfill, so real
   historical events fell outside the window and got silently dropped.
   Fixed: the full backfill window is now used until a dataset has
   genuine prior live/stale evidence, not just sample rows. This affects
   every "deep" tier feed seeded with sample history, not just NOAA.

### Stub tier — genuinely still unimplemented (`fetchRaw()` throws a TODO)

| Feed | Fetcher file | Env var(s) | Generated file |
|---|---|---|---|
| NOAA Climate Data Online (normals) | `site/src/ingest/fetchers/noaaClimate.ts` | `NOAA_CDO_TOKEN` (not yet requested — add it if you implement this one) | `noaa-climate/austin.json` |
| Texas Dept. of Insurance (wind/hail, fire, water loss) | `site/src/ingest/fetchers/tdiLosses.ts` | none confirmed — TDI publishes as periodic data calls, not a standing API | `tdi-losses/austin.json` |
| ERCOT | `site/src/ingest/fetchers/ercot.ts` | none confirmed — no single documented REST API, some data is CSV/XML downloads | `ercot/texas.json` |
| Texas A&M Forest Service | `site/src/ingest/fetchers/txForestService.ts` | none confirmed — verify a machine-readable feed exists before assuming one | `tx-forest-service/texas.json` |

The other 11 feeds that used to be single-location stub-tier samples
(NWS, FEMA/NFHL, USDA Soil, AirNow, Census ACS, BLS, U.S. Drought
Monitor) now have real `fetchRaw()` bodies — see "Round 2" above. AirNow
and U.S. Drought Monitor were expanded to both Austin + San Antonio; NWS,
FEMA/NFHL, USDA Soil, Census ACS, and BLS remain single-location
(Austin/Travis) per this round's scope — extending one to San Antonio
too is the same "add a second `RegistryEntry`" pattern as
`noaaStormEventsAustin`/`noaaStormEventsSanAntonio`, whenever that's
asked for.

### A note on `data-sources.yaml`'s `status` field

`status` here describes whether a feed's `fetchRaw()` is real code (not
whether the GitHub secret it needs is actually set, or whether a given
`DatasetFile` on disk is currently `"live"` — that's the per-file runtime
status, a separate concept). It's now `"live"` for every feed with a real
`fetchRaw()` implementation, including the nine wired in Round 2 —
`noaa-climate`, `tdi-losses`, `ercot`, and `tx-forest-service` are the
only ids still `"stub"`, matching the fetcher files that are still true
TODO stubs.

---

## Seam 2 — Lead-form / intake backend hookup ✅ built (Phase 3), stubs still yours to wire

Built as: the `/start/` intake UI (an Astro island, `site/src/scripts/intake.ts`),
Astro API routes (**not** the `site/functions/` convention originally
sketched here — this project uses Astro's native `src/pages/api/*.ts`
route convention instead, each with `export const prerender = false`),
request validation (`site/src/lib/validation.ts`, Zod), and the data-access
interfaces they call (`site/src/lib/kv.ts`, `site/src/lib/db.ts`) — with
the actual writes to your email/Slack/Sheets providers left as documented
stubs (logged via `console.log`, never sent). KV + D1 writes themselves
are real (not stubbed) against your eventual production bindings — only
the external-notification calls are stubs.

| Piece | File (actual) | What's stubbed | Env var(s) needed |
|---|---|---|---|
| `POST` — create project, return-link email | `site/src/pages/api/intake/start.ts` | Logs `Resume link: /start/?resume=...&token=...` instead of emailing it | `RESEND_API_KEY` or equivalent (_TBD — confirm provider_) |
| `GET`/`PATCH` — resume + save answers as steps complete | `site/src/pages/api/intake/[project_id]/index.ts` | Nothing external here — KV+D1 writes are real | — |
| `POST` — generate the deterministic brief | `site/src/pages/api/intake/[project_id]/complete.ts` | Logs a "brief generated" notification instead of posting to Slack | `SLACK_WEBHOOK_URL` |
| `POST` — post-brief contractor-count + phone request | `site/src/pages/api/intake/[project_id]/contractor-request.ts` | Logs the request instead of routing it to a real contractor-matching process; only reachable once `status === "brief_generated"` (enforced server-side, 409 otherwise) | _TBD — depends how you want these routed_ |
| Google Sheets mirror | _not built — CLAUDE.md marks Sheets as a downstream mirror only, never project-state storage_ | N/A | `GOOGLE_SHEETS_*` (_TBD_) |

**Shared validation/token/type modules** (not stubs — these are finished,
real code the routes above depend on): `site/src/lib/validation.ts`
(Zod schemas for every payload), `site/src/lib/token.ts` (project ID +
opaque return-token generation), `site/src/lib/types.ts`
(`ProjectState`/`GeneratedBrief`/`ContractorRequest`), `site/src/lib/brief.ts`
(the deterministic, non-LLM brief generator).

**What you do:** provide the email-send provider + API key, the Slack
webhook URL, and (later, optional) Sheets credentials/contractor-routing
destination; swap each stub's logged payload for a real call. Nothing
else in this seam needs rebuilding — the validation, auth, and
persistence around each stub are already real and tested.

---

## Seam 3 — Database build-out ✅ scaffolded + seeded (Phase 3), yours to provision + extend

Built as: D1 SQL schema + migration, KV binding shape, and a typed
data-access layer — seeded with obviously-fake sample rows only
(`*.seed@example.com`).

| Piece | File (actual) | Status |
|---|---|---|
| D1 schema/migration (`projects`, `intake_responses`, `generated_briefs`, `contractor_requests`) | `site/migrations/0001_init.sql` | ✅ built, verified against a real local D1 (Miniflare) instance |
| D1 seed script (sample rows) | `site/fixtures/seed.sql` (moved out of `migrations/` in Round 13) | ✅ built |
| KV binding (project state + return tokens) | `site/src/lib/kv.ts` | ✅ built (`getProject`, `putProject`, `mapTokenToProject`, `resolveToken`) |
| Data-access layer (typed, used by the API routes) | `site/src/lib/db.ts` | ✅ built (`insertProject`, `updateProjectServiceLocation`, `updateProjectStatus`, `insertIntakeResponse`, `insertGeneratedBrief`, `insertContractorRequest`) |
| `wrangler.jsonc` bindings | `site/wrangler.jsonc` | ✅ present, with the **real Cloudflare resource IDs**, verified against the owner's account. (This row previously said "local placeholder IDs only — `local-placeholder-projects-kv`, `local-placeholder-d1-database`". Those strings are long gone from the file; the note outlived them.) |

Verified locally end-to-end via `wrangler dev` (real Miniflare-backed KV +
D1, no mocks): project creation, PATCH-driven answer saves, resume via
return token, brief generation, and contractor-request all read/write
correctly, and D1 stays in sync with KV (confirmed by querying D1
directly after each step).

**Gotcha found and fixed during this phase, worth knowing:** `wrangler d1
execute --local` persists to a directory relative to whichever
`wrangler.jsonc`/`wrangler.json` **config file path** you pass with
`--config`, not your shell's cwd. Running the migration against
`site/wrangler.jsonc` and then serving via `wrangler dev --config
dist/server/wrangler.json` (the built Cloudflare adapter output) writes
to two different local SQLite files unless you pass the *same* `--config`
to both — the dev server otherwise starts with tables missing (`D1_ERROR:
no such table: projects`). Locally we now always apply migrations with
`--config dist/server/wrangler.json` to match how `wrangler dev` is run
here; this is purely a local-dev-loop detail and has no bearing on how
you provision production D1.

**What you do:** ~~provision the real D1 database + KV namespace in your
Cloudflare account, bind them in the Pages project settings (replacing the
local placeholder IDs in `wrangler.jsonc` with real ones, or via
environment-specific config)~~ — **done.** The resources exist and
`wrangler.jsonc` carries their real IDs. What remains: run
`migrations/0001_init.sql` against production, and continue building out any
schema beyond what's scaffolded here. Do **not** run `fixtures/seed.sql`
against production — it's sample data only. (Round 13 moved it out of
`migrations/` precisely so the migrations workflow cannot run it by accident.)

---

## Analytics — not one of the 3 reserved seams, but still yours to key in

Built in Phase 4: GA4 + Cloudflare Web Analytics wiring and a working
AI-referral attribution mechanism, all in `site/src/layouts/Base.astro`.
Both scripts are **fully gated on real env vars being set** — with no ID
supplied, nothing analytics-related renders at all (no placeholder ID is
ever shipped, so a blank config can never quietly send traffic to a
property that doesn't exist).

| Piece | Where | Env var | Status |
|---|---|---|---|
| GA4 tag (`gtag.js`) | `Base.astro` `<head>` | `PUBLIC_GA4_MEASUREMENT_ID` (e.g. `G-XXXXXXX`) | ☐ set the env var in Cloudflare Pages → this is a **build-time** Vite `PUBLIC_*` var, baked in at build, not a runtime Worker binding |
| Cloudflare Web Analytics beacon | `Base.astro` `<head>` | `PUBLIC_CF_BEACON_TOKEN` | ☐ same as above — get the token from Cloudflare dashboard → Analytics → Web Analytics |
| AI-referral first-touch capture | `Base.astro` inline script | (uses the GA4 var above) | ✅ built — see below |

**AI-referral channel — what's built vs. what you still do in the GA4 UI:**
AI answer engines (ChatGPT, Perplexity, Claude, Gemini, Copilot) mostly
don't send a referrer GA4 recognizes as "search," so this traffic lands in
Direct by default and is invisible as a channel. The inline script in
`Base.astro` fixes the *data* side of this: on first landing, if
`document.referrer`'s host matches `chatgpt.com`, `perplexity.ai`,
`claude.ai`, `gemini.google.com`, or `copilot.microsoft.com` (subdomains
included), it stores that domain in `sessionStorage` and resends it as a
`ai_referral_source` user property/event param on every subsequent hit in
the session — so it survives internal navigation, not just the landing
page. **What's still manual, in the GA4 UI itself (Admin → Data display →
Channel groups → create a custom channel):** add a rule matching
`ai_referral_source` is set (or matches your domain list) → name the
channel "AI Referral." This is a GA4 configuration step, not something a
build can wire for you — GA4 doesn't expose channel-group definitions
through gtag/config.

**What you do:** create the GA4 property and Cloudflare Web Analytics
site, set the two env vars above in Cloudflare Pages (Settings →
Environment variables, **Production** — and Preview if you want analytics
in preview deploys too), then define the "AI Referral" custom channel in
the GA4 UI per the rule above.

---

## Cutover to production (separate from the three seams above)

Not a "seam" in the same sense, but worth tracking here since CLAUDE.md
defers it: **texashomeintelligence.com currently serves the live Jekyll
site on GitHub Pages.** This Astro app deploys as a Cloudflare Worker to
its own workers.dev staging subdomain independently (see the deploy-target
correction at the top of this file). Pointing the real domain at this app
(DNS change + retiring the GitHub Pages deployment) is an explicit,
separate go-live step — not implied by any phase above being "done."
