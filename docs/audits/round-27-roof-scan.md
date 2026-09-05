# Round 27 — Roof Scan, built on the two hail products disagreeing

**Route:** `/tools/roof-scan/` · indexed · ungated · Tools stays out of the nav.
Date: 2026-09-05 · Branch: `claude/thi-governance-post-launch`

Built: `site/src/data/roofScan.ts` (copy and constants as data),
`site/src/lib/roofScan.ts` (the build-time readings),
`site/src/pages/tools/roof-scan/index.astro` (the page),
`site/scripts/replays/roofscanrender.mjs` (104 render-side assertions).

---

## 1. The design and the specs, against what exists

`docs/source/design/tools/Roof Scan.dc.html` plus the `roof-scan` entry in
`specs/copy-deck.md`. Read in full before building. Its asks:

| The design asks for | Status | Why |
|---|---|---|
| **"Enter your address and we'll pull the storm history and permit record for your property"** | ❌ not built | Round 16c read TCAD's `improvement_detail` field list from the probe's own run: no situs, street, city or ZIP field of any kind. Nothing to look a property up by. Bexar publishes no bulk export at all. |
| **The satellite image with the footprint drawn on** — the deck calls it *"the single most persuasive moment in the product"* | ❌ not built | Two separate blocks. There is no address→parcel join, so there is nothing to centre an image on; and Microsoft Building Footprints, the only free source for the outline, was set aside on ODbL grounds. |
| **Chip: "Roof area — 2,240 sq ft"** | ❌ not built | Needs the footprint above and a pitch assumption. The deck's own caption says *"About 22 squares, from the parcel footprint at an estimated 6:12 pitch"* — an estimate on top of data that does not exist. |
| **Chip: "Last re-roof permit — 1998 · Asphalt shingle, $4,100 declared"** | ❌ not built | Per-address permit history needs the same join. The dollar figure is separately barred: Round 6 measured that declared valuation is an applicant's fee-basis statement to the city, not a paid invoice, and is unusable as a cost signal in both metros. |
| **Chip: "Hail within one mile — 7 events · largest 2.0″ in May 2021"** | ⚠️ **partly**, reshaped | "Within one mile" needs a point, which needs an address. The count is published **by county** (Storm Events) and would be published **over a metro box** (SWDI) — the two shapes we actually have. The size is not published at all; see §3. |
| **Answer block: "typically reaches replacement at 15–20 years, and hail is usually what decides the year… a roof that predates the 2021 storm has taken damage the record already knows about"** | ❌ not built | This is a damage claim and a replacement window about a house nobody has seen, from an area storm record. It is the thing the round forbids and the thing the tool says on its face that it will not do. |
| **Gate: "a replacement cost range, an estimated replacement window, and your property's hail exposure compared with the rest of your ZIP"** | ❌ none of the three built | Cost: no source (Round 6). Window: a replacement recommendation. Per-ZIP comparison: verified in the Round 4 planning that **no current signal varies by ZIP** — Storm Events carries county, SWDI carries a box, permits are city-level. |
| `data-labeling-spec.md` **requirement 4** — a homeowner-entered value labelled as such, the label changing **visibly at the moment of edit** | ✅ built | See §4. |

**Net: one of the deck's eight elements is buildable as specified.** Every element the
reference implementation is *about* — the address, the image, the footprint, the roof area,
the per-address permit, the cost, the window — rests on data that a prior round measured and
found absent.

So the tool was rebuilt around what the data actually supports, and around the one thing this
project can show that no competitor page does: **the two hail products disagree, and the page
shows both.**

---

## 2. ⚠️ The headline reading has no committed data — surfaced, not approximated

The round's brief opens *"The SWDI hail feed, live in both metros."* **It is not in the repo.**

- `src/data/generated/swdi-nx3hail/` **does not exist.** No file for either metro.
- The fetcher is real and registered — `ingest/registry.ts` lines 84-85, deep tier — and was
  built and unit-tested in Rounds 22-23 against replayed responses. What never happened is a
  **live ingestion run**: this container's egress denies `www.ncei.noaa.gov`, and Round 21b's
  720/484-record measurement came from a probe on the Actions runner, whose output was read
  from a log and never written to a dataset file.
- `ingest/seed.ts` lists `swdi-nx3hail` in `NEVER_SEED`, so there is not even a placeholder.

**What was done instead of approximating it.** `radarHail()` returns an explicit unavailable
branch and the card renders **"Not published yet"**, names what the reading needs, and states
the box it will be counted over. It renders **no zero** — CLAUDE.md forbids substituting one
for a feed we do not hold, and a zero here would read as *no hail signatures over your metro*,
which is the opposite of unknown. The code path is written so the day an ingestion run commits
the files, `findDataset` resolves and the card fills in with no further work, and
`roofscanrender.mjs` asserts which of the two states the repo is in so that transition is
visible rather than silent.

**This is the round's one unmet objective and it is not fixable from here.** It needs an
ingestion run on a host with egress.

---

## 3. Hail size: not published, in any unit, from either product

Constraint 1 concerns SWDI's `MAXSIZE`, which has no published unit — NOAA's REST usage
documentation for the service does not define the columns and does not mention the field, and
`maxSizeUnit` is `null` in the fetcher's own value type. Values like 0.75 and 1.5 are as
consistent with inches as with anything else, and inches and millimetres are a factor of 25
apart.

**The decision here goes one step further than the constraint required: no size from Storm
Events either.** NCEI *does* document its `magnitude` in inches, and the committed data carries
them (`1.00"`, `2.75"` and so on). They are still not printed, for two reasons:

1. A hail size in the Storm Events record is measured **at the observation point**, which is
   somewhere in a county, not at a reader's address. The deck's own caption admits this and
   prints the number anyway.
2. Printing one product's size in inches beside another product's unitless count on the same
   page invites a reader to read the second in inches too. The cleanest way not to imply a unit
   for `MAXSIZE` is for the page to contain no hail sizes at all.

`roofscanrender.mjs` asserts no size in any unit anywhere — inches, the `″` glyph, millimetres,
centimetres, "up to", "largest … N", and the informal sizes ("golf ball", "quarter-sized").

---

## 4. Inputs: ZIP only. No roof age, no square footage.

The round permitted roof age and square footage *"if they change what the tool can say."*
Neither does, so neither is asked for:

- **Square footage** feeds nothing. Roof area needs a footprint we do not have and a pitch we
  would be inventing; there is no cost model to multiply it by. A field that collects a number
  and does nothing with it is a signal harvested for a future gate, not an input.
- **Roof age** could only support one comparison: *was your roof in place during the events we
  hold?* The confirmed-hail window we hold runs **2025-08-31 to 2026-05-26** — under ten
  months. Every roof older than a year answers "yes", so the output would be constant for
  essentially every reader. A question whose answer is predetermined is a ritual. The design's
  real use for roof age was to drive a replacement window, which is forbidden.

**ZIP does change what the tool says**, so ZIP is the input: it resolves through the same
crosswalk the dashboard uses, names the county, and moves that county's row and that metro's
cards to emphasis. `78201` → *"78201 is in Bexar County, San Antonio metro… These readings
describe the county and the metro, not this address."*

The label beside it goes **"Nothing entered" → "Your ZIP — area readings, not your address"**
on the first keystroke — `data-state` empty→reported, border dashed→solid, background
transparent→`rgb(251,244,230)`, `role="status" aria-live="polite"`, and back on clear. The
filled label carries the qualification rather than just the bucket name, because the specific
misreading available here is *"this is about my house."*

---

## 5. The radar-versus-confirmed treatment

Three separate structures, so a reader who skims still cannot merge them:

1. **`#radar-signatures`** — its own section, the product named in full on every card
   ("NEXRAD radar-derived hail signatures, not confirmed hail reports"), the area stated as
   *a box 0.5° either side of a named lat/lon* and explicitly *"not a county and not a city
   limit"*, and **no county name anywhere in the card** (asserted).
2. **`#confirmed-reports`** — its own section, the product described as *"hail that a person
   reported and the National Weather Service accepted"*, filed **by county**, with the
   publisher's lag stated as the publisher's (102 days at this build).
3. **`#the-difference`** — a section of its own with three findings: one is an algorithm and
   one is a person; they are not counted over the same shape; **neither is a statement about a
   house**. Plus the line *"Nothing on this site converts one shape into the other."*

### The reading that makes the contrast concrete

Every county in each metro's file is listed **including the ones with zero**, with a second
column counting that county's non-hail events in the same window. That is what turns a zero
into a measurement:

**Bexar County: 0 confirmed hail, 29 other events on record.** Bexar is in the file, NOAA files
events for it, and it reported no hail this window. Round 12 measured that separately; this is
the same finding rendered so a reader can check it. The page says it in words too: *"A county
showing 0 in the first column and a number in the second is one NOAA files events for and which
reported no hail in this window. That is a reading, not a gap."*

Austin: Williamson 9, Travis 5, Burnet 4, Blanco 1, Bastrop/Caldwell/Hays 0 — **19** total.
San Antonio: Atascosa 3, Bandera 3, Comal 3, Guadalupe 1, Kendall 1, Bexar/Medina/Wilson 0 —
**11** total.

---

## 6. Permits — and a defect this round's own first build shipped

Austin **1,860** and San Antonio **4,871** over the same 12 complete months, in separate cards,
never in a shared table (asserted), under a section paragraph that reads before either number
and says the two mechanisms are not the same instrument. Each card also carries *"not comparable
with the other metro's number on this page."*

Austin's card carries the Round 12 text-match qualification — **633 of 1,945 descriptions (33%)
mention solar, photovoltaic or PV; 366 (19%) explicitly describe replacing a roof covering** —
reused from `textMatchComposition()`, the same function and the same imported regexes the
roof-permit data page uses, rather than a second copy of the measurement.

**The defect:** the first build called `textMatchComposition("austin-roof-text-match", permits)`
unconditionally, so **San Antonio's card rendered Austin's solar measurement** as though it
described a dedicated Re-Roof Permit class. A "don't put them side by side" check would have
passed — they were in separate cards — and the page would still have published one metro's
measurement under the other's heading. Caught by reading the rendered text, fixed by gating on
the classification mechanism (`description-text` gets the qualification; `permit-type` does
not), and now asserted from both directions.

Round 25's percentage guard is generalised here: **every element on the page containing a `%`
must name the archive it was measured on**, asserted over all paragraphs and list items.

---

## 7. Gate and referral slots — located, not built

- **Gate: between `#your-area` and `#radar-signatures`.** Above it is one field the reader
  already knows; everything below is area-level published data, and no block below the slot
  depends on another block below it.
- **Referral: after `#limits`, and note it is also after `#licensing`** — that ordering is the
  point. A reader should learn that **Texas does not license roofing contractors**, and what to
  check instead, *before* being offered an introduction to one. Round 24's `/privacy/` states
  that nothing is shared with any company and that no list of companies exists; that stays true
  until a handoff mechanism and a legal read exist.

Both are HTML comments and a `SLOTS` constant. Neither is built.

---

## 8. JavaScript

**With scripts:** the ZIP field resolves a county, rewrites the reading line, and emphasises
that county's row and that metro's three cards. `data-rs-js="1"` on `<html>` hides the no-JS
note.

**Without scripts:** every published figure is in the served HTML for **both** metros — all
fifteen county rows with both their counts, both permit readings, the licensing position, the
radar cards' unavailable state, and all four limits. Only the ZIP lookup needs scripts, and the
page says so in place of it. Asserted in both directions.

---

## 9. Verification

`npm run build` · `npm run check` (0 errors, 0 warnings, 0 hints) · `npx tsc --noEmit` clean ·
`npm run verify-content` clean. Full cold-start replay suite green: **104** new + 38 dashboard
+ 48 ac-lifespan + 127 triage + 315 service + 68 r7 + 46 footer + 18 sign-in + 18 r9, plus every
unit replay.

### Phone widths (Round 26's measurement)

| width | scrollWidth | elements past the edge |
|---|---|---|
| 320px | 320 | **0** |
| 360px | 360 | **0** |
| 390px | 390 | **0** |

Two things were built in rather than found later: the county table sits in an
`overflow-x: auto` box so a wide table scrolls inside itself instead of taking the document
with it, and `#sources a { overflow-wrap: anywhere }` because a bare URL is one unbreakable
word — the AC Lifespan defect, fixed on the way in.

**Tap targets at 320px:** the ZIP input is 230×48. Every in-body link is a citation inside a
sentence (42-52px for the named-source links, 45px for the wrapped bare URLs, 20px for the two
short ones), which is WCAG 2.2 SC 2.5.8's inline exception. The 17px breadcrumbs are the same
sitewide chrome finding Round 26 recorded and recommended for its own round; unchanged here.

### Nothing else changed

**The shared stylesheet's content hash did not change** — `Base.CXq_0MfF.css` before and after —
so this page's `<style>` did not leak a utility into the sitewide bundle and **raw bytes are the
valid comparison**, not the hash-normalised one Round 26 needed. Built with the round's four
files held aside, then rebuilt with them:

- **344 of 345 build artefacts byte-identical.** The one that differs is `sitemap-0.xml`,
  gaining `https://texashomeintelligence.com/tools/roof-scan/`. One artefact is new:
  `tools/roof-scan/index.html`.
- Named explicitly and byte-identical: the six service pages, `/tools/plumbing-triage/`,
  `/tools/ac-lifespan/`, `/methodology/home-stress-index/`, and both
  `data/stress-index/*.json`.

### What the replay caught that a green build could not

- **One metro's measurement under the other's heading** (§6) — the round's most consequential
  defect, and invisible to any check that only asked whether the two counts were adjacent.
- **Round 20's lesson, a third time.** `.data-table` row headers are capitalised by CSS, so
  `innerText` returns `BEXAR` while `data-county` holds `Bexar`. An assertion failed against a
  table that rendered perfectly.
- **Round 24's lesson, twice in one run.** The damage-and-timing pattern matched *"whether it
  needs replacing"* and then *"Whether your roof is damaged"* — both the page **declining** to
  make the claim. Narrowed the pattern with a lookbehind, never the copy, and added positive
  assertions that both refusals are present.

---

## 10. Open, for the owner

1. **The SWDI ingestion run** (§2). Until it happens the tool's headline reading is an honest
   placeholder. Everything else on the page is live.
2. **Storm Events magnitude is available and deliberately unused** (§3). If a later round wants
   a size, it can only come from Storm Events, it must be labelled as measured at the
   observation point rather than at an address, and the radar card must still carry none —
   that asymmetry would need explaining on the page, which is why this round did not open it.
