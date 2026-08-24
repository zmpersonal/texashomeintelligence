# CLAUDE.md — Texas Home Intelligence (TexasHomeIntelligence.com)

Persistent instruction set for this project. Read it before every task. If a one-off instruction I give in chat conflicts with this file, ask before proceeding.

## What we are building

**Positioning: a Texas homeowner data / tools / intelligence platform first; lead generation is downstream.** The site publishes original, continuously-updated Texas home intelligence (weather, storms, permits, energy, costs, risk) and free homeowner tools. Lead capture is a secondary outcome that rides on top of that authority — not the front door.

The flagship tool is the **Home Dashboard** (address → translated local home signals). Other tools: **Cost Calculators**, **QuoteReady Project Brief** (the deterministic brief generator, live at `/start/`, no further investment for now), **QuickConnect** and **Home Risk Report** (later). Tools live under a `/tools/` hub.

Launch metros: **Austin and San Antonio** (Houston is a strong candidate for #3, deferred). Services: **Roofing, HVAC, Plumbing, Fire Damage Restoration, Mold Remediation, Electrical, Tree Trimming.** **First authority cluster: Austin Roofing.** Next clusters: HVAC + Plumbing.

Source material in `docs/` (read as reference): the copywriter output, the wireframe/handoff doc, the master backlog, the homepage/nav round spec, the phase-0 coder foundation list, and (when present) the roofing data-structure and keyword-research files.

## Primary optimization goal: AI first, SEO second, humans third

**We optimize indexed content for AI answer engines (ChatGPT / Perplexity / Claude / Google AI answers) first, classic SEO second — NOT for human conversion.** Human conversion happens on the tools and on the paid `/lp/` pages, not on the authority content. When a tradeoff appears between "more citable / more extractable by AI" and "more persuasive to a human reader," choose citable on indexed authority pages. This priority ordering is the point of the whole build; do not quietly revert to conversion-first content.

## Owner [O] vs. coder [C] split

- **[O] Owner:** provisions the Postgres instance, obtains API keys, sets Cloudflare/GitHub secrets, loads datasets, runs migrations in the real env, handles DNS cutover, decides which crawlers to allow, gets legal review before any lead resale.
- **[C] Coder (you):** all code, config, migrations, scripts, scaffolding, with clear TODO markers where owner values plug in. **Secrets never committed to the repo or shipped in client JS.**

Maintain `HANDOFF.md` listing every seam the owner completes (file paths, function names, env vars, expected I/O). Keep it current.

## Non-negotiable product rules

- **Do not lead with "AI"** in user-facing copy. The visible value is Texas-specific intelligence and useful tools. AI optimization is how we get *found*, not the pitch.
- **Indexed authority pages are not conversion pages** (see Page Families below).
- **QuoteReady / `/start/` intake:** name + email only to start → creates `project_id` + secure return token → (stubbed) return-link email. **No phone before the brief exists. No 1/2/3 contractor choice before the brief** — contractor help is a post-brief screen only, where phone may be requested.
- **The brief never diagnoses or invents facts.** It organizes homeowner-reported facts + enriched public context and separates: reported facts vs. external context vs. unknowns/items-a-pro-should-evaluate. Includes limitation language: not an inspection or remote diagnosis.
- **The Dashboard captures an address → PII.** Consent/privacy handling must be in place before it stores anything (ties to the leads/consent schema). A display-only mode that stores nothing is allowed without a consent flow; storing the address as a lead requires consent.
- **Sample data is never presented as fact.** Anything placeholder is visibly SAMPLE and/or renders a clear unavailable/stale state. Every data card can show source, last-updated, and a stale/error state. Never silently substitute zero/null for a failed feed.
- **Leads carry consent from day one:** consent, consent_source, shared_with, source attribution, timestamps. Homeowner-facing and contractor-facing data are cleanly separated (schema or DB boundary). No lead resale before owner's legal review (TDPSA / TCPA / privacy policy).

## Page families (LOCKED — this reverses the original conversion-first model)

1. **Indexed authority pages** — location hubs (`/austin/`), location×service pages (`/austin/roofing/`), `/data/**`, `/texas/**`, `/indexes/**`, `/methodology/**`. These are **authority-first, optimized for AI citation**: exact AI-prompt phrasings as H2s with the answer in the first 1–2 sentences; original data, tables, and index readings in **static/server HTML**; visible freshness. Conversion is limited to **one contextual CTA at the bottom** plus at most a single soft inline mention. Do NOT build these conversion-first.
2. **Conversion pages** — the **tools** (`/dashboard/`, `/tools/cost-calculators/`, `/start/`) and the **paid `/lp/{service}-{location}/` landing pages**. This is where persuasion, forms, and heavy CTAs live. `/lp/` pages are **noindex** (paid traffic; avoid duplicate-content collision with the authority pages). Tools are indexable where a citable companion answer exists, but the interactive tool itself is the conversion surface.

## Tool architecture (LOCKED — protect logic, expose facts)

- Tool **logic** (calculator formulas, cost model, dashboard signal computation, index weights/thresholds) runs **server-side in Cloudflare Functions against the operational DB, behind rate-limited endpoints** — never shipped as client JS, never exposing proprietary constants.
- Citable **outputs** (cost ranges, tables, index readings, FAQ answers) are still published as **static HTML on companion content pages.** Win the citation with the exposed general answer; win the click with the personalized/live layer AI can't reproduce.
- **Never hide citable facts.** The moat is the Postgres archive + live execution + brand, protected by architecture — not by hiding pages.

## Non-negotiable engineering rules

- **Config-driven, not hand-coded pages.** All location×service pages, hubs, and data pages generate from content collections / structured config. Adding a metro or service = config, not a copied page. Document "how to add a new metro×service" in HANDOFF.md.
- **Facts render in static/server HTML, not JS-only.** Every important number is in served HTML, tabular data in `<table>`. Charts are progressive enhancement over already-present HTML.
- **Secrets never reach the browser.** Keyed calls and tool logic run server-side only.
- **Store history, never overwrite.** Ingestion appends observations; derived indices store the underlying observations + methodology version that produced them.
- **Preserve URLs across the migration; 301 anything that must change; no URL breaks.**
- **Scale reality:** target ~90–300 leads/month; over-building is a mistake. Prefer boring, cheap, reliable.

## Tech stack

- **Framework:** Astro + TypeScript + Tailwind (small custom design-token layer; intentional, trustworthy, fast — not the default AI-generated look; follow the frontend-design skill).
- **Hosting:** Cloudflare Pages (static) + Pages Functions (server-side tool/intake endpoints). Confirm the Pages project auto-deploys on push, or cron-committed data won't reach the site.
- **State/session:** Cloudflare **KV** = session/return-token state.
- **Operational DB — TARGET: Postgres (Supabase or Neon) as the owned system-of-record** (leads/PII+consent, the historical observations archive, indices, cost estimates, projects). **CURRENT STATE:** the intake pipeline is built on Cloudflare **D1**; the Postgres migration is a planned foundation round and is **not done yet**. Until it is: the public site renders from generated JSON regardless of engine, and you must **confirm what actually exists in the repo before writing DB code** — do not assume Postgres is wired.
- **Edge DB access:** when Postgres lands, use an **edge-compatible driver** (Neon serverless driver, Supabase HTTP client, or Cloudflare Hyperdrive). A raw TCP `pg` driver may not work in the Workers/Pages runtime — do not assume raw TCP.
- **Ingestion:** GitHub Actions cron (2–3×/week) → real API calls → append to the archive → derive indices/costs (deterministic, no LLM) → emit `src/data/generated/*.json` → commit → Pages rebuild. GitHub is source of truth for site, scripts, generated datasets, and config.
- **Analytics:** GA4 + a documented custom AI-referral channel (chatgpt.com, perplexity.ai, claude.ai, gemini.google.com, copilot.microsoft.com) + Cloudflare Web Analytics. Default GA4 grouping under-counts AI referrals — set it up so we can see the channel from day one.

## URL architecture

```
/                       Homepage (authority hero + four cards + live-data section)
/dashboard/             Home Dashboard (flagship tool; header button + hero CTA point here)
/tools/                 Tools hub (indexable) — cards to each tool
/tools/cost-calculators/  /tools/quickconnect/  /tools/home-risk-report/   (shells until built)
/start/                 QuoteReady intake (live, deterministic brief; no further investment now)
/brief/{project_id}/    Generated brief (token-gated)
/austin/  /san-antonio/                         Location hubs (authority)
/austin/{service}/  /san-antonio/{service}/     Location×service (authority)
/data/  /data/{location}/  /data/{location}/{topic}/   Data catalog + detail (authority)
/indexes/{index}/       Derived index pages (e.g. austin-roof-stress)
/methodology/  /methodology/{index}/            Methodology (authority)
/texas/{topic}/         Texas-wide authority pages (justified by data)
/lp/{service}-{location}/   Paid AdWords landing pages (conversion-pure, NOINDEX)
```

- **Nav (current, LOCKED):** Tools · Data · Locations(dropdown: Austin, San Antonio) + a persistent top-right **"My Dashboard"** button → `/dashboard/`. Methodology is in the footer. **`/services/` was removed and deleted — do not re-add it or link to it.** Dashboard is not a nav link (the button covers it).
- All nav/CTAs are real crawlable `<a href>`; the Locations dropdown is keyboard/touch accessible (no hover-only).
- Thin not-yet-built pages get clean non-empty placeholders and are **noindex**; `/tools/` is the indexable exception.
- Sitemap is `sitemap-index.xml` (Astro).

## Database schema (target Postgres; append-only archive)

- `observations` — historical archive, **append-only** (metro, service, metric_key, value, unit, classification, band, period, data_through, source_name, source_dataset, source_url, baseline_value, baseline_label, captured_at).
- `indices` — computed index history (metro, service, index_key, value, band, inputs JSON, drivers JSON, computed_at).
- `cost_estimates` — (metro, service, breakdown JSON, inputs JSON, computed_at).
- `leads` — PII + consent from day one (id, created_at, email, phone, address, geo, ip, source, service, metro, consent, consent_source, shared_with, status).
- `projects` — QuoteReady briefs.
- Homeowner-facing vs. contractor-facing data cleanly separated.

## Data feeds (deep on three; others stubbed)

Priority, real backfill + history: **NOAA Storm Events + NWS** (hail/wind; roofing + tree), **municipal permits via Socrata** (Austin + San Antonio; roofing permit counts + valuations — the local moat feed), **EIA Texas residential electricity** (HVAC operating-cost context). Additional feeds (AirNow, Census ACS, BLS, etc.) are wired as owner keys become available. Present derived, **branded indices** (e.g. Austin Roof Stress Index) as the citable, defensible unit. On feed failure: keep last-good data, mark stale, never crash the build, never show sample-as-fact.

## Generated brief

Deterministic, from a **template keyed to structured intake fields.** No LLM-invented facts about the home. (An optional prose-smoothing hook may only rephrase homeowner-supplied text, never add facts; off by default.) Sections: Project Summary; Reported Problem/Conditions; Property & Local Context; Work Already Performed / Prior Quotes; Homeowner Objectives; Items a Professional Should Evaluate; Questions the Written Estimate Should Answer; Attachments/Notes; Information Still Needed/Unknowns; limitation statement.

## AI-optimization requirements (apply to every authority page)

1. Exact AI-prompt phrasings as H2s; answer in the first 1–2 sentences.
2. Publish original data (permit-valuation costs, hail counts, indices) — be the primary source for prompts that currently cite nothing.
3. Extractable formats: cost-by-material tables, key-findings blocks, ranges not false precision — all in server-rendered HTML.
4. Schema: FAQPage + Article + Dataset/DataCatalog + Organization (consistent "Texas Home Intelligence" entity, logo, sameAs) + WebSite + BreadcrumbList.
5. Own the "how to choose" decision frameworks (a large share of demand); THI is not a directory.
6. `llms.txt` + `robots.txt` allowing citation/search crawlers (OAI-SearchBot, ChatGPT-User, PerplexityBot, Perplexity-User, Claude-SearchBot, Claude-User, Googlebot, Bingbot, plus Applebot-Extended/Amazonbot/cohere-ai; training crawlers and no-value scrapers in clearly-labeled, separately-togglable blocks). **Verify Cloudflare Bot Fight Mode / WAF isn't blocking citation crawlers at the edge** — this is the most common own-goal.
7. Visible freshness (Updated / Data-through) on time-sensitive pages.
8. Canonicals everywhere; consistent trailing-slash policy; per-page OG/Twitter overrides.

## Content grounding & scope discipline

- Content is grounded in the **roofing keyword research**, NOT the noisy AHI-AI-PHRASES file (retired for planning). ~Half of roofing AI prompts are "recommend/choose a roofer" (#1 intent) — own that framework.
- Roofing FAQ batches (in the backlog) map to specific cluster pages and carry FAQPage schema; apply them per page in the roofing round.
- **Skip keyword-tool noise:** individual competitor-brand review pages, crown molding, awnings, deck/fence, canvas. Gutters/siding/insulation/waterproofing/roof-cleaning are possible future adjacencies, not now.

## Roadmap / priority (avoid scope creep)

- **Foundation:** live data feeds wired + AI-structure foundation; then the Postgres migration + DB foundation (before any tool that queries the archive).
- **Main thrust:** the Austin Roofing authority cluster (hub → how-to-choose flagship → replacement-cost → storm-and-hail → repair-vs-replace → materials/metal/tile → finding-a-roofer → insurance educational → permits → Texas-wide), plus Roof Stress Index + `/methodology/roof-stress-index/` + `/data/austin/roofing/`.
- **Near-term tools (each its own round, after data/DB):** Cost Calculator (roofing first), Home Dashboard.
- **Later:** Home Risk Report (clarify vs. Dashboard first — one-time report vs. live view), QuickConnect, proposal-maker work, HVAC + Plumbing clusters, Houston, San Antonio roofing, contractor-facing/lead marketplace.
- Do not build ahead of the current round. Tool functionality only in its dedicated round.

## Working style

- Work in the round/phase I give you. After each: run the build, confirm it compiles and renders, summarize changes, and stop for review before the next.
- Keep a running todo list; small verifiable commits with clear messages.
- At any owner seam (live API, DB provisioning, lead backend, DNS), stop and stub with a documented TODO — never fake a live integration to make something "work."
- If a requirement here is ambiguous for a specific file, ask rather than guess.
