# Round 25 — AC Lifespan, built as a tool that refuses to guess

**Route:** `/tools/ac-lifespan/` · indexed · ungated · Tools stays out of the nav.
Date: 2026-09-05 · Branch: `claude/thi-governance-post-launch`

Built: `site/src/data/acLifespan.ts` (copy and constants as data),
`site/src/pages/tools/ac-lifespan/index.astro` (the page),
`site/scripts/replays/aclifespanrender.mjs` (48 render-side assertions).

---

## 1. What the design and the specs ask for, and what exists

The delivered material is `docs/source/design/tools/AC Lifespan.dc.html` plus five specs, of
which `copy-deck.md` carries an `ac-lifespan` **reference implementation**. Read in full before
building. Its asks, against what this repo can actually serve:

| The deck asks for | Status | Why |
|---|---|---|
| **Step 1 — "What's your address?"** | ❌ not built | There is no address→parcel join. Round 16c read TCAD's `improvement_detail` field list from the probe's own run: `pID`, `pImprovementID`, `pDetailID`, `actualYearBuilt`, … and **no situs, street, city or ZIP field of any kind**. `addressKey.ts` has nothing to match on. Bexar publishes no bulk export at all, so San Antonio has no route even in principle. |
| **Step 2 — "Built [year] · [sqft] sq ft · Source: [CAD], as of [date]"** | ❌ not built | Same join. Also: Round 16 could not open either file, and states plainly that **year-built coverage, null rate and improvement-area coverage were never measured and no figure is offered**. |
| **Free chip — "System age · Last mechanical permit: [year]"** | ❌ not built | Needs a per-address permit history. Permits are ingested at metro level; there is no per-parcel index, and Round 6 fixed the standing rule that **permit data is an activity instrument, not a property instrument**. |
| **Free chip — "Local runtime — [Metro] cooling load runs about [n]× the national average"** | ❌ ratio omitted | See §2. |
| **Free chip — "Size check — [n] tons for [sqft] sq ft"** | ❌ not built | Sizing is a Manual-J calculation over envelope, ductwork and orientation. None of it exists here, and neither does the sq ft it would divide. |
| **Gate — "estimated replacement window, cost range by system size, what your system likely costs to run each summer"** | ❌ none of the three built | All three are the thing the round's instruction forbids. A replacement window is a lifespan verdict; a cost range needs a cost source this project does not have (Round 6: neither city's valuation field is a homeowner cost); a summer running cost needs this home's consumption. |
| **Answer block — "typically lasts [n]–[n] years … repair-versus-replace math"** | ❌ not built | Same. |
| `data-labeling-spec.md` **requirement 4** — a homeowner-entered value must be labelled as such, and the label must change **visibly at the moment of edit** | ✅ built | This is the one interactive behaviour on the page. See §4. |

**Net: one of the deck's eight elements is buildable today.** Everything the reference
implementation is *about* — the address, the parcel, the permit history, the size, the window,
the cost — rests on data that was measured and found absent, not on work not yet done.

So the tool was built around what does exist: two published metro measurements, one published
statewide rate, one dated tax-credit position, one industry convention stated as a convention,
and a `#limits` section that is a section of the tool rather than a footnote.

---

## 2. The runtime ratio: omitted, and why

The deck's "cooling load runs about **[n]× the national average**" needs a national cooling
degree-day figure. There isn't one in `src/data/generated/**` — the `noaa-climate` fetcher
(Rounds 19–19e) resolves a **named station per metro** and stores its 1991-2020 monthly normals;
nothing in the repo holds a national series. Getting one means a new feed, which is out of this
round's scope, and hard-coding a national constant is exactly what `belowHero.ts`'s own header
forbids: a number with no provenance, no freshness and no way to go stale visibly.

**Decision: omit the ratio, same as Round 20.** The page publishes the two annual normals
themselves — Austin **3,289.8** and San Antonio **3,474** cooling degree days base 65°F — with
the station, its distance and its years of record attached. A reader who wants the comparison can
make it against any national figure they trust; the page does not make it for them and does not
present a THI-computed multiplier as though it were sourced.

`aclifespanrender.mjs` asserts the multiplier never returns (`no runtime multiplier is
published`).

---

## 3. A statistic that was in the copy and should not have been

The first draft of the `#limits` entry on equipment age read:

> "…and on the records that do carry a year, that year is the building's rather than the
> equipment's **on 99.79% of them**."

**No round measured that.** Round 16 says the opposite in so many words — neither TCAD file could
be opened, and "none of it was measured … no figure is offered". Round 16c's step 16c.4 was
*designed* to settle whether `actualYearBuilt` on an `HVAC RESIDENTIAL` row is the equipment's
year or the building's, notes that one sample property is consistent with the building's, and
explicitly draws no conclusion from one property.

It was caught in review before this round shipped and removed. The entry now claims only what was
measured: the export carries no street address at all, Bexar publishes nothing, the export does
record HVAC presence, and **whether the year on that record is the equipment's or the building's
has never been established** — so the page will not build on it.

Two guards now stand behind that:

- `aclifespanrender.mjs` asserts **no percentage figure appears anywhere on the page.** Every
  figure this page is allowed to print is a degree-day total, a cent-per-kWh rate or a count of
  years, so a `%` on it is by construction a number with nothing behind it.
- The claim itself is written as what is *absent* from a dataset, which is checkable against the
  field list in `round-16c-parcel-join-probe.md`, rather than as a distribution nobody has read.

---

## 4. The homeowner-reported label

`#your-system` takes one input: age in years. Next to it sits a label chip that reads **"Nothing
entered"** and flips to **"Homeowner-reported"** on the first keystroke — `data-state` goes
`empty` → `reported`, the border goes dashed → solid, the background goes transparent →
`rgb(253, 241, 220)`, and the chip is `role="status" aria-live="polite"` so a screen reader is
told too. Clearing the field returns it. All five transitions are asserted in a real browser.

The verdict below it converts the entered age into **where it sits against the parts-warranty
convention** and nothing else: inside both terms, inside the 10-year registered term only, or
outside both. `14` returns "outside both terms. Parts coverage from the manufacturer has usually
ended by then" — and the replay separately asserts that string contains no `replace`, `new
system` or `upgrade`.

The warranty terms are stated as an industry pattern, not attributed to any manufacturer; **no
manufacturer's warranty document was read for this page and none is cited.** The page says so.

---

## 5. The gate and referral slots — located, not built

Both are HTML comments in the markup and a `SLOTS` constant in `acLifespan.ts`.

- **Gate: between `#your-system` and `#cooling-load`.** Everything above it is the one thing the
  homeowner already knows; everything below is metro-level published data. The page is ordered
  that way deliberately, so a gate can be dropped in without moving or rewriting a block below it.
- **Referral: after `#limits`, never before it.** A homeowner should read what the tool cannot see
  *before* being offered an introduction. Round 24's `/privacy/` states that nothing is shared with
  any company and that no list of companies exists; that stays true until a handoff mechanism and
  a legal read exist, so this round writes a comment and nothing else.

---

## 6. No JavaScript

Every published figure is in the served HTML for both metros: both cooling-load readings with
their stations and freshness, the 13.88¢/kWh rate, the 25C position with its IRS citation, the
warranty terms, and all four limits. Only the age→warranty arithmetic needs scripts, and with
scripts off the page says so in place of the verdict:

> "This part needs JavaScript, because it is arithmetic on something you type. Everything else on
> this page is already in the page…"

With scripts running, `data-acl-js="1"` on `<html>` hides that line — asserted in both directions,
because a page that tells a reader it cannot do something it just did is its own defect.

---

## 7. Verification

`npm run build` · `npm run check` (0 errors, 0 warnings, 0 hints) · `npx tsc --noEmit` clean ·
`npm run verify-content` clean. Full cold-start replay suite green: **48** new + 127 triage + 315
service + 68 r7 + 46 footer + 18 sign-in + 18 r9, plus every unit replay (45 climate, 44 hail, 32
notice-freshness, 31 privacy, 23 alert-copy, 14 trade-mapping, 13 citation-check).

**Adding this page changes nothing else on the site.** Built at `3164c5d` with the round's files
held aside, then rebuilt with them, and compared file by file: **343 of 344 client artefacts are
byte-identical**, and the one that differs is `sitemap-0.xml` gaining
`https://texashomeintelligence.com/tools/ac-lifespan/`. The six service pages,
`/tools/plumbing-triage/`, `/methodology/home-stress-index/index.html` and both
`data/stress-index/*.json` files are byte-identical.

That took two corrections, and the mechanism is worth writing down:

> **Tailwind 4 auto-detects its sources from the project root — `scripts/` included — so a bare
> utility-shaped token anywhere in a scanned file, including inside a CSS declaration or a code
> comment, emits that utility into the SITEWIDE stylesheet and rehashes all 267 pages.**
> First `flex-wrap: wrap` in this page's `<style>` added `.flex-wrap` (+26 bytes, every page's
> `<link>` changed). Then a comment in the *replay file* containing the word for a capitalising
> `text-transform` added `.uppercase` and did it again. Both were reworded, not the CSS behaviour.

### What the replay caught that a green build could not

- **Horizontal scroll at 320px.** `#sources` prints each citation as its full URL, and a URL is
  one unbreakable word: the NOAA normals link measured 301px inside a ~292px column and pushed the
  whole document to `scrollWidth 341`. Fixed with `#sources a { overflow-wrap: anywhere; }`;
  now 320.
- **Round 20's lesson, again.** `.acl-bucket` inherits a capitalising `text-transform` from
  `.metric-label`, so `innerText` returns the label shouted. Three assertions failed against a page
  that rendered perfectly. The assertions were fixed, not the page.
- **Round 24's lesson, again.** The first "no payback estimate" pattern matched the word *payback*
  inside the sentence that **refuses** to give one. Narrowed the pattern, not the copy — and added
  a positive assertion that the refusal sentence is present.

### Tap targets at 320px (reported, per the round's instruction)

| height | zone | target |
|---|---|---|
| 48px | control | the age input — the only control on the page |
| 169 / 71 / 45 / 45 / 45 / 42px | in-sentence | the `#sources` and `#tax-credit` citation links |
| **17px** | breadcrumb | **Home**, **Tools** |

The citation links are links inside a sentence, which is WCAG 2.2 SC 2.5.8's explicit inline
exception. **The 17px breadcrumb links are not**, and they are sitewide chrome this round did not
introduce — `/austin/hvac/` measures the same 17px. Recorded here as a finding rather than fixed,
because changing shared chrome is outside this round (Rule 1).

**Second finding, also pre-existing and larger:** `/dashboard/78704/` overflows badly at 320px —
`scrollWidth 451` against a 320px viewport, with `.dash-score-panel`, `.dash-h1`,
`.dash-score-row` and six more elements extending past the right edge. `/austin/hvac/` and
`/tools/plumbing-triage/` are clean at the same width. Not touched this round; worth its own.
