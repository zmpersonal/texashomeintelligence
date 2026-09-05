# Round 19d — The CDD fetcher, built on the measured mechanism

**`noaa-climate` is implemented and working for both metros.** The mechanism is approach (a)
after all: `data/v1` with **explicit station ids**, resolved from `ghcnd-stations.txt`
filtered locally. The endpoint was never the problem — the bounding box was.

---

## 1. Stations chosen, and rejected

| Metro | Station | Distance | Years of record | Outcome |
|---|---|---|---|---|
| Austin | **USW00013958** Camp Mabry | 3.8 mi | 29–30 | **selected** |
| San Antonio | **USW00012970** Stinson Muni AP | 6.0 mi | 19–22 | **selected** |
| San Antonio | USW00012909 Kelly AFB | 6.1 mi — *nearer* | **2**, `comp_flag=E` | **rejected** |

Kelly AFB is the case that proves distance alone is the wrong ranking. It is nearer than
Stinson and it publishes a full twelve months, but every row is a two-year **estimated**
record wearing a 30-year product's clothes. Selection therefore walks candidates
nearest-first and applies two gates before accepting one:

- `MIN_YEARS_OF_RECORD = 10` — generous by design. The two selected stations sit at 19–22 and
  29–30, so the bar only ever excludes records that are not really normals.
- Any month flagged `E` rejects the station outright.

A third gate matters as much and is easy to miss: **if the response carries no
years-of-record column at all, the station is rejected too.** Without it nothing can tell a
two-year record from a thirty-year one, which is the exact trap this function exists for.

Every rejection is logged on the run that makes it, naming the station, its distance, the flag
count and the minimum years — "we skipped the nearest station" is something a reader has to be
able to see.

**Only `USW` is eligible.** `USC` co-op and `US1` CoCoRaHS stations are excluded from the
candidate list rather than ranked lower, because Round 19b's whole failure was letting a
precipitation-only tier into the running at all.

---

## 2. What is stored, and how the two kinds stay apart

One file per metro holds **both** readings. They answer different questions and mixing them
would be a category error a reader could not detect, so they are separated three ways: a
`kind` discriminant on every row, different key prefixes, and no code path that combines them.

| | `normal-1991-2020` | `monthly-actual` |
|---|---|---|
| Question | how hard a system works in a *typical* month | what one specific month actually did |
| Source | `dataset=normals-monthly-1991-2020`, `MLY-CLDD-NORMAL` | `dataset=global-summary-of-the-month`, `dataTypes=CLDD` |
| Rows | 12, one per calendar month | one per **complete** month in the window |
| Key | `normal-1991-2020-07` | `actual-2026-07` |
| `yearsOfRecord` | present | absent — one month has no 30-year record behind it |

**The base is documented, not inferred.** NCEI's
`Readme_By-Variable_By-Station_Normals_Files.txt` states *"Note that NORMAL with degree days is
base 65"*, confirmed there by a worked example. That sentence is the only reason `baseF: 65`
may be written down. Every row also carries `units: "degree-days F"`, so a stored value is
self-describing rather than depending on a reader finding this document.

**Every observation carries** its station id (`sourceRef`, required by the type), station name,
distance in miles from the metro point, and — for normals — the years count and completeness
flag behind it.

**Round 15's lesson is enforced:** the current calendar month is always partial, and a
part-month CDD total understates the month by however much of it has not happened yet. Next to
twelve complete months it reads as a real collapse in cooling demand. It is **dropped, not
flagged**, and the run logs how many rows it dropped.

**Two failure paths refuse rather than reporting silence as success.** No station passing the
quality bar throws with the full rejection list. Normals retrieved but no actuals also throws —
returning normals alone would leave the newest `observedAt` at 2020 and the file would read as
five years stale forever while looking like a successful run.

---

## 3. The generated files, run through the real pipeline

`www.ncei.noaa.gov` is refused at CONNECT from this container, so ingestion was run through
`runIngestion` with `fetch` replaying the payloads the 2026-09-05 dispatch measured.

> **Provenance, stated precisely.** The **normals values, station ids, names, years counts and
> flags below are measured** — read from live NOAA responses and quoted in the round brief. The
> **GSOM actual magnitudes are synthetic**: the dispatch measured that endpoint's *shape*
> (36 monthly rows) but did not quote its values. The **distances** come from fixture
> coordinates, so they differ by ~0.2 mi from the brief's measured figures; the real
> `ghcnd-stations.txt` gives 3.8 / 6.0 / 6.1.

```
noaa-climate/austin: live — Fetched 47 raw record(s), 47 total after merge.
  datasetId=noaa-climate location=austin status=live
  lastSuccessAt=2026-09-05T13:12:39.208Z   lastError=null
  observations=47 (normals=12, actuals=35)
  newest observedAt=2026-08-01T00:00:00.000Z
  station=USW00013958 "AUSTIN CAMP MABRY" 3.8 mi  base=65F units=degree-days F
  1991-2020 NORMAL, base 65F:
     1:    9.6   years=29 flag=C        7:  644.8   years=30 flag=C
     2:   24.0   years=29 flag=C        8:  664.8   years=30 flag=C
     3:   73.2   years=30 flag=C        9:  473.7   years=29 flag=C
     4:  171.7   years=30 flag=C       10:  238.3   years=30 flag=C
     5:  369.9   years=30 flag=C       11:   62.3   years=29 flag=C
     6:  541.4   years=30 flag=C       12:   16.1   years=29 flag=C
    annual total: 3289.8 degree-days F, base 65
  seeded rows remaining: 0        <- the fabricated normalHighF/normalLowF row retired

noaa-climate/san-antonio: live — Fetched 47 raw record(s), 47 total after merge.
  selected USW00012970 (STINSON MUNI AP). Rejected: USW00012909 (KELLY FIELD, nearer):
    12/12 month(s) flagged "E" (estimated), min years of record 2 — an estimated record
    is not a normal
  observations=47 (normals=12, actuals=35)
  newest observedAt=2026-08-01T00:00:00.000Z
  station=USW00012970 "SAN ANTONIO STINSON MUNI AP"  base=65F units=degree-days F
  1991-2020 NORMAL, base 65F:
     1:   11.0   years=19 flag=S        7:  643.3   years=22 flag=S
     2:   35.2   years=20 flag=S        8:  667.9   years=22 flag=S
     3:   95.2   years=21 flag=S        9:  487.8   years=21 flag=S
     4:  206.6   years=22 flag=S       10:  263.9   years=20 flag=S
     5:  408.9   years=22 flag=S       11:   70.8   years=20 flag=S
     6:  563.9   years=22 flag=S       12:   19.5   years=19 flag=S
    annual total: 3474.0 degree-days F, base 65
```

Both measured normals round-trip **value for value**, and the Austin file's fabricated
`{normalHighF: 95, normalLowF: 73}` seed row retires on first success exactly as Round 19
designed.

### ⚠️ These files are NOT committed, and that is deliberate

`src/data/generated/noaa-climate/` is unchanged: `austin.json` is still the marked SAMPLE and
there is still no `san-antonio.json`. **The GSOM actual magnitudes in the replay are synthetic.**
Committing them would put invented cooling-degree-day numbers for real, named months into a
dataset badged `live` — precisely what this project forbids. `lastSuccessAt` would also record
a NOAA fetch that never happened from here.

**The first live runner ingestion writes them.** Say the word if you want them committed
anyway and I will land the normals half only — but the honest state today is no file.

---

## 4. Freshness windows

`30 → 120 days`, with the reasoning for **each kind** written into the table, and why one
number covers both:

- **`normal-1991-2020` does not go stale on any cadence this site cares about.** NCEI
  republishes normals once a decade; the next edition is the 2001–2030 series. Its rows are
  dated to 2020, the last year of their own period, so a normals-only file would read about
  five years old and any sane window would flag it — which is exactly why the fetcher throws
  rather than returning normals alone.
- **`monthly-actual` is what the window is actually set for**, because it is always the newest
  row.

The 120 days is four things that each have to fit: **31** days of month-start dating, **31**
more because the current partial month is deliberately dropped, GSOM's publication lag (**not
measured** — the probe characterised the endpoint, not its cadence, so this is a bound), and a
missed weekly run. It errs toward admitting staleness; too tight would badge a perfectly
current series as out of date every month.

---

## 5. Counts, and why `NEVER_SEED` stays

| | Before | After |
|---|---|---|
| `registry.ts` entries | 26 | **26** |
| `data-sources.yaml` ids | 17 | **17** |
| `noaa-climate` registry entries | 2 (austin, san-antonio) | 2 |

No count moves. Round 19 already registered both metros; this round replaced the mechanism
behind them, not their number.

**`noaa-climate` stays in `NEVER_SEED`.** The two facts are unrelated. That list is not about
whether a fetch works — `permit-trade-activity` has been a working deep fetcher for many rounds
and is still in it. It is about what the file should contain in the window *before* the first
successful run, and for a figure a homeowner would act on the answer is nothing at all. A
seeded CDD row would be an invented climate fact about a real city sitting on disk until
ingestion happens to run.

**`data-sources.yaml` stays `status: stub`** for the same reason — the feed has delivered
nothing yet. §6 measures exactly what flips when it does.

---

## 6. Verification

**The Home Stress Index is unchanged for both metros, and so are the seven named pages.**
Proven the strong way rather than the easy way: the generated files were placed into
`src/data/generated/`, the site rebuilt, and the full artefact manifest diffed against the
build without them.

```
IDENTICAL (10 files): stress-index/austin.json, stress-index/san-antonio.json,
  austin/{roofing,hvac,plumbing}, san-antonio/{roofing,hvac,plumbing},
  tools/plumbing-triage
```

Publishing **94 live CDD observations changes exactly three artefacts**, all on
`/methodology/`, and every one of them is the page doing its job:

- "We track 17 public sources; **12** are currently connected and live" → **13**
- the `noaa-climate` row: `Not yet connected` → **LIVE**, "Data through Aug 1, 2026"
- `dateModified` / sitemap `lastmod` follow from that

`/methodology/` is generated from the source registry precisely so it reflects the real state
of each feed. It would be a defect if it did *not* change.

`noaa-climate` remains absent from `INDEX_DATASETS`, and the unit replay asserts it — a
30-year normal is by construction the opposite of news, and adding it would make the index move
on a number that cannot change.

**`scripts/replays/climateunit.ts` rewritten — 35 assertions.** Round 19b's version asserted
the fetcher makes *no* request, which is what this round changed. It now pins: the measured
normals round-tripping value for value, both kinds staying distinguishable and key-collision
free, the partial current month being dropped, Kelly AFB being *considered* and then rejected
while Stinson is selected, `USC`/`US1` never being queried, **no bbox parameter on any
request**, no token, both refusal paths, and the freshness window.

That last one found a real design detail: the station table is memoised per process — right for
a one-shot ingest run, where both metros share one ~10 MB download — but it made the
parse-failure path unreachable from a replay. A test-only `__resetStationTableCacheForTests()`
now exists so that path is actually covered.

---

## 7. Open items

1. **A first live runner ingestion.** Nothing is committed under
   `src/data/generated/noaa-climate/` until one lands.
2. **The multiplier is recorded in HANDOFF as owner-approved: THI analysis, not a sourced
   claim** — both NOAA sources cited, point-versus-area caveat in the reading itself. Not
   computed or stored anywhere in this round.
3. **The two below-hero "omitted reading" statements go stale the moment ingestion succeeds.**
   `src/data/belowHero.ts` still tells readers the noaa-climate feed "has no San Antonio file at
   all" and that its Austin file is "a one-observation SAMPLE". Both are accurate today and were
   left untouched to keep the six service pages byte-identical. **The round that first sees live
   CDD data must rewrite them**, and flip `data-sources.yaml` to `live` in the same change.
4. **All three TEMP probe steps are now deletable** — one `git rm` of
   `.github/workflows/noaa-climate-probe.yml`. They have served their purpose.
5. Four unflagged legacy seed rows remain in other stub datasets (Round 19 §4a) — flagged, not
   fixed.
