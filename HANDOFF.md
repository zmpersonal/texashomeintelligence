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
- Real KV/D1 namespace IDs substituted for the placeholder IDs in
  `wrangler.jsonc` (or bound in the dashboard) before a production-grade
  deploy — the committed IDs are local/Miniflare placeholders.

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
| D1 seed script (sample rows) | `site/migrations/seed.sql` | ✅ built |
| KV binding (project state + return tokens) | `site/src/lib/kv.ts` | ✅ built (`getProject`, `putProject`, `mapTokenToProject`, `resolveToken`) |
| Data-access layer (typed, used by the API routes) | `site/src/lib/db.ts` | ✅ built (`insertProject`, `updateProjectServiceLocation`, `updateProjectStatus`, `insertIntakeResponse`, `insertGeneratedBrief`, `insertContractorRequest`) |
| `wrangler.jsonc` bindings | `site/wrangler.jsonc` | ✅ present, with **local placeholder IDs only** (`local-placeholder-projects-kv`, `local-placeholder-d1-database`) — these are not real Cloudflare resource IDs |

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

**What you do:** provision the real D1 database + KV namespace in your
Cloudflare account, bind them in the Pages project settings (replacing the
local placeholder IDs in `wrangler.jsonc` with real ones, or via
environment-specific config), run `migrations/0001_init.sql` against
production, and continue building out any schema beyond what's scaffolded
here. Do **not** run `migrations/seed.sql` against production — it's
sample data only.

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
