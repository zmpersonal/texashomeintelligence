# BUILD_PLAN.md — Texas Home Intelligence (Astro rebuild)

Tracks the phased build described in `CLAUDE.md`. This plan governs the
**new Astro app in `site/`** — the existing Jekyll site at the repo root
(the currently-live texashomeintelligence.com) is untouched by this plan
and stays as-is until go-live cutover.

Rule for every phase: **build it, run it, verify it the way the "how I'll
verify it" line says, then stop and report** — don't self-mark a phase done
from reading the diff.

---

## Phase 0 — Scaffold, stack, base layout, deploy pipe

**Goal:** an empty-but-real Astro app that builds, renders one page with
the design tokens applied, and is ready for Cloudflare Pages.

- [ ] `site/` Astro project: TypeScript, content collections enabled
- [ ] Tailwind CSS wired in with a custom design-token layer (color, type
      scale, spacing) — carries over the palette/voice already validated
      on the live Jekyll site (navy/slate + amber accent), not a new look
- [ ] `@astrojs/cloudflare` adapter configured (`output: "server"` or
      hybrid, so Phase 3's Pages Functions have somewhere to live later)
- [ ] Base layout (`src/layouts/Base.astro`): `<head>` meta scaffold,
      sitewide `Organization`/`WebSite` JSON-LD, nav/footer shells
- [ ] `robots.txt` per CLAUDE.md's crawler list (citation bots explicitly
      allowed, commented-out block for low-value scrapers, sitemap
      reference)
- [ ] `@astrojs/sitemap` integration wired in (even with 1 page)
- [ ] One real placeholder page at `/` proving the layout + tokens render
- [ ] `package.json` scripts: `dev`, `build`, `preview`
- [ ] `.gitignore` for `node_modules/`, `dist/`, `.astro/`
- [ ] Root Jekyll `_config.yml` excludes `site/` (done — verified the
      existing homepage output is byte-identical before/after)

**How I'll verify it:** `npm run build` exits 0; grep the built HTML for
unrendered template syntax (none expected); load the one page with
Playwright at desktop + mobile viewports and screenshot it; confirm the
JSON-LD block parses with `JSON.parse`. Report the local dev command and
the exact Cloudflare Pages dashboard steps (or `wrangler pages deploy`
command) to deploy `site/` — I do not hold Cloudflare credentials, so I
cannot execute the deploy myself. **Stop here for review — do not start
Phase 1 without explicit go-ahead.**

---

## Phase 1 — Data model + structured config ✅ done

**Goal:** every piece of copy/structure that varies by location or service
lives in typed config, not in page markup.

- [x] `src/content.config.ts` collections: `locations`, `services`,
      `intakeQuestions` (per service), `dataSources` (registry — name, org,
      primary use, THI output, status), `faq` (tagged product vs.
      authority) — Astro 7's Content Layer API (`glob`/`file` loaders +
      Zod schemas), not the legacy `src/content/config.ts` path
- [x] `locations`: Austin, San Antonio — name, region, counties, hub
      intro, dashboard conditions (`src/data/locations/*.yaml`)
- [x] `services`: 7 services with `copyStatus: supplied | draft`, hero
      copy, section copy, FAQ — ported verbatim from
      `docs/source/THI-Copywriter_Output.txt` for roofing/HVAC/plumbing;
      draft copy for the other 4, ported from the Jekyll build and marked
      `draft` (`src/data/services/*.yaml`)
  - [x] PPC hero (`ppcHero`) kept separate from the SEO-page hero for the
        3 supplied services — the copywriter doc supplies one body-copy
        block per service (labeled "PPC" in the source) which both page
        families share; only the *hero* differs (wireframe's city-specific
        hero for SEO pages vs. the copywriter's generic hero for `/lp/`)
- [x] `intake-questions`: per-service field list from handoff §10, typed
      (`id`/`label`/`kind`/`options`) — `src/data/intake-questions/*.yaml`
- [x] `data-sources`: all 14 feeds from handoff §11, `status: stub |
      sample | live` (the 4 rows behind CLAUDE.md's "go deep on three"
      groups — NWS, NOAA Storm Events, municipal permits, EIA — are
      `sample`; the other 10 are `stub`; nothing is `live`)
- [x] Every sample value uses the shared `sampleValue` schema
      (`status`/`asOf`/`source`) so the UI layer can render the SAMPLE
      badge/stale-state generically, without per-page logic

**How I verified it:** `npx astro sync` — Zod-validates every entry
against its collection schema (this is what actually caught and forced the
fix of a stray `z` import deprecation, see below); `npm run build` and
`npx astro check` both clean (0 errors/warnings/hints); a standalone
completeness script (`site/scripts/verify-content.mjs`, run via `npm run
verify-content`) checks the cross-cutting rules the per-file schema can't
— exactly 2 locations and 7 services present, the 3 supplied services have
`ppcHero` and the 4 draft ones don't, every service has a matching
intake-questions file, the 4 priority data sources are `sample` and none
are `live`, the FAQ has both tags represented within 6–8 entries. I
deliberately broke one rule (flipped `electrical`'s `copyStatus` to
`supplied`) to confirm the script actually fails loudly instead of passing
trivially, then restored it.

---

## Phase 2 — Templates (config-driven)

**Goal:** every route in the URL architecture renders from Phase 1 config
through a shared template — no hand-authored near-duplicate pages.

- [ ] Homepage — **reuses the section order and content already approved
      on the live Jekyll site** (Hero → QuoteReady + Live Data Proof → How
      QuoteReady Works → Something on Your Mind? → Austin Home Data
      dashboard → Texas Homeowner Guides → Methodology → Sources →
      QuoteReady CTA → FAQ). Re-implemented in Astro/Tailwind, not
      redesigned.
- [ ] 2 location hubs from one template + `locations` config
- [ ] 14 location×service pages from one template + `services`/`locations`
      config (top ~30–40% conversion, live-metric slots, H2 direct-answer
      blocks, dataset links, FAQ)
- [ ] 3 PPC landing pages (`/lp/roofing-austin/`, `/lp/hvac-austin/`,
      `/lp/plumbing-austin/` — supplied-copy services only for now),
      `noindex` by per-page config flag
- [ ] Data catalog (`/data/`) + one representative data-detail page
      (`/data/austin/roofing/`), ported from the existing Jekyll version:
      value/scope/period/comparison/updated/source/interpretation as
      static HTML + HTML table
- [ ] Methodology page

**How I'll verify it:** build all routes, assert route count matches
2 hubs + 14 service pages + 3 PPC + data catalog + 1 data-detail +
methodology + homepage; Playwright screenshot each page family (one hub,
one SEO service page, one PPC page, the data-detail page) at desktop +
mobile; grep every generated page for `SAMPLE` badges where expected and
zero raw unrendered template syntax.

---

## Phase 3 — Intake flow, generated brief, submission stub, KV/D1 scaffold

**Goal:** a working, resumable, deterministic intake → brief pipeline on
sample data, with the three reserved seams stubbed and documented.

- [ ] `/start/` multi-step intake (name+email first, no phone; service
      picker; project overview; service-specific questions from Phase 1's
      intake-question-map; prior work/photos; review) — an Astro
      island, not full-page JS
- [ ] Pages Function: `POST /api/intake/start` creates `project_id` +
      secure return token, **stub**-sends return-link email (logged, not
      sent)
- [ ] Pages Function: `PATCH /api/intake/:project_id` updates the project
      record as steps complete
- [ ] Deterministic brief generator: template keyed to structured intake
      fields → the 10 brief sections + limitation statement. No LLM
      inference of facts (an optional off-by-default prose-smoothing hook
      may be stubbed, never wired live)
- [ ] `/brief/:project_id/` token-gated brief view
- [ ] Cloudflare KV binding scaffold (project state + return tokens) —
      documented shape, sample read/write, real binding left to you
- [ ] Cloudflare D1 schema (SQL) for structured project/lead records —
      migration file + seed script with sample rows, no production data
- [ ] Post-brief screen offers optional contractor help (1/2/3 choice) —
      confirmed to never appear before the brief exists

**How I'll verify it:** walk the intake flow start-to-finish against the
local dev server (KV/D1 local emulation via `wrangler`), confirm a
resumed project via the return token preserves prior answers, confirm the
generated brief's fields trace back to specific intake inputs (no
invented facts), confirm no secret/key ever appears in client-shipped JS
(`grep` the client bundle).

---

## Phase 4 — AI/SEO layer

**Goal:** the finished shape is maximally legible to search + AI crawlers.

- [ ] Per-page-type schema: `Organization`, tool as `WebApplication`,
      `Dataset`/`DataCatalog` on real data pages, `BreadcrumbList`
      sitewide, `FAQPage` on FAQ blocks
- [ ] Breadcrumbs (visible + structured) on every non-homepage route
- [ ] Canonicals on every page; PPC pages `noindex` via the per-page flag
- [ ] Final `robots.txt` (citation bots allowed, training bots allowed per
      CLAUDE.md, low-value scrapers blocked-but-commented, sitemap ref)
- [ ] `sitemap.xml` generation covers every indexable route, excludes
      `/lp/*`
- [ ] `llms.txt` pointing agents at methodology + data catalog + best
      data pages
- [ ] GA4 snippet + documented custom channel grouping for AI-referral
      traffic (chatgpt.com, perplexity.ai, claude.ai, gemini.google.com,
      copilot.microsoft.com) + Cloudflare Web Analytics
- [ ] **`HANDOFF.md` gets the Cloudflare Bot Fight Mode / WAF warning**
      (dashboard-level AI-bot blocking can silently override robots.txt)

**How I'll verify it:** validate every JSON-LD block with a schema
validator pass (`JSON.parse` + required-field check per type), confirm
`sitemap.xml` entry count matches indexable route count, confirm `/lp/*`
pages carry `noindex` and are absent from the sitemap, confirm robots.txt
explicitly names each required crawler.

---

## Phase 5 — Ingestion framework

**Goal:** the pipe that will carry real data exists and is provably
correct on sample data, without needing real API keys yet.

- [ ] Normalized observation schema (value, geography, period, source,
      fetched-at, status: `ok | stale | error`) — one schema for all feeds
- [ ] GitHub Actions cron workflow: runs ingestion scripts, writes to
      `site/src/data/generated/`, commits, triggers a Pages rebuild
- [ ] Fetcher interface + stubbed fetchers for every feed in handoff §11
- [ ] Real backfill + stale/history logic, with **sample historical
      series** (not live-fetched) for the three priority feeds: NOAA Storm
      Events, Austin/San Antonio municipal permits, EIA TX electricity
      price
- [ ] Failure path proven: a fetcher returning an error preserves the last
      valid observation and marks it `stale` with its last-good timestamp
      — never silently zero/null
- [ ] Historical observations append, never overwrite

**How I'll verify it:** run the cron script locally against the sample
fixtures, confirm a simulated fetch failure leaves the prior value intact
and flips status to `stale`, confirm a second successful run appends a new
historical row rather than replacing the first, confirm the three
priority feeds render a real (if sample-sourced) historical chart + HTML
table on their data-detail pages.

---

## Open items carried from `CLAUDE.md`

- Backend hosting during the pre-migration period: since `site/` targets
  Cloudflare Pages directly (not the live GitHub Pages Jekyll site), Phase
  3's Functions/KV/D1 can be real from the start — no dual-provider
  problem, since this whole app deploys to Cloudflare from Phase 0 onward.
  The live *cutover* (DNS, `texashomeintelligence.com` pointing at this
  app instead of the Jekyll site) is a separate, later, explicit step.
