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

## Phase 2 — Templates (config-driven) ✅ done (homepage excepted — see note)

**Goal:** every route in the URL architecture renders from Phase 1 config
through a shared template — no hand-authored near-duplicate pages.

- [ ] Homepage — **not built this round.** The user's Phase 2 go-ahead
      listed 14 service pages, both hubs, data catalog/detail, methodology,
      and the 3 PPC pages specifically, and did not include the homepage.
      Left as the Phase 0 placeholder at `/` until explicitly requested.
      When it is: reuse the section order and content already approved on
      the live Jekyll site (Hero → QuoteReady + Live Data Proof → How
      QuoteReady Works → Something on Your Mind? → Austin Home Data
      dashboard → Texas Homeowner Guides → Methodology → Sources →
      QuoteReady CTA → FAQ) — re-implemented, not redesigned.
- [x] 2 location hubs from one template (`src/layouts/LocationHub.astro`)
      driven by `src/pages/[location]/index.astro` + `locations` config
- [x] 14 location×service pages from **one** template
      (`src/layouts/ServicePage.astro`) driven by
      `src/pages/[location]/[service]/index.astro` — a single file
      generating all 14 routes via `getStaticPaths`, not 14 hand-authored
      pages. Hero (with city substitution), data-note card, body sections,
      FAQ (with FAQPage JSON-LD), cross-links to the other city.
- [x] 3 PPC landing pages (`/lp/roofing-austin/`, `/lp/hvac-austin/`,
      `/lp/plumbing-austin/`) from one template (`src/layouts/PPCPage.astro`)
      driven by `src/pages/lp/[slug]/index.astro`, filtered to
      `copyStatus: supplied` services only. `noindex` via a `Base.astro`
      prop, and excluded from the sitemap via the sitemap integration's
      `filter` option — not just noindexed, actually absent from
      `sitemap.xml`.
- [x] Data catalog (`/data/`) + one representative data-detail page
      (`/data/austin/roofing/`), ported from the Jekyll version:
      value/scope/period/source/interpretation as static HTML + an HTML
      `<table>` (not chart-only), plus a CSV download and Dataset JSON-LD.
- [x] Methodology page

**Supporting work not itemized above:**
- `DataStatus.astro` — the one generic component every data card renders
  through (SAMPLE/STALE/LIVE/UNAVAILABLE badge + source + last-updated),
  driven purely by Phase 1's shared `{status, asOf, source}` shape. Added
  an `error` status to that Phase 1 enum (was `sample|stale|live`) since
  "stale/error state" needs a true fourth state — a feed that has never
  had a valid value is a different thing from one that's gone stale. The
  Austin roofing data page demonstrates it live (one metric card is
  deliberately `status: error` to prove the state renders, not just the
  happy path).
- Ported the Jekyll build's approved CSS component classes (nav, hero,
  cards, data-card, faq-item, cta-band, etc.) into the Astro global
  stylesheet as a component layer on top of the Tailwind v4 token theme,
  instead of re-deriving the design in raw utility classes — zero
  visual-regression risk, confirmed by screenshot comparison against the
  live site.
- Draft-copy visibility: a `draft-flag` banner renders on the 4 draft
  services' hero (`svc.copyStatus === "draft"`) and is absent on
  roofing/HVAC/plumbing — confirmed in generated HTML, not just visually.

**How I verified it:** `npm run build` generates exactly 23 pages (14
service + 2 hubs + 3 PPC + data catalog + data detail + methodology +
the Phase 0 homepage placeholder) — matches the expected count exactly;
`npx astro check` clean (0/0/0); grepped every generated page for
unrendered template syntax and double-escaped HTML entities (found and
fixed a real bug this way — see below); validated every JSON-LD block on
a sample of page types with `json.loads` (Organization+BreadcrumbList+FAQPage
on SEO pages, Organization+BreadcrumbList+Dataset on the data page,
Organization+FAQPage only — no breadcrumbs — on PPC pages, by design);
confirmed the 4 draft services show the draft flag and the 3 supplied
ones don't; confirmed PPC pages carry `noindex` and are absent from
`sitemap.xml` (20 URLs, not 23); screenshot-checked a hub, a supplied
service page, a draft service page, a PPC page, and the data-detail page.

**Bug found and fixed during verification:** several YAML copy fields used
HTML entity codes (`&mdash;`, `&rsquo;`, etc.) — correct under Jekyll/Liquid,
which passes template output through unescaped, but wrong under Astro,
which HTML-escapes plain `{expression}` interpolation by default. The
entities were rendering as literal visible text (e.g. "Isn&rsquo;t") on
the draft-copy pages. Fixed by replacing every HTML entity in the service
YAML files with its real Unicode character, confirmed with a targeted
grep for double-escaped patterns across the full build output, and
re-verified visually via screenshot.

**How I'll verify it:** build all routes, assert route count matches
2 hubs + 14 service pages + 3 PPC + data catalog + 1 data-detail +
methodology + homepage; Playwright screenshot each page family (one hub,
one SEO service page, one PPC page, the data-detail page) at desktop +
mobile; grep every generated page for `SAMPLE` badges where expected and
zero raw unrendered template syntax.

---

## Phase 3 — Intake flow, generated brief, submission stub, KV/D1 scaffold ✅ done

**Goal:** a working, resumable, deterministic intake → brief pipeline on
sample data, with the three reserved seams stubbed and documented.

- [x] `/start/` multi-step intake (name+email first, no phone; service
      picker; project overview; service-specific questions from Phase 1's
      intake-question-map; prior work/photos; review) — an Astro
      island, not full-page JS
- [x] Pages Function: `POST /api/intake/start` creates `project_id` +
      secure return token, **stub**-sends return-link email (logged, not
      sent)
- [x] Pages Function: `PATCH /api/intake/:project_id` updates the project
      record as steps complete
- [x] Deterministic brief generator: template keyed to structured intake
      fields → the 10 brief sections + limitation statement. No LLM
      inference of facts (an optional off-by-default prose-smoothing hook
      may be stubbed, never wired live)
- [x] `/brief/:project_id/` token-gated brief view
- [x] Cloudflare KV binding scaffold (project state + return tokens) —
      documented shape, sample read/write, real binding left to you
- [x] Cloudflare D1 schema (SQL) for structured project/lead records —
      migration file + seed script with sample rows, no production data
- [x] Post-brief screen offers optional contractor help (1/2/3 choice) —
      confirmed to never appear before the brief exists

**How I verified it:** ran the entire pipeline against a real local
Workers runtime (`wrangler dev` with real Miniflare-backed KV + D1, no
mocks) two ways:

- Curl-driven API tests: start → PATCH (service/location, then
  service-specific answers) → complete → contractor-request, checking
  each response and then querying D1 directly (`wrangler d1 execute
  --local`) to confirm the durable mirror matches KV exactly, including
  after a fix (`updateProjectServiceLocation`) for a sync bug D1
  inspection caught (service/location were staying blank in D1 after
  being set via PATCH — KV had them, D1 didn't).
- A real headless-Chromium (Playwright) walk of the actual `/start/` UI —
  filled every step including the plumbing-specific field, generated the
  brief, and confirmed the browser redirected to
  `/brief/:project_id/?token=...` and rendered all 10 sections with a
  correct reported/external/unknown split (unknowns exactly matched the
  fields left blank) plus the post-brief 1/2/3 + phone contractor-request
  UI. This caught a real bug: plumbing's intake field was also named
  `id: location` ("Where is the problem located?"), colliding with the
  PATCH route's reserved `location` key (the project's city) — the
  client's attempt to save "Kitchen sink" was rejected as an invalid city.
  Fixed by renaming the field to `problem-location` in
  `src/data/intake-questions/plumbing.yaml`; audited all 6 other
  services' intake-question ids against every reserved key (`service`,
  `location`, and the brief's `GENERIC_FIELDS`: `overview`, `urgency`,
  `address`, `priorWork`, `objectives`) — no other collisions exist.
- Resume: started a second project, partially answered it, fetched it
  back via `GET /api/intake/:id?token=...` and confirmed the exact
  answers/service/location came back; confirmed a wrong token gets a 403.
- Confirmed the "brief locks answers" rule: `PATCH` after
  `status: "brief_generated"` returns 409, and the brief itself never
  invents a fact — every unknown listed is an intake field with no entry
  in `answers`, checked field-by-field against what was left blank.
- `grep`-ed `dist/client` for `DB.prepare`, `PROJECTS_KV`,
  `cloudflare:workers`, and the binding/config keywords — none present;
  the only client-shipped JS is the `/start/` and post-brief islands, and
  neither embeds any secret or server binding.
- `npx astro check` → 0 errors / 0 warnings / 0 hints; `npm run build`
  clean.

---

## Phase 4 — AI/SEO layer ✅ done

**Goal:** the finished shape is maximally legible to search + AI crawlers.

- [x] Per-page-type schema: `Organization`, tool as `WebApplication`,
      `Dataset`/`DataCatalog` on real data pages, `BreadcrumbList`
      sitewide, `FAQPage` on FAQ blocks
- [x] Breadcrumbs (visible + structured) on every non-homepage route
- [x] Canonicals on every page; PPC pages `noindex` via the per-page flag
- [x] Final `robots.txt` (citation bots allowed, training bots allowed per
      CLAUDE.md, low-value scrapers blocked-but-commented, sitemap ref)
- [x] `sitemap.xml` generation covers every indexable route, excludes
      `/lp/*`
- [x] `llms.txt` pointing agents at methodology + data catalog + best
      data pages
- [x] GA4 snippet + documented custom channel grouping for AI-referral
      traffic (chatgpt.com, perplexity.ai, claude.ai, gemini.google.com,
      copilot.microsoft.com) + Cloudflare Web Analytics
- [x] **`HANDOFF.md` gets the Cloudflare Bot Fight Mode / WAF warning**
      (dashboard-level AI-bot blocking can silently override robots.txt)

**How I verified it:**

- Wrote a small Node script that walks every built page, extracts every
  `<script type="application/ld+json">` block, `JSON.parse`s it, and
  checks required fields per `@type`. Result: 24 pages, 87 JSON-LD
  blocks, 0 parse errors, 0 missing required fields. Spot-checked one
  page per family (homepage, location hub, location×service, data
  catalog, data detail, methodology, `/start/`, PPC) and confirmed the
  expected type set on each — e.g. `BreadcrumbList` present everywhere
  except the homepage and `/lp/*` (by design — PPC pages are
  conversion-pure/noindex and intentionally carry no internal-linking
  breadcrumb trail per CLAUDE.md's two-page-family split), `Dataset` +
  `DataDownload` on the data-detail page, `DataCatalog` (referencing that
  dataset) on `/data/`, `FAQPage` on every service + PPC page.
  `Organization` and `WebApplication` (the QuoteReady tool modeled as a
  product of that org, via a shared `@id`) render on every page from
  `Base.astro`.
- `grep`-ed the sitemap: 21 entries, exactly matching the indexable route
  count (1 homepage + 2 hubs + 14 service pages + 2 data pages +
  methodology + `/start/`); confirmed zero `/lp/*` entries and confirmed
  each `/lp/*` page's built HTML carries `<meta name="robots"
  content="noindex, follow">`, absent on every indexable page.
- Confirmed `robots.txt` (already correct from Phase 0) copies through to
  the build output unchanged and matches CLAUDE.md's crawler list
  exactly.
- Built `llms.txt` and confirmed it's present in `dist/client/`.
- Added GA4 + Cloudflare Web Analytics to `Base.astro`, both fully gated
  on real env vars (`PUBLIC_GA4_MEASUREMENT_ID`, `PUBLIC_CF_BEACON_TOKEN`)
  — confirmed via `grep` that a build with no env vars set ships zero
  analytics script tags (no placeholder/fake ID ever ships), then
  rebuilt with fake test IDs and confirmed via `grep` that both render
  correctly when the vars are present.
- Built the AI-referral first-touch capture (session-scoped
  `document.referrer` host match against the 5 CLAUDE.md-listed AI
  domains, resent as a `ai_referral_source` GA4 user property on every
  hit) and verified it with three real headless-Chromium (Playwright)
  runs against the built static output: (1) landing with
  `referer: https://chatgpt.com/...` correctly populates
  `sessionStorage` and appears in the GA4 `dataLayer`'s `config` call;
  (2) landing with a normal Google-search referrer leaves it unset; (3)
  landing via Perplexity then navigating to a second internal page shows
  the value persists across the session and is resent on the second
  page's `config` call. Documented the one part that has no code
  equivalent — defining the actual GA4 "AI Referral" channel-group rule —
  as a manual GA4-UI step in `HANDOFF.md`.
- Refreshed `HANDOFF.md`'s Cloudflare Bot Fight Mode/WAF warning (it
  already existed from the initial scaffold) with the finalized
  `robots.txt` crawler list, and added a new "Analytics" section covering
  both env vars and the manual GA4 channel-group step.

**Known, deliberate gap carried forward:** the homepage is still the
Phase 0 scaffold placeholder — per Phase 2's note, the homepage rebuild
was explicitly out of scope for that go-ahead and has not been assigned
to any phase since. `Organization`/`WebApplication` schema, canonical,
and OG/Twitter meta all render correctly on it as-is, but its visible
content is not real yet. Flagging again here since Phase 4 is normally
where a site's SEO surface gets called "finished."

---

## Phase 5 — Ingestion framework ✅ done

**Goal:** the pipe that will carry real data exists and is provably
correct on sample data, without needing real API keys yet.

- [x] Normalized observation schema (value, geography, period, source,
      fetched-at, status: `ok | stale | error`) — one schema for all feeds
- [x] GitHub Actions cron workflow: runs ingestion scripts, writes to
      `site/src/data/generated/`, commits, triggers a Pages rebuild
- [x] Fetcher interface + stubbed fetchers for every feed in handoff §11
- [x] Real backfill + stale/history logic, with **sample historical
      series** (not live-fetched) for the three priority feeds: NOAA Storm
      Events, Austin/San Antonio municipal permits, EIA TX electricity
      price
- [x] Failure path proven: a fetcher returning an error preserves the last
      valid observation and marks it `stale` with its last-good timestamp
      — never silently zero/null
- [x] Historical observations append, never overwrite

**How I verified it:**

- Normalized schema lives in `site/src/ingest/types.ts` —
  `Observation<T>`/`DatasetFile<T>`/`FetcherModule<T>`, with `FeedStatus`
  deliberately identical to `DataStatus.astro`'s existing
  `"sample"|"live"|"stale"|"error"` contract rather than inventing a
  parallel vocabulary.
- Wrote a standalone test against a fake fetcher (3 sequential
  `runIngestion` calls, not against any real feed) and confirmed the
  exact state machine required: run 1 (first success) → `live`, 1
  observation; run 2 (second success, one new row) → `live`, 2
  observations, **the first row byte-for-byte unchanged**; run 3
  (simulated failure) → `stale`, still 2 observations (preserved
  exactly), `lastError` recorded, no zero/null substitution.
- Ran `npm run ingest` for real against all 15 fetchers (all of which
  throw, by design — every `fetchRaw()` is an unimplemented TODO stub):
  seeded 16 dataset files (5 deep + 11 stub — `noaa-storm-events` and
  `municipal-permits` each produce an Austin + San Antonio file), then
  ran it a second time and confirmed the observations arrays were
  untouched — only `lastAttemptAt`/`lastError` moved — proving seeding is
  idempotent and a no-op fetch attempt never resets accumulated sample
  history.
- Wired the existing Austin roofing data-detail page
  (`site/src/pages/data/austin/roofing/index.astro`, built in Phase 2) to
  import `noaa-storm-events/austin.json` directly and compute its metrics
  (trailing-12-month event count, largest hail size, the events table)
  from the real observations array instead of 4 hand-typed rows —
  confirmed via the built HTML that the rendered numbers (10 events,
  1.86″ largest) match the generated JSON exactly.
- `npx astro check` → 0/0/0; `npm run build` clean with the new
  `src/ingest/**` code and `src/data/generated/**` fixtures included.

**Two honest gaps, not fixed this phase (out of this instruction's
scope, flagged rather than silently left):**

1. Municipal permits and EIA electricity price don't have data-detail
   pages yet (only Austin roofing does, from Phase 2) — so those two
   deep-tier feeds' generated JSON isn't rendered anywhere yet, even
   though the ingestion pipeline for them is fully real. Building those
   pages is a Phase-2-style template addition, not part of this seam.
2. `src/data/data-sources.yaml`'s `nws-api` entry is still
   `priority: true` / `status: "sample"` (from Phase 1, following
   CLAUDE.md's original "NOAA Storm Events **+ NWS**" grouping), while
   this phase's explicit instruction scoped NWS into the stub tier
   instead. Both are accurate on their own terms; see HANDOFF.md's Seam 1
   note for the full explanation.

---

## Open items carried from `CLAUDE.md`

- Backend hosting during the pre-migration period: since `site/` targets
  Cloudflare Pages directly (not the live GitHub Pages Jekyll site), Phase
  3's Functions/KV/D1 can be real from the start — no dual-provider
  problem, since this whole app deploys to Cloudflare from Phase 0 onward.
  The live *cutover* (DNS, `texashomeintelligence.com` pointing at this
  app instead of the Jekyll site) is a separate, later, explicit step.
