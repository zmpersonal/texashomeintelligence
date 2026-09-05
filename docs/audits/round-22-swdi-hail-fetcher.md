# Round 22 — The SWDI hail fetcher

**`swdi-nx3hail` is implemented for both metros.** New dataset, separate from `noaa-storm-events`.
No generated file is committed — see §7.

---

## 1. MAXSIZE units: I have not read the documentation, and that is not the same as "it does not state them"

**The size figure is not publishable. Only counts are.**

The response carries **no units column** — measured, both metros, twelve windows — and the
observed values are 0.75, 1, 1.25, 1.5, 2. Inches and millimetres differ by 25× and both look
entirely plausible for hail at those magnitudes.

SWDI's documentation is the only thing that settles it, **and it could not be read**:

```
https://www.ncdc.noaa.gov/swdiws/            000  (connect_rejected)
https://www.ncei.noaa.gov/swdiws/            000  (connect_rejected)
https://www.ncdc.noaa.gov/swdiws/csv/nx3hail 000  (connect_rejected)
```

So the honest claim is **"the documentation has not been read"**, not "the documentation does not
state it". Those are different statements and only one of them is true here.

The fetcher stores `maxSize` as a bare number with **`maxSizeUnit: null`**, and the field's own
doc comment says why in full. A number with no unit is not a measurement, and nothing in this
round guesses one. `hailunit.ts` asserts that no row and no line of the fetcher names inches or
millimetres anywhere.

---

## 2. Radar-derived versus confirmed — carried in the data, not a comment

Every observation carries:

```json
"observationType": "radar-derived-hail-signature",
"sourceProduct": "SWDI nx3hail"
```

The **value is the warning**. A reader sees JSON and a rendered page, never the source file, so a
comment cannot protect them; a discriminant whose literal text reads `radar-derived-hail-signature`
can, because any consumer printing it verbatim is unable to make a signature read as hail that fell.

The feed's own `source.name` closes the loop: *"NEXRAD radar-derived hail signatures, **not
confirmed hail reports**"* — which is what `/methodology/` and any DataStatus caption renders.

**Both facts stay true at once.** Round 12 measured no *confirmed* hail in Bexar from NCEI Storm
Events — human reports. Radar can flag a probable-hail cell over a county where nobody reported
hail on the ground. `hailunit.ts` asserts the dataset id is not `noaa-storm-events` and that the
type string contains no form of "confirmed", "reported" or "fell".

---

## 3. The date parser: found, filtered, and the real lag

**The bug:** SWDI appends a trailing metadata row, `totalTimeInSeconds,0.412`, after the records.
Round 21b's probe filtered `#` comment lines only, so the trailer survived, sorted last
lexically, and was reported as the newest timestamp for both metros.

**The fix is deliberately not "drop the last line"** — a trailer that moved or was renamed would
walk straight back in. A row is kept only if **its column count matches the header AND its ZTIME
parses as a real timestamp**. Anything else is counted and logged:

```
swdi-nx3hail/austin: dropped 1 non-data row(s) (SWDI appends a timing trailer after the records).
```

so a rise in that number is visible as a shape change rather than silent.

**Real timestamps after the fix**, from the ingestion run below:

| | newest `observedAt` | age at run time |
|---|---|---|
| austin | `2026-08-27T19:21:00.000Z` | 9 days |
| san-antonio | `2026-08-22T14:16:00.000Z` | 14 days |

`rows whose key or value mentions "totalTimeInSeconds": 0` for both.

---

## 4. Design decisions

**Its own dataset.** `swdi-nx3hail`, separate files, no shared rows with `noaa-storm-events`.
Folding one into the other is the sibling-product error that cost rounds 19–19e.

**The box is not a county.** ±0.5° around each metro's representative point from `zip-areas.ts`.
A box around a point includes area outside the county and excludes area inside it, so a count from
this feed is *signatures near the city*, never *signatures in Travis County*. No county polygon has
been measured anywhere in this repo. Every row carries
`areaBasis: "box-around-metro-reference-point-not-a-county"`, and the replay asserts no county is
named and that the only occurrence of the word "county" is that disclaimer.

**One 31-day window per run; no backfill, and that is a decision.** `computeFetchWindow` hands a
full backfill window on a first run, which SWDI answers with a 500 — its stated ceiling is 744
hours, quoted from the error body Round 21 misread. Rather than loop twelve requests to fill a
year, the window is **clamped** to the ceiling and the series accumulates: `mergeObservations` is
append-only and the key is `ZTIME-WSR_ID-CELL_ID`, so weekly runs build the history a backfill
would have bought, and an overlapping window updates in place instead of duplicating. The
alternative is loop logic that runs its guard every day forever to do nothing. **Recurring cost:
2 requests per run, one per metro.**

**`plsr` does not exist on SWDI.** The server enumerated its products — nx3structure, nx3hail,
nx3meso, nx3mda, nx3tvs, nldn. The replay asserts no request ever names `plsr`.

**Failures carry the server's own words.** An HTTP error puts the response body into the throw.
Round 21 printed that body and discarded it, and lost a round to the difference.

---

## 5. Freshness: 200 days, and the one window where absence and failure look alike

`dataThrough` is the newest **signature**, not the newest fetch — so a quiet winter and a broken
fetcher age the data identically. **`lastSuccessAt` is what distinguishes them**, and DataStatus
renders it beside the badge; the age check cannot.

Sized from measurement, not instinct: the Round 21b dispatch found signatures in **twelve of twelve
consecutive 31-day windows for both metros — zero empty**. The longest observed gap is under 31
days; 200 days is roughly six times that. It tolerates a full quiet season without crying stale,
which is the failure that would matter: badging a correct *"no hail near the city lately"* as a
data problem teaches a reader to distrust an honest empty state.

**Round 15's partial-period lesson applies to the consumer, not the fetcher.** The current 31-day
window is always partial, so a count taken from it is a count *so far*. No record is dropped for
that — discarding a hail signature because the month is unfinished would throw away a real event —
but nothing may compare a partial window's count against a complete one.

---

## 6. Counts, and NEVER_SEED

| | Before | After |
|---|---|---|
| `registry.ts` entries | 26 | **28** |
| `data-sources.yaml` ids | 17 | **18** |

**`swdi-nx3hail` goes into `NEVER_SEED`.** A seeded hail signature is the worst kind of
placeholder this list guards: it carries a **latitude and longitude**, so it does not merely state
something untrue — it points at a place near a real city and says a storm was probably there. The
honest bootstrap state is no file at all.

`data-sources.yaml` lists it `status: stub`, which is accurate: the feed has delivered nothing yet.
`/methodology/` reads **"We track 18 public sources; 13 are currently connected and live"** with the
new row showing **Not yet connected**.

---

## 7. The generated files

Ingestion was run through the real `runIngestion` with `fetch` replaying the measured response
shape.

> **Provenance.** The **column set, the absence of a units column, the MAXSIZE value domain, the
> `totalTimeInSeconds` trailer, the 744-hour ceiling and the absence of a county field are
> measured.** **Coordinates and timestamps are synthetic** — the dispatch reported counts and
> columns, not rows. No figure below is claimed as a real storm.

```
swdi-nx3hail/austin        live   24 observations   KGRK
  observedAt 2026-08-06T10:00:00Z .. 2026-08-27T19:21:00Z   (newest 9 days old)
  observationType=radar-derived-hail-signature   sourceProduct=SWDI nx3hail
  maxSizeUnit=null   areaBasis=box-around-metro-reference-point-not-a-county
  distinct MAXSIZE: 0.75, 1, 1.25, 1.5, 2  (no unit)
    2026-08-06T10:00:00Z-KGRK-C100  lat=29.7672 lon=-98.2431 maxSize=0.75 prob=50 sevProb=20
    2026-08-06T20:22:00Z-KGRK-C122  lat=29.9072 lon=-97.5831 maxSize=1.25 prob=72 sevProb=42
  rows mentioning "totalTimeInSeconds": 0

swdi-nx3hail/san-antonio   live   17 observations   KEWX
  observedAt 2026-08-06T10:00:00Z .. 2026-08-22T14:16:00Z   (newest 14 days old)
  … same type, unit and areaBasis fields
  rows mentioning "totalTimeInSeconds": 0
```

**Not committed.** The coordinates are synthetic, and committing them would put invented storm
positions near real cities into a dataset badged `live`. Same call as Round 19d. **The first live
runner ingestion writes them.**

---

## 8. Verification

**Home Stress Index unchanged for both metros; six service pages and `/tools/plumbing-triage/`
byte-identical.** Proven by placing both generated files, rebuilding, and diffing the manifest —
**10 files identical**. Publishing 41 signatures changes only `/methodology/` and the two sitemaps
that follow its `dateModified`.

Against HEAD `39d6b02`, this round changes **exactly one artefact**: `/methodology/`, gaining the
new source row.

`swdi-nx3hail` is **not in `INDEX_DATASETS`** and the replay asserts it — a score must not move on
radar echoes nobody confirmed.

- `npm run check` — 187 files, **0 errors, 0 warnings, 0 hints**.
- `npm run build` clean · `npm run verify-content` passes (**18 data sources**, 4 priority).
- **New:** `scripts/replays/hailunit.ts` — **34 assertions**: the trailer filtered and never read
  as a date, the radar discriminant on every row, `maxSizeUnit` null with no unit named anywhere,
  the not-a-county guard, the 744-hour clamp, one request per run, no token, `plsr` never
  requested, an empty window returning cleanly, an HTTP error quoting the server, a changed column
  set refusing rather than defaulting, positionless rows dropped, and the registration/scoring/
  freshness/seeding wiring.

---

## 9. Open items

1. **Read SWDI's documentation for MAXSIZE's unit.** Until then the count is publishable and the
   size is not. It is a one-line answer that this environment cannot fetch.
2. **A first live runner ingestion** — nothing is committed under `src/data/generated/swdi-nx3hail/`
   until one lands, and `data-sources.yaml` flips to `live` in that same round.
3. **Roof Scan's empty-state decision is already approved.** Twelve of twelve windows were
   non-empty for both metros, so the empty state may be rarer than expected — but it is the
   *confirmed* hail feed, not this one, that showed Bexar at zero.
4. Four TEMP probe steps remain deletable in one `git rm`.
