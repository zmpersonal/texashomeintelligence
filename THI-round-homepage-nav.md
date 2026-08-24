# THI — Round Spec: Homepage Hero + Navigation + Header Button (FINAL)

**Purpose:** Complete, build-ready specification for this round. Hand this to the build chat,
which converts it into Claude Code prompts. This is NOT a Claude Code prompt. Everything here
is already agreed — do not expand scope during the build.

**Stack / sequencing note:** Written stack-agnostically (requirements are identical in Jekyll or
Astro). If the Astro migration is imminent, run it BEFORE this round so the work isn't built
twice. Otherwise build on the current stack.

**In scope:** header button relabel; top-nav restructure; `/tools/` hub page + tool routes;
homepage hero rebuild; four nav cards; required placeholder routes; SEO/mobile guardrails.
**Out of scope (placeholders only):** functionality for Dashboard, QuickConnect, Home Risk
Report, Cost Calculators; roofing cluster; Astro migration; database. Do not build tool logic.

---

## 1. Header button (relabel + repurpose)

- The existing top-right header CTA currently reads **"Build My QuoteReady Brief."** Change the
  label to **"My Dashboard"** and the destination to **`/dashboard/`**.
- Keep its position (top-right), prominence, and styling. It must appear on **all pages** (it's
  the persistent Dashboard entry point).
- Because this button covers Dashboard sitewide, **Dashboard is NOT a top-nav link** (see §2).

## 2. Top navigation (restructure to the product axis)

Current nav: Austin · San Antonio · Data · Methodology  +  [Build My QuoteReady Brief].
New nav: **Tools · Services · Data · Locations(dropdown)**  +  [My Dashboard button].

- **Primary nav links (left/center):** Tools (→ `/tools/`), Services (→ `/services/`),
  Data (→ `/data/`).
- **Locations:** a dropdown containing **Austin** (`/austin/`) and **San Antonio**
  (`/san-antonio/`). Remove Austin/San Antonio as standalone top-level links.
- **Methodology:** remove from top nav; place in the footer.
- **Dashboard:** not in nav (covered by the My Dashboard button).
- All nav links (including every item inside the Locations dropdown) must be **real crawlable
  `<a href>` in the served HTML** — not JS-only. Dropdown must be keyboard-accessible and work on
  touch/mobile (no hover-only).

## 3. Tools structure — DECISION: `/tools/` hub page (primary)

- Nav **Tools → `/tools/` hub page**, an indexable page with a section/card per tool. Each links
  to that tool's own page:
  | Tool | Destination | Status |
  |---|---|---|
  | Dashboard | `/dashboard/` | **near-term build (own round)** — flagship free tool |
  | QuoteReady | `/start/` (existing intake) | live; no further buildout now |
  | QuickConnect | `/tools/quickconnect/` | placeholder (LATER) |
  | Home Risk Report | `/tools/home-risk-report/` | placeholder (LATER) |
  | Cost Calculators | `/tools/cost-calculators/` | **near-term build (own round)** — free tool |
- Tool priority (owner decision): **build Dashboard + Cost Calculator** as the near-term free
  tools (each in its own round, after the Astro + data/DB foundation). **Home Risk Report,
  QuickConnect, and further proposal-maker work come LATER.** In THIS homepage round, all of these
  are created as routes/shells only; the two near-term tools get their real build in later rounds.
- The `/tools/` hub page is **real and indexable** (title e.g. "Free Texas Homeowner Tools"),
  with a short intro and one card per tool (name, one-line description, link). Consistent card
  styling.
- **Optional future enhancement (not this round):** also make the nav Tools item a dropdown
  listing the five tools plus a "View all tools →" link to `/tools/`.
- **FLAG (decide before building either):** Home Risk Report and Dashboard overlap (both are
  address → home-risk output). Clarify the relationship — e.g. Home Risk Report = one-time
  generated report; Dashboard = ongoing live view — so the same thing isn't built twice.

## 4. Homepage hero (rebuild)

- **Remove** the current address-entry / Home Risk Report lead form from the hero. (Address
  intake moves into the Dashboard experience — see PII flag in §8.)
- Rebuild as editorial/authority. **Single `<h1>`.** Content:
  - Eyebrow / small label: **Texas Home Intelligence**
  - H1: **Know What Your Texas Home Needs — Before It Gets Expensive.**
  - Subhead: *Texas-specific data, tools, and local home-service intelligence to help homeowners
    understand risks, maintenance, repair costs, and when to take action.*
  - Freshness line: *Updated continuously using weather, property, economic, and home-service data.*
- **Primary CTA (visually dominant):** "Open My Home Dashboard" → `/dashboard/`
- **Secondary CTA:** "Explore Free Tools" → `/tools/`
- Design: premium, clean, data-focused. No button walls, FAQs, stats, or badges inside the hero.
  Hierarchy: brand → H1 → paragraph → primary CTA → secondary CTA → small freshness line.
- Note: the hero primary CTA and the top-right My Dashboard button both point to `/dashboard/`.
  This redundancy is intentional (persistent button + homepage-specific CTA).

## 5. Four navigation cards (immediately below the hero)

- Row of four **fully-clickable** cards (each wrapped in an `<a>`). Desktop 4-across; tablet 2×2;
  mobile single-column. Card headings use `<h2>` (nested under the single `<h1>`).
- **Card 1 — Home Dashboard** (flagship; slightly stronger visual weight — larger icon / stronger
  border / small "For Your Home" tag; not dramatically larger) → `/dashboard/`.
  Copy: *See the conditions affecting your home right now — including weather, HVAC stress, storm
  exposure, maintenance signals, and more.* CTA: "Check My Home →". Optional tag: "Personalized to
  your address or neighborhood." No account required.
- **Card 2 — Homeowner Tools** → `/tools/`. Copy: *Use Texas-specific tools for repair costs,
  repair-vs-replace decisions, project planning, and contractor quotes.* CTA: "Explore Free Tools →".
- **Card 3 — Research a Home Project** → `/services/`. Copy: *Research HVAC, roofing, plumbing,
  electrical, mold, fire damage, tree care, and other major home projects.* CTA: "Explore Home
  Services →". Framed as research/decision support — NOT THI performing services.
- **Card 4 — Texas Home Data** → `/data/`. Copy: *Track the weather, costs, risks, and market
  conditions affecting homes across Texas.* CTA: "See Current Data →".
- Consistent dimensions/typography/restrained icons/whitespace/subtle hover states.

## 6. Routes & placeholders

- Ensure these routes exist and are crawlable: `/dashboard/`, `/tools/`, `/services/`,
  `/tools/quickconnect/`, `/tools/home-risk-report/`, `/tools/cost-calculators/`.
  (`/data/`, `/austin/`, `/san-antonio/`, `/start/` already exist.)
- Any not-yet-built page gets a **clean, non-empty placeholder** ("what this will do") — never a
  dead link. **`noindex` the thin placeholders** until they're real pages.
- The `/tools/` hub is the exception: real content, indexable.

## 7. SEO / technical guardrails

- Exactly one `<h1>` on the homepage; card headings `<h2>`.
- All CTAs and nav items are real crawlable `<a href>`, not JS-only buttons.
- No important copy inside images. Content server-rendered/static.
- Do not weaken existing metadata, schema, canonical tags, or indexing behavior.
- Do not remove the existing live-data content below the new hero/cards section.
- **Re-point the homepage `<title>` and OG tags** away from "Free QuoteReady Project Brief" to the
  authority positioning (e.g. "Texas Home Intelligence — Data, Tools & Local Home Intelligence for
  Texas Homeowners"). Update meta description to match.
- Keep `Organization` schema consistent ("Texas Home Intelligence") sitewide.

## 8. Mobile

- Hero stays concise; headline wraps to a few lines, not 5–6. CTAs may stack vertically.
- Four cards become a single-column stack, **Dashboard first**, order preserved:
  Dashboard → Tools → Services → Data.
- The My Dashboard button remains visible/accessible (in the header or hamburger).
- Nav collapses to a hamburger; Locations dropdown renders as an accessible expandable list.
- **PII flag (for the later Dashboard build, not this round):** the Dashboard will capture an
  address. Consent/privacy handling must be in place when that's built (ties to the lead/consent
  schema in the Stack & Database section of the backlog).

## 9. Explicitly OUT of scope this round

- Building tool *functionality* — this round creates routes/shells only. Dashboard and Cost
  Calculator are built in their own near-term rounds (after Astro + data/DB); QuickConnect,
  Home Risk Report, and proposal-maker enhancements are later.
- The roofing content cluster.
- The Astro migration (unless sequenced first) and any database work.
- Any homepage sections other than the hero and the four-card row.

## Open flags carried out of this round (decide before dependent work)

- Home Risk Report vs. Dashboard overlap (§3).
- Stack sequencing: Astro migration before this round?
- QuoteReady route: keep `/start/` as the tool link, or add a `/tools/quoteready/` explainer page later.
