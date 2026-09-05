# Round 19c — Do USW normals carry a cooling-degree-day column?

**Report only. No fetcher, and none until the column is measured.** The question Round 19b's
probe was meant to answer is still open, because Round 19b sampled the wrong tier of station.

---

## 1. What I got wrong

Round 19b's section 3 ranked candidates with:

```python
sorted(matches[metro], key=lambda r: (not r[4], r[0]))   # index membership, then station id ASC
```

`US1…` sorts before `USC…` sorts before `USW…`. Of **533 Austin** and **403 San Antonio**
candidates, the two that got sampled were therefore both `US1`: **CoCoRaHS volunteer
observers, who report precipitation only.**

- `US1TXBRT056` — 13 columns, all `MLY-PRCP-*`
- `US1TXBXR011` — 81 columns, all `MLY-PRCP-*`

`"degree-day-looking columns: NONE"` was **a fact about the tier I picked, not about the
normals product.** No temperature appears in either file because those stations do not
measure temperature. `USW` is the first-order/airport tier that does, and both
Austin-Bergstrom and San Antonio International are `USW`.

The sort key is the entire defect. It was chosen to put indexed stations first and then be
deterministic; "deterministic" got implemented as "alphabetical", and alphabetical happens to
be an ordering by station tier, ascending, worst-first.

---

## 2. What this round changes — one new step in the existing TEMP workflow

`.github/workflows/noaa-climate-probe.yml` gains **"TEMP (Round 19c): USW normals sampling +
doc/ + explicit-station API"**. No new file. Same guarantees throughout: `workflow_dispatch`
only, explicit `permissions: contents: read`, no checkout, no commit step, no token on any
request, `$RUNNER_TEMP` only, `continue-on-error`, and an `excepthook` sentinel.

**Section 1 — ranking, done properly.** Candidates are ordered by **tier first**
(`USW` → `USC` → `US1` → other) and then by **real great-circle distance in miles** from each
metro's representative point, not by the alphabet. Counts per tier are printed. If no indexed
`USW` station falls in the ±0.35° box, the box widens to ±0.75° then ±1.5°, and **every
widening is printed** — "we had to look sixty miles out" is itself a finding.

**Section 2 — the CSVs, with the full column list printed unconditionally.** Round 19b
reported `NONE` off a regex; if the regex is wrong again the raw list is still in the log to
read. For any degree-day column it prints **all twelve monthly values**, and it separately
reports whether the base temperature is stated **in the column name** and whether the string
"base" appears **anywhere in the file**. If a degree-day column exists with no stated base it
prints a warning saying so, because per this round's rule *a CDD figure whose base is inferred
is not usable*. It also names any `USW` station that is **nearer but publishes no normals
CSV** and was therefore skipped — that is a finding, not a detail.

**Section 3 — `doc/`, read rather than assumed.** Round 19b saw this directory return a
listing and never opened it. This lists it and fetches each document, grepping for degree-day
and base tokens. PDFs get a best-effort stdlib extraction (inflate each FlateDecode stream,
then search); **if that recovers nothing the log says the result is INCONCLUSIVE rather than
letting silence read as "the document says no."**

**Section 4 — the Access Data Service with a real station id.** Folded into the same dispatch
rather than deferred, so a fourth round is not needed if the normals disappoint. It tests the
same station section 2 sampled — the simulation caught an earlier version querying Camp Mabry
while section 2 read Bergstrom, which would have made the two sections incomparable.

### Dry-run first, three scenarios

| Scenario | Result |
|---|---|
| Every host denied (this sandbox) | `NOAA_PROBE3_STATUS=complete requests=3 ok=0 failed=3 station_csvs=0 docs=0` |
| Realistic fixture (USW/USC/US1, an index missing one USW, a `MLY-CLDD-NORMAL` column with no base in its name) | ranks USW first by distance; reports Camp Mabry as nearer-but-unindexed; fires the unstated-base warning; recovers "base 65 degrees F" from `doc/` |
| Injected crash after the hook installs | `NOAA_PROBE3_STATUS=error … crash=RuntimeError: injected` |

The fixture deliberately encodes the **unstated-base** case, because that is the outcome that
decides whether a measured column is usable, and it is the one a naive probe would sail past.

---

## 3. What the dispatch will settle, and what it cannot

**Will settle:** whether `USW` normals carry a degree-day column, its exact name, its twelve
monthly values for both metros, its units as printed, whether its base is stated in the data,
what `doc/` says the available elements are, and whether `data/v1` returns `CLDD` for a real
station id.

**Cannot settle:** nothing about aggregation (§5). And if `doc/`'s only documentation is a PDF
whose text does not survive the stdlib extractor, the base question may come back
inconclusive — in which case the answer is a human opening that PDF, not another probe.

---

## 4. If normals are dead: what remains

**The Access Data Service with explicit station ids from `ghcnd-stations.txt`** — the one path
nothing has falsified. Its standing is better than Round 19b judged, and for a reason worth
stating plainly:

- Round 19b rejected approach (a) because station resolution would depend on `search/v1`,
  whose response shape nobody had seen. **The dispatch measured `search/v1/data` with
  `boundingBox` returning 400 "Invalid search options"** — so NCEI accepts no bounding box
  anywhere useful, and Round 19b's stated worry was justified.
- **But (a) no longer needs `search/v1` at all.** `ghcnd-stations.txt` answered: **132,501
  records** with id, latitude, longitude and name, downloaded and filtered locally. That *is*
  the mapping mechanism, and it yields the explicit station ids the data service demanded when
  it said "A station is required". The reason (a) was rejected has been removed by a different
  measurement.

**What would still need measuring before a fetcher is written against it** — section 4 does
all four in this dispatch:

1. that `data/v1` returns rows for `dataset=global-summary-of-the-month` with an explicit
   `stations=USW…`, rather than another 400;
2. that `dataTypes=CLDD` is the right identifier — the assumption Round 19 flagged and never
   got to test, because the request failed before it reached the datatype;
3. the returned column names and units, read from the response rather than assumed;
4. whether `dataset=normals-monthly-1991-2020` is queryable the same way, which would give the
   normals through the API and make the static-CSV path optional rather than necessary.

---

## 5. The multiplier: one objection removed, the decisive one unchanged

The dispatch measured that **Climate at a Glance publishes annual contiguous-U.S. CDD for
1991–2020, base 65 °F — the same period as the normals.**

- **Period alignment: now possible.** Round 19b's §4 said the periods do not line up (national
  actuals 2015–2025 against a 1991–2020 normal) and that reconciling them would be our choice.
  **That objection is withdrawn** — a national 1991–2020 figure on a 65 °F base is published.
- **Base: on track**, pending section 2 confirming the local column's base is 65 and stated.
- **Aggregation: still unfixable.** The national figure is an **area-weighted mean over the
  contiguous United States**; the local figure is **one station's point value**. No station is
  the average of its metro, and no amount of period alignment makes a point a mean.

**The verdict stands: THI analysis, not a sourced claim.** NOAA publishes both numbers and
publishes neither ratio. What changes is that the honest version of the claim is now *closer* —
two of the three comparability gaps are closed or closable — and the remaining one is a
labeling obligation rather than a blocker. **AC Lifespan's flagship reading is labeled THI
analysis, cites both NOAA sources, and carries the point-versus-area caveat in the reading
itself.**

---

## 6. Verification

**Nothing under `site/src` changed.** This round touches the workflow and two documents only.

- `git diff --stat` confirms no path under `site/src` in the diff.
- Generated data byte-identical — `src/data/generated/**` unchanged, verified by hash.
- `npm run check` — 187 files, **0 errors, 0 warnings, 0 hints**.
- `npm run build` — clean. `npm run verify-content` — passes.
- All build artefacts byte-identical against `d1ec5c1`.
- Full cold-start replay suite green — results in the round summary.

---

## 7. Open items

1. **Dispatch `TEMP (Round 19c)`.** It is the third step in the same workflow; the two earlier
   steps can be dispatched or ignored independently.
2. **A fetcher is written in the round after that log is read** — not before. Three rounds have
   now turned on assumptions about this API, and two of them were wrong.
3. If the base comes back unstated in both the data and `doc/`, that is a human reading a PDF,
   not a fourth probe.
4. All three TEMP steps delete together with one `git rm` of the workflow once the mechanism is
   settled.
5. Round 19's carried-forward items are unchanged: the two below-hero "omitted reading"
   statements, `data-sources.yaml` still `status: stub`, and four unflagged legacy seed rows in
   other stub datasets.
