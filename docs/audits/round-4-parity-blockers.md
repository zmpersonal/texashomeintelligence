# Round 4 — San Antonio parity: two blockers found before writing code

**No fetcher, filter, or registry change was made.** Both blockers are the kind the round's
own rules say to surface rather than resolve. Everything below is verified from committed
data and source code in this repository; nothing is inferred from memory.

Date: 2026-09-03 · Branch: `claude/thi-governance-post-launch`

---

## Blocker 1 — Every source this round needs is blocked from this environment

Part 1 opens with a hard gate: *"Before changing the filter, download the live CSV and
enumerate the complete set of distinct values… Do not infer codes from memory or from any
external document; take them from the data."* That gate cannot be met here.

Probed directly, all five:

| Source | Endpoint | Result |
|---|---|---|
| SA permits (CKAN) | `data.sanantonio.gov/api/3/action/package_show?id=building-permits` | `HTTP 000` |
| Census ACS | `api.census.gov/data/2023/acs/acs5?…county:029…` | `HTTP 000` |
| USDA Soil Data Access | `sdmdataaccess.nrcs.usda.gov/Tabular/post.rest` | `HTTP 000` |
| BLS Time Series v2 | `api.bls.gov/publicAPI/v2/timeseries/data/` | `HTTP 000` |
| NWS API | `api.weather.gov/points/29.4241,-98.4936` | `HTTP 000` |

The agent proxy reports the reason for each, and it is policy, not a transient fault:

```
connect_rejected — "gateway answered 403 to CONNECT (policy denial or upstream failure)"
  data.sanantonio.gov:443 · api.census.gov:443 · sdmdataaccess.nrcs.usda.gov:443
  api.bls.gov:443 · (and api.weather.gov:443)
```

**What this makes impossible, not merely harder:**

- The permit-type enumeration with row counts — the gate itself.
- The definitive `DECLARED VALUATION` finding (empty vs zero vs unparsed). Narrowed below,
  not settled.
- Determining each source's real publication cadence for the `dataFreshness.ts` windows.
  Two of the four are already documented in-repo (ACS annual, OEWS annual), but SSURGO and
  NWS-for-Bexar are not, and Round 1's convention is to ground the window in the source,
  not guess.
- The entire verification section: *"Run the ingestion for San Antonio and show the
  resulting generated files."*

Writing four fetchers I cannot execute, and a trade classification derived from memory, is
precisely what the round forbids. So none was written.

**The route that does work,** and which this project has used before for exactly this: the
`data-ingestion` GitHub Action runs with real network access, and triggering it is 🟢 in
`SECURITY.md`. Round 5b.1 verified the Austin Water scraper against the live page that way.
An enumeration can be produced the same way — a temporary read-only step that prints the
distinct `PERMIT TYPE` / `WORK TYPE` values and the valuation distribution to the Actions
log, dispatched from this branch, changing no committed data. That needs your go-ahead
because it adds a workflow step, and it is the one thing that unblocks Part 1 honestly.

---

## Blocker 2 — Part 2 cannot be done without changing the Home Stress Index, which Part 2 forbids

This is the more consequential one, and it is internal to the brief rather than
environmental.

Out of scope, as stated: *"The Home Stress Index and its scoring are not to change."*
Verification, as stated: *"Prove the Home Stress Index is unchanged… show the composite
scores and per-signal scores are identical to before."*

In scope, as stated: add San Antonio coverage to `nws.ts`.

**Those cannot both hold.** San Antonio's HVAC signal is currently withheld *because* there
is no NWS feed for it. The signal says so itself, in the artifact:

> `signals[hvac].limitation` — "No National Weather Service forecast feed for San Antonio.
> Heat load is most of this signal, and air quality alone would understate cooling demand
> badly enough to mislead, so no HVAC score is published for this area."

`signals.ts:482` reads `findDataset("nws-api", ctx.areaId)`. Create
`nws-api/san-antonio.json` and that lookup starts succeeding. Four consequences, all
automatic:

1. **A new HVAC score is published for San Antonio** where one is currently, deliberately,
   withheld.
2. **`weightCoverage` moves 0.8 → 1.0**, and `composite.signalsUnavailable` empties.
3. **The composite moves off 38** — it is a re-normalised mean over four signals today, five
   tomorrow.
4. **Every San Antonio signal score may move.** `nws-api` is in
   `INDEX_DATASETS = ["noaa-storm-events", "usdm-drought", "nws-api", "airnow"]`
   (`compute.ts:29`), which sets `referenceDateFor()`. Adding a daily-refreshed NWS feed
   moves San Antonio's `referenceDate`, and every time-decay window is measured from it.

So the index change is not a side effect to be tidied up — it is the whole point of having
the feed, and it lands on a live site's published scores.

### Baseline, captured now so the decision is reversible either way

Committed state, `methodologyVersion: hsi-v1`, from the current build:

| | Austin | San Antonio |
|---|---|---|
| **composite** | **50/100 (Elevated)** | **38/100 (Moderate)** |
| weightCoverage | 1.0 | **0.8** |
| referenceDate | 2026-08-30T11:00:00.000Z | 2026-08-30T08:00:00.000Z |
| roof-storm | 70 elevated (raw 109.60026014569908) | 48 moderate (raw 58.33493092282129) |
| foundation-soil | 41 moderate (raw 40.51499999999999) | 42 moderate (raw 41.77999999999999) |
| hvac | 66 elevated (raw 65.82902097902098) | **0 — not computable** |
| water-irrigation | 6 normal (raw 6.2) | 13 normal (raw 12.8) |
| trees-yard | 42 moderate (raw 41.97402895550921) | 38 moderate (raw 38.06844978595208) |

Austin is untouched by anything in this round; its numbers should be byte-identical
afterwards and that is checkable against this table.

### Three ways forward — your call, no recommendation implied by ordering

- **(a) Ship the NWS feed and accept the index change.** San Antonio gains a real HVAC
  score and full coverage. Requires lifting the no-scoring-change constraint, and a
  published score on a live site moves.
- **(b) Ship the other three fetchers, hold `nws.ts`.** Census, soil and wages are inert to
  the index — no signal reads them (`INDEX_DATASETS` excludes all three). Parity improves,
  the index is provably unchanged, and the HVAC gap stays as the honest state it is today.
- **(c) Ship the NWS feed but keep San Antonio's HVAC withheld behind an explicit gate.**
  Preserves the numbers, but it is itself a scoring-logic change, and it means ingesting
  data we deliberately refuse to use — which is hard to justify to a reader.

Option (b) is the only one that satisfies the brief as written.

---

## What I did establish, from committed data and source

These findings stand on their own and are worth having regardless of how the above resolves.

### The premise "Austin's equivalent holds 13 distinct types" is a misreading

Austin has **no plumbing, HVAC or electrical permit data either.** Its permit fetcher is
roof-only at *two* layers:

- `austinPermits.ts` builds a SoQL `$where` clause:
  `… AND (upper(work_class) like '%ROOF%' OR upper(permit_type_desc) like '%ROOF%' OR upper(description) like '%ROOF%')`
  — server-side filtering, before anything is downloaded.
- Then `austinPermits.ts:99` — `if (!isRoofingRelated(row)) continue;` — filters again
  client-side, commented "belt-and-suspenders vs. the `$where` clause".

The 13 values are Austin's **`work_class` taxonomy within roofing permits**, not trades:

```
 520  Remodel              374  Addition and Remodel      13  Upgrade        1  Addition
 467  Auxiliary Power      132  New                        4  Wall           1  Homebuilder Loop
 390  Repair                18  Change Out                 1  Freestanding   1  Demolition
                                                                             1  Roof
```

San Antonio's 5,148 observations are also all roofing, but its `PERMIT TYPE` collapses them
to a single label, `Re-Roof Permit`. **The real difference is source taxonomy granularity,
not trade coverage.**

This matters for the objective. *"Give San Antonio the same data coverage Austin has"*
already holds for permits — both cities carry roofing only. Widening San Antonio to four
trades would make it **broader than Austin**, which is the opposite of parity, and would
change what `municipal-permits` means across two cities while `austinPermits.ts` is out of
scope (it is not among the four named fetchers). Worth deciding deliberately rather than
discovering after the fact.

### The valuation question — narrowed to two candidates, not settled

`valuationUsd` is **absent as a key** on all 5,148 San Antonio observations — not null, not
zero. `JSON.stringify` omits `undefined`, and `parseValuation` returns `undefined` both when
the raw string is falsy and when the parsed number is ≤ 0, so the committed file cannot
distinguish the causes. Austin carries it on 501 of 1,923.

A second column is silently empty too: `workDescription` is `""` on **all 5,148** rows. It
resolves from `["WORK TYPE", "PROJECT NAME", …]`.

Both `DECLARED VALUATION` and `WORK TYPE` are listed in the fetcher's own header comment as
real columns *"confirmed against a live Actions run"*. Two documented columns yielding
nothing is one symptom, not two coincidences.

Ruled out offline: a header-name mismatch. `resolveHeader` (line 73) normalises with
`.trim().toUpperCase()` on both sides, so case and whitespace are handled — and `PERMIT
TYPE`, `PERMIT #` and `DATE ISSUED` all resolve from the same header row.

The two surviving candidates:

1. **The columns are genuinely empty for re-roof rows** — plausible for a permit class with
   no declared valuation and a redundant work type.
2. **Rows are shorter than the header.** `rowsToRecords` (`csv.ts:49`) does
   `r[i] ?? ""`, so any row with fewer fields than the header silently yields `""` for every
   trailing column. Per the documented header,
   `DECLARED VALUATION, AREA (SF), PRIMARY CONTACT, CD, NCD, HD` are the **last six
   columns** — exactly where truncation would bite. This would not explain `WORK TYPE`
   (column 4) unless `parseCsv` is also mishandling a quoted field earlier in the row.

Distinguishing them needs one look at the raw CSV: the header field count versus the field
count of a re-roof row. That is a single line of output from the Actions route above.

---

## State of this branch

Nothing was changed. No fetcher, no `registry.ts`, no `dataFreshness.ts`, no generated data.
The only new file is this report. `verify-content` still reports **16 data sources**, the
pre-round count, and the four new datasets are unregistered because they do not exist.

`npm run build`, `npm run check` and `npm run verify-content` all pass, unchanged — recorded
as a clean baseline for whichever option you pick, not as evidence of work done.
