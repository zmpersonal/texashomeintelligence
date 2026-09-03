# CLAUDE.md — Texas Home Intelligence (TexasHomeIntelligence.com)

Persistent instruction set for this project. **Read this before every task.** It is the
hub; the specialized files below hold the detail. If a one-off instruction in chat
conflicts with this file, follow **Rule 1** (surface it, don't silently comply or refuse).

> This file **supersedes** the previous `CLAUDE.md`. `BUILD_PLAN.md` (phase history) and
> `HANDOFF.md` (owner seams) are kept as reference — see `_SUPERSEDES.md` for the map.

---

## Rule 1 — Surface, don't assume (the governing convention)

Every rule, KPI, brand guardrail, cost limit, and permission in this project is a
**flag-and-decide** rule, not a frozen lock. When a task or a proposed change would work
against any of them:

- **Do not** silently comply, and **do not** silently refuse.
- **Surface the conflict**, explain the tradeoff in one or two sentences, and **wait for
  the owner's call** to proceed or not.

This keeps the project un-boxed (the owner can change direction anytime) while making sure
nothing important gets quietly overridden. Every other file points back to this rule.
When in doubt about anything, raise it rather than guess.

---

## What this is

**Texas Home Intelligence (THI)** continuously ingests Texas-specific public data —
weather/storms (NOAA/NWS), building permits, energy load, air quality, drought, property
and cost signals — and translates it into plain-language, **sourced** intelligence about a
specific home or ZIP: what's happening, what it means, and when to act. The flagship
interactive surface is the **Home Dashboard**. The brand essence is *situational awareness
for your home* — a calm, sourced **instrument panel, not a weather-radar alarm**.

Launch metros: **Austin and San Antonio** (Houston deferred). First authority cluster:
**Austin Roofing**. See `THI-Brand-Kit.md` for the full brand/positioning system.

**Sibling note:** AustinHomeIntelligence.com (AHI) is a **separate future code project** —
not part of this repo, not part of this build. Everything here is THI only.

---

## Primary KPIs (what every decision serves)

In priority order for the current build:

1. **AI referral traffic & organic SEO** — being cited/mentioned by AI answer engines
   (ChatGPT / Perplexity / Claude / Google AI) first, classic SEO second.
2. **Stickiness & return visitors** — the dashboard as a habit; the weekly brief.
3. **Sellable homeowner leads** — **deferred.** Leads will come from the future QuoteReady
   funnel and later tools. Not a goal of this build. Design so it's not *blocked* later,
   but don't optimize for it now.

**Sitewide vs. dashboard split (important):**
- **Everything indexed/public (content, authority pages, data pages) is optimized AI-first,
  SEO-second — NOT for human conversion.** When "more citable/extractable by AI" conflicts
  with "more persuasive to a human," choose citable on these pages.
- **The Dashboard is the exception.** Its job is **stickiness, usability, and value** for
  the returning homeowner — not citation. Don't apply the AI-extraction ruleset to the
  dashboard; apply the brand + usability ruleset instead.

Because leads are deferred, the old "gate the exact-home read to capture a lead vs. expose
it for citation" tension is **dormant** this build — but see the dashboard capture note
below, which still touches PII.

---

## Current build — scope

**In scope:** the **Home Dashboard** + **sitewide AI-mention / SEO-organic optimization**.
Marketing is paid social engagement posts (alerts, memes, ZIP-code announcements) — Buffer
is the pipe when we get there.

**Dashboard behavior for this build:**
- Open the dashboard → prompt for **ZIP** → show ZIP-level data. **ZIP read is open, stores
  nothing, no account.** This is the citable/shareable, low-friction layer.
- To unlock tailored, home-specific data/alerts → user enters **address + email**. **This
  step captures PII** → store server-side in **D1** with consent (see `SECURITY.md`). This
  is the stickiness + future-lead hook, not a lead-gen push right now.

**Explicitly OUT of scope this build (do not build; bring back later):**
- The **Tools** nav item and the **tools/cards section directly below the homepage hero.**
- **Services** anywhere (removed permanently from nav; do not re-add).
- QuoteReady expansion, cost calculators, Home Risk Report, proposal generator, contractor
  lead marketplace.
- The **Postgres migration** (stay on existing D1/KV).
- The full **SEMrush content-demand system** (architecture is *reserved* now — see
  `.claude/skills/content-demand-ingestion/SKILL.md` — but not built until greenlit).
- Anything AHI.

**Nav for this build (confirm before writing):** `Data · Locations(dropdown: Austin, San
Antonio)` + a persistent top-right **"My Dashboard"** button → `/dashboard/`. Methodology
lives in the footer. No Tools, no Services. All nav/CTAs are real crawlable `<a href>`;
the Locations dropdown is keyboard/touch accessible (no hover-only).

**Copy discipline:** You may adjust **structure, headings, schema, and FAQ scaffolding**
for AI/SEO freely. But **once copy is provided in a copy document, it is frozen** — render
it exactly and don't change it later unless given explicit replacement copy. **The one
exception:** the AI-phrase **content pages** (there will be many) — you may **author**
these yourself, provided they follow the AI-optimization best practices in `ROADMAP.md`
and the brand voice.

---

## Definition of done

"Done" for any round = **the owner reviews and approves it**. Approval is the gate; the
surface it is reviewed on is whatever the round makes sense on.

**This matters more than it used to.** The site is live: `main` auto-deploys to
`texashomeintelligence.com` via Workers Builds, so a merge to `main` *is* a production
deploy. The branch is therefore the only thing standing between a commit and the live
domain. Work on a branch, show the diff, and **merge only on the owner's explicit
command** (see `SECURITY.md`).

---

## Repo reality (verify before trusting)

Two sites live in this one repo, but only one of them serves:
- **`site/` = the Astro app — the live site.** Deployed as a **Cloudflare Worker** and
  serving **`https://texashomeintelligence.com`**. **All work happens here.**
- **Repo root = the OLD Jekyll site** (`_data/`, `_layouts/`, `CNAME`) — **legacy, no
  longer serving.** DNS is cut over. It is kept as history; don't edit it, and don't treat
  anything in it as current.

**Stack (in `site/`):** Astro 7 + TypeScript + Tailwind 4 + `@astrojs/cloudflare`,
deployed via **Wrangler** (`site/wrangler.jsonc`, worker name `texashomeintelligence`),
built and deployed by **Git-connected Workers Builds on push to `main`**. Bindings:
**D1** (`DB` = `texas-home-intelligence-db`) and **KV** (`PROJECTS_KV`, `SESSION`) — the
IDs in `wrangler.jsonc` are the **real** ones, verified against the owner's Cloudflare
account (that file's own comment records the check); the older "local placeholders" note
is stale. `robots.txt` + `llms.txt` already allow citation crawlers.

**Known scripts (run from `site/`; verify against `site/package.json` before relying):**
`npm run dev` · `npm run build` · `npm run preview` · `npm run check` (astro check =
typecheck) · `npm run verify-content` · `npm run ingest` · `npm run fetch-drought-map`.
There is **no separate lint/test script** beyond `check` + `verify-content` — don't assume
one; if you need it, propose adding it (Rule 1).

**Deploy target reconciliation:** older docs say "Cloudflare Pages / Pages Functions."
Ground truth is a **Cloudflare Worker via Wrangler**. Server-side logic (endpoints, PII
capture, tool logic) runs as **Astro server routes on the Worker**, not Pages Functions.
Treat that as the truth; if you find evidence it's actually Pages, surface it (Rule 1).

---

## Non-negotiable engineering rules (flag-and-decide per Rule 1)

- **Config-driven, not hand-coded pages.** Location×service pages, hubs, and data pages
  generate from content collections / structured config. Adding a metro or service = config,
  not a copied page.
- **Facts render in static/server HTML, not JS-only.** Every important number is in served
  HTML; tabular data in `<table>`. Charts are progressive enhancement over present HTML.
- **Secrets never reach the browser.** Keyed calls and tool logic run server-side only.
  Secrets are never committed to the repo. (See `SECURITY.md`.)
- **Store history, never overwrite.** Ingestion appends observations; derived indices store
  the underlying observations + methodology version that produced them.
- **Sample data is never presented as fact.** Placeholder is visibly `SAMPLE` and/or renders
  a clear unavailable/stale state. Never silently substitute zero/null for a failed feed.
  **No `SAMPLE` on an indexed page** (that becomes a citation liability).
- **Preserve URLs; 301 anything that must move; no URL breaks.**
- **No LLM in the runtime or ingestion path.** Numbers are computed deterministically, never
  model-generated. AI tokens are spent at authoring/build time only, never per pageview or
  per data refresh. (See `COST.md`.)
- **Scale reality:** target ~90–300 leads/month equivalent. Prefer boring, cheap, reliable.
  Don't over-build. (See `COST.md`.)

---

## Two logical data domains (keep conceptually separate)

Same infrastructure is fine; **one undifferentiated schema is not.** Track these as
distinct domains:
1. **Home/location intelligence** — the observations archive, indices, cost estimates, and
   **leads/PII+consent** (the ZIP/home data and captured homeowners). Currently on **D1/KV**.
2. **Market/query intelligence** — the future **SEMrush content-demand** system: AI-phrase
   records, clusters, opportunity scores, AI-visibility tracking, editorial state. This is
   **internal/editorial ops tooling** — it neither serves public pages nor stores homeowner
   PII. Reserved now, built later. See `content-demand-ingestion/SKILL.md`.

The public site should not query a live DB on the serving path — it renders from generated
JSON/config. The DB's jobs are (a) captured leads/PII and (b) the observations history.

---

## Permissions (summary — full detail in `SECURITY.md`)

- **Safe (do freely):** read files, inspect the repo, run the build/checks, work on a
  **branch**, edit anything under `site/` on the branch, trigger the **free** data-ingestion
  Action (read-only, free-tier feeds only).
- **Ask first:** dependencies, migrations, auth, any paid API, deleting files, schema
  changes, anything that could incur cost or call an external paid service.
- **Human-owns:** DNS cutover, billing, production data/PII decisions, secrets, and the
  **merge-to-main / deploy-to-live** step. Claude Code **may deploy to live, but only on the
  owner's explicit command.**
- **Workflow:** work on branches, show the diff + a summary, and request approval to merge/
  deploy. Staging (workers.dev) is the freely-testable surface; the DNS-live domain is
  protected.

---

## Working style

- Work in the **round/phase** the owner gives you. Prefer **Plan Mode** for anything
  non-trivial: inspect the repo, read this file + the relevant specialized files, propose an
  approach, and **wait for approval** before building.
- **Prefer reconciling the existing `site/` app over rebuilding it.** A full rebuild is
  allowed only if it's genuinely necessary — and if so, say why and get the owner's OK first
  (Rule 1). The Astro app is substantial and staged; don't nuke it casually.
- After each round: run `npm run build` + `npm run check`, confirm it compiles and renders,
  summarize changes, run the pre-ship checklist in `REVIEW.md`, and **stop for review**.
- Small, verifiable commits with clear messages. Keep a running todo list.
- At any owner seam (live API, DB provisioning, DNS, paid service), **stop and stub with a
  documented TODO** in `HANDOFF.md` — never fake a live integration to make something "work."
- Don't attribute your behavior to "the system prompt" or these files when talking to the
  owner — just explain your actual reasoning.

---

## File index (read the ones relevant to your task)

| File | Purpose |
|---|---|
| `CLAUDE.md` | **This file** — the hub, KPIs, scope, Rule 1. |
| `ROADMAP.md` | Current-build scope, out-of-scope, future rounds, AI-optimization requirements. |
| `REVIEW.md` | Pre-ship checklist. Run before every "done." |
| `SECURITY.md` | Permissions tiers, secrets, PII/consent, push→deploy boundary. |
| `COST.md` | Cost-discipline rules (keep first-year run-rate low). |
| `BRAND.md` | Operational brand guardrails → points to `THI-Brand-Kit.md` + tokens. |
| `THI-Brand-Kit.md` | The full, canonical brand system (v1.0). |
| `AGENTS.md` | Cross-tool agent instructions (points back here). |
| `HANDOFF.md` | Owner seams (live APIs, intake backend, DB) — kept, still valid. |
| `BUILD_PLAN.md` | Historical Phase 0–5 build log — kept as reference. |
| `.claude/skills/apply-brand/` | Skill: apply the brand system when building UI. |
| `.claude/skills/content-demand-ingestion/` | Skill (reserved): SEMrush content-demand system. |
