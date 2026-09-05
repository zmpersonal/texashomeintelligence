# Round 28 — /tools/ describes what is there

Date: 2026-09-05 · Branch: `claude/thi-governance-post-launch`
Changed: `site/src/pages/tools/index.astro` (rewritten).
Added: `site/src/data/toolsHub.ts`, `site/scripts/replays/toolshubrender.mjs` (44 assertions).
Deleted: `site/src/pages/tools/{quickconnect,home-risk-report,cost-calculators}/index.astro`
and `site/src/layouts/ToolPlaceholder.astro` (its only three users).

---

## 1. What the hub said before

Five listings. Two pointed at real pages, three at noindexed placeholders.

| Listed | Route | Description it carried | Points at |
|---|---|---|---|
| Home Dashboard | `/dashboard/` | "See the conditions affecting your home right now — weather, HVAC stress, storm exposure, maintenance signals, and more." | **real** (built Rounds 3-4) |
| QuoteReady Project Brief | `/start/` | "Describe a home repair or improvement project once and get a standardized brief you can send to any contractor." | **real**, and **noindexed** by a later round |
| QuickConnect | `/tools/quickconnect/` | "A faster way to connect with local Texas home-service contractors." | placeholder |
| Home Risk Report | `/tools/home-risk-report/` | "A generated report on the weather, storm, and environmental risks facing your property." | placeholder |
| Cost Calculators | `/tools/cost-calculators/` | "Texas-specific calculators for repair-vs-replace decisions and project cost ranges." | placeholder |

Page title *"Free Texas Homeowner Tools"*, eyebrow *"FREE FOR TEXAS HOMEOWNERS"*.
**None of the three built tools was listed.** The hub had not been told they exist.

### The three placeholders — all still present, all still noindexed

Confirmed in the built output: each carried `<meta name="robots" content="noindex, follow">`,
and none appears in `sitemap-0.xml`. All three used `ToolPlaceholder.astro`.

| Route | Its status note, verbatim |
|---|---|
| `/tools/cost-calculators/` | "**Coming soon** — this is one of Texas Home Intelligence's near-term free tools, **in active development as its own build round.**" |
| `/tools/home-risk-report/` | "Planned for later — after the Home Dashboard and Cost Calculators. This page is a placeholder; no report-generation functionality exists yet." |
| `/tools/quickconnect/` | "Planned for later — after the Home Dashboard and Cost Calculators. This page is a placeholder; no QuickConnect functionality exists yet." |

### Two contradictions, reported rather than smoothed

1. **Cost Calculators said "in active development".** It is not, and cannot be on current
   sources. HANDOFF's Round 17b evaluation is explicit: *"the reachable free sources give
   **indices**, not prices… A genuine national dollar range for 'replace a roof' most likely
   needs a licensed source,"* with RSMeans marked 🔴 owner/legal. Round 17c lists the Roof Cost
   Calculator as **🔴 Blocked**. "Coming soon" understates that by a category: this is not
   unbuilt, it is blocked on a source that may not exist for free.
2. **Home Risk Report promised a per-address report.** Its copy: *"risks facing a specific Texas
   property… for that address."* Round 16c measured that TCAD's improvement export carries no
   situs address in any member and Bexar publishes no bulk export, so there is no property to
   address the report to.

Both also sit in `ROADMAP.md`'s explicit out-of-scope list, alongside QuickConnect.

---

## 2. What the three working tools actually publish

Read from each **built page's rendered output**, not from its spec.

- **Plumbing Triage** (`/tools/plumbing-triage/`) — five questions about water trouble in
  progress. Opens with the gas-smell question and, on a yes, terminates at a stop screen ("leave
  the house now… call 911") that offers no way onward. Otherwise routes through shut-off
  instructions, an electrical-hazard check, and location questions to a verdict. Ungated, no
  account, no address, nothing stored. Every action is phrased as check/look, never fix/quote.
- **AC Lifespan** (`/tools/ac-lifespan/`) — Austin **3,289.8** and San Antonio **3,474** cooling
  degree days base 65°F from NOAA's 1991-2020 normals at a named station with its distance and
  years of record; the published Texas residential rate (**13.88¢/kWh**); a parts-warranty
  convention (10 years registered / 5 unregistered) against an age the reader types, labelled
  homeowner-reported; and the expired 25C credit with its IRS citation. No runtime multiplier,
  no cost beyond the rate, no replacement timing.
- **Roof Scan** (`/tools/roof-scan/`) — confirmed hail by county from Storm Events, every county
  listed including the zeroes with a second column of non-hail events (Bexar: **0 hail, 29
  other**); re-roof permits counted per city by that city's own mechanism (Austin **1,860** by
  text match, San Antonio **4,871** by permit class) and never compared; the TDLR licensing
  position. Radar signatures render an explicit unavailable state — no ingestion run has written
  that dataset. **Counts only, no sizes.**

---

## 3. The placeholder decision: remove all three

**Recommended and implemented: delete the three pages and the layout, and replace the three
listings with one section that says what this site does not publish and the measurement behind
each refusal.**

Why removal rather than honest placeholder copy:

- **Round 17's own reasoning now inverts.** A hub that is three-quarters coming-soon promises
  more than it delivers. Three real tools exist; keeping three "planned" entries beside them
  halves the hub's credibility for nothing.
- **All three are named in ROADMAP.md's out-of-scope list.** A live page for each contradicts
  the scope document.
- **Two of the three carried copy a later round falsified** (§1). Rewriting them honestly is
  possible — but then the page's whole content is "here is a thing we are not building", which
  does not need a route of its own.
- **The cost of removal is zero.** All three were noindexed, absent from the sitemap, and linked
  from exactly one place — this hub. Measured after the change: **the sitemap is byte-identical.**
  No indexed URL moved, so CLAUDE.md's preserve-URLs rule is not engaged and no 301 is owed.
- **QuickConnect specifically.** It is a contractor-introduction promise, standing on a live page,
  while `/privacy/` states in the present tense that nothing is shared with any company and no
  list of companies exists, and CLAUDE.md defers leads for this build. That is the one placeholder
  whose continued existence was a live inconsistency rather than a stale one.

**What replaced them is better content, not less.** "We publish no cost figure because San
Antonio's DECLARED VALUATION is 0.00% populated and Austin's coalesced valuation has a median of
1" is a citable fact about Texas permit data that stands on its own. "Coming soon" is not. The
new `#not-published` section carries four such entries, each naming its measurement.

### QuoteReady

`/start/` is real but **noindexed**, and it collects a first name, an email and a property
address. It is out of the tool grid — those four ask for nothing — and named in a closing
paragraph for exactly what it collects, still linked. Not deleted: it works, and whether the
deferred funnel returns is the owner's call, not a hub round's.

---

## 4. Pipe Report — recommendation

**No hub listing as a tool, and no placeholder page.** It is in `#not-published` instead, as
*"What your water is doing to your pipes"*, saying what it needs:

> Austin Water publishes its treated hardness in its own water-quality report — 70 ppm at the
> low end, 126 at the high, 93 on average — which is a usable, utility-published figure for
> delivered water. San Antonio's equivalent has not been read yet, and the USGS ambient samples
> that are easy to get measure untreated water in streams and wells, which is a different
> question from what comes out of a tap. We are not shipping a two-metro tool that works in one
> metro.

Reasoning: a hub listing is a promise of a page, and there is no page — listing one is the thing
this round removed three of. The blocker is real but narrow, and naming it precisely is more
useful than a placeholder.

**Separate recommendation, for a later round.** Austin's hardness figure is publishable *today*,
just not as "Pipe Report": it belongs as a reading on the Austin plumbing service page, where the
existing `serviceNotices` mechanism with `checkedByHumanOn` fits an annually-published consumer
confidence report exactly — Round 21b's own conclusion was that a once-a-year human read is the
right cadence, not a compromise. That would put a real, sourced hardness reading on the site
without waiting for SAWS.

---

## 5. The hub now

`#working` — four cards, each with the tool's name, **its route in mono**, what the built page
publishes, and **"What it will not do."** at the same weight inside the same card. That last part
is the point: a hub that lists only capabilities re-promises what each page declines, one click
before the reader reaches the page that declines it.

`#not-published` — the four refusals with their measurements.

`#elsewhere` — the data catalog, methodology, and QuoteReady named for what it collects.

Title and eyebrow changed from *"Free Texas Homeowner Tools" / "FREE FOR TEXAS HOMEOWNERS"* to
*"What we have built, and what we will not publish" / "TOOLS"* — BRAND.md's instrument panel
rather than a product catalogue, and no exclamation of freeness.

---

## 6. Verification

`npm run build` · `npm run check` (0/0/0) · `npx tsc --noEmit` clean · `npm run verify-content`
clean. Full cold-start replay suite green: **44** new + 104 roof-scan + 38 dashboard + 48
ac-lifespan + 127 triage + 315 service + 68 r7 + 46 footer + 18 sign-in + 18 r9, plus every unit
replay.

### Phone widths

| width | scrollWidth | elements past the edge |
|---|---|---|
| 320px | 320 | **0** |
| 360px | 360 | **0** |
| 390px | 390 | **0** |

**Tap targets at 320px:** the four card CTAs are **44px** each. They were **19px** on the first
build — an inline link in a paragraph — and unlike the citation links elsewhere on the site a
card CTA is a *standalone* target, so WCAG 2.2 SC 2.5.8's inline exception does not cover it.
Fixed rather than excused. The 17px breadcrumbs remain the sitewide chrome finding Round 26
recorded.

### Nothing else changed

**The shared stylesheet's content hash is unchanged** — `Base.CXq_0MfF.css` before and after — so
**raw bytes are the valid comparison**, not the hash-normalised one Round 26 needed. Against a
build at `fda9be2`:

- **342 of 346 artefacts byte-identical.** The four differences are `/tools/index.html`
  (rewritten) and the three deleted placeholder files.
- **`sitemap-0.xml` is byte-identical** — the deleted pages were never in it.
- Named explicitly and byte-identical: the six service pages, all three tools,
  `/methodology/home-stress-index/`, and both `data/stress-index/*.json`.

### What the replay caught

- **19px CTAs** (above) — a real accessibility defect introduced by this round.
- **A sitewide CSS leak, twice.** Reaching 44px the obvious way uses a display value whose
  hyphenated name is also a Tailwind utility this bundle did not carry, which added it to the
  sitewide stylesheet and rehashed every page. Rewriting the rule was not enough — the *comment
  explaining the rewrite* re-introduced the token, and then a second comment did it again. Round
  25's mechanism, occurrences four and five. Confirmed fixed by the hash returning to baseline.
- **Round 24's refusal-versus-assertion trap, a fifth time.** The "no coming soon" guard matched
  the hub's own sentence quoting the phrase as the thing it refuses to do. Narrowed the pattern
  with a lookaround; never the copy.
- **A hub sentence not backed by the page it opens.** The Home Dashboard card's refusal is
  published on `/dashboard/[zip]/`, not on `/dashboard/`, which is a selector publishing no
  reading. The replay now verifies each card's refusal against the page that publishes the
  reading, and says which page that is.

---

## 7. Reported, not fixed

**`/tools/` has no inbound link from anywhere outside its own subtree.** The round's brief says
the hub is footer-reachable; **it is not**. Measured across the built site: the only pages
linking `/tools/` are the breadcrumbs of its own children. There is no footer link, no homepage
link, nothing. That is the orphaned-but-indexed state the Round 0 plan flagged as *"worse than
either a footer link or noindex"*, and this round improved the page a reader cannot get to.

Not fixed here deliberately: a footer link is a change to shared chrome on all 265 pages, which
would have made the "everything else is byte-identical" proof this round owes impossible to give.
**Recommendation: add `Tools` to the footer's Company column in its own small round**, measured
before and after across the site.

Second, smaller: `ROADMAP.md` says Services is *"permanently removed from nav — do not re-add or
link"*, and the footer still carries a Services column that `footerchrome.mjs` actively asserts is
reachable. Pre-existing, untouched, and worth the same round.
