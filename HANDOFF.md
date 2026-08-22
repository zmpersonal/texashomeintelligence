# HANDOFF.md — Seams reserved for you

This tracks exactly what's stubbed vs. real, so "ready for live traffic" =
you filling in the items below. Updated as each phase lands — right now
(pre-Phase-0) it's an empty scaffold per your request.

---

## ⚠️ Cloudflare gotcha — verify this yourself before go-live

Cloudflare's **Bot Fight Mode** / WAF / the dashboard "block AI bots"
toggle can silently override `robots.txt` at the edge. Our `robots.txt`
will explicitly allow the citation/search crawlers (OAI-SearchBot,
ChatGPT-User, PerplexityBot, Perplexity-User, Claude-SearchBot,
Claude-User, Googlebot, Bingbot) and the training crawlers (GPTBot,
ClaudeBot, Google-Extended) — but that file has no authority over
Cloudflare's edge security settings. **You need to check the Cloudflare
dashboard directly** (Security → Bots) once this app is on Cloudflare
Pages, and confirm none of those user agents are being challenged/blocked
before relying on citation traffic.

---

## Seam 1 — Live data APIs

Ingestion framework, normalized schema, and stubbed fetchers get built in
Phase 5. Each feed below needs its real fetcher + credentials wired in;
until then it runs on the sample/backfill data we generate.

| Feed | Fetcher file (planned) | Env var(s) needed | Status |
|---|---|---|---|
| NOAA Storm Events | `site/src/ingest/fetchers/noaaStormEvents.ts` | _TBD_ | ☐ not started |
| NWS (forecast/observations/alerts) | `site/src/ingest/fetchers/nws.ts` | _TBD_ | ☐ not started |
| Austin municipal permits (Socrata) | `site/src/ingest/fetchers/austinPermits.ts` | `SOCRATA_APP_TOKEN` (optional, raises rate limit) | ☐ not started |
| San Antonio municipal permits | `site/src/ingest/fetchers/sanAntonioPermits.ts` | _TBD_ | ☐ not started |
| EIA TX residential electricity price | `site/src/ingest/fetchers/eiaElectricityPrice.ts` | `EIA_API_KEY` | ☐ not started |
| FEMA / NFHL | `site/src/ingest/fetchers/femaFlood.ts` | _TBD_ | ☐ not started |
| TWDB / TexMesonet | `site/src/ingest/fetchers/twdbDrought.ts` | _TBD_ | ☐ not started |
| Texas Dept. of Insurance (wind/hail, fire loss) | `site/src/ingest/fetchers/tdiLosses.ts` | _TBD_ | ☐ not started |
| AirNow | `site/src/ingest/fetchers/airnow.ts` | `AIRNOW_API_KEY` | ☐ not started |
| Census ACS | `site/src/ingest/fetchers/censusAcs.ts` | `CENSUS_API_KEY` (optional) | ☐ not started |
| BLS | `site/src/ingest/fetchers/blsWages.ts` | `BLS_API_KEY` (optional) | ☐ not started |
| ERCOT | `site/src/ingest/fetchers/ercot.ts` | _TBD_ | ☐ not started |
| Texas A&M Forest Service | `site/src/ingest/fetchers/txForestService.ts` | _TBD_ | ☐ not started |
| USDA Soil Data Access | `site/src/ingest/fetchers/usdaSoil.ts` | _TBD_ | ☐ not started |

**Priority 3 (real backfill + sample historical series built in Phase 5):**
NOAA Storm Events, Austin + San Antonio permits, EIA electricity price.
All others: fetcher interface + stub only until you provide keys.

**What you do:** get an API key/token where one is needed, fill it into
Cloudflare Pages environment variables (never into repo config), implement
the fetcher body (interface + expected return shape will already be
defined and type-checked), remove the `status: "stub"` flag in the data
source registry entry.

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

## Cutover to production (separate from the three seams above)

Not a "seam" in the same sense, but worth tracking here since CLAUDE.md
defers it: **texashomeintelligence.com currently serves the live Jekyll
site on GitHub Pages.** This Astro app deploys to its own Cloudflare Pages
project/subdomain independently. Pointing the real domain at this app
(DNS change + retiring the GitHub Pages deployment) is an explicit,
separate go-live step — not implied by any phase above being "done."
