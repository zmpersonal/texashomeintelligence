# CLAUDE.md — Texas Home Intelligence (TexasHomeIntelligence.com)

This file is your persistent instruction set for this project. Read it before every task. If anything here conflicts with a one-off instruction I give you in chat, ask me before proceeding.

## What we are building

A static, config-driven website that does two jobs at once:

1. **Conversion product:** the *QuoteReady Project Brief* — a free tool where a Texas homeowner describes a home repair/improvement project once and gets a clean, standardized brief they can send to any contractor. This is the product. Contractor introductions are a secondary, optional capability that appears ONLY after the brief is generated.
2. **AI/SEO authority layer:** below the conversion layer, the site is a continuously-updated "Texas homeowner intelligence" publisher — pages built from free public-data feeds (weather, storms, permits, energy prices, etc.), engineered to be cited by AI answer engines (ChatGPT, Perplexity, Claude, Google AI Overviews) and to rank in classic + AI search.

Launch scope: **Austin and San Antonio**. Seven services: **Roofing, HVAC, Plumbing, Fire Damage Restoration, Mold Remediation, Electrical, Tree Trimming.**

Source material lives in `docs/source/`:
- `THI-Copywriter_Output.txt` — supplied conversion copy (homepage, roofing, HVAC, plumbing).
- `THI_Wireframes_Developer_Handoff.docx` — the full build blueprint (sitemap, wireframes, data sources, acceptance criteria). Extract its text and treat it as authoritative for structure. This CLAUDE.md summarizes it but the docx has the detail.

## Division of labor — what YOU build vs. what I finish

You build the entire site so that it runs locally and deploys to Cloudflare Pages **with clearly-marked sample data and stubbed endpoints**. I will then finish three seams and go live. Do NOT implement these three — scaffold them as clean, documented stubs with TODO markers and env-var placeholders:

1. **Live data APIs.** I wire up the real fetchers and API keys. You build the ingestion *structure*, the normalized data schema, sample data files, and the rendering — with fetcher functions stubbed.
2. **Lead-form backend hookup.** I connect the submission endpoint to my store / Slack / Sheets. You build the form, the endpoint handler, request validation, and the interface it will call — but leave the actual writes as documented stubs.
3. **Database build-out.** I continue building the DB. You scaffold the schema (Cloudflare D1 SQL + KV bindings) and the data-access layer, seeded with sample rows.

Everything else must be complete and working on sample data. "Ready for live traffic" = I only have to fill those three seams.

Maintain a `HANDOFF.md` at the repo root that lists, precisely, every seam I must complete (file paths, function names, env vars, expected inputs/outputs). Update it as you build.

## Non-negotiable product rules (from the handoff — do not violate)

- **Do not lead with "AI."** The visible value proposition is transformation: messy homeowner info becomes organized and useful. AI is plumbing, not marketing.
- **Name + email only to start.** Step 1 of intake is first name + email, which immediately creates a `project_id` + secure return token and (stub) sends a return-link email. **No phone number required before the brief exists.**
- **No 1/2/3 contractor choice before the brief.** Contractor help is offered only after the brief is shown, on a post-brief screen; phone may be requested there.
- **The brief must never diagnose or invent facts.** It organizes homeowner-reported facts + enriched public context, and explicitly separates: reported facts vs. external context vs. unknowns/items-a-pro-should-evaluate. Include limitation language: not an inspection or remote diagnosis.
- **Sample data is never presented as fact.** Any placeholder value must be visibly marked SAMPLE and/or render a clear "unavailable / stale" state. A data card must be able to show source, last-updated timestamp, and a stale/error state. Never silently substitute zero/null for a failed feed.

## Non-negotiable engineering rules

- **Config-driven, not hand-coded pages.** All 14 location×service pages, both location hubs, and all data pages are generated from structured config/content collections. Do NOT hand-author near-identical pages. Adding a city or service = adding config, not copying a page.
- **Facts render in static/server HTML, not JS-only.** Many AI citation crawlers don't execute JavaScript. Every important number must be in the served HTML (and inside an HTML `<table>` where it's tabular). Charts are progressive enhancement on top of already-present HTML data.
- **Secrets never reach the browser.** Submission and any keyed calls run in Cloudflare Pages Functions / Workers, server-side only.
- **Store history, never overwrite.** Data ingestion appends historical observations; it does not clobber the prior value. Interpretations store the underlying observations + methodology version that produced them.
- **Scale reality:** target throughput is ~90–300 leads/month. Do not over-engineer. A static site + KV/D1 + a serverless endpoint is plenty. Prefer boring, cheap, reliable.

## Tech stack (confirm with me before scaffolding if you'd change it)

- **Framework:** Astro + TypeScript. Rationale: static HTML output (facts render server-side), content collections (config-driven pages), islands architecture (only the intake flow ships JS), first-class Cloudflare Pages support, excellent for schema/SEO. If you strongly prefer an alternative that better fits these constraints, say so and wait for my OK.
- **Styling:** Tailwind CSS with a small custom design-token layer. Build a real, intentional visual identity — clean, trustworthy, fast — not the default AI-generated look. Consult and follow good frontend design practice (typography scale, spacing system, restrained palette).
- **Hosting:** Cloudflare Pages (static) + Pages Functions (serverless endpoints).
- **Data store:** Cloudflare KV (project state + return tokens — read/written per session) and Cloudflare D1 (structured lead/project records, scaffold + seed only). Do NOT use Google Sheets for project state; Sheets is only ever a downstream mirror I may wire later.
- **Data ingestion:** GitHub Actions cron workflow that runs ingestion scripts, writes normalized JSON/CSV into the repo (`src/data/generated/`), commits, and triggers a Pages rebuild. GitHub is the source of truth for site, scripts, generated datasets, and config.
- **Analytics:** GA4 snippet + a documented custom AI-referral channel (referrers: chatgpt.com, perplexity.ai, claude.ai, gemini.google.com, copilot.microsoft.com), plus Cloudflare Web Analytics. AI referral traffic is under-attributed by default and often lands in "Direct" — set it up so we can see it from day one.

## URL architecture (from handoff §2)

```
/                                    Homepage (conversion product + live intelligence front page)
/austin/                             Location hub
/san-antonio/                        Location hub
/austin/roofing/  … /austin/tree-trimming/          7 services × Austin
/san-antonio/roofing/ … /san-antonio/tree-trimming/ 7 services × San Antonio
/data/                               Statewide data catalog + status
/data/{location}/                    Location data catalog
/data/{location}/{topic}/            Durable dataset / derived-intelligence pages
/methodology/                        Global methodology, definitions, update policy, limitations
/lp/{service}-{location}/            AdWords/PPC landing pages (conversion-pure, see below)
/start/                              Intake flow entry
/brief/{project_id}/                 Generated brief view (token-gated)
```

Future `/houston/` and `/dallas-fort-worth/` must be pure config additions — do not build them now, but do not architect anything that would block them.

## Two page families — keep them distinct

1. **SEO location×service pages** (`/austin/roofing/` etc.): top ~30–40% is service-specific QuoteReady conversion copy + CTA + sample brief; immediately below, 3–5 live local metrics relevant to that trade; high-value questions as H2 direct-answer blocks (answer in first 1–2 sentences); dataset links; small FAQ near the bottom. Data serves both SEO and the reason-to-convert. Indexed.
2. **AdWords/PPC landing pages** (`/lp/roofing-austin/` etc.): conversion-pure, fast, minimal or no data modules, built for Google Ads Quality Score and a single action (build the brief). Use the supplied PPC copy from the copywriter doc. Default these to `noindex` (paid traffic; avoids duplicate-content collision with the SEO pages) — make indexability a per-page config flag.

## Copy status (tag everything)

- **SUPPLIED (use as baseline):** Homepage, Roofing, HVAC, Plumbing — pull real copy from `docs/source/THI-Copywriter_Output.txt` and the handoff hero copy into config.
- **DRAFT (mark visibly for editorial review before launch):** Fire Damage Restoration, Mold Remediation, Electrical, Tree Trimming hero/intake copy.
- Product name is **QuoteReady Project Brief**; primary CTA is **Build My QuoteReady Brief** (handoff wording) / **Create My Free Project Brief** (copywriter wording) — use the handoff wording as canonical and keep it in one config constant so it's changeable in one place.

## Service → intake & data mapping (from handoff §10; sample data for all)

| Service | Intake focus | Enrichment feeds (stub) | Copy |
|---|---|---|---|
| Roofing | storm/hail, leak, age/type, damage, interior water, prior repair, insurance, photos | NOAA Storm Events, NWS, permits, TDI wind/hail | SUPPLIED |
| HVAC | cooling/heating, running, airflow, area, thermostat, time-of-day, age, prior repair, label photo | NWS heat/humidity, mechanical permits, EIA, AirNow, BLS | SUPPLIED |
| Plumbing | leak/clog/pressure/sewer/water-heater, location, active damage, hot/cold, duration, prior repair/access | freeze/weather, plumbing permits, FEMA/TWDB, BLS | SUPPLIED |
| Fire Damage Restoration | event date, fire dept, affected areas, smoke/soot, water damage, utilities, occupancy, insurance | fire weather, AirNow, TDI fire loss, FEMA | DRAFT |
| Mold Remediation | visible conditions, moisture source, water event, area, testing, prior remediation | rain/humidity, flood context, TDI water loss, housing age | DRAFT |
| Electrical | outage/breaker/panel/circuits/flicker/outlets, area, burning/heat/sparking, panel context, prior work | electrical permits, severe-storm context, housing age, BLS | DRAFT |
| Tree Trimming | size/type, proximity, dead limbs, storm damage, lean, access, trim/remove, stump, photos | drought, wind/storm, soil, tree permits, rainfall | DRAFT |

## V1 data feeds — go DEEP on three, stub the rest

Build the full ingestion *framework* + normalized schema + sample data for all feeds listed in handoff §11, but implement real backfill logic + sample historical series only for the three priority feeds (I'll add API keys):

1. **NOAA Storm Events + NWS** — hail/wind/storm exposure (flagship citeable data; feeds roofing + tree).
2. **Austin + San Antonio municipal permit open data** (Socrata) — local activity/timing proxy; the real moat feed.
3. **EIA Texas residential electricity price** — HVAC operating-cost context.

Present derived, **branded indices** where sensible (e.g. "Austin Roof Storm-Exposure Index") rather than only raw numbers — more citeable, more defensible, and it compounds as the historical archive grows.

## Generated brief

Deterministic. Build the brief from a **template keyed to structured intake fields**. Do NOT use an LLM to infer or assert facts about the home. (If you want an optional prose-smoothing pass later, it may only rephrase homeowner-supplied text, never add facts — leave this as a stubbed, off-by-default hook.) Brief sections: Project Summary; Reported Problem/Conditions; Property & Local Context; Work Already Performed / Prior Quotes; Homeowner Objectives; Items a Professional Should Evaluate; Questions the Written Estimate Should Answer; Attachments/Notes; Information Still Needed/Unknowns; limitation statement.

## AI-citation / crawler requirements

- `robots.txt` must explicitly allow the live-citation/search crawlers (they cannot cite you if blocked): OAI-SearchBot, ChatGPT-User, PerplexityBot, Perplexity-User, Claude-SearchBot, Claude-User, Googlebot, Bingbot. Allow training crawlers (GPTBot, ClaudeBot, Google-Extended) as well for V1 (maximize visibility) but keep them in clearly-labeled, separately-togglable blocks. Block obvious no-value scrapers (CCBot, DataForSeoBot) — commented so I can change my mind. Reference the sitemap.
- **Flag the Cloudflare gotcha in HANDOFF.md:** Cloudflare Bot Fight Mode / WAF / the "block AI bots" toggle can silently override robots.txt. I must verify in the dashboard that citation bots aren't being blocked at the edge.
- Add an `llms.txt` pointing agents at the best data/methodology pages.
- Schema.org: `Organization` (Texas Home Intelligence, consistent name/sameAs sitewide), the tool modeled as a `WebApplication`/product OF that org, `Dataset` + `DataCatalog` on genuine data pages, `BreadcrumbList` across the hierarchy, `FAQPage` on FAQ blocks. Canonical URLs everywhere; generate `sitemap.xml`.
- Do not `noindex`/`nosnippet` any page we want quoted (except the paid `/lp/` pages).

## Acceptance criteria (from handoff §14 — treat as the definition of done)

Responsive; all 14 routes from one template/config system; supplied copy used for roofing/HVAC/plumbing and draft copy visibly tagged; no phone before brief; no 1/2/3 choice before brief; secure return link after name+email; resumable project; intake branches are config not duplicated pages; brief separates reported/external/unknown and avoids diagnosis; submission + notifications are server-side stubs with secrets never shipped to browser; data modules read normalized objects not raw API shapes; every data card shows source + timestamp + stale/error state; SAMPLE/FEED values clearly fake; important data crawlable without chart JS; sitemap/canonicals/metadata/breadcrumbs/internal links follow the hierarchy.

## Working style for this repo

- Work in the phases defined in `BUILD_PLAN.md`. After each phase: run the build, confirm it compiles and renders, summarize what changed, and stop for my review before starting the next phase.
- Keep a running todo list. Prefer small, verifiable commits with clear messages.
- When you hit one of my three seams, stop and stub it — never fake a live integration to make something "work."
- If a requirement here is ambiguous for a specific file, ask rather than guess.
