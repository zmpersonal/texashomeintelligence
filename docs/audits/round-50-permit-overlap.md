# Round 50 — are our per-trade permit counts additive, and has a wrong number reached a reader?

**Scope:** measurement. Nothing is fixed, no mapping is changed, no dataset file is written.
Measured 2026-10-15 against both cities' live feeds, in GitHub Actions (no external host is
reachable from an agent session). Every request is built by the ingestion fetcher's own code;
the raw measurement is committed at `docs/audits/round-50-probe.json`.

---

## 0 · What the round was asked, and what it found

It was asked whether our per-category counts can be added up. The answer is **no, and never
could have been, in either metro, in any month** — but that turned out to be the smaller half.

The hand-read the brief called for turned up a **live published figure that is wrong**, for a
reason that has nothing to do with additivity:

> **Austin's published solar permit counts are mostly not solar.** Since July 2026 the Austin
> "solar" count has been dominated by **battery-storage** permits. In August 2026 — the month a
> live article headlines — **144 of the 224 (64.3%)** carried no mention of solar, photovoltaic
> or PV, and 142 of those 144 describe energy storage. In September it is **178 of 240 (74.2%)**.
> For the ten months before July the non-solar share was **2.2%–8.9%**.

The live article `/analysis/is-austins-home-improvement-boom-cooling-off/` states, as its
headlined finding:

> "Solar. 224 solar permits in a single month, up 138% month over month — the largest month in
> the twelve we hold."

On permits that actually name solar, August is **80 against July's 72: +11.1%**, and 80 is not
the largest month in twelve — September 2025 had 140 and October 2025 had 156. **The surge is a
filing-mix change, not a solar market.** A reader has seen a wrong number, and it is on the
site's most citable layer.

San Antonio's solar is unaffected and sound: it comes from a single explicit permit type,
`Solar - Photovoltaic Permit`, in all 14 months.

---

## 1 · Is the sum-of-categories figure published anywhere?

**No. Nowhere.** This was the first question because it decides incident from curiosity, and the
answer is clean:

| surface | carries a cross-trade total? | evidence |
|---|---|---|
| every built HTML page | **no** | no page contains 4,434 or any cross-trade sum; the only `4434` in the build is a street number in the Austin Resource Recovery schedule |
| public JSON endpoints | **no** | only `stress-index/{metro}.json`, which contains no permit field at all |
| the permit data pages | **no** | `/data/{metro}/roof-permits/` are single-category; their totals (2,162 · 5,666) sum **months within one category**, which is unaffected |
| `lib/tradeActivity.ts` | **no** | `tradeActivity(location, category)` is per category; its `total` sums months |
| the two "boom" articles | **no total**, but see below | multi-row trade tables with no total row |
| the autoposter feed | **no** | only `permit_activity_{trade}`; there is no total metric in the system |
| the autoposter builders | **no** | the Austin builder's `tally` counts *how many trades* are below their average — a count of trades, not of permits |

So **4,434 is a figure I computed by summing five rows of a committed file. No reader has ever
seen it**, and on the additivity question alone this would be a curiosity.

What keeps it from being nothing: the San Antonio article publishes a **seven-row** trade table
and the Austin one a three-row table, with no total and **no statement that the rows overlap**. A
reader or an answer engine that adds the San Antonio table gets 5,262, a number the city would not
recognise and that we could not explain. The invitation is published even though the sum is not.

---

## 2 · The backlog's 201 was wrong. It is 344, and the error was mine

| | permits |
|---|--:|
| our per-category counts for 2026-09, summed | 4,434 |
| **distinct permits we classify in 2026-09** | **4,090** |
| **true overshoot** | **344 · 8.41%** |
| backlog 34's figure | 201 · 4.75% |

Round 49's probe asked the city with `austinTradeWhere('2026-09-01T00:00:00.000',
'2026-10-01T00:00:00.000')`. **Socrata's `between` is inclusive at both ends**, so that window is
September *plus the 1st of October*, and its 4,233 is not a September figure. Asked three ways,
with the answers predicted before the run:

| control | prediction | measured |
|---|--:|--:|
| W1 · the right-inclusive window reproduces Round 49's count | 4,233 | **4,233** |
| W2 · September alone equals what row-parsing counted | 4,090 | **4,090** |
| W3 · the gap is exactly the permits issued 2026-10-01 | 143 | **143** |

**The lesson is a sharper version of Round 49's own rule.** That probe *did* call
`austinTradeWhere` — the rule as written was obeyed. It then chose the bounds by hand, and chose
a right-inclusive bound that overlaps the next month. The ingestion never bounds a month that
way: its predicate spans the whole recount window and each row's month comes from parsing its own
`issue_date`. So:

> **Reusing a request builder with hand-chosen arguments is still a hand-built request.** The
> builder guarantees the shape of the query, never that the arguments mean what you think. Where
> the pipeline derives an argument, derive it the same way.

Round 49 hardened "use the repo's code" into "per request". This hardens "per request" into "and
its arguments too". Three rounds, the same defect wearing a smaller hat each time.

---

## 3 · The overlap, measured — and the two metros differ completely

Overshoot = (sum of per-category counts) − (distinct permits classified), per month:

| month | Austin distinct | summed | over | % | SA distinct | summed | over | % |
|---|--:|--:|--:|--:|--:|--:|--:|--:|
| 2025-09 | 3,373 | 3,661 | 288 | 8.54 | 4,958 | 5,288 | 330 | 6.66 |
| 2025-10 | 3,219 | 3,527 | 308 | 9.57 | 4,866 | 5,104 | 238 | 4.89 |
| 2025-11 | 2,857 | 3,111 | 254 | 8.89 | 3,675 | 3,912 | 237 | 6.45 |
| 2025-12 | 3,094 | 3,286 | 192 | 6.21 | 3,386 | 3,581 | 195 | 5.76 |
| 2026-01 | 3,203 | 3,311 | 108 | 3.37 | 3,746 | 4,028 | 282 | 7.53 |
| 2026-02 | 3,295 | 3,437 | 142 | 4.31 | 3,830 | 4,107 | 277 | 7.23 |
| 2026-03 | 3,670 | 3,788 | 118 | 3.22 | 4,688 | 4,977 | 289 | 6.16 |
| 2026-04 | 3,789 | 3,940 | 151 | 3.99 | 4,365 | 4,538 | 173 | 3.96 |
| 2026-05 | 3,557 | 3,668 | 111 | 3.12 | 4,318 | 4,569 | 251 | 5.81 |
| 2026-06 | 4,114 | 4,279 | 165 | 4.01 | 4,692 | 4,911 | 219 | 4.67 |
| 2026-07 | 3,931 | 4,114 | 183 | 4.66 | 5,061 | 5,281 | 220 | 4.35 |
| 2026-08 | 3,945 | 4,256 | 311 | 7.88 | 4,861 | 5,060 | 199 | 4.09 |
| **2026-09** | **4,090** | **4,434** | **344** | **8.41** | **4,694** | **4,847** | **153** | **3.26** |
| 2026-10† | 1,462 | 1,573 | 111 | 7.59 | 1,441 | 1,504 | 63 | 4.37 |

† incomplete month, shown for completeness; `tradeActivity()` drops it from publication.

**Additivity has never held.** Austin 3.1–9.6%, San Antonio 3.3–7.5%, every month of the window.
The backlog treated this as a September anomaly; it is the normal state of both feeds.

### The mechanisms are not the same thing, and the brief was right to ask separately

**Austin — 2026-09: 312 of 4,090 permits in more than one category** (280 in two, 32 in three):

| pair | permits |
|---|--:|
| electrical + solar | 238 |
| electrical + roofing | 68 |
| roofing + solar | 34 |
| plumbing + roofing | 21 |
| hvac + roofing | 15 |

Austin's overlap is the **description-text paths crossing the permit-type path**. One filing, one
job: a rooftop solar install filed as an Electrical Permit is electrical by the city's class and
solar by the city's own words. The classifier's comment says exactly this — *"Both are true; both
are recorded."* It is right. They are simply not addable.

**San Antonio — 2026-09: 89 of 4,694 permits in more than one category** (25 in two, 64 in three),
and the overlap is **only** among electrical/hvac/plumbing:

| pair | permits |
|---|--:|
| electrical + plumbing | 85 |
| electrical + hvac | 67 |
| hvac + plumbing | 65 |

`classifySanAntonio` returns **at most one** category per row, so a multi-category San Antonio
permit can only come from one permit number carrying several `PERMIT TYPE` values across rows —
asserted as control S1 and confirmed (1,796 multi-category ≤ 1,872 multi-type across the window).
Reading them: every one is a **commercial project** (`COM-ADD-…`, `COM-IFO-…`, `COM-RML-…`,
`COM-BLG-…`) whose single project number carries electrical, mechanical and plumbing sub-permits:

```
COM-ADD-PMT25-39900074  Electrical General · Electrical TOPS · Mechanical ·
                        Plumbing Gas · Plumbing General · Plumbing Irrigation · Plumbing Sewer
                        → electrical, hvac, plumbing
```

**San Antonio's overlap is not an error of ours at all.** It is the city stating that one project
involves three trades, and our counts reflecting that faithfully. Round 45's 11.56% was *row*
duplication on one axis; this is a different axis entirely (`spanningMonths` is **0**).

---

## 4 · The hand-read: method first, then what the permits are

**How the sample was chosen**, fixed before looking at any description: take all 312
multi-category Austin permits for 2026-09; stratify by the distinct category *combination*; sort
each stratum by permit number; take every 7th from index 0; a stratum smaller than 7 contributes
its first permit, so no combination goes unread. Deterministic, reproducible, no discretion.
**48 permits** — comparable to the 45 Round 44 read by hand.

| stratum | size | read |
|---|--:|--:|
| electrical + solar | 206 | 30 |
| electrical + roofing | 36 | 6 |
| electrical + roofing + solar | 32 | 5 |
| plumbing + roofing | 21 | 3 |
| hvac + roofing | 15 | 3 |
| roofing + solar | 2 | 1 |

What they are:

**Genuinely one job, two true categories — not an error.** Rooftop solar filed as an Electrical
Permit: *"Installing 132 kW Solar System with 240 … solar panels"*, *"Residential installation of
a 3.2kW Roof-mounted solar with 8 panels"*, *"Prewire permit for solar project"*. All of
`electrical + roofing + solar` read this way. These are correct in every category they appear in
and must not be "fixed" by reassigning them.

**The roofing text match sweeping in non-roofing work.** Already measured and documented by the
project (a prior hand sample of 40: 35% re-roofing, 32.5% roof-adjacent, 32.5% unrelated). This
sample found the same, with three instructive shapes:
- roof-*adjacent*: *"new roof top skylights"*
- *incidental*: *"Installation of riser through roof"* (an electrical service upgrade);
  *"Replacement of air handler and condenser (rooftop unit)"* — "rooftop unit" is an HVAC term
- a **negation counted as a match**: *"No expansion of building footprint of modification to
  existing roof columns beams or framing"* → classified roofing

**And the thing that broke the round open.** 24 of the 30 `electrical + solar` permits read
carried one identical description:

```
BASE: Installing a backup battery system and additional meter socket.
```

No solar. No photovoltaic. No PV. Counted as solar because `work_class = "Auxiliary Power"` maps
to solar. That sent the round to §5.

---

## 5 · The solar count, measured in full — the live defect

Every Austin permit classified as solar, per month, unsubsetted:

| month | solar | says solar | no solar text | % no text | of those: storage |
|---|--:|--:|--:|--:|--:|
| 2025-09 | 144 | 140 | 4 | 2.8 | 4 |
| 2025-10 | 160 | 156 | 4 | 2.5 | 3 |
| 2025-11 | 128 | 123 | 5 | 3.9 | 4 |
| 2025-12 | 90 | 88 | 2 | 2.2 | 1 |
| 2026-01 | 46 | 43 | 3 | 6.5 | 2 |
| 2026-02 | 54 | 51 | 3 | 5.6 | 1 |
| 2026-03 | 33 | 32 | 1 | 3.0 | 1 |
| 2026-04 | 79 | 72 | 7 | 8.9 | 5 |
| 2026-05 | 48 | 46 | 2 | 4.2 | 2 |
| 2026-06 | 79 | 74 | 5 | 6.3 | 3 |
| 2026-07 | 93 | 72 | **21** | **22.6** | 20 |
| **2026-08** | **224** | **80** | **144** | **64.3** | **142** |
| **2026-09** | **240** | **62** | **178** | **74.2** | **178** |
| 2026-10† | 75 | 20 | 55 | 73.3 | 55 |

**The break is July 2026 and it is sharp.** Ten months at 2–9%, then 22.6%, 64.3%, 74.2%. The
permits with no solar text are almost entirely energy storage (142/144 in August, 178/178 in
September). The two non-storage stragglers in August are a 540kW roof-mounted auxiliary power
system and a Tesla Powershare vehicle-to-home charger — also not solar generation.

This is not our arithmetic going wrong. **Austin's filing mix changed**: `Auxiliary Power` is the
work class the city uses for distributed energy resources generally — PV, battery storage,
generators, V2H — and from July 2026 storage came to dominate it. Our mapping calls that class
"solar", and until July that was ~95% true.

### What the published claim should read

| | published | on permits that name solar |
|---|--:|--:|
| August 2026 count | 224 | **80** |
| month over month | **+138%** | **+11.1%** |
| rank in the window | **"largest month in the twelve we hold"** | 6th; Sept 2025 had 140, Oct 2025 had 156 |

The article's section heading is *"The one nobody expected"*. Measured, nobody expected it
because it did not happen.

### Why nothing caught it, which is the part worth keeping

**The control was taken on the only subset that could not contain the counterexample.** The
mapping's own comment is candid about its evidence:

> *"of the 469 Auxiliary Power rows inside the roof-matched archive, 463 (98.7%) mention solar.
> That measurement is on the roof-matched subset, not the full 808 in the window, so it is strong
> evidence rather than proof"*

The roof-matched archive is selected by the word *roof*. **Rooftop solar contains it; a battery
cabinet and a meter socket do not.** So the 98.7% was measured on a population from which
non-solar Auxiliary Power rows had already been filtered out. The caveat was written, the
direction of the bias was not, and the number read as reassurance for fourteen months. Same
family as Round 47's 178-mile distance and Round 49's °C-days: *a control that cannot see the
thing it is meant to rule out is not a weak control, it is a misleading one.*

**And the evidence was already on disk, with no consumer.** `toObservations` stores `sourceValues`
on every monthly observation — the per-source-value permit counts. Austin's solar rows record
`Auxiliary Power: 194` and `description mentions solar/photovoltaic/PV: 30` for August. **The
composition shift is visible in the committed file, in git, and nothing reads it.** Round 46
named the pattern as a config key with no consumer; Round 49 found its mirror, a consumer with no
config. This is a third face: **a stored provenance field with no consumer — the data that would
have raised the alarm, recorded faithfully and never looked at.**

---

## 6 · Has a reader seen a wrong number?

**Yes — from §5, not from the additivity question.**

| surface | state |
|---|---|
| `/analysis/is-austins-home-improvement-boom-cooling-off/` | **live and wrong.** Hero stat "224 solar permits · up 138% month over month"; body claims the largest solar month in twelve and "That is not a market cooling off" |
| `/analysis/` index | carries that article's summary, including the solar claim |
| the autoposter's live feed | **loaded.** `austin_metro / permit_activity_solar` is ranked **#4** with *"240 solar permits in 2026-09, +7% month over month"*, surprise score 0.372 — a future cycle can publish another one |
| `/analysis/san-antonio-home-improvement-boom-august-2026/` | solar figure sound (explicit `Solar - Photovoltaic Permit`); its 7-row table still invites a sum nothing supports |
| every other surface | no cross-trade sum exists anywhere to be wrong |

On additivity alone: **no reader has seen a wrong number.** On the solar composition: **a reader
has, it is still live, and the next cycle is queued to repeat it.**

---

## 7 · Options

These are separable problems and should be decided separately.

### A · The Austin solar mapping (the live defect)

| | what it catches | what it costs | what it still misses |
|---|---|---|---|
| **A1 · Require solar text, drop the bare work-class path** | all 178 September storage permits | loses genuine PV filed under Auxiliary Power with a terse description; the series re-bases (Aug 224→80) and `CATEGORY_MAPPING_VERSION` must bump, so the trend restarts | PV whose description says only "AUX" or a job number |
| **A2 · Split the category: `solar` (PV text) and `energy_storage` (Auxiliary Power, storage text)** | the same, and makes the storage surge a *finding* instead of a contaminant — it is real and interesting | a new category with no San Antonio counterpart; `CATEGORIES_WITHOUT_SOURCE` grows; new copy | the residue that names neither |
| **A3 · Keep the mapping, rename the published category "auxiliary power / distributed energy"** | the wrongness of the *word* solar | the published series stays comparable, no re-base | nothing about the composition shift; a reader asking about solar still gets storage |
| **A4 · Caveat only** | nothing | nothing | everything |

The live article needs a correction under any of these, because its claim is about **solar** and
its numbers are about **storage**. That is a copy decision and therefore yours.

### B · Additivity

| | what it catches | what it costs | what it still misses |
|---|---|---|---|
| **B1 · Store a `distinctPermits` total per month alongside the per-category rows** | gives a correct total to publish, and makes the overshoot a visible measured quantity rather than something a round has to go and find | one more observation per metro-month; a small fetcher change | nothing about which categories overlap |
| **B2 · State non-additivity wherever a multi-trade table renders** (both articles, methodology) | the reader and the answer engine adding the 7-row table | copy on live pages | a reader who adds anyway |
| **B3 · One trade per permit** | makes the rows addable | **destroys the measure.** A rooftop solar install really is electrical and really is solar; forcing a choice makes every category wrong to make the sum right | — |
| **B4 · Nothing** | — | — | the published invitation to add stays |

**B3 is the one to rule out explicitly**, because it is the obvious-looking fix and it is backwards:
the per-category counts are each correct, and only their sum is meaningless. B1+B2 keep every
count true and make the sum either available or disclaimed.

### C · The pattern (why this was found by hand and not by a check)

| | what it catches |
|---|---|
| **C1 · A composition check on `sourceValues`** — fail or flag when a category's mechanism mix moves by more than a set amount month over month | exactly this defect, in the month it started (July, at 22.6%), from data already committed. Also the next one like it, in any category or metro |
| **C2 · Require a control to state what it could not have seen** — a measurement taken on a subset says which population it excluded and why that cannot hide the thing being ruled out | the 98.7% would have had to say "measured only on rows containing the word roof", which answers itself |

C1 is the one with teeth and it needs no new source — only a reader for a field we already store.

---

## 8 · What I got wrong, and the controls that caught it

Every number above is from `docs/audits/round-50-probe.json`, measured through the ingestion
fetcher's own code. Six controls with answers known before the run, all passing:

| control | prediction | measured |
|---|---|---|
| A1 | recomputed 2026-09 per-category counts equal the committed file | **exact** (1,634 / 1,296 / 1,097 / 240 / 167) |
| A2 | electrical/plumbing/hvac pairwise disjoint | **0** overlapping |
| A3 | their sum is 4,027 | **4,027** |
| A4 | ≥ 25 permits in both roofing and solar | **34** |
| A5 | `count(1)` agrees with the paged read | **47,599 = 47,599** |
| S1 | SA multi-category ≤ SA multi-type | **1,796 ≤ 1,872** |

Control A1 is also the proof that extracting `fetchAustinTradeRows` out of the Austin fetcher
changed no published figure: the recomputed counts reproduce the committed file exactly.

**My error, carried from last round:** the 201 in backlog 34 was wrong, and the cause was a
right-inclusive `between` bound I chose by hand while believing I had obeyed the per-request rule
because I had called the project's builder. §2 states the hardened rule.

**One thing noticed in passing, out of scope, not fixed:** `austinPermits.ts:116` calls
`redactPersonalShapes(row.description?.slice(0, 300))` — it **shortens before it redacts**, the
inverse of Round 47's rule. A personal shape straddling character 300 is cut in half and the
redactor then cannot match it, so a fragment can survive into the committed archive. Severity
looks low (a fragment, not a full address) and it is a different file and a PII question, so it
needs its own decision rather than a drive-by edit. This round's probe redacts *then* shortens.

---

## 9 · Verification

| check | result |
|---|---|
| `npm run check` | 0 errors, 0 warnings, 0 hints |
| autoposter suite | 394/394 |
| probe controls | 9/9 pass (A1–A5, S1, W1–W3) |
| probe wrote no dataset file | asserted by the workflow; `site/src/data/generated` unchanged |
| `austinTradeWhere` / mappings | unchanged — this round reads, it does not reclassify |
