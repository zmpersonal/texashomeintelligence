# ROADMAP.md — Texas Home Intelligence

What matters **now**, what's explicitly **out**, and what's queued for **later**. Governed
by `CLAUDE.md` Rule 1: if a request pulls against this scope, surface it and let the owner
decide — don't silently expand scope.

> Historical build detail (Phases 0–5, already completed) lives in `BUILD_PLAN.md`. This
> file is the **forward-looking** scope. Where they disagree, this file wins.

---

## This build — the only two things in scope

### 1. The Home Dashboard (stickiness · usability · value)
The flagship interactive surface. Not optimized for AI citation — optimized to be the thing
homeowners come back to.

- **ZIP layer (open, no capture):** open dashboard → prompt for ZIP → show ZIP-level read
  (Home Stress Index + the five signals + "what changed this week" + ZIP-vs-metro compare).
  Stores nothing. This is the shareable/citable-flavored, no-account layer and the source of
  share cards for paid social.
- **Home layer (unlock via address + email → PII capture):** entering address + email
  unlocks tailored, home-specific data and alerts. **Captures PII to D1 with consent**
  (`SECURITY.md`). This is the stickiness hook and the future-lead seed — not a hard
  lead-gen push now.
- Build from the current staging build + the delivered design screens in
  `docs/source/design/` (`THI Home Dashboard.dc.html`, `THI Public ZIP Dashboard.dc.html`,
  `THI Share Card.dc.html`) as the canonical layout reference (supersedes
  `MOCKHUP-Dashboard-V1.html`). **Staging is the source of truth for current state**;
  reconcile, don't blindly rebuild.
- Apply `BRAND.md` / the `apply-brand` skill: instrument-panel feel, the information ladder
  (Data → Analysis → Estimate → Recommendation → Sponsored), source + freshness on every
  reading, score never without its methodology link, status color as small signal only.

### 1b. Municipal schedules on the home dashboard (Round 5b)
Fills the "Your home this week" municipal row on the logged-in dashboard with
**verified** Austin municipal schedules. Austin-only; every other metro renders
the honest "not available for your area" state rather than implying coverage.

Built in tiers, by how well the source actually supports the claim:

- **Tier 1 — Watering (built).** The drought stage is ingested with provenance
  and an as-of; the watering day is Austin Water's published rule applied to
  street-number parity. Stated **conditionally** ("if your home is an Austin
  Water customer") because the day is rule-derived, not measured for this home.
- **Tier 2 — Personalised watering day (deferred).** Asserting the day applies
  to *this* home needs the Austin Water service-area boundary, which does not
  follow city or county lines. See HANDOFF seam 8.
- **Tier 3 — Trash/recycling (built).** Matched per-address against the city's
  own table, **strict match-or-withhold**: exact match publishes the day and the
  A/B recycling week; any ambiguity, ZIP conflict, unreadable address, or absent
  row withholds and links the city's lookup. A home the city does not serve is
  never shown Austin's day. The A/B week ships as a **letter, never a date** —
  the calendar anchor is unsourced (HANDOFF seam 7).
- **Tier 4 — Bulk (built).** Entitlement only, **never a date**: Austin replaced
  its predetermined bulk schedule with on-demand appointments in January 2025,
  so no "next pickup" date exists to publish for anyone.

The governing rule for the whole round: **a wrong collection day is worse than
no collection day.** There is no fuzzy matching anywhere in the path.

### 2. Sitewide AI-mention / SEO-organic optimization
Everything indexed/public, optimized AI-first (see requirements below). Includes the nav
change (drop Tools + the section directly below the homepage hero; no Services), schema,
crawlability, freshness, and — where copy is *not* frozen — the AI-phrase content pages,
which Claude may author.

**Marketing (context, not a build task yet):** paid social engagement posts — alerts, memes,
ZIP-code announcements — fed by the dashboard's share-card system. Buffer is connected as the
scheduling pipe for when this becomes a build task.

---

## Explicitly OUT of scope this build

Bring these back in later rounds; do **not** build them now:

- The **Tools** nav item and the **tools/cards section directly below the homepage hero**.
- **Services** anywhere (permanently removed from nav — do not re-add or link).
- **QuoteReady** expansion (the deferred lead funnel), **Cost Calculators**, **Home Risk
  Report / Home Intelligence Report** (keep the report's content/layout concept for later —
  recolored to brand — but don't build it now), **proposal generator**, **QuickConnect**,
  contractor lead marketplace.
- The **Postgres migration** — stay on the existing **D1/KV**.
- The full **SEMrush content-demand system** — architecture reserved (see the
  `content-demand-ingestion` skill), not built until greenlit.
- **AHI / Austin Home Intelligence** — separate project entirely.

---

## AI-optimization requirements (apply to every indexed authority page — NOT the dashboard)

1. **Exact AI-prompt phrasings as H2s**, with the answer in the **first 1–2 sentences**.
2. **Publish original data** (permit-valuation costs, hail counts, branded indices) — be the
   primary source for prompts that currently cite nothing.
3. **Extractable formats:** cost-by-material tables, key-findings blocks, ranges (not false
   precision) — all in **server-rendered HTML**.
4. **Schema:** FAQPage + Article + Dataset/DataCatalog + Organization (consistent "Texas Home
   Intelligence" entity, logo, sameAs) + WebSite + BreadcrumbList.
5. **Own the "how to choose" decision frameworks** — a large share of homeowner AI demand.
   THI is an intelligence source, not a directory.
6. **`llms.txt` + `robots.txt`** keep citation/search crawlers allowed (OAI-SearchBot,
   ChatGPT-User, PerplexityBot, Perplexity-User, Claude-SearchBot, Claude-User, Googlebot,
   Bingbot, + Applebot-Extended/Amazonbot/cohere-ai). **Verify Cloudflare Bot Fight Mode /
   WAF isn't blocking citation crawlers at the edge** — the most common own-goal.
7. **Visible freshness** (Updated / Data-through) on time-sensitive pages.
8. **Canonicals everywhere**, consistent trailing-slash policy, per-page OG/Twitter overrides.
9. **Don't lead with "AI"** in user-facing copy. The visible value is Texas-specific
   intelligence and useful tools. AI optimization is how we get *found*, not the pitch.

**Content grounding:** ground content in the roofing keyword research, not the retired
AHI-AI-PHRASES file. ~Half of roofing AI prompts are "recommend/choose a roofer" — own that
framework. Skip keyword-tool noise (competitor-brand review pages, crown molding, awnings,
deck/fence, canvas).

---

## Closed-loop AI-visibility (why the content-demand system exists — later)

The point of the future SEMrush system is a **closed loop**, not one-off keyword research:
ingest AI-phrase data → normalize → cluster → map to service/location → score opportunity
(AI demand × commercial value × topical fit × THI weakness × competitor weakness) → map to
an existing URL or a content gap → editorial queue → publish → **recheck AI visibility
later**. That final recheck is what tells us which content actually moved THI's citation
rate — a direct instrument for KPI #1. Reserved now; see the skill.

---

## Future rounds (rough order, not a commitment)

1. Copy-rewrite round(s) on the ported/old sections (realign voice per `THI-Brand-Kit.md`).
2. Austin **Roofing** authority cluster (hub → how-to-choose flagship → replacement-cost →
   storm/hail → repair-vs-replace → materials → finding-a-roofer → insurance → permits →
   Texas-wide) + Roof Stress Index + `/methodology/roof-stress-index/` + `/data/austin/roofing/`.
3. SEMrush **content-demand system** build (two-domain schema, ingestion, scoring, editorial
   queue, visibility recheck).
4. Cost Calculator (roofing first), then re-introduce the Tools hub + the below-hero section.
5. QuoteReady lead funnel (reactivates the leads KPI and the "expose vs. gate" tension).
6. Postgres migration (only when the archive/tooling genuinely needs it).
7. HVAC + Plumbing clusters; San Antonio roofing; Houston.

Do not build ahead of the current round. Tool functionality only in its dedicated round.
