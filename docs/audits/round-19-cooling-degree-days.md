# Round 19 — Cooling degree days: implementing `noaa-climate`

**Status:** fetcher implemented for both metros; **no cooling-degree-day figure has been
measured yet, and none is published anywhere on the site.** The probe that would confirm
the three remaining unknowns runs on the Actions runner and its output is observable only
after this branch merges.

---

## 1. The probe — what was asked, and why it could not be answered here

The round asked for the NOAA endpoint, station, resolution, cadence and lag to be reported.
None of that could be established from this container. Every NOAA host is refused at
CONNECT by the sandbox's network policy, exactly as `traviscad.org` was in Round 16:

```
  www.ncei.noaa.gov/cdo-web/api/v2/datasets                  HTTP 000  connect_rejected
  www.ncdc.noaa.gov/cdo-web/                                 HTTP 000  connect_rejected
  www.ncei.noaa.gov/access/services/data/v1                  HTTP 000  connect_rejected
  www.ncei.noaa.gov/pub/data/normals/1991-2020/              HTTP 000  connect_rejected
  ftp.cpc.ncep.noaa.gov/htdocs/degree_days/                  HTTP 000  connect_rejected
```

So, per the Round 16b pattern, this round adds
**`.github/workflows/noaa-climate-probe.yml`** — `workflow_dispatch` only,
`permissions: contents: read` set explicitly, no checkout, no commit step, no token,
writes nothing outside `$RUNNER_TEMP`, `continue-on-error: true`, and it prints
`NOAA_PROBE_STATUS=complete requests=N ok=N failed=N` so a crash is distinguishable from an
empty finding. **It is TEMP and marked for deletion once this question is settled.**

It was dry-run offline before commit, the same discipline that caught two defects in the
Round 16b probe. With every host refused it still reached the sentinel:
`NOAA_PROBE_STATUS=complete requests=15 ok=0 failed=15`. The crash guard works.

The probe discovers rather than asserts. Its five sections:

1. **Reachability** — does the token-free Access Data Service answer at all, and does the
   token-gated CDO v2 path behave as expected (it should refuse).
2. **Station discovery by bounding box** — prints every column name returned, so the
   degree-day datatype id is *learned* rather than guessed, plus every station in each
   metro's box with its date span and how many months carry a usable value.
3. **Publication lag** — newest monthly row versus the runner's own date. Measured, not
   assumed. This is the number `dataFreshness.ts` has to absorb.
4. **National baseline** — see §3.
5. **1991–2020 monthly normals** — the fallback basis, and whether its station file names
   match the ids section 2 found.

**Read the probe log before trusting a first live ingestion run.**

---

## 2. What was implemented

`src/ingest/fetchers/noaaClimate.ts` is now a real fetcher, `makeFetcher(location)` in the
`blsWages.ts` idiom, exporting `noaaClimateAustin` and `noaaClimateSanAntonio`.

- **Endpoint:** NCEI **Access Data Service v1**, dataset `global-summary-of-the-month`.
  Chosen over CDO v2 specifically because it needs **no token**: `requiredEnvVars` stays
  empty, the feed adds no secret, no owner seam and no cost.
- **Resolution:** one row per calendar month, dated to the first of the month it summarises.
- **Value:** `{ coolingDegreeDaysF, stationId, stationName }`. Degree-days Fahrenheit,
  base 65. It is a measure of how much cooling a month asked for — **not a cost, a runtime,
  or a bill.**
- **No station id is written down.** Round 16's standing lesson is not to assert an
  identifier nobody has round-tripped. The fetcher draws a ±0.35° box around the
  representative point **already in `src/data/zip-areas.ts`** (Austin 30.2672/−97.7431,
  San Antonio 29.4241/−98.4936) and picks the best-covered station out of what actually
  comes back, ranked by usable-month count with a station-id tie-break so the choice is
  reproducible. Selection always reads ≥3 years regardless of the incremental window, so a
  fortnightly run cannot silently move a metro onto a different instrument. The chosen
  station rides on every observation, so the series itself is the audit trail.

### The three constructions, flagged as `blsWages.ts` flags the San Antonio CBSA

**Not one request in this fetcher has ever been round-tripped against a live response.**
Three things are constructions:

1. **`dataTypes=CLDD`** as GSOM's id for monthly cooling degree days.
2. **`bbox` ordering.** NCEI documents north,west,south,east. The fetcher tries that first
   and falls back to south,west,north,east, and names both orderings in its error message
   if neither answers.
3. **`units=standard`** yielding base-65 °F degree-days rather than Celsius.

If a first live run fails, **check the datatype id before anything else.** Do not just
retry, and do not ship a differently guessed id without checking the probe log.

### What it refuses to do

A response that yields no usable degree-day row **throws** rather than returning `[]`. An
empty return would let `runIngestion` mark a dataset with prior live evidence "live" on a
run that learned nothing. A three-year GSOM query that finds no cooling degree days means
the query is wrong, and the message says which part to check.

---

## 3. The runtime multiplier — what it needs, and why it was not built

The round asked what a "runs N× the national average" multiplier requires and whether the
national baseline is published or derived. **The multiplier was not built.**

To be defensible it needs a national cooling-degree-day figure **on the same basis** as the
metro figure, which means agreement on all four of:

1. **Base temperature** — 65 °F, matching GSOM's `CLDD`.
2. **Period** — the same months, not a 30-year normal against a single recent season.
   Comparing one hot summer to a long-run normal produces a multiplier that says more about
   the year than about the metro.
3. **Population weighting** — the two candidate national series differ here, and they are
   not interchangeable. NOAA CPC publishes **population-weighted** degree days (that is the
   point of them: they track energy demand). A simple average of station CDD across the
   country is a different quantity. A multiplier that silently mixes the two is wrong in a
   way no reader can see.
4. **Station-versus-area** — the metro number will come from one station; a national number
   is an area or population aggregate. That asymmetry needs stating wherever the ratio is
   published, not buried.

**Published or derived:** a national figure is *published* — NOAA CPC issues
population-weighted monthly CDD for the nation and by state, and NCEI's Climate at a Glance
carries a national CDD time series. **Neither could be confirmed reachable from here** —
`ftp.cpc.ncep.noaa.gov` is refused at CONNECT along with every NCEI host. Section 4 of the
probe requests both and prints the first 700 bytes of whatever answers, which is what will
settle the format, the weighting and the licensing.

Until that log exists, a multiplier would be a number derived from a baseline nobody has
opened. The round's own rule applies: **report no figure you did not measure.**

---

## 4. Two defects found on the way, both fixed

### 4a. A fabricated climate reading that would have survived into a `live` dataset

`src/data/generated/noaa-climate/austin.json` carried one seeded row —
`{ "normalHighF": 95, "normalLowF": 73 }` — written **before** `seed.ts` began stamping
`seed: true`. It therefore matched none of the three fingerprints anything checks for: no
`seed` flag, no `sample-` key prefix, no literal "SAMPLE" in its value. That means
`runIngestion`'s retirement filter (`o => !o.seed`), `verify-content`'s `looksSeeded`, and
`purge-seed-observations.mjs` would all have walked past it.

Demonstrated against a temp copy, with the fetcher stubbed to return three months:

```
  untagged legacy seed on a month the fetch does not return:
    noaa-climate/austin: live n=4 — Fetched 3 raw record(s), 4 total after merge.
      normals-shaped rows remaining: 1        ← a fabricated reading, inside a LIVE dataset

  same row, tagged seed:true (this round's fix):
    noaa-climate/austin: live n=3 — ... Retired 1 seeded sample row(s).
      normals-shaped rows remaining: 0
```

**Fixed** by tagging the row `seed: true`, so `runIngestion` retires it on the first
successful fetch. Worth stating precisely: with its committed key of `2026-07` the row would
probably have been overwritten by key collision anyway, since a first backfill spans the
year. The defect is real; that particular row's escape was luck.

`noaa-climate` is also added to `seed.ts`'s **`NEVER_SEED`** set, alongside
`arr-collection-schedule`, `austin-water-stage` and `permit-trade-activity`, for the same
reason those are there: a cooling-degree-day count is a number a homeowner would act on, and
the honest bootstrap state is **no file at all**. **No San Antonio file is committed** —
the first successful run creates it.

**Four other generated files carry unflagged pre-stamp seed rows** and would behave the same
way if their fetchers were ever wired up: `tdi-losses/austin`, `tx-forest-service/texas`,
`ercot/texas`, and (already flagged, no action needed) `fema-nfhl/austin`. All are true TODO
stubs today, so nothing is at risk right now. **Flagged, not fixed — outside this round.**

### 4b. Dataset citations frozen at their bootstrap value

`runIngestion` built its success record as `{ ...existing, status: "live", ... }`, which
carried `source` forward from whatever the file was first written with. Re-pointing a
fetcher at a new upstream therefore left the file — and every page that cites it — naming
the old one indefinitely.

This is not hypothetical. `noaa-storm-events` is **live today** in both metros, citing
`https://www.ncdc.noaa.gov/stormevents/`, while its fetcher has for some rounds actually
read `https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/`.

**Fixed** by taking `source` from the fetcher on each successful run. The two storm-events
files self-correct on the next ingestion run; they were **not** hand-edited, because
hand-editing a live dataset file is not something this round should do quietly.

---

## 5. Registry and freshness

**Registry:** `25 → 26` entries. One `entry("stub", noaaClimate)` became
`entry("deep", noaaClimateAustin)` + `entry("deep", noaaClimateSanAntonio)`. "deep" rather
than "stub" because the tier describes seed richness and there is now no seed to describe —
the same reasoning `permit-trade-activity` carries.

**`noaa-climate` is not in `INDEX_DATASETS`.** The Home Stress Index reads
`noaa-storm-events`, `usdm-drought`, `nws-api` and `airnow` and nothing else, so it cannot
move because of this round.

**Freshness window:** `30 → 75 days`, moved out of the "cadence not established" stub group
into its own entry with the reasoning written down: ~31 days of month-start dating by
construction, plus roughly six weeks for GSOM's publication lag and a missed weekly run.
**The lag component is a bound, not a measurement** — section 3 of the probe measures it, and
this number should be revisited against that log. It errs toward admitting staleness: too
tight would badge a perfectly current series as out of date every month.

---

## 6. Verification

- `npm run check` — 187 files, **0 errors, 0 warnings, 0 hints**.
- `npm run build` — clean.
- `npm run verify-content` — passes.
- **Byte-identical output:** every one of the **267** rendered HTML pages hashes identically
  before and after this round — not only the six service pages and
  `/tools/plumbing-triage/`. Verified by building at HEAD, building with the change, and
  diffing a full `sha256sum` manifest. This round changes ingestion only; it publishes
  nothing.
- **New:** `scripts/replays/climateunit.ts` — 28 assertions against synthetic GSOM payloads:
  station selection and its tie-break, the ≥3-year selection lookback, the bbox fallback,
  non-overlapping metro boxes, `-9999`/empty never read as zero, a genuine zero-degree-day
  January kept, duplicate-month dedupe, the refusal to report silence as success, and that no
  request carries a token. It cannot prove the three constructions in §2 — only the runner can.
- Cold-start replay suite: results recorded in the round summary.

---

## 7. Open items for the owner

1. **The probe log is the gate.** Nothing here should be trusted as measured until
   `TEMP (Round 19): NOAA cooling-degree-day probe` has been dispatched and read. Delete the
   workflow once it has served its purpose.
2. **Two below-hero "omitted reading" statements will go stale on the first successful run.**
   `src/data/belowHero.ts` currently tells readers that the noaa-climate feed "has no San
   Antonio file at all" and that its Austin file is "a one-observation SAMPLE". Both are
   accurate today and were deliberately left untouched to keep the six service pages
   byte-identical. **They stop being true the moment ingestion succeeds**, and the round that
   first sees live CDD data must rewrite them.
3. **`data-sources.yaml` still lists `noaa-climate` with `status: stub`.** Accurate today —
   the feed has delivered nothing. It should flip to `live` in the same round as item 2, not
   before, since `/methodology/` renders it.
4. **The multiplier is deferred, not rejected** (§3). It needs the national baseline settled
   first.
5. **Four unflagged legacy seed rows remain** in other stub datasets (§4a) — flagged, not
   fixed.
