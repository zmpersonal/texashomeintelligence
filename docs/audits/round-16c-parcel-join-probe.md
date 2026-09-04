# Round 16c — The address join, and what a property-level record would be

**No fetcher, dataset, storage or page was written.** This extends the temporary probe
(`.github/workflows/tcad-probe.yml`) with three read-only steps and records the analysis they
will settle. Everything below is either measured from **run 33916199229** (2026-09-04,
conclusion `success`) or explicitly labelled as a hypothesis the extended probe tests.

Date: 2026-09-04 · Branch: `claude/thi-governance-post-launch`

---

## 0. A correction to carry forward: 1,067,067 rows was ONE FILE OF FOUR

Run 33916199229 reported `ROW COUNT: 1,067,067`. Reading its own log, that count came from a
single member:

```
── ARCHIVE CONTENTS (4 entries) ──
  improvement_detail_2026_1.csv    110,086,742 bytes
  improvement_detail_2026_2.csv    100,621,592 bytes
  improvement_detail_2026_3.csv    192,426,001 bytes
  improvement_detail_2026_4.csv    192,513,676 bytes
── DATA MEMBER: improvement_detail_2026_4.csv (192,513,676 bytes uncompressed) ──
── ROW COUNT: 1,067,067 ──
```

The Round 16b probe picked `max(members, key=file_size)` and counted that one. **The dataset is
~595 MB uncompressed across four members — roughly 3.3M rows, not 1.07M.** Every distribution in
that run (HVAC 114,732, solar 11,085, `stateCd` A1 706,059) is likewise **one quarter of the
data**, not the whole. Those figures remain valid as *proportions*; they are wrong as *totals*.
The extended probe reads all four members.

This is the round's own rule biting correctly — report no figure you did not measure, and be
precise about what you measured it over.

---

## 1. Confirmed: `improvement_detail` carries no address, and is not property-level

Both blocking findings hold, from the run's own field list:

```
pYear, pID, pImprovementID, pDetailID, imprvType, stateCd, imprvDescription,
imprvDetailType, imprvDetailTypeDesc, detailClass, detailQuality, detailPricingModel,
imprvAreaModifier, area, grossArea, TotgrossArea, pricingUnitPrice, imprvUnits,
imprvStories, actualYearBuilt, imprvEffYearBuilt, imprvCondition, replacementCostNew,
grossRCN, DeprecGood, physicalAdj, economicAdj, functionalAdj, pctComplete,
imprvDetailModifier, improvementDetailValue
```

**No situs, street, city or ZIP field exists.** `addressKey.ts` has nothing to match against, so
the Round 16b shard design cannot be built on this file alone.

And the grain is a **component**, not a property: `1st Floor`, `PORCH OPEN 1ST F`, `BATHROOM`,
`HVAC RESIDENTIAL`, `GARAGE ATT 1ST F`. The `area` distribution (med 1,691 · max 732,704) is
component area. **A row is not a home and the row count is not a home count.**

---

## 2. What the two sample rows already tell us — and the hypothesis they raise

Both rows are the same property and the same improvement:

```
pID 700000, pImprovementID 8249970
  1ST  '1st Floor'         area 2406.5   grossArea 5652.0   TotgrossArea 5659.6   yr 2007.0
  011  'PORCH OPEN 1ST F'  area   32.0   grossArea 5652.0   TotgrossArea 5659.6   yr 2007.0
```

`area` varies per component. **`grossArea` and `TotgrossArea` are identical across both rows.**
That raises a testable hypothesis: those two may be *denormalised totals* already carried on
every row — `grossArea` per improvement, `TotgrossArea` per property. If so, no grouping is
needed to obtain a property total.

**The extended probe tests it directly** rather than assuming it: it counts how many `pID`s show
a varying `TotgrossArea`, and how many `(pID, pImprovementID)` pairs show a varying `grossArea`.
Near-0% confirms denormalisation; anything else refutes it.

---

## 3. The aggregation rule I propose — and why the obvious ones are wrong

### Home square footage

> **SUM(`area`) over rows whose `imprvDetailTypeDesc` is on an explicit living-space whitelist —
> and withhold when an unrecognised description carries material area.**

**Why not `SUM(area)` over all rows.** It would add `PORCH OPEN 1ST F` (205,172 rows in member
_4 alone), `GARAGE ATT 1ST F` (107,849), `TERRACE UNCOVERD`, `DECK UNCOVRED` and `POOL RES CONC`
to the house. On the sample property that turns 2,406.5 into roughly 2,838.5 before pools and
terraces. A homeowner reading "your home is 2,839 sq ft" when it is 2,406 has been told
something false about their own house.

**Why not `TotgrossArea`, even if the hypothesis in §2 holds.** It is *gross*: 5,659.6 against
2,406.5 of first-floor living space on the same property — **2.35×**. It is the right number for
a cost model and the wrong number for "how big is my home". Publishing it as home size would be
wrong by more than a factor of two, and it would look authoritative because it came straight
from a field.

**Why the whitelist is by published description, not by code.** `imprvDetailType` codes (`1ST`,
`011`, `041`, `095`) are the district's internal vocabulary — 229 distinct values in one member.
`imprvDetailTypeDesc` is the district's own English for the same thing. The probe prints **every
description it did not classify, with its row count**, so the whitelist is auditable rather than
asserted, and an unrecognised structural type shows up as a finding instead of silently landing
on one side.

**Why withholding is the default.** This is `addressKey.ts`'s rule — *a wrong collection day is
worse than no collection day* — and it transfers with more force here: a wrong square footage or
a wrong year built silently changes what a tool tells someone about their roof or their pipes.

### Year built

Report **`actualYearBuilt` of the improvement carrying the largest living area** (the main
dwelling), and carry **`imprvEffYearBuilt` as a separate, separately-labelled number** — CAD uses
effective year to reflect substantial renovation, so the two answer different questions. **Never
blend or average them**, and never take a bare `MIN`/`MAX` across a property: an outbuilding's
year is not the house's.

### Residential determination

By **`stateCd`**, the field the round names. In member _4: `A1` 706,059 and `A4` 269,683 rows,
against `F1` 22,737 and `O1` 25,288. **What A1 and A4 actually denote is not asserted here** —
that is what the layout file in §4 must confirm. Using a code whose meaning we inferred would be
the Round 6 valuation mistake again.

---

## 4. What the extended probe adds

| step | question | method |
|---|---|---|
| 16c.1 | What does the export family contain, and **does any file map `pID` → situs address**? | Discover and open the published layout archive; print every text member in full; flag every line naming a situs/address/street/city/ZIP field |
| 16c.2 | What is inside the ~530 MiB certified and supplemental exports? | **HTTP range requests** — read the 64 KB tail, parse the end-of-central-directory, range-read the central directory, list every member; then inflate only the first ~600 KB of any address-looking member to read its CSV header. **~0.2% of the file instead of 100%.** Falls back to *reporting* if the origin ignores Range; it never downloads the whole archive |
| 16c.3 | What is a property-level record? | Read **all four members**; distinct `pID`, rows-per-`pID` distribution, the two denormalisation hypotheses, living-area sum vs `TotgrossArea` on real residential properties, and every detail type it did and did not classify |
| 16c.4 | **Can AC Lifespan read equipment age?** | Within each `pID`, compare `actualYearBuilt` and `imprvEffYearBuilt` on the `HVAC RESIDENTIAL` row against the floor rows, and report the distribution of deltas |

Each block was compiled, pyflakes-cleaned, and **dry-run offline against a fixture built to the
real field list and the real sample rows** — including the range reader against an actual zip
(which correctly recovered `situsAddress`/`situsCity`/`situsZip` and `pID` from a member's header
by range alone) and its refusal path when a server ignores Range.

---

## 5. The HVAC question, and why its answer decides a tool

`HVAC RESIDENTIAL` is 114,732 rows in member _4 and `SOLAR DEVICES RESIDENTIAL` 11,085 — a
per-property record of system presence at parcel level, which is more direct than inferring it
from permits.

**Presence is not age.** The question that decides whether AC Lifespan can work is whether
`actualYearBuilt` on an HVAC row is the *equipment's* year or the *building's*. The probe answers
it by comparison within the same property, and the reading is stated in the output itself:

- **~100% identical to the floor row** → it is the building's year. **AC Lifespan cannot read
  install age from this file**; a tool built on it would be reporting house age as equipment age
  to someone deciding whether to replace a system.
- **Materially lower** → the field tracks the component and deserves a second look.

The sample row is consistent with the first case (`1st Floor` and its siblings all carry
`2007.0`), but one property is not a measurement, so no conclusion is drawn here.

---

## 6. Licensing: what was found and what was not

Run 33916199229's terms search returned **WordPress boilerplate only** — cookie notices,
accessibility settings, "Copyright 2026 | Travis Central Appraisal District", a page-load script.
No use restriction, no redistribution condition and no Texas Tax Code reference appeared on
either page fetched.

**Absence of a restriction is not a grant, and this is recorded as unresolved rather than
clear.** What has *not* been checked: the layout archive's own contents (16c.1 prints and
searches them), any separate terms or legal page not linked from the two pages fetched, and the
Tax Code provisions themselves. The one thing found that bears on republication at all is a
"Copyright 2026 | Travis Central Appraisal District" line in a site footer, and it points the
other way from "unconditioned public data".

---

## 7. If no address join exists, what happens to the four address tools

Stated now so it is not discovered late. If 16c.1 and 16c.2 find no file mapping `pID` to a situs
address:

- **The three parcel tools cannot be keyed by address from TCAD bulk data at all.** Not "harder"
  — there would be no join to make.
- **Round 16b's shard design fails as specified**, since it keys a ZIP shard by normalised
  address.
- **The Round 16 (a)/(b) split survives and becomes the whole answer**: per-ZIP aggregates
  (median year built, decade bands, living-area distribution) still work and are still worth
  publishing, because they need no address. The per-parcel lookup does not.
- **Google Places (Round 15c) still resolves an address to a ZIP**, so a tool can honestly say
  "homes in 78704 are typically…" while withholding "your home is…". That is a smaller product
  than the brief imagined, and an honest one.
- The remaining routes would be a different TCAD product (a GIS parcel layer carrying situs, if
  one is published) or a commercial address→parcel provider — **a cost and a Rule 1
  conversation, not something to adopt by default.**
