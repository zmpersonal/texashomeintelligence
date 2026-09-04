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

**Measured coverage (first live ingest):** 178,060 addresses across 42 Austin
ZIPs; **98.4%** of them round-trip to the city's own key. The remaining 1.6% is
an ambiguity in the city's `HSE_SUFF` encoding, deferred and recorded as
HANDOFF seam 9 — it withholds honestly today.

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
2. **Publish original data** (permit activity counts, month-by-month permit timing,
   within-city trade mix, hail counts, branded indices) — be the primary source for prompts
   that currently cite nothing.
3. **Extractable formats:** key-findings blocks, ranges (not false precision), and tables of
   anything the data supports — all in **server-rendered HTML**. 🟡 **Cost-by-material tables are
   CONDITIONALLY UNBLOCKED (Round 17b)** — as **national averages only**, under the five
   requirements in the cost note below. No LOCAL cost figure is publishable in either metro,
   and that measurement is unchanged.
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

> ⛔ **No cost figure is publishable from permit data, in either metro.** Measured end to end
> in rounds 4b–6 — `docs/audits/round-6-permit-measurement.md`. San Antonio's `DECLARED
> VALUATION` is 0.00% populated on every residential and trade permit type; Austin's coalesced
> `valuationUsd` has a **median of 1**, and its trade-named fields carry whole-project
> construction values (plumbing median $900k, mechanical median $1m) rather than trade costs.
> Declared valuation is in any case an applicant's fee-basis statement to the city, **not a
> paid invoice**, so even a clean field would not be a homeowner cost.
>
> Requirement (2) previously named "permit-valuation costs" and (3) named "cost-by-material
> tables". Both were falsified by that measurement and are corrected above. What permits
> **do** license is activity, timing, seasonality and within-city trade mix (see the permit
> rule in `CLAUDE.md`'s engineering rules). Unblocking a cost figure needs a **different
> source**, not a better read of this one.
>
> ### 🟡 Round 17b — OWNER DECISION: national averages are publishable, under conditions
>
> **The measurement above stands and is not softened.** What changes is the response to it.
> Round 7 read "no local price source exists" as "publish no cost figure". The owner's decision
> is narrower and better: **a national figure, labelled national, is publishable; a national
> figure presented as local is not.**
>
> These are **requirements, not preferences.** A round that publishes a cost figure meets all
> five or does not publish one:
>
> 1. **Labelled national**, in the visible copy — not in a footnote — and carrying the
>    **Estimates** bucket. Never labelled, implied or positioned as an Austin or San Antonio
>    figure.
> 2. **Sourced to a primary publisher.** Never an aggregator and never a contractor-marketing
>    page. **HomeAdvisor, Angi, Thumbtack and their equivalents are unacceptable sources** — they
>    publish figures derived from their own lead flow, with no method anyone can check.
> 3. **The page states plainly why there is no local figure**, citing the measurement above.
>    That absence is itself a finding worth publishing, and it is the thing that makes a national
>    number honest rather than evasive.
> 4. **A `reviewEveryDays` cadence**, because material prices move. The same build-time gate that
>    governs the dated claims in `serviceNotices.ts`.
> 5. **Ranges never collapse to a single number.** A single figure is false precision about a
>    quantity that varies by material, scope, region and month.
>
> Full requirement text and the source evaluation are in `HANDOFF.md`.

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

## Shipped

The site is **live at `texashomeintelligence.com`** (DNS cut over from the old GitHub-Pages
Jekyll site; the Jekyll root is legacy and no longer serving). Sign-in email and the Slack
lead notification are **confirmed working in production** by the owner.

Rounds 4–10, in order:

- **Round 4 — public ZIP dashboard.** Open, no account, stores nothing. Home Stress Index +
  five signals + "what changed this week", server-rendered.
- **Round 4.1 / 4.2 — nav, cards, logged-in layout.** "My Home" routing, the conditions →
  "check/look" action guardrail, desktop layout polish.
- **Round 5 — accounts, home profile, reminders, condition alerts.** Passwordless sign-in,
  PII to D1 with consent, the reminder engine.
- **Round 5b / 5b.1 — Austin municipal schedules.** Watering, trash/recycling (strict
  match-or-withhold), bulk as an entitlement. Austin Water stage scraper, fail-closed.
- **Round 7 — v2 logged-in dashboard.** The four-tier redesign; presentation only.
- **Round 8 — copy rewrite** across the homepage, dashboard, ZIP page and sign-in, per the
  approved copy doc. The doc's component-age flagging block is **held** — that mechanic does
  not exist and shipping it would promise behaviour the build does not have.
- **Round 9 — weekly-email infrastructure.** Recipient gate, send loop, signed one-click
  unsubscribe, suppression. **Default OFF**, opt-in only. Inert until the owner sets secrets.
- **Round 10 — Slack lead notification.** Internal ops only, a separate code path from the
  homeowner email transport. **ZIP-only payload** — no email, no address (see `COST.md` and
  the notifier's own `LEAD_DETAIL` note for why).
- Favicon and app-icon set, generated from the brand mark.

---

## Next rounds — owner-approved sequence

**This supersedes the prior ordering.** The earlier "future rounds" list (copy rewrite →
roofing cluster → SEMrush build → cost calculator → QuoteReady → Postgres → more clusters)
is retired; where the two disagree, this list wins.

1. **County data model + Home Stress Index score history.**
2. **San Antonio data parity** — permits, census, soil, BLS, NWS.
3. **Location×service content rework + AI/SEO optimization.**
4. **County rankings page.**
5. **Social poster.**
6. **Article poster.**
7. **AI content poster.**
8. **Tools (conversion).**
9. **Additional content and geographies.**

**The SEMrush content-demand system remains reserved and unbuilt.** Its architecture stays
described in the `content-demand-ingestion` skill and is not to be built without a
greenlight. By owner decision, its **keyword output is being used as an input to round (3)**
— that is a human handing over research, not a licence to build the ingestion, scoring or
visibility-recheck system.

**Round (7), the AI content poster, has an unresolved cost/architecture question** against
`COST.md`'s "no LLM per data refresh" rule. Flagged there; it needs an explicit owner
decision before that round is scoped.

Do not build ahead of the current round. Tool functionality only in its dedicated round.
