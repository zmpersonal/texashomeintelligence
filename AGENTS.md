# AGENTS.md — Texas Home Intelligence

This file exists so any agent/tool that reads `AGENTS.md` (rather than `CLAUDE.md`) still
gets the guardrails. **`CLAUDE.md` is the single source of truth** — read it first and in
full. This file is a short mirror of the most important rules; if the two ever drift,
`CLAUDE.md` wins, and you should surface the drift.

## The one rule everything hangs on
**Rule 1 — Surface, don't assume.** Every rule/KPI/brand/cost/permission here is
*flag-and-decide*, not a frozen lock. When a task pulls against any of them, don't silently
comply and don't silently refuse — **state the conflict + tradeoff and wait for the owner's
call.** When unsure about anything, ask.

## What this is
TexasHomeIntelligence.com — calm, sourced Texas home-intelligence (an **instrument panel,
not a weather-radar alarm**). Flagship surface: the **Home Dashboard**. AHI is a separate
future project, not this repo.

## KPIs (this build)
1. AI citations / referral traffic + organic SEO (sitewide, indexed pages — AI-first).
2. Stickiness / return visitors (the **Dashboard**, which is optimized for usability/value,
   **not** AI-extraction).
3. Sellable leads — **deferred** (future QuoteReady funnel).

## Scope (this build)
**In:** the Home Dashboard + sitewide AI/SEO optimization.
**Out:** Tools nav + the section directly below the homepage hero, Services (removed),
QuoteReady expansion, calculators, Home Risk Report, Postgres migration, the full SEMrush
content-demand system (reserved), AHI.
Nav = `Data · Locations + "My Dashboard"` button. Methodology in footer.

## Repo truth (verify, don't assume)
- Root = old **Jekyll** site (still live on GitHub Pages). `site/` = the **Astro** app
  (Astro 7 + Tailwind 4 + `@astrojs/cloudflare`), deployed as a **Cloudflare Worker**
  (`site/wrangler.jsonc`), served at the workers.dev **staging** URL. **Work in `site/`.**
- Bindings exist: **D1** (`DB`) + **KV** (`PROJECTS_KV`, `SESSION`).
- Scripts from `site/`: `dev · build · preview · check · verify-content · ingest ·
  fetch-drought-map`. No separate lint/test — don't assume one.

## Hard rules
- Config-driven pages; facts in **server HTML**; **secrets server-side only**, never
  committed, never in client JS.
- **No LLM in runtime or ingestion**; deterministic data; store history (append), never
  overwrite; no `SAMPLE` on indexed pages.
- **Copy freeze:** once copy is supplied in a copy doc, render it exactly; only AI-phrase
  content pages may be Claude-authored (per `ROADMAP.md` + brand voice).
- **Dashboard capture:** ZIP layer stores nothing; address+email unlock captures **PII to D1
  with consent**, server-side only.
- **Brand:** navy + neutrals base, amber sparing, status color as small signal only, sponsored
  content quarantined; Newsreader / Plex Sans / Plex Mono. See `BRAND.md`.
- **Cost:** keep run-rate low; no per-request DB/API/LLM on the serving path. See `COST.md`.

## Permissions
Safe (branch edits, build/check, free ingestion) · Ask-first (deps, migrations, auth, paid
APIs, deletes) · Human-owns (DNS, billing, secrets, PII decisions, merge/deploy). **Deploy
to live only on the owner's explicit command.** Work on branches; show diffs; request
approval. Full detail in `SECURITY.md`.

## Working style
Plan Mode for non-trivial work → propose → wait for approval. Prefer reconciling the existing
`site/` app over rebuilding. After each round: `build` + `check`, run `REVIEW.md`, summarize,
**stop for review.** Stub owner seams in `HANDOFF.md`; never fake a live integration.

**Read next:** `CLAUDE.md` (hub), then `ROADMAP.md`, `REVIEW.md`, `SECURITY.md`, `COST.md`,
`BRAND.md` as your task requires.
