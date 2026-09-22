# THI Website V3 — Backlog

Owner's idea dump for the V3 revision cycle, with a grounding note per item and the decisions
each one needs before it can be built. **This is a backlog, not a plan of record.** Nothing here
is approved for build except what a round prompt explicitly scopes.

Grounding notes were written from a read of `main` at `a995ebc` (2026-09-22) in a chat session,
not by Claude Code. **Treat every factual claim below as unverified until a round confirms it
against the repo** (CLAUDE.md Rule 1; the Round 30 premise failure is the reason this line exists).

Publication note: this repo is public. This file carries direction and decisions only. Anything
about other properties the owner operates, or about the repo's own visibility, is held by the
owner outside the repo and is deliberately absent here.

---

## Proposed round sequence

| Round | Objective | Items | Blocked on |
|---|---|---|---|
| 31 | Analysis discoverability + article formatting | 9, 10 | nothing (nav + homepage module surfaced as decisions, not built) |
| 32 | Zero broken internal links (shipped) | — | nothing — done, see `docs/audits/round-32-broken-data-links.md` |
| 33 | Footer restructure (shipped) | 2 | nothing — done, see `docs/audits/round-33-footer.md` |
| 34 | Dashboard free-account card accent | 5a | nothing — small |
| 35 | Privacy disclosure → tag container → conversion events | 3 | D3a–D3d; privacy copy is 🔴 owner-approved before any tag ships |
| 36 | Metric contract for external readers (`data-metric` / JSON) | 6 | D6 (the consumer's config) |
| 37 | Hero system evaluation (probe, then build) | 4, 5b | D4a–D4c |
| P1 | Probe: county appraisal data | 1 | probe only — no build until data + legal gates pass |
| P2 | Probe: crime data | 7 | probe only — D7 |

Probes (P1, P2) can run in any gap; they write an audit and change no served page.

---

## Items

### 1 · County appraisal data → property-tax overpayment estimate

**Owner:** County appraisal reports etc. to calculate how much someone is overpaying on their
property taxes.

**Grounding:** New data domain; no appraisal-district ingestion exists. The sandbox network
allow-list already includes Travis, Bexar, Harris, Dallas and Tarrant CAD domains.

**Why this is a probe first:**
- *Data gate (Meta-Rule 5).* Unknown whether CAD data is available in bulk, at parcel grain,
  with the fields a comparable-value estimate needs, under terms that allow republication.
- *Honesty.* "How much you are overpaying" is a claim about one specific property. Every THI
  figure today is county- or metro-level and says so. An overpayment figure is a **modelled
  estimate** by construction and must be labelled as one — or withheld.
- *Regulatory.* Texas regulates property tax consultants. Whether a free self-help estimate
  touches that regime is a question for someone qualified, not for the build. Name it; don't
  answer it.

**Decision needed:** none yet — the probe's audit produces the decision list.

### 2 · Footer restructure

> **SHIPPED — Round 33** (`docs/audits/round-33-footer.md`). Four columns: brand + Connect,
> Company, Services, Data. Decisions taken: D2a keep all seven service links in their own
> column · D2b Tools in Company · D2c metro links are anchors on `/data/`, no location hubs ·
> D2d no About link until there is copy · D2e Facebook only. **Still open from this item:**
> the About page and its link, and YouTube / Pinterest icons if those accounts are created.

**Owner:**
- Locations → **Company**: add About, keep locations (Austin, San Antonio), Sign in, My Dashboard
- Services → **Connect**: remove all services
- Company → **Data**: Data Catalog, Methodology, Austin Data, San Antonio Data, Privacy
- Narrow the left "Texas Home Intelligence" column — only ~50% of its current height should be
  dead space
- Add social icons: Facebook, YouTube, Pinterest

**Grounding:** `site/src/components/Footer.astro`. The live footer differs from the screenshot the
owner annotated: Round 29 added **Tools** to the Company column, and "All services" was already
removed in Round 10b. The footer is on every page, so it is the site's largest internal-link
surface.

**Decisions needed:**
- **D2a — the seven service links.** Round 10b kept them deliberately: they are the only
  sitewide inbound links to the Austin × service pages. Removing them may leave some of those
  pages with thin or no inbound links. Options: (a) remove, after an orphan check proves
  every service page keeps an inbound link from elsewhere; (b) move them into the Data or
  Company column; (c) keep a compact "Guides" row. Recommendation: (a) only if the check passes,
  otherwise (b).
- **D2b — Tools.** The owner's list omits Tools. Removing it re-creates the exact orphan Round 29
  fixed. Keep it (Company column) unless the owner wants `/tools/` de-indexed.
- **D2c — "Austin Data" / "San Antonio Data" targets.** There is no `/data/austin/` hub route
  today (`site/src/pages/data/[location]/` has only `[topic]`). Options: build two thin location
  hubs (config-driven), or link to anchors on `/data/`. Recommendation: config-driven hubs.
- **D2d — About.** No `/about/` page exists. It needs owner copy (copy discipline: provided copy
  is frozen; new copy comes from the owner). Recommendation: build the route when copy arrives;
  don't ship a placeholder.
- **D2e — social URLs.** The three profile URLs, or confirmation the accounts exist. No icon ships
  pointing at a profile that doesn't exist or a guessed URL.
- Also: an **Analysis** link belongs in the footer once Round 31 lands (see item 10).

### 3 · Tag container, ad pixels, conversion goals

**Owner:** Install Google Tag and connect it; inside it install the Facebook pixel and the
Pinterest pixel; in Analytics, set conversion goals — leads — broken out by vertical.

**Grounding:**
- `Base.astro` already loads **gtag.js directly**, gated on `PUBLIC_GA4_MEASUREMENT_ID`, with an
  AI-referral session parameter and a `window.__thiTrack()` event shim. Events already fired:
  `zip_selected`, `signup_cta_clicked`, `home_created`, `reminder_created`,
  `reminder_completed`, `weekly_email_pref_set`.
- `/privacy/` currently states that analytics are **switched off**, that the site uses exactly
  **three** services, that THI is **not running an advertising business**, and that it does
  **not track which pages you read while signed in**. Ad pixels contradict all four.
- The lead handoff is **not live** (HANDOFF, Round 24). There are no "leads" to count yet.

**Decisions needed:**
- **D3a — privacy first.** The privacy page must be rewritten and live *before* any tag or pixel
  loads (the Round 24 precedent: disclosure precedes mechanism). Owner approves the copy. 🔴
- **D3b — where pixels load.** Recommendation: public pages only; never on `/home/*` or any
  signed-in surface, which keeps the "we don't track what you read while signed in" promise true.
- **D3c — consent.** Whether a consent banner is wanted for ad pixels. Owner/legal call.
- **D3d — "leads by vertical."** Until the handoff exists, define conversions as the events that
  do exist, tagged with a `vertical` parameter where one applies (e.g. `roof-scan` → roofing,
  `ac-lifespan` → HVAC, `plumbing-triage` → plumbing, service-page CTAs by service slug).
  Container ID, pixel IDs and GA4 conversion marking are owner-side (🔴).
- The existing `__thiTrack` shim means a container migration is a loader swap plus `dataLayer`
  pushes, not a rewrite of every call site.

### 4 · New heroes (Scrolltide templates)

**Owner:** Candidate hero templates from `scrolltide.co/templates` — Billet for a THI membership
page; Willow (or a plumbing rendering) for location pages; Glowinn for service-specific pages;
Meridian as a general base case; the bookmark card component as a section. Open question: are
they AI/SEO friendly? If not, restrict them to lead-gen pages.

**Grounding:** Nothing from Scrolltide is in the repo. A previous hero set produced in Claude
Design exists (tools heroes). CLAUDE.md requires facts in served HTML (not JS-only) and fixes the
indexed pages as AI-first, not conversion-first.

**Decisions needed:**
- **D4a — licence.** Whether the templates may be used and modified on this site.
- **D4b — the SEO/AI test**, answered by measurement, not assumption: served HTML contains the
  headline and every figure; LCP/CLS under budget on mobile; works with JS disabled; no content
  hidden behind scroll triggers. Pages that fail stay off indexed routes (`/lp/` only).
- **D4c — "THI Membership."** No membership page or product exists. Scope it before designing a
  hero for it.
- Route: visual adaptation → Claude Design (export into the repo); wiring → Claude Code.

### 5 · Dashboard free-account card

> **5a SHIPPED — Round 34** (`docs/audits/round-34-eyebrow-accent.md`). The "Free account · Two
> minutes" eyebrow carries the logo's Caliche Amber as ink `#0E1726` on an amber `#C4772E` pill,
> **5.15:1**. Applied through a modifier class so the two quiet `.card-tag` labels are untouched.
> 5b (hero system) is unaffected and still open.

**Owner:** (a) The "FREE ACCOUNT · TWO MINUTES" eyebrow should be accented in the logo orange.
(b) This might be the place for a Scrolltide hero.

**Grounding:** The card lives on the ZIP dashboard (`site/src/pages/dashboard/[zip]/`,
`LaunchNotify.astro`). The logo orange is BRAND.md's accent, **Caliche Amber `#C4772E`**,
"sparing (~3%), one deliberate accent per view." The dashboard is exempt from the AI-extraction
ruleset (CLAUDE.md), so (b) is less constrained here than on indexed pages.

**Decisions needed:** (a) none — check the view has no competing accent and that amber on the
eyebrow's background meets WCAG AA for its text size. (b) folds into item 4.

### 6 · Machine-readable metrics for an external reader

**Owner:** Add `data-metric` attributes to the data pages. A `config/sources.yaml` elsewhere
selects on things like `[data-metric='permit-count']`; if the attributes don't exist, add them to
the elements holding the headline figures — or better, expose a small JSON endpoint per dataset
and set `json_url`, dropping scraping entirely. Right now `signals` reports "selector matched
nothing" for every source.

**Grounding:** `config/sources.yaml` and `signals` are **not in this repo**. No `data-metric`
attributes exist in `site/`. Datasets are already committed JSON rendered at build time, and CSV
routes already exist per topic (`/data/[location]/[topic]/[csvName].csv`).

**Decision needed:**
- **D6 — the contract.** The owner supplies the consumer's `sources.yaml` (or its list of metric
  names and expected shapes). Recommendation: JSON endpoints, statically generated at build time
  from the same committed data (no serving-path fetch, no new cost), with each value carrying
  `source` and `asOf` — THI's honesty rules apply to machine-readable output too. Add
  `data-metric` attributes as well; they are cheap and help any reader.

### 7 · Crime stats and data feeds

**Owner:** Add crime stats and API data feeds.

**Why this is a probe first:**
- *Data gate.* What APD and SAPD (and county) publish, at what grain, how current, and under what
  terms.
- *Brand.* THI is an instrument panel, not an alarm. Crime data is the easiest data on the site to
  present as alarm.
- *Risk.* Neighbourhood crime figures on a housing-adjacent site raise fair-housing concerns in
  how they are framed and where they appear. Name it; the owner decides with qualified input.

**Decision needed:**
- **D7** — after the probe: whether crime belongs on THI at all, and at what grain.

### 9 · Article formatting

**Owner:** Improve the formatting on the articles (example:
`/analysis/are-texas-electricity-prices-still-going-up/`).

**Grounding (from the live render):** Content structure is sound — a direct answer first,
sourced figures, a data table. Formatting gaps: no visible publish/updated date or author line
(present only in metadata); "The short answer" renders as ordinary prose; the headline figure is
not visually elevated even though the frontmatter `card` block already holds it, ledger-verified;
the Sources list is bare text; typographic minus signs; no related reading or link onward to the
underlying data page.

**Scope → Round 31.**

### 10 · A proper blog / analysis page

**Owner:** Articles are being published but are effectively impossible to reach from the
homepage, and there is no page listing them.

**Grounding:** `/analysis/` **does exist** (`site/src/pages/analysis/index.astro`) — a plain list.
Nothing outside `/analysis/` links to it: not the nav, footer, or homepage. The hub and every
article appear to be orphans; the articles began publishing after Round 29's orphan sweep. **To be
confirmed by `check-orphans.mjs`.**

**Decisions needed:**
- **D10a — nav.** CLAUDE.md fixes the header nav at Data, Locations and My Dashboard. Adding
  "Analysis" is a Rule 1 change. Recommendation: add it — it is the site's most citable layer.
- **D10b — homepage module.** A "Latest analysis" section needs owner-approved heading copy.
  Recommendation: yes, three most recent, rendered at build time.

**Scope → Round 31** (footer link + hub + article template; nav and homepage module built only on
owner approval).

### 11 · Data-page slug parity

**Owner (Round 32 decision A):** Austin storm events publish at `/data/austin/roofing/`,
San Antonio's at `/data/san-antonio/storms/`. Candidate fix: 301 roofing → storms with roofing
as a section; needs its own round (URL move, citation risk).

**Grounding (measured in Round 32, not a chat read):** both pages render the same feed —
`austinRoofing.ts` is `topic: "roofing"`, `sanAntonioStorms.ts` is `topic: "storms"`, and both
carry `datasetId: "noaa-storm-events"`. Austin's file holds 88 non-seed records over 7 counties
(wind 33, flood 34, hail 20, tornado 1); San Antonio's 94 over 8. `/data/austin/roofing/` is not
a roofing subset: its own description covers "hail, wind, flood and tornado events for the
seven-county Austin area". The mismatch cost a broken link — the readings layer asked every
metro for `storms` and Austin did not have it — which Round 32 fixed at the source. **Nothing is
broken while this sits:** the Austin storm reading keeps its source and as-of and carries no
onward link, where San Antonio's links out.

**Why its own round:** moving a published, indexed URL is a citation risk (KPI #1), needs a 301,
touches `llms.txt`, the sitemap, the CSV endpoint and every cross-link, and the alternative —
adding `/data/austin/storms/` beside the roofing page — publishes the same 88 records at two
URLs, which is the near-duplicate an answer engine resolves by picking one.

**Decisions needed:** which direction the 301 runs, and what the surviving page is called.

**Scope → unscheduled.** Options and the Round 32 recommendation are in
`docs/audits/round-32-broken-data-links.md` §4.

### 12 · `.card p` overrides the label type on every `.card-tag`

**Found in Round 34's grounding, measured not assumed.** `.card-tag` asks for
`font-size: var(--thi-fs-label)` — `0.75rem`, 12px. It renders at **15.04px**, because
`.card p { font-size: .94rem }` is more specific and the eyebrow is a `<p>` inside a `.card`.
The label token is being ignored wherever a `.card-tag` sits in a card, which is all three of
them: the free-account eyebrow and the "Modeled — per-ZIP coming soon" label on a ZIP dashboard,
and "<alert> · condition detected" on the signed-in dashboard.

**Why it needs its own round rather than a one-line fix:** putting the eyebrows back on the
label scale shrinks them by 3px on 225 indexed pages plus the signed-in view, which changes the
card's type rhythm and the vertical space the heading beneath it sits in. It is a type change
dressed as a specificity bug. It also wants a decision on whether the fix is a more specific
`.card .card-tag` rule, a reordering, or dropping `.card p`'s size altogether — the last of which
reaches every paragraph in every card on the site.

**Not a contrast problem.** 15.04px at weight 600 is not WCAG large text either way (that needs
18.66px AND bold), so the 4.5:1 threshold Round 34 measured against applies at either size.

**Decision needed:** which fix, and whether the eyebrows should be 12px at all.

**Scope → unscheduled.**
