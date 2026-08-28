# _SUPERSEDES.md — what replaced what (read once, then delete if you like)

This bundle refreshes the **governance layer** of the repo. Here's the map so nothing is lost
and nothing is duplicated.

## Replace
- **`CLAUDE.md`** — the new one **supersedes** the previous `CLAUDE.md`. Key changes vs. the
  old file:
  - Adds **Rule 1 (surface, don't assume)** as the governing convention.
  - Reweights KPIs: **AI/SEO + stickiness now; leads deferred** to the future QuoteReady
    funnel. Dashboard is explicitly optimized for **usability/value, not AI-extraction**.
  - Nav updated to **`Data · Locations + My Dashboard`** (Tools dropped, Services removed,
    Methodology → footer) and the **tools/cards section below the homepage hero dropped**
    for this build.
  - Adds the **copy-freeze** rule (with the AI-phrase-content-pages exception).
  - Corrects the deploy target from "Cloudflare Pages/Pages Functions" to **Cloudflare
    Worker via Wrangler** (ground truth from `site/wrangler.jsonc`).
  - Sets **D1** (not Postgres) as the store for this build's PII capture; Postgres deferred.
  - Adds the **two-data-domain** boundary and points to cost/security/brand files.

## Keep (still valid, referenced by the new `CLAUDE.md`)
- **`HANDOFF.md`** — the owner-seams doc (live APIs, intake backend, DB build-out). Still
  accurate and useful. New PII/consent and market-intelligence datastore notes live in
  `SECURITY.md` and the `content-demand-ingestion` skill; reconcile into `HANDOFF.md` when
  you next touch a seam.
- **`BUILD_PLAN.md`** — the historical Phase 0–5 build log. Kept as reference. Where it
  disagrees with `ROADMAP.md`, **`ROADMAP.md` wins** (it's the forward-looking scope).
- **`README.md`** — currently describes the **old Jekyll** site. Leave it until DNS cutover;
  update it to describe the Astro app in `site/` as part of go-live.
- **`THI-round-homepage-nav.md`** — an earlier homepage/nav round spec. **Partly stale:** it
  still assumes a `/tools/` hub and four cards below the hero, which this build **drops**.
  Treat `ROADMAP.md` + `CLAUDE.md` as current; use that file only for historical context.

## New files in this bundle
- `ROADMAP.md`, `REVIEW.md`, `SECURITY.md`, `COST.md`, `BRAND.md`, `AGENTS.md`
- `THI-Brand-Kit.md` (canonical brand system — commit it if not already in the repo)
- `.claude/skills/apply-brand/SKILL.md`
- `.claude/skills/content-demand-ingestion/SKILL.md` (reserved)
- Parent-folder `Claude-Master/CLAUDE.md` (goes one level up, in the `Claude Master` folder —
  not in this repo)

## Placement
- All `.md` governance files → **repo root** (where `CLAUDE.md` already lives).
- `THI-Brand-Kit.md` → repo root (or `docs/`); ensure `site/src/styles/thi-tokens.css` exists.
- `.claude/skills/…` → repo root `.claude/skills/` so Claude Code (desktop) discovers them.
- `Claude-Master/CLAUDE.md` → the **parent** `Claude Master` folder, not this repo.

## First move for Claude Code (suggested)
Open in **Plan Mode**, read `CLAUDE.md` + `ROADMAP.md` + `SECURITY.md`, inspect the `site/`
app and the current staging build, and **propose** how to deliver the two in-scope items
(Home Dashboard + sitewide AI/SEO) by **reconciling** the existing app — flagging anything
that would require a rebuild — then wait for approval before building.
