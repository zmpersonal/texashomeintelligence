# Round 41d — both fetchers moved onto permitted paths

Date: 2026-09-30 · Branch: `claude/thi-v3-round41d-allowed-paths`, from `origin/main` at
`60ac24c` — the Round 41a merge.

**Both feeds had an allowed path, both were moved, and no published reading changed.**
`dist/client` is byte-identical to `main` across all 355 files.

Measured through a temporary Actions workflow (deleted — §7) carrying Round 39's robots guard
with both of Round 41c's parser corrections.

---

## 1 · SWDI hail

### The rule that blocked it

`www.ncdc.noaa.gov/robots.txt`, `User-agent: *`, quoted from the file:

```
Disallow: /*.csv
…
Disallow: /swdiws/
```

`swdiHail.ts` requested `https://www.ncdc.noaa.gov/swdiws/csv/nx3hail/{window}?bbox=…` —
matched by **both** rules.

### The allowed path

**NCEI serves the identical web service.** `www.ncei.noaa.gov/robots.txt`, complete:

```
User-agent: *
Disallow: /data*
Disallow: /orders*

Allow: /data/oceans/coris/library*

#CRN
Disallow: /access/crn/*?
…
```

Nothing matches `/swdiws/`. The `*` group disallows `/data*` and `/orders*`, and neither is a
prefix of `/swdiws/csv/nx3hail/…`.

### Proof of equivalence

Queried with the same bbox over the exact window the committed San Antonio rows cover
(2026-08-27 → 2026-09-12), against `src/data/generated/swdi-nx3hail/san-antonio.json`:

| | committed | NCEI host |
|---|---|---|
| header | `ZTIME,WSR_ID,CELL_ID,PROB,SEVPROB,MAXSIZE,LAT,LON` | **identical** |
| first row | `2026-08-27T20:34:56Z` · KEWX · J0 · lat 29.904 · lon −98.383 | **identical** |
| row count | **190** | trailer `count,190` |
| trailer | `count,N` + `totalTimeInSeconds` | **identical shape** |

Same service, same columns, same rows, same trailer. **A host change and nothing else.**

### What changed

`src/ingest/fetchers/swdiHail.ts` — `SWDI_BASE` and the dataset's `source.url`. Two lines,
plus the comment recording why it must not go back.

---

## 2 · NCEI monthly normals

### The rule that blocked it

From the file quoted above: `Disallow: /data*`, with the only `Allow:` beside it being a
coral-reef library. `noaaClimate.ts` read
`/data/normals-monthly/1991-2020/access/{STATION}.csv` — the per-station file **and** the
directory index above it.

The other three NCEI families the fetcher uses are unaffected and were left alone:

| Family | Path | Status |
|---|---|---|
| Access Data Service (GSOM) | `/access/services/data/v1` | allowed |
| GHCND station table | `/pub/data/ghcn/daily/…` | allowed |
| Storm events listing | `/pub/data/swdi/…` | allowed |
| **Monthly normals** | `/data/normals-monthly/…` | **disallowed** |

### The allowed path, and the thing that nearly stopped it

The Access Data Service — the family already used for GSOM — publishes the same normals. The
first attempt returned **only three columns**:

```json
{"DATE":"01","STATION":"USW00013958","MLY-CLDD-NORMAL":"     9.6"}
```

The values matched, but `years_`, `comp_flag_` and `meas_flag_` were absent — and **Round 19c
made those decisive**. Kelly AFB sits 6.1 mi from San Antonio, nearer than the station actually
selected, and was rejected because every row carried `years=2, comp_flag=E`. Without those
columns a two-year estimated record publishes as a thirty-year normal. Round 19e had sent
normals to the static CSV for exactly this reason: *"the API returns values without years_"*.

That reason no longer holds. **`includeAttributes=true` returns all four:**

```json
{"DATE":"01","STATION":"USW00013958","comp_flag_MLY-CLDD-NORMAL":"S",
 "meas_flag_MLY-CLDD-NORMAL":" ","MLY-CLDD-NORMAL":"     9.6",
 "years_MLY-CLDD-NORMAL":"29"}
```

### Proof of equivalence

Against the committed output in `src/data/generated/noaa-climate/`, month for month:

| Station | Source | Jan–May CDD | years | comp_flag |
|---|---|---|---|---|
| USW00013958 *(Austin, Camp Mabry)* | committed | 9.6 · 24 · 73.2 · 171.7 · 369.9 | 29, Apr/May 30 | S |
| | **service** | **9.6 · 24.0 · 73.2 · 171.7 · 369.9** | **29, Apr/May 30** | **S** |
| USW00012970 *(San Antonio, Stinson)* | committed | 11 · 35.2 · 95.2 · 206.6 · 408.9 | 19/20 | R |
| | **service** | **11.0 · 35.2 · 95.2 · 206.6 · 408.9** | **19/20** | **R** |

Exact on every value, both stations. `DATE` still arrives as `"01".."12"`, so **not one line of
the parsing changed** — only where the rows come from.

### What changed

`src/ingest/fetchers/noaaClimate.ts`:

- `NORMALS_ACCESS` → `NORMALS_DATASET = "normals-monthly-1991-2020"`, fetched through the
  existing `getRows()` against `ACCESS_DATA_V1` with `includeAttributes=true`.
- `fetchNormalsCsv` → `fetchNormalsRows`. The static file said "no normals" with a **404**; the
  service says it with an **empty array**. The caller already rejected an empty result by name,
  so the two collapse into one case and the `null` sentinel had nothing left to represent.
- **The directory-index pre-filter is gone.** Round 19e added it to stop the fetcher requesting
  normals for stations that have none — five of eleven requests on the first live run. That
  listing is under `/data*`, and the service publishes no index to replace it. It was only ever
  an optimisation, and the code already tolerated losing it. The cost is a few requests per run;
  **correctness is unchanged**, because a station with no normals now returns empty and is
  rejected by name at the same place every other rejection is recorded.
- `parseCsv`/`rowsToRecords` and the `rejections` parameter on `candidateStations` went with it —
  the only rejections that function raised came from the pre-filter.

---

## 3 · A robots reading I could not settle, and why it does not matter here

Round 41c changed the guard so a blank line closes a group. That rests on a contested reading of
RFC 9309: the ABNF makes a group `startgroupline+ *(rule / emptyline / commentline)`, which
allows empty lines *within* the rule section but is silent on an empty line between two
`User-agent:` lines. Google's reference parser does not treat blank lines as separators, and
under that reading `www2.census.gov` — `User-agent: *`, blank, `User-agent: RavenCrawler`,
`Disallow: /` — would refuse everything for `*`, which is what my pass-1 parser concluded before
I "fixed" it.

**I cannot resolve which is correct, so I checked whether it matters.** Both readings were run
against every path this round turns on:

| Path | blank-ends-group | blank-ignored | |
|---|---|---|---|
| `www.ncei.noaa.gov/swdiws/csv/nx3hail/…` | allowed | allowed | **agree** |
| `www.ncei.noaa.gov/access/services/data/v1` | allowed | allowed | **agree** |
| `www.ncei.noaa.gov/data/normals-monthly/…` | blocked | blocked | **agree** |
| `www.ncdc.noaa.gov/swdiws/csv/nx3hail/…` | blocked | blocked | **agree** |

They agree on all four, because both NOAA files put rules immediately after `User-agent: *` with
no intervening blank line. The ambiguity only bites on `www2.census.gov`, which this round does
not touch. **Backlogged as item 22** rather than left as a silent assumption.

---

## 4 · Existing readings

**None changed, and none needed to.** Every value the two fetchers produce is identical, proven
above value-for-value against committed output. `dist/client` is byte-identical to `main` across
all 355 files, and identical across two consecutive builds.

No correction is being claimed, because none was required: this round moved *where* the data
comes from, not *what* it says.

---

## 5 · The tests now pin the compliance

Both replays asserted the old mechanism by name, so both were updated — and in one case
inverted, which is the round in miniature.

**`climateunit.ts` — 47 checks, 0 failures.** Scenario 5b used to assert *"the normals request is
a static .csv"* and *"no normals request goes to data/v1"*. Both are now false by intent. They
are replaced by:

- the normals request goes to `data/v1` with `dataset=normals-monthly-1991-2020`;
- **and carries `includeAttributes=true`** — without it a two-year estimated record passes as a
  normal, which is the whole reason Round 19e avoided this endpoint;
- **no request touches a `/data/` path at all**, which is the compliance itself, asserted rather
  than promised.

Scenario 5e used to prove that losing the directory index degraded gracefully. The index is gone,
so it now proves that a station with **no published normals** is asked, skipped by name, and the
run still lands on Stinson. It empties **Kelly Field** specifically, because Kelly is the nearest
candidate — emptying a farther one would prove nothing, since the loop returns on the first
success.

The fixture builder was rewritten from the static CSV shape to the service's JSON shape, copied
from a live response including its left-padded values and single-character flags.

**`hailunit.ts` — 48 checks, 0 failures.** Two new assertions: every request goes to
`www.ncei.noaa.gov`, and nothing requests `ncdc.noaa.gov`. A revert would otherwise be silent.

---

## 6 · Verification

- **`dist/client` byte-identical to `main`** — 355/355, and identical across two builds.
- **`npm run check`** — 0 errors, 0 warnings, 0 hints.
- **check-links 0 · check-orphans 0.**
- **Sweep 27/29** — `weeklyunit` and `r9render`, both pre-existing on `main` (backlog item 18).
- `climateunit` 47/47, `hailunit` 48/48, both now asserting the host and path.

---

## 7 · Cleanup

`.github/workflows/tmp-allowed-probe.yml` — **deleted**; `.github/workflows/` holds only the
eight pre-existing files. `tmp/allowed/` — **deleted**. No bulk rows landed: the probe fetched
metadata, two robots files, one SWDI window for the comparison, and six normals variants. Every
figure here is recorded above; nothing is cited to `tmp/`.

---

## 8 · What this leaves

**Backlog item 20 is closed by this round** — both fetchers are on permitted paths and no ruling
is needed after all. Note that item 20 is defined on the **unmerged Round 41c branch**, not on
`main`, so it arrives already closed whenever 41c lands; this branch's BACKLOG records that so
the two do not end up both open. The options I was going to bring you turned out not to be necessary, which
is the better outcome: nothing had to be given up, and no standard had to be bent.

Two things it does *not* close:

- **Item 22 (new):** the robots blank-line reading, unresolved and now written down.
- **The hail bbox question**, which is out of scope here and remains open: `BOX_PAD_DEGREES` is
  0.5°, a ~69-mile box, and per-location hail would need it shrunk. Backlog item 23.

The knock-on Round 41c recorded is also cleared: **the station 5.2 miles from New Braunfels can
now be checked**, because its normals are reachable on a permitted path. Whether it qualifies is
a measurement for whenever per-location cooling load is built.
