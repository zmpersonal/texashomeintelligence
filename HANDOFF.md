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

## Seam 2 — Lead-form / intake backend hookup

Built in Phase 3 as: the intake UI, the Pages Function handlers, request
validation, and the data-access interface they call — with the actual
writes to your store/Slack/Sheets left as documented stubs (logged, not
sent).

| Piece | File (planned) | What's stubbed | Env var(s) needed |
|---|---|---|---|
| Return-link email on intake start | `site/functions/api/intake/start.ts` | Logs the email payload instead of sending | `RESEND_API_KEY` or equivalent (_TBD — confirm provider_) |
| Project record persistence | `site/functions/api/intake/[project_id].ts` | Writes to KV only (see Seam 3); no external store yet | — |
| Slack notification on brief completion | `site/functions/api/intake/complete.ts` | Logs the Slack payload instead of posting | `SLACK_WEBHOOK_URL` |
| Google Sheets mirror | _not built until you say go — CLAUDE.md marks Sheets as a downstream mirror only, never project-state storage_ | N/A | `GOOGLE_SHEETS_*` (_TBD_) |

**What you do:** provide the email-send provider + API key, the Slack
webhook URL, and (later, optional) Sheets credentials; swap each stub's
logged payload for a real call.

---

## Seam 3 — Database build-out

Built in Phase 3 as: D1 SQL schema + migration, KV binding shape, and a
data-access layer — seeded with sample rows only.

| Piece | File (planned) | Status |
|---|---|---|
| D1 schema/migration (`projects`, `intake_responses`, `generated_briefs`) | `site/migrations/0001_init.sql` | ☐ not started |
| D1 seed script (sample rows) | `site/migrations/seed.sql` | ☐ not started |
| KV binding (project state + return tokens) | `site/src/lib/kv.ts` | ☐ not started |
| Data-access layer (typed, used by both API + build-time rendering) | `site/src/lib/db.ts` | ☐ not started |

**What you do:** provision the real D1 database + KV namespace in your
Cloudflare account, bind them in the Pages project settings, run the
migration against production, continue building out any schema beyond
what's scaffolded here.

---

## Cutover to production (separate from the three seams above)

Not a "seam" in the same sense, but worth tracking here since CLAUDE.md
defers it: **texashomeintelligence.com currently serves the live Jekyll
site on GitHub Pages.** This Astro app deploys to its own Cloudflare Pages
project/subdomain independently. Pointing the real domain at this app
(DNS change + retiring the GitHub Pages deployment) is an explicit,
separate go-live step — not implied by any phase above being "done."
