# Round 47 — the fetch window, so an upstream revision can be reached

Date: 2026-10-11 · Branch: `claude/thi-plan-review-m40n0x`, from `origin/main` at `f2b87ec`.

**The defect (Round 46 F2).** `computeFetchWindow` set the incremental `since` to the **newest**
observation's `observedAt`. So a revision to anything older was never re-requested;
`mergeObservations`' replace-by-key could only ever fire for one record; and a series could never
grow backwards. `/data/texas/electricity-prices/` told readers in rendered copy that "the newest
one or two figures can move". Only the newest could.

**The fix.** `src/ingest/fetchWindows.ts` answers one question per dataset — *how far back can
this source still change a record we have stored?* — with the reason on every entry. `since` is
now `now − revisitDays(datasetId)`, and deliberately **not** `max(revisitSince, newestObserved)`:
taking the later of the two is what produced the defect, because the newest record is always later.

---

## 1 · Did the drift probe's question change? No

Round 47's probe answered this before any code changed: **no published figure had drifted.**
`eia-electricity` 12 of 12 identical to EIA today, `noaa-storm-events` 88 and 94 identical,
`permit-trade-activity` 0 changed on every `trades-v2` row, `bls` and `census-acs` 0 changed. The
window defect was real and had **not yet produced a wrong number**, which is why it was sequenced
as a fix rather than an emergency.

## 2 · What the window change actually moved

Measured by re-running the real pipeline under the new windows and diffing the committed spans.

| dataset | before | after |
|---|---|---|
| **`eia-electricity/texas`** | 12 months, 2025-08 … 2026-07 | **24 months, 2024-08 … 2026-07** |
| `census-acs/*` (4 files) | 1 row, 2024 vintage | **2 rows, 2023 + 2024** — reached back and recovered a vintage |
| `noaa-storm-events/san-antonio` | frozen at `since` 2026-06-20 | 94 rows across 9 months |
| `municipal-permits/austin` | 2,089 | 2,145 |
| `noaa-climate/*` | — | 25 rows, 2020-01 … 2026-09 |

## 3 · The first value was wrong, and the way it was wrong is the lesson

`eia-electricity` was first set to **400 days** on the reasoning "year-over-year needs thirteen
months". **It changed nothing.** 400 days before 2026-10-11 is 2025-09-06, so the fetcher's
`start=2025-09` was *later than the 2025-08 row already on disk* — which survived only because
merging never deletes.

The requirement was never thirteen months. It is **thirteen months before the newest published
month**, and this series runs ~3 months behind real time, so the reach is **fifteen** months from
today — and it widens whenever the EIA's publication lag does. 800 days absorbs the lag rather
than tracking it.

Recorded as a standing rule in the backlog: *a tuned number says what it is compensating for.* An
entry encoding a requirement relative to a moving upstream lag states the arithmetic — requirement,
lag, product — rather than leaving a figure a later reader trims as arbitrary.

## 4 · One number, three readers

`swdiHail` clamps every request to 31 days (SWDI's documented 744-hour ceiling). That constant was
held privately in the fetcher while the drift probe carried **its own copy** and the window set a
third width. It is now `SWDI_MAX_WINDOW_DAYS`, exported once and read by all three, and
`REVISIT_DAYS["swdi-nx3hail"]` **is** that constant — so the request asks for exactly what the
clamp allows instead of over-asking and being silently clamped.

## 5 · Cost, measured — and the limit of the measurement

| run | window | wall time |
|---|---|---|
| drift probe `36934653632` | every feed's full held history | **73 s** |
| ingestion `38152104258` | the old incremental window | **37 s** |

Worst case ≈ **2× wall time**, and every configured value is narrower than that worst case.

**This measurement covers wall time and success only.** It does **not** measure per-feed request
counts against each source's rate limits, and nothing here should be read as evidence about those.
The two heavy feeds (Austin 47,110 rows, San Antonio 91,284) already fetched their full window
every run under Round 45's recount, so they contribute no marginal cost.

## 6 · The autoposter halt, fixed as a side effect

The cadence workflow had failed **18 consecutive days** (last success run #27, 2026-09-23). Nine
tests in `test_posting_path.py` raised:

> `LedgerHalt: the price series does not reach 2025-07, so the year-over-year comparison this
> article is built on cannot be made for July 2026.`

A twelve-month series can never support year-over-year on its newest month. **Round 45's purge of
the fabricated rows was the proximate trigger** — those rows had padded the series to thirteen
months, which made the year-ago lookup resolve. Removing them correctly exposed a defect that was
always there.

With the series at 24 months: **`test_posting_path` 9/9 passed.** No editorial decision was needed,
so neither the YoY claim nor the period selection was touched.

## 7 · Two mistakes of mine, recorded because the second nearly shipped

**A complete ingestion was lost to a push race.** The first 800-day run fetched everything,
committed it, and was rejected non-fast-forward because a commit landed on the branch from the
session while the job ran. The data went away with the runner. The workflow now rebases before
pushing. Cheap to recover, but it would not have been if the run had been expensive or the source
rate-limited.

**A 178-mile distance was caught only because it was absurd on its face.** The AirNow probe joined
AirNow's monitoring-site table with `line.includes(siteId)`; a nine-digit AQS id occurs inside
other fields of a 3.2 MB file, so the first matching *line* was the wrong site's. It reported "San
Antonio Northwest C23" — a Bexar County monitor — at **178.1 mi** from downtown San Antonio. Pass 2
matched on an exact field: **9.9 mi**.

The number was rejected because it was ridiculous, not because anything checked it. **A
wrong-but-plausible distance — 23 miles instead of 9.9 — would have been reported as measured fact
and used to decide whether a reading is local enough to publish.** That is the same class as Round
44's circular precision measurement, and the only defence that would have worked is the one not
built: a control with a known answer.

---

## Verification

| Check | Result |
|---|---|
| `npm run check` | 0 errors, 0 warnings, 0 hints |
| `npm run sweep` | **33/33** |
| drift probe, before any change | no figure had drifted on any revisable feed |
| re-ingestion under the new windows | 31 datasets, 25 live / 2 stale / 0 error |
| `eia-electricity` span | 12 months → **24**, reaches 2025-07 |
| `test_posting_path.py` | 0/9 → **9/9** |

## Still open after this round

- **AirNow is retired, not failing.** `/aq/observation/zipCode/current/` returns 410 with
  *"This web service has been retired as of October 1, 2026"*; the replacement
  `/aq/observation/current/ziplatlong/` returns 200 on the same key. Whether `nowcastAQI` is the
  same quantity as the `AQI` we published is the owner's decision and is not settled here.
- **The 50-mile lookup boundary cannot be constrained.** Five candidate parameters
  (`distance`, `radius`, `maxDistance`, `lookupBoundary`, `miles`) all return
  `lookupBoundary: 50 Miles`. **Owner ruling, 2026-10-11:** label every AQI reading with its
  measured distance, always, the way New Braunfels labels its 5.2 mi station, and **withhold above
  25 miles** — the radius we asked for and cannot enforce, enforced on our side instead. All six
  readings pass today (Austin 1.8 / 6.1 / 1.8 mi; San Antonio 5.2 / 9.9 / 15.3 mi); the point is
  that tomorrow's might not.
- **The autoposter's cadence is still red** on three causes unrelated to the window, now its own
  round.
- `noaa-climate-probe.yml` stays until this round lands, then goes, with `swdiHail.ts:143`
  repointed at the audit rather than the workflow.
