# Round 19e — The API returns values; the CSV returns values plus provenance

The first live run of Round 19d's fetcher rejected **every station in both metros**. The gate
was right and the source could not satisfy it. This round changes the source, not the gate.

---

## 1. What the live run actually returned

Read out of the run's own `lastError` on `origin/main`, not inferred:

**Austin** — `status: sample` (one seed row survived), 5 candidates:

| Station | Distance | Outcome |
|---|---|---|
| USW00013958 Austin-Camp Mabry | 3.8 mi | **95 columns, no `years_`** |
| USW00013904 Austin Bergstrom Intl AP | 6.9 mi | **95 columns, no `years_`** |
| USW00000230 Austin Executive AP | 13.7 mi | no normals rows returned |
| USW00000166 Lago Vista Rusty Allen AP | 20.9 mi | no normals rows returned |
| USW00063904 Taylor Muni AP | 27.6 mi | no normals rows returned |

**San Antonio** — `status: error`, 6 candidates:

| Station | Distance | Outcome |
|---|---|---|
| USW00012931 Brooks AFB | 5.8 mi | no normals rows returned |
| USW00012970 Stinson Muni AP | 6.0 mi | **68 columns, no `years_`** |
| USW00012909 Kelly AFB | 6.1 mi | **47 columns, no `years_`** |
| USW00012921 San Antonio Intl AP | 8.3 mi | **91 columns, no `years_`** |
| USW00012911 Randolph AFB | 15.8 mi | **47 columns, no `years_`** |
| USW00000263 Boerne Stage Field AP | 24.0 mi | no normals rows returned |

The API column lists are in the file verbatim. They contain `MLY-CLDD-NORMAL`,
`MLY-CLDD-BASE40` through `BASE72`, `MLY-GRDD-*`, `MLY-HTDD-*`, `MLY-TMIN/TMAX/PRCP-*` — and
**not one column beginning `years_`, `comp_flag_` or `meas_flag_`.**

Against Round 19c's measurement of the **static CSVs** for the same stations — 413 columns for
Camp Mabry, 313 for Stinson, 225 for Kelly AFB, each carrying `MLY-CLDD-NORMAL`,
`years_MLY-CLDD-NORMAL`, `meas_flag_` and `comp_flag_`, with years values printed as
`['01=29', '02=29', … '12=29']`.

**The API returns values. The CSV returns values plus their provenance.** They are not the same
product, and reading one column list as though it were the other is what cost this round.

---

## 2. Did the gate need changing? No.

**Not one threshold moved.** `MIN_YEARS_OF_RECORD` is still 10, `E` still rejects outright, and
a source with no years column is still refused rather than worked around. Against the CSV the
gate as written passes Camp Mabry (29–30) and Stinson (19–22) and rejects Kelly AFB (2 years,
`comp_flag=E`) — which is what it was built to do, and it did it. **Kelly AFB was caught by the
live run too**, on the one station whose response the gate could evaluate.

What changed is the *lookup*, not the *logic*. Round 19d searched for a years column by pattern,
which was a hedge against not knowing the name. The name is now measured, so the columns are
addressed exactly and derived from the value column:

```ts
const CDD_NORMAL_COLUMN = "MLY-CLDD-NORMAL";
const YEARS_COLUMN      = `years_${CDD_NORMAL_COLUMN}`;
const COMP_FLAG_COLUMN  = `comp_flag_${CDD_NORMAL_COLUMN}`;
const MEAS_FLAG_COLUMN  = `meas_flag_${CDD_NORMAL_COLUMN}`;
```

A guess replaced by a measurement is the only change the gate needed.

---

## 3. What moved, and what deliberately did not

**Normals → the static CSV** at `normals-monthly/1991-2020/access/{STATION}.csv`. No query
parameters at all, so there is nothing for a server to reject — which, after four attempted
mechanisms, is the point. Parsed with the repo's existing `parseCsv`, because a normals row
carries a station `NAME` containing a comma and a naive `split(",")` would shift every one of
200–400 columns after it.

**GSOM actuals stay on `data/v1`** with an explicit station id. That call worked in the live
run — 36 rows with a `CLDD` column — and had no reason to move. Reported as asked: it stays.

**A 404 is now a rejection, not an abort.** Static files 404 where the API returned an empty
array. Without this, one missing station would kill the whole run instead of advancing to the
next candidate.

**Candidates are filtered against the `access/` index before any request.** Five of the live
run's eleven normals requests went to stations with no normals file at all — Austin Executive,
Lago Vista, Taylor Muni, Brooks AFB, Boerne Stage Field. They are in `ghcnd-stations.txt`, which
lists every GHCN station, but not in the normals product. The index is fetched once per process
and cached. If it cannot be read the run **degrades rather than fails**: the pre-filter is lost,
the 404 path handles those stations, and a line says so. That costs requests, not correctness.

---

## 4. Item 4's premise is wrong: a file *was* written

The brief asked me to confirm San Antonio's first-run failure wrote nothing. **It wrote a file.**
`failAttempt` calls `writeDatasetFile` unconditionally, so `san-antonio.json` exists on `main`:

```
status: "error",  lastSuccessAt: null,  observations: [],
lastError: "no USW station passed the record-quality bar. Rejected: ..."
```

The mechanism is also slightly different from the brief's reading. The outcome label comes from
`existing.observations.length > 0 ? "sample-unchanged" : "error"` — Austin had one seed row and
so reported `sample`; San Antonio had none and so reported `error`. Having no prior *file* and
having no prior *observations* coincide here, but it is the observation count that decides.

**Is the written state honest? Yes, and it is better than writing nothing.** It carries zero
observations, claims no CDD figure, records `lastSuccessAt: null`, and states in full why every
candidate was rejected — which is exactly how this round diagnosed the problem. Silence would
have been less useful and no more honest. `verify-content` permits `status: "error"` with zero
observations for precisely this case. **No change made.**

### A real bug those two files did expose

Both carried a `source` their fetcher had stopped reading: `austin.json` naming *Global Summary
of the Month* / `data/v1`, `san-antonio.json` naming the normals CSV path — neither matching
Round 19d's fetcher. Round 19 fixed source drift on the **success** path only; `failAttempt`
still spread `...existing` and froze the citation at whatever created the file. A file that has
never succeeded still carries a citation, and a stale one is a wrong citation. **Fixed** —
`failAttempt` now takes `source` from the fetcher too.

---

## 5. The generated files

Ingestion run through the real `runIngestion` with `fetch` replaying the measured payloads
(this container cannot reach NCEI).

> **Provenance.** The normals values, station ids, names, years counts and flags are
> **measured**. The GSOM actual magnitudes are **synthetic** — the dispatch measured that
> endpoint's shape, not its values. Distances come from fixture coordinates and differ by
> ~0.2 mi from the live figures.

```
noaa-climate/austin        live   47 obs (12 normals + 35 actuals)
  station USW00013958 "AUSTIN CAMP MABRY" 3.8 mi   base=65F  units=degree-days F
  9.6 24.0 73.2 171.7 369.9 541.4 644.8 664.8 473.7 238.3 62.3 16.1
  years 29-30, flag C          annual total 3289.8 degree-days F   ← matches Round 19d
  actuals actual-2023-10 .. actual-2026-08;  2026-09 dropped as partial
  seeded rows remaining: 0     ← the fabricated normalHighF/normalLowF row retired

noaa-climate/san-antonio   live   47 obs (12 normals + 35 actuals)
  selected USW00012970 "SAN ANTONIO STINSON MUNI AP"
  rejected  USW00012931 Brooks AFB   — not in the access/ index, never requested
  rejected  USW00012921 SA Intl AP   — not in the access/ index, never requested
  rejected  USW00012909 Kelly AFB    — 12/12 flagged "E", min years of record 2
  11.0 35.2 95.2 206.6 408.9 563.9 643.3 667.9 487.8 263.9 70.8 19.5
  years 19-22, flag S          annual total 3474.0 degree-days F   ← matches Round 19d
```

**Both annual totals match Round 19d's replay exactly.** No difference to report.

**Still not committed**, for the reason Round 19d gave: the actual magnitudes are synthetic, and
committing them would put invented figures for real, named months under a `live` badge. The
first live runner ingestion writes them.

---

## 6. Verification

- **Home Stress Index unchanged for both metros**, and the six service pages and
  `/tools/plumbing-triage/` byte-identical — proven by placing both generated files, rebuilding,
  and diffing the full artefact manifest. **10 files identical.**
- Publishing 94 live CDD observations changes **exactly three artefacts**: `/methodology/`
  (connected-feed count 12 → 13, the noaa-climate row gaining a LIVE badge) and the two sitemaps
  following its `dateModified`. That page is generated from the source registry to report real
  feed state; it would be a defect if it did not change.
- `npm run check` 187 files, **0/0/0**. `npm run build` clean. `npm run verify-content` passes.
- All 344 artefacts identical to the committed-state build; generated data untouched.
- `scripts/replays/climateunit.ts` — **44 assertions** (was 35). New: the normals request is a
  static `.csv`, no normals request goes to `data/v1`, actuals still do, a values-only source is
  refused naming `years_MLY-CLDD-NORMAL`, Brooks AFB is skipped without a request, the index is
  fetched once, and an unreadable index still lands on Stinson.
- Full cold-start replay suite — results in the round summary.

---

## 7. Open items

1. **A live runner ingestion on this fetcher.** Four mechanisms have now been tried; this is the
   first built entirely on measured column names from the source it actually reads.
2. The two `belowHero.ts` "omitted reading" statements and `data-sources.yaml`'s `status: stub`
   both go stale the moment that run succeeds — rewrite them in the same change.
3. All three TEMP probe steps remain deletable in one `git rm`.
4. Four unflagged legacy seed rows remain in other stub datasets (Round 19 §4a).
