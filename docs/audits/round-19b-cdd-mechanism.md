# Round 19b — Rebuilding the CDD mechanism on what the probe measured

> ## ⚠️ TWO FINDINGS BELOW ARE CORRECTED BY ROUND 19c
>
> **1. The probe sampled the wrong tier of station.** Section 3's ranking sorted by station id
> ascending, so `US1` (CoCoRaHS volunteers, precipitation only) sorted ahead of `USC` and
> `USW`. Both CSVs it opened were `US1` and carried no temperature at all. The
> `"degree-day-looking columns: NONE"` result is **a fact about the tier that got picked, not
> about the normals product.** Whether `USW` normals carry a CDD column is **still open** —
> Round 19c re-ranks USW-first by distance and re-samples.
>
> **2. §4's period objection is withdrawn.** Climate at a Glance publishes annual
> contiguous-U.S. CDD for **1991–2020, base 65 °F — the same period as the normals**, so the
> periods *can* be aligned. The aggregation objection (area-weighted national mean versus a
> single station point) stands unchanged, and the verdict — **THI analysis, not a sourced
> claim** — is unaffected.
>
> Also measured: `search/v1/data` with `boundingBox` returns 400 "Invalid search options", so
> §2's worry about that endpoint was justified. But approach (a) **no longer needs it** —
> `ghcnd-stations.txt` answered with 132,501 records and is the mapping mechanism, supplying
> exactly the explicit station ids the data service demanded. See `round-19c-usw-normals.md` §4.

**Outcome: a second probe, not a second fetcher.** Both candidate approaches depend on
something the 2026-09-05 dispatch did not measure, and Round 19's failure was shipping on
exactly that kind of gap. The fetcher is reverted to an honest unavailable state.

---

## 1. What the dispatch measured

| Request | Result |
|---|---|
| `data/v1` GSOM, bbox, both orderings, both metros | **400** — `errors: [{"field":"stations","message":"A station is required."}]` |
| `access/services/search/v1/datasets` | **200** |
| `data/normals-monthly/1991-2020/access/` | **200** — index of **1,162** station CSVs |
| Climate at a Glance national CDD | **200** — `{"title":"Contiguous U.S. August Cooling Degree Days (base 65°F)"}`, monthly 2015–2025 |
| CDO v2 | **400** — "Token parameter is required" |
| Both CPC population-weighted degree-day URLs | **404** |
| 1991–2020 normals documentation PDF | **404** |

**This invalidates Round 19's design outright.** Its whole point was that no station id had
to be asserted: draw a box around the representative point, take the best-covered station
that comes back. The endpoint does not do that. It requires explicit station ids. There is
no version of the shipped fetcher that works.

---

## 2. The choice: (b), the 1991–2020 monthly normals

Justified against the probe output, not against the brief:

**(a) resolve via `search/v1`, then pass explicit ids to the data service — rejected.**
What answered 200 was `search/v1/**datasets**`, which lists *datasets*. Station resolution
would use a different `search/v1` path with a different query vocabulary and a response
shape **nobody has seen**. That is the same bet Round 19 lost: an endpoint accepting a
parameter because it seemed reasonable that it would. The falsified request was itself a
plausible-looking `bbox=` on an endpoint that answers 200 for other calls. Two API calls
also means two ways to be wrong, and it inherits the data service's station requirement
rather than escaping it.

**(b) read the 1991–2020 monthly normals station CSVs directly — chosen.** Three reasons,
each anchored to a measurement:

1. **The path is measured at 200 and has no query shape to get wrong.** Static files at
   fixed URLs. There is no parameter for a server to reject. The single largest source of
   Round 19's failure — a query the endpoint does not accept — does not exist here.
2. **A 30-year normal is the correct basis for the claim being made.** AC Lifespan asks how
   hard a system works in a *typical* season. A normal is a typical season by construction.
   GSOM monthly actuals answer "how hot was last July", which swings year to year and would
   make the reading move for reasons that have nothing to do with the home.
3. **It needs no token and no secret**, same as (a), so neither is preferred on cost.

### What (b) still does not know, and how it gets determined

The probe showed the index exists. It did **not** show:

1. **Which of the 1,162 files covers Austin, and which covers San Antonio.**
   → *Answered:* `ghcnd-stations.txt` (132,501 records, id + lat/lon + name), downloaded and
   filtered locally. The mechanism works; Round 19b's ranking of its output did not.
2. **What is inside one of them** — whether a cooling-degree-day normal is present at all,
   its column name, its base temperature, and the month layout.
   → *Still open.* The two files opened were precipitation-only volunteer stations.

**How the mapping gets determined — by download and local filter, not by assertion.** A
station list carrying id + latitude + longitude is fetched, then filtered *in the probe
script* to a ±0.35° box around each metro's representative point from `zip-areas.ts`, and
each hit is cross-checked for membership in the `access/` index. Nothing asks a server to
interpret a bounding box — that is the parameter just proven unsupported. Three candidate
list sources are tried and each is reported whether it answers or not: any inventory file
found by listing the normals product directory, `ghcnd-stations.txt`, and `search/v1/data`
(probed here so that a future round choosing (a) is not starting blind either way).

**This needs another dispatch. It cannot be inferred.** Guessing a station id would repeat
Round 19 with a different endpoint, and guessing the CSV's column names would repeat it with
a different assumption.

---

## 3. Does another dispatch have to happen first? Yes — so the probe shipped

Per the round's own instruction that a second probe is cheaper than a wrong fetcher, this
round extends `.github/workflows/noaa-climate-probe.yml` (it does **not** add a third file)
with one new step: **"TEMP (Round 19b): normals station mapping + CSV layout"**. Same
guarantees as before — `workflow_dispatch` only, explicit `permissions: contents: read`, no
checkout, no commit step, no token on any request, `$RUNNER_TEMP` only, `continue-on-error`.
Five sections:

1. **The normals product directory listing.** The doc PDF the last run guessed at 404'd;
   this lists the directory and prints every link rather than guessing a second filename.
2. **The `access/` index in full**, counted by prefix. Round 19's probe matched only
   `USW000\d+\.csv`, so co-op (`USC`) and other stations were silently invisible — a defect
   in my own probe, fixed here.
3. **The mapping**, as described above.
4. **The CSV layout.** If section 3 resolves a station, that station's file is opened. If it
   does not, the *first indexed file* is opened anyway, purely for the column layout, which
   is identical whichever station it is. This keeps "we cannot find the right station"
   a separate finding from "we do not know the format" — one run can settle one without the
   other. If neither is possible the log says so explicitly rather than printing an empty
   heading that reads like "there is no CDD column".
5. **Climate at a Glance's own metadata block** — base, period, aggregation — which is what
   §4 below turns on. It also asks whether a 1991–2020 national normal is published.

### Dry-run first, and it caught a real defect

The probe was run offline before commit, as Rounds 16b and 19 were. Three scenarios:

- **Everything denied** (this sandbox's actual state): reaches
  `NOAA_PROBE2_STATUS=complete requests=7 ok=0 failed=7 station_csvs=0`.
- **Mixed outcome** — directory listing 404, index 200, which is an ordinary runner outcome:
  **crashed with `NameError: name 'inventoryish' is not defined`**, taking sections 3, 4, 5
  and the status line with it. A silent death is the one thing a diagnostic must not do.
  Fixed by hoisting the declarations; the scenario now completes and exercises section 4's
  layout-only fallback.
- **Injected crash**: prints
  `NOAA_PROBE2_STATUS=error … crash=RuntimeError: injected`.

The crash guard is now an `excepthook`, so *any* unexpected failure still ends the log with
a status line, and "crashed" stays distinguishable from "measured nothing".

---

## 4. The national baseline: what comparability requires, and the verdict

Climate at a Glance gives **contiguous-U.S. cooling degree days, base 65 °F**, monthly,
2015–2025. For a local figure to be comparable to it, four things must line up:

1. **Base temperature — 65 °F on both sides.** The normals files must be confirmed to carry
   a base-65 column; a file offering several bases and read at the wrong one produces a
   ratio that is wrong by a fixed factor and looks entirely plausible. Section 4 of the
   probe checks this.
2. **Period — the same years on both sides.** This one does not line up as things stand. The
   national series is **actuals, 2015–2025**. The local figure would be a **1991–2020
   normal**. Dividing one by the other compares a 30-year normal to a recent-decade average
   and attributes the difference to the metro. Either a national 1991–2020 normal is
   obtained (probe section 5 asks) or the national actuals are averaged over a chosen window
   — and that averaging is **our** choice, not NOAA's.
3. **Aggregation — and this is the one that cannot be fixed.** The national series is an
   **area-weighted average over the contiguous U.S.** The local figure is a **single
   station's point value**. A point is not an area mean, and no station is "the average of
   its metro". The ratio is a point-to-area comparison however carefully the rest is
   handled, and that has to be stated wherever it appears rather than buried.
   Round 19's analysis assumed the reachable national series was CPC's
   **population-weighted** one; the probe measured that both CPC URLs 404. Area-weighted and
   population-weighted are different quantities — population weighting tracks where people
   and their air conditioners actually are — so the correction makes the mismatch larger,
   not smaller.
4. **Month set — the same months summed identically** on both sides, stated on the page.

### Verdict: THI analysis, not a sourced claim

**Both inputs are sourced. The multiplier is not.** NOAA publishes the station normal and
NOAA publishes the national series; NOAA does not publish the ratio, and does not publish
either number on a basis that makes the ratio a like-for-like comparison. The period
reconciliation, the month set, and the decision to compare a point against an area mean are
all THI's.

**So AC Lifespan's flagship reading must be labeled THI analysis**, citing both NOAA sources,
and must carry the point-versus-area caveat in the reading itself — not in a footnote. It
must **not** be phrased as "NOAA says Austin runs N× the national average". The honest form
names what was divided by what.

This is a labeling decision, not a blocker: a clearly-labeled derived comparison with both
sources cited is publishable. A ratio presented as a NOAA finding is not.

---

## 5. What changed in the repo

- **`src/ingest/fetchers/noaaClimate.ts` reverted to an honest unavailable state.** It makes
  **no HTTP request at all** rather than firing a call path already measured to return 400
  every day and writing error files for a question already answered. Its refusal message
  quotes the measured 400, its date, and points at this document. Deliberately **not**
  `notImplemented()` — that helper says "nobody wrote this yet", which was true in Round 19
  and is not true now. It was written, run, and measured wrong, and the message says so.
- **`CoolingDegreeDayValue.sourceRef` is now required and non-optional**, carrying the
  station id or the exact filename a value was read from. Round 19b's binding rule: a CDD
  figure with no attributable instrument is not publishable, and the type enforces it before
  any fetcher exists to violate it.
- **The `source` citation points at the normals product**, not the data service that has been
  proven not to answer for us. A dataset file should not cite an endpoint we know rejects us.
- **`scripts/replays/climateunit.ts` rewritten.** Its 28 Round 19 assertions all exercised
  the falsified mechanism; a green test over a falsified mechanism is worse than no test. It
  now guards the opposite invariant — **21 assertions** that no request is issued, that the
  refusal names the measurement rather than shrugging, that no generated file carries a
  `coolingDegreeDaysF` value or an unmarked row, and that the feed is still outside
  `INDEX_DATASETS`. It is the regression guard against re-shipping the 400.
- **The Round 19 audit is corrected in place**, banner at the top, §2 marked falsified, and
  the multiplier paragraph superseded with what was actually measured — the Round 16b
  precedent for a finding that turns out to be wrong.

### Kept from Round 19, because the dispatch did not touch them

Both defect fixes stand and are unaffected: the fabricated `{normalHighF, normalLowF}` row
is still tagged `seed: true` so it retires rather than surviving into a live dataset, and
`runIngestion` still takes `source` from the fetcher so `noaa-storm-events` self-corrects its
stale `ncdc.noaa.gov` citation. The 75-day freshness window and the two registry entries also
stand.

---

## 6. Verification

- `npm run check` — 187 files, **0 errors, 0 warnings, 0 hints**.
- `npm run build` — clean. `npm run verify-content` — passes.
- **Byte-identical output.** Every build artefact under `dist/client` — all 267 HTML pages,
  the six service pages and `/tools/plumbing-triage/` among them — hashes identically before
  and after. Verified by building at `fd30bca`, building with the change, and diffing a full
  `sha256sum` manifest.
- **Home Stress Index unchanged for both metros**, proven the same way:
  `dist/client/data/stress-index/austin.json` and `san-antonio.json` are byte-identical, and
  `noaa-climate` remains absent from `INDEX_DATASETS` (asserted by `climateunit.ts`).
- Full cold-start replay suite green — results in the round summary.

---

## 7. Open items

1. **Dispatch `TEMP (Round 19b): normals station mapping + CSV layout`.** Nothing about the
   normals path should be treated as known until its log is read. The fetcher is written in
   the round *after* that, not before.
2. ~~**If section 4 reports no CDD column in the normals files**, (b) is dead too and the
   choice returns to (a) — for which section 3 will already have captured `search/v1`'s
   response shape.~~ **Superseded.** Section 4 did report no CDD column, but off the wrong
   station tier, so it establishes nothing about the product. The fallback reasoning was wrong
   a second way too: `search/v1`'s bounding-box path returned 400, while
   `ghcnd-stations.txt` — not `search/v1` — is what approach (a) actually needs. See
   `round-19c-usw-normals.md` §4.
3. **AC Lifespan's label is decided** (§4): THI analysis, both sources cited, point-versus-
   area caveat in the reading. Worth confirming before the reading is designed.
4. **Both TEMP probe steps are deletable together** once the mechanism is settled — one
   `git rm` of `.github/workflows/noaa-climate-probe.yml`.
5. Round 19's remaining open items are unchanged: the two below-hero "omitted reading"
   statements, `data-sources.yaml` still `status: stub` (both still accurate, and now for
   longer), and four unflagged legacy seed rows in other stub datasets.
