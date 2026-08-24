# HANDOFF.md — Seams reserved for you

This tracks exactly what's stubbed vs. real, so "ready for live traffic" =
you filling in the items below. Updated as each phase lands — current
through Phase 5 (ingestion framework).

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
| NOAA Storm Events ✅ **implemented** | `site/src/ingest/fetchers/noaaStormEvents.ts` | `makeFetcher("austin"\|"san-antonio")` → exports `noaaStormEventsAustin`, `noaaStormEventsSanAntonio` | none (NOAA bulk data is keyless) | `noaa-storm-events/austin.json`, `noaa-storm-events/san-antonio.json` |
| Austin municipal permits (Socrata) | `site/src/ingest/fetchers/austinPermits.ts` | exports `austinPermits` | `SOCRATA_APP_TOKEN` (optional — raises the anonymous rate limit, not required to fetch at all) | `municipal-permits/austin.json` |
| San Antonio municipal permits | `site/src/ingest/fetchers/sanAntonioPermits.ts` | exports `sanAntonioPermits` | none confirmed yet — verify which platform (Socrata vs. ArcGIS) San Antonio's portal actually uses before assuming Austin's shape | `municipal-permits/san-antonio.json` |
| EIA TX residential electricity price | `site/src/ingest/fetchers/eiaElectricityPrice.ts` | exports `eiaElectricityPrice` | `EIA_API_KEY` (free instant signup) | `eia-electricity/texas.json` |

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
or fabricated data) — every case passed. **Not independently verified
against the live NOAA endpoint**: this sandbox's outbound network policy
blocks `ncei.noaa.gov` (and `api.weather.gov`), so the only live-network
attempt from here got HTTP 403 at the proxy — the pipeline correctly
handled that (preserved the 10/8 existing sample observations, updated
only `lastAttemptAt`/`lastError`, stayed `"sample"` rather than
fabricating anything). The real end-to-end proof happens on the next
GitHub Actions cron run, which has normal internet egress.

### Stub tier — same schema/pipeline, single illustrative sample row, `fetchRaw()` fully unimplemented

| Feed | Fetcher file | Env var(s) | Generated file |
|---|---|---|---|
| NWS (forecast/observations/alerts) | `site/src/ingest/fetchers/nws.ts` | none (NWS API is keyless; needs a descriptive `User-Agent` header per its terms of use, not a token) | `nws-api/austin.json` |
| NOAA Climate Data Online (normals) | `site/src/ingest/fetchers/noaaClimate.ts` | `NOAA_CDO_TOKEN` (not yet requested — add it if you implement this one) | `noaa-climate/austin.json` |
| FEMA / NFHL | `site/src/ingest/fetchers/femaFlood.ts` | none | `fema-nfhl/austin.json` |
| Texas Dept. of Insurance (wind/hail, fire, water loss) | `site/src/ingest/fetchers/tdiLosses.ts` | none confirmed — TDI publishes as periodic data calls, not a standing API | `tdi-losses/austin.json` |
| TWDB / TexMesonet | `site/src/ingest/fetchers/twdbDrought.ts` | none | `twdb-texmesonet/austin.json` |
| USDA Soil Data Access | `site/src/ingest/fetchers/usdaSoil.ts` | none | `usda-soil/austin.json` |
| AirNow | `site/src/ingest/fetchers/airnow.ts` | `AIRNOW_API_KEY` | `airnow/austin.json` |
| Census ACS | `site/src/ingest/fetchers/censusAcs.ts` | `CENSUS_API_KEY` (optional) | `census-acs/austin.json` |
| BLS (OEWS trade wages) | `site/src/ingest/fetchers/blsWages.ts` | `BLS_API_KEY` (optional) | `bls/austin.json` |
| ERCOT | `site/src/ingest/fetchers/ercot.ts` | none confirmed — no single documented REST API, some data is CSV/XML downloads | `ercot/texas.json` |
| Texas A&M Forest Service | `site/src/ingest/fetchers/txForestService.ts` | none confirmed — verify a machine-readable feed exists before assuming one | `tx-forest-service/texas.json` |

These 11 are single-location samples (one representative city/statewide,
not both Austin and San Antonio) — narrower than the deep tier
deliberately, per this phase's scope. Extending one to full Austin + San
Antonio coverage is part of "implement the real fetcher," not a separate
step: add a second `RegistryEntry` in `site/src/ingest/registry.ts`
(follow the `noaaStormEventsAustin`/`noaaStormEventsSanAntonio` pattern)
once there's a second location's worth of real data to fetch.

### A note on `nws-api`'s status in `src/data/data-sources.yaml`

That registry (built in Phase 1) marks `nws-api` `priority: true` /
`status: "sample"`, matching CLAUDE.md's original "go deep on NOAA Storm
Events **+ NWS**" framing. This phase's instructions named exactly three
feeds for deep treatment — NOAA Storm Events, Austin/San Antonio permits,
EIA electricity — and NWS landed in the stub tier instead. Both facts
are true at once and don't conflict: `data-sources.yaml`'s `status:
"sample"` describes what's shown on the data-catalog page (accurate —
nothing here is fabricated as live), while the *ingestion pipeline's*
depth for NWS specifically is stub-tier until you ask for it to be
deepened. Flagging this explicitly so the mismatch doesn't look like an
oversight.

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
site on GitHub Pages.** This Astro app deploys to its own Cloudflare Pages
project/subdomain independently. Pointing the real domain at this app
(DNS change + retiring the GitHub Pages deployment) is an explicit,
separate go-live step — not implied by any phase above being "done."
