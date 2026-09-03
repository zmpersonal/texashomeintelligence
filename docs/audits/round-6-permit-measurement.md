# Round 6 — Permit feed measurement (Austin + San Antonio)

**Status: measured, not decided.** Every figure below came from a live read on a GitHub
Actions runner, and the run number is given for each. Nothing here is an estimate, a
model output, or carried over from documentation. Where a figure could not be measured,
it says so instead of guessing.

**Why this file exists.** Rounds 4b–6 measured both permit feeds end to end. Several of
the findings are things a future round would get wrong by default — the shape of the data
actively invites the wrong assumption. The most expensive one: both cities publish a field
called "valuation", and in neither city does it mean what a homeowner would think it means.

| run | date | what it established |
|---|---|---|
| #32 | 2026-09-03 | San Antonio taxonomy: 139,124 rows, 68 permit types, `WORK TYPE` is a status flag, `DECLARED VALUATION` is commercial-only |
| #33 | 2026-09-03 | Austin taxonomy: 54,798 rows in a measured 365-day window, 5 `permit_type_desc` values, 29 `work_class` values, 39 fields on row 1 / 67 across the window |
| #34 | 2026-09-03 | Austin's eleven valuation fields; San Antonio's `DATE ISSUED` range; the normalised cross-metro comparison |

Provenance for anything not from a runner is marked inline. Two figures come from the
committed archive `site/src/data/generated/municipal-permits/austin.json` rather than a
runner — they are labelled **[archive]** and their denominator (1,945 stored roof-matched
observations) is different from the runner's window (1,878 rows), so the two must not be
mixed.

---

## 1. Austin — all eleven valuation fields (run #34)

Denominator: **54,798** permits issued in the measured 365-day window.

`usable` means numeric and **> 10**. Values of 1 and 5 are counted separately as
placeholders, and that distinction is the whole finding: a $1 permit valuation is a field
somebody had to type a number into, not a small job. Reporting only "89% null" would hide
that most of the remaining 11% is junk as well.

| field | non-empty | > 0 | ≤ 10 | > 10 | distribution of values > 10 | verdict |
|---|---:|---:|---:|---:|---|---|
| `electrical_valuation_remodel` | 15,198 (27.73%) | 10,463 | 3,322 | **7,141** | min 11 · p25 1,200 · med 5,000 · p75 15,000 · p90 60,000 · max 305,000,000 | **MIXED** — 31.75% of positives ≤ 10 |
| `total_job_valuation` **[READ]** | 9,267 (16.91%) | 5,065 | 4,059 | 1,006 | min 11 · p25 23,600 · med 160,000 · p75 2,600,000 · max 830,000,000 | **POISONED** — 80.14% |
| `building_valuation_remodel` | 7,009 (12.79%) | 3,079 | 2,680 | 399 | min 100 · p25 23,007 · med 111,000 · p75 1,000,000 · max 305,000,000 | **POISONED** — 87.04% |
| `plumbing_valuation_remodel` | 6,844 (12.49%) | 2,350 | 2,269 | 81 | min 54 · p25 3,000 · **med 900,000** · p75 6,667,000 · max 305,000,000 | **POISONED** — 96.55% |
| `mechanical_valuation_remodel` | 6,833 (12.47%) | 2,295 | 2,235 | 60 | min 500 · p25 16,500 · **med 1,000,000** · p75 6,779,589 · max 305,000,000 | **POISONED** — 97.39% |
| `total_valuation_remodel` **[READ]** | 6,815 (12.44%) | 2,991 | 2,634 | 357 | min 100 · p25 23,008 · med 120,000 · p75 1,000,000 · max 1,525,000,000 | **POISONED** — 88.06% |
| `medgas_valuation_remodel` | 3,035 (5.54%) | 269 | 238 | 31 | min 100,000 · med 5,000,000 · max 305,000,000 | **POISONED** — 88.48% |
| `plumbing_valuation` | 2,250 (4.11%) | 327 | 303 | 24 | min 300 · med 1,000,000 · max 50,000,000 | **POISONED** — 92.66% |
| `electrical_valuation` | 1,737 (3.17%) | 398 | 368 | 30 | min 100 · med 1,000,000 · max 50,000,000 | **POISONED** — 92.46% |
| `mechanical_valuation` | 1,463 (2.67%) | 312 | 279 | 33 | min 100 · med 26,222 · max 50,000,000 | **POISONED** — 89.42% |
| `building_valuation` **[READ]** | 1,138 (2.08%) | 426 | 274 | 152 | min 100 · p25 1,000,000 · med 1,000,000 · max 181,502,159 | **POISONED** — 64.32% |

**[READ]** marks the three `parseValuation()` in `austinPermits.ts` coalesces. The other
eight are ingested by nothing.

### The coalesced result — what the fetcher actually stores

```
carrying any positive value: 5,893  (10.75% of the window)
of which <= 10 (placeholder): 4,594  (77.96% of them)
genuinely > 10:               1,299  (2.37% of the window)
all positive:  min=1  p10=1  p25=1  median=1  p75=5  p90=325,000  max=1,525,000,000
> 10 only:     min=11 p25=25,000 median=155,000 p75=2,000,000 max=1,525,000,000
```

**A median of 1 across 5,893 stored values is the headline.** `valuationUsd` as currently
ingested is not a cost figure.

### The one usable slice

`electrical_valuation_remodel` **restricted to Electrical Permit rows** (run #34):

```
7,088 of 15,932 rows > 10 (44.49%), 1,023 placeholders <= 10
min=11  p10=500  p25=1,200  median=4,700  p75=15,000  p90=55,000  max=305,000,000
```

87% signal, and a median of $4,700 with a $1,200–$15,000 interquartile range is plausible
electrical remodel pricing. This is the only field-and-type combination in the eleven that
survives. Caveats that still apply: the max of $305,000,000 for an electrical remodel is an
error rather than an outlier, and the figure is Austin-only, electrical-only, and a
**declared** value rather than a paid one.

The same field on Building Permits is the opposite: 53 values above 10 against 2,299
placeholders. The field is only clean where the trade matches the permit.

### Why the trade-named fields fail

The surviving medians give it away. `plumbing_valuation_remodel` has a median of **$900,000**
across its 81 usable values; `mechanical_valuation_remodel` **$1,000,000** across 60. Those
are whole-project construction values recorded against a trade sub-permit — the field name
promises a trade cost and the number is a building cost. Publishing either as a plumbing or
HVAC price would be off by two orders of magnitude.

---

## 2. San Antonio — `DATE ISSUED` (run #34)

```
column index 9, resolved from the fetcher's candidate list position 1 of 7
FORMAT (digits shown as 9):  "9999-99-99"   139,124 row(s)  (100.00%)
first five raw values:       "2025-01-01" x5
PARSED WITH: new Date(raw) — the identical call sanAntonioPermits.ts makes
blank: 0   unparseable: 0   parsed: 139,124 of 139,124
```

**MIN 2025-01-01 · MAX 2026-08-28 · SPAN 604 days (1.65 years).** One format, no exceptions,
nothing dropped. 84,073 rows per 365 days across the whole file.

The file begins exactly where the sibling archive resource
`permits_issued_ending_12312024.csv` stops. Round 5 flagged that as a filename inference and
refused to use it; run #34 measured it and it was right.

**Per calendar year:** 2025 — 84,239 (60.55%) · 2026 — 54,885 (39.45%)

**Per calendar month** (20 distinct months exist in the file; all are listed — 2026-08 is
partial, the file ends on the 28th):

| | | | |
|---|---|---|---|
| 2025-01 6,591 | 2025-02 6,197 | 2025-03 6,761 | 2025-04 8,018 |
| 2025-05 7,669 | 2025-06 7,385 | 2025-07 7,597 | 2025-08 7,133 |
| 2025-09 7,773 | 2025-10 7,616 | 2025-11 6,164 | 2025-12 5,335 |
| 2026-01 6,105 | 2026-02 6,359 | 2026-03 7,410 | 2026-04 6,900 |
| 2026-05 6,696 | 2026-06 7,278 | 2026-07 7,549 | 2026-08 6,588 |

### San Antonio's `DECLARED VALUATION` (runs #32, #34)

97.78% null overall (135,946 blank + 94 zero-or-negative; 3,084 usable, 2.22%).

The split by permit type is close to binary. **Exactly three non-commercial types carry any
value at all, and between them they carry 13 rows:**

| type | with a value | of | rate |
|---|---:|---:|---:|
| Plumbing General Permit | 4 | 15,369 | 0.03% |
| Plumbing Gas Permit | 8 | 4,209 | 0.19% |
| On Premise Sign | 1 | 3,150 | 0.03% |

Every other residential and trade type is **0.00%** — Mechanical 0/16,395, Electrical
General 0/13,977, Plumbing Irrigation 0/11,514, Re-Roof 0/10,161, Residential Repair
0/9,373, Foundation Repair 0/5,243, LSR Plumbing 0/4,559, Plumbing Sewer 0/4,299, and so on.

Commercial types are the mirror image: Comm New Building 915/915, Comm Finish Out 258/258,
Comm Retaining Wall 131/131, Comm Shell 110/110, Comm Foundation 37/37, Comm Pad Site 6/6 —
all 100%; Comm Sitework 707/796 (88.82%), Comm Fence 310/314 (98.73%).

San Antonio requires a declared valuation only on commercial permits. This is a property of
the city's permitting rules, not of `parseValuation`.

---

## 3. The normalised cross-metro comparison (run #34)

Austin's enumeration reads a **measured 365-day window**, so Austin's counts are already
per-365-day. San Antonio's file spans 604 days, so:

> **Normalisation factor: 365 ÷ 604 = 0.60430**

### Mechanical / HVAC — comparable

| | count | per 365d |
|---|---:|---:|
| SA Mechanical Permit | 16,395 | 9,908 |
| SA LSR Mechanical Permit | 1,766 | 1,067 |
| SA Mechanical Completion Permit | 268 | 162 |
| **SA aggregate** | **18,429** | **11,137** |
| **Austin Mechanical Permit** | **10,703** | **10,703** |

**Ratio 1.04×.** Two independent cities, two independent permitting systems, two
independently written parsers, landing within 4% of each other. This is the strongest
evidence in the whole exercise that both feeds are being read correctly, and it is the one
cross-metro comparison the data licenses.

### Plumbing — classification-dependent, do not publish

SA's nine plumbing types normalise to: Plumbing General 9,288 · Irrigation 6,958 · LSR 2,755
· Sewer 2,598 · Gas 2,544 · Backflow 431 · Completion 268 · Medical Gas 102 · MRFPSS 1 →
**aggregate 41,277 → 24,945 per 365d**, against **Austin's single Plumbing Permit type at
14,801**. **Ratio 1.69×.**

Most of that gap is one line. SA Irrigation alone is 6,958/365d; Austin's equivalent is
`work_class = "Irrigation"` at **1,851** — a 3.8× difference in a category where the two
cities plausibly have different *permitting rules* rather than different plumbing. Excluding
irrigation from both sides brings the ratio to roughly 1.4×. The comparison is real
arithmetic over a classification choice neither city documents, so it is not a demand
comparison.

### Roofing — not comparable at any ratio

| | count | per 365d |
|---|---:|---:|
| SA Re-Roof Permit (a dedicated permit type) | 10,161 | **6,140** |
| Austin `%ROOF%` text match | 1,878 | 1,878 |
| Austin explicit re-roof wording (derived, a floor) | 366 | 366 |

**3.27× against the text match, 16.78× against the explicit floor.** Neither ratio measures
roofing demand. San Antonio counts a permit type; Austin runs a text search across
`work_class`, `permit_type_desc` and `description`. The gap is a measurement-method
artefact, and the two numbers must never appear side by side.

---

## 4. Austin has no roofing permit type

- `work_class = "Roof"` has **one row** in 54,798 (run #33/#34).
- No `permit_type_desc` value mentions roofing — there are only five: Electrical Permit
  15,932, Plumbing Permit 14,801, Building Permit 12,197, Mechanical Permit 10,703,
  Driveway / Sidewalks 1,165.
- The `%ROOF%` clause keeps **1,878 of 54,798 (3.43%)** and discards **52,920 (96.57%)**.
  Server-side count and the local reproduction of `isRoofingRelated()` agree exactly, so the
  SoQL predicate and the JS predicate are equivalent.
- What it keeps, by type: Electrical 796/15,932 · Building 695/12,197 · Plumbing 199/14,801
  · Mechanical 188/10,703 · Driveway 0/1,165.

Since no permit type and effectively no work class mentions roofing, **essentially all 1,878
matches come from free-text `description`**.

**[archive]** Over the 1,945 stored roof-matched observations in
`site/src/data/generated/municipal-permits/austin.json`: **633 (32.54%) mention solar,
photovoltaic or PV**; 129 (6.63%) mention HVAC, condenser, rooftop unit or exhaust fan; 19
(0.98%) mention telecom. `work_class = "Auxiliary Power"` accounts for **469 rows, 463 of
which (98.7%) mention solar**.

**[archive]** A hand-classified random sample of 40 (seed 20260903): 14 actually re-roofing
(35%), 13 roof-adjacent (32.5% — 10 rooftop solar, 3 rooftop mechanical), 13 unrelated
(32.5% — 8 with no roof work at all, 5 multi-trade scopes that include roof work). The
unrelated set includes an event permit at a venue called "Moody Rooftop", a sign permit for
a business named Hargrove Roofing, an AT&T rooftop collocation, and a Verizon fibre run to
rooftop cell equipment.

For comparison, San Antonio's roof filter keeps 10,161 of 139,124 (7.30%) and discards
92.70% — but it keeps a dedicated permit type at 100%, so its 7.30% is a clean slice rather
than a text match.

---

## 5. What this licenses, and what it does not

**Supported by the measurements:**

- Permit **counts** and **timing** by type, by month, in each city. Both feeds are complete
  and unambiguously dated; SA gives 20 months, Austin 12.
- **Seasonality** within a city — SA monthly volume runs 5,335 to 8,018.
- **Trade mix within a city** — SA's 68-type taxonomy supports it directly.
- **Mechanical demand across both metros** (11,137 vs 10,703).
- **Austin electrical remodel cost, narrowly** — `electrical_valuation_remodel` on Electrical
  Permits, with outlier handling, labelled as a declared value.

**Not supported:**

- Any **roofing cost** figure in either metro. SA is 0.00% populated on Re-Roof Permits;
  Austin's roof rows are two-thirds placeholder. There is no roof price in this data.
- Any **plumbing or HVAC cost** figure. The trade-named fields carry building costs.
- A **cross-metro roofing** comparison (different methods, 3.27× apart).
- A **cross-metro plumbing** comparison (classification-dependent, irrigation-dominated).
- Anything about **what a homeowner pays**. Declared valuation is what an applicant states
  to the city for fee purposes. Nothing in either dataset bridges declared-to-paid.
- Anything **address- or ZIP-level**. Both are city-jurisdiction counts.

**One line:** permits are a good activity-and-timing instrument and a bad price instrument.

---

## 6. Provenance and reproducibility

The two temporary enumeration steps that produced runs #32–#34
(`site/scripts/enumerate-sa-permits.ts` and `site/scripts/enumerate-austin-permits.ts`,
wired into `.github/workflows/data-ingestion.yml` under `continue-on-error`) were **removed
in Round 7**, once the measurements above were recorded here. They were always marked TEMP.

Both were read-only: they wrote nothing under `site/src/data/`, committed nothing, and
modified no fetcher. Each carried an `assertNoDrift()` guard that read the corresponding
fetcher's source and warned if any copied literal stopped matching, so the enumeration could
never quietly describe a different query than the one ingestion issues. Both reported clean
on run #34 (6 literals San Antonio, 8 Austin).

To re-measure, restore either script from git history and re-add its step. The scripts are
recoverable at the Round 6 commit; nothing about the approach needs re-deriving.

**Not preserved by this file:** the Austin step also cross-checked the server-side `%ROOF%`
count against a local reproduction of `isRoofingRelated()` on every run, which was a live
consistency check between the fetcher's SoQL predicate and its JavaScript one. That check
goes away with the step. It has never failed.
