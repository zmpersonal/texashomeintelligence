# What THI's feeds actually support — the honest menu (2026-09-11)

Every dataset THI generates, surveyed for whether a claim-builder could stand on it. The verdict
column is the point: **BUILDABLE** means a rigorous sourced article is possible today,
**THIN** means the data is real but the story it supports is not worth a post, **NOT-YET** means
the honest answer is "we cannot source that well enough."

No gate was adjusted to move anything up a row.

## The feeds

| Dataset | Obs | Span | Verdict | Why |
|---|---|---|---|---|
| `municipal-permits` → `permit_activity_*` | 1,970 / 5,223 raw → 12 monthly per trade | Sep 2025 – Aug 2026 | **BUILDABLE** | 12 complete months, 5 trades in Austin, 7 in San Antonio, each with its own baseline. Bound 1,440h, fresh. |
| `noaa-climate` (CDD + 1991-2020 normals) | 12 monthly + 12 normals per metro | Sep 2025 – Aug 2026 | **BUILDABLE** | Actuals AND a fixed reference period. A normal is what turns "it was hot" into a checkable claim. Bound 2,160h. |
| `eia-electricity` | 13 monthly | Aug 2025 – Aug 2026 | **BUILDABLE** | Already carried post #1. 13 points is enough for a seasonal argument. Bound 2,160h. |
| `usdm-drought` (metro anchor) | 56 weekly per metro | Aug 2025 – Sep 2026 | **BUILDABLE** | The longest series held. Anchored to one county per metro (Travis, Bexar) — an article must say so. Bound 336h; latest reading 3 days old. |
| `usdm-drought` (county grain) | **3 weekly per county** | Aug – Sep 2026 | **NOT-YET** | Only Travis/Williamson/Hays and Bexar/Comal/Guadalupe carry county fields, and only for 3 weeks. Below the 4-week floor. This is exactly the parked-reels condition; it clears around 2026-09-29, not 09-22. |
| `noaa-storm-events` | 65 / 63 | Oct 2025 – **May 2026** | **NOT-YET** | Rich (19 hail events in Austin, 32 wind, 13 flood) and directly relevant to roofing. Two blockers: the last event is ~3.5 months old and I cannot tell publication lag from genuine absence without checking NOAA's release schedule; and there is no staleness bound for it, which G5 default-denies. Both are answerable — this is the best NOT-YET on the list. |
| `airnow` (AQI) | 30 / 31 | Jul – Sep 2026 | **THIN** | Aggregates to 2 monthly points, below the 4-point floor; weekly grain would give ~10. But every measured day was Good or Moderate, range 29–87. "Nothing happened, twice" is a true story and a dull one. |
| `census-acs` | 2 / 1 | 2023, 2026 | **THIN** | Useful as a REFERENCE value (Austin's median home is 34 years old, 58% owner-occupied). Not a trend: the two Austin points move median home age 29 → 34 in three years, which is more than time alone explains, so the basis may differ between vintages. Good context inside another article; no article of its own. |
| `bls` (trade wages) | 1 per metro | Jan 2025 | **THIN** | One trade (plumbers), one vintage, 20 months old. A legitimate cost source — unlike permits, which CLAUDE.md bars from any cost reading — but one figure is not a story. |
| `nws-api` (forecast) | 33 | Jul – Sep 2026 | **NOT-YET** | Forecasts, not observations. THI's shape is sourced history; a forecast piece goes stale in hours and is a different editorial product. |
| `austin-water-stage` | 13 daily | Aug 30 – Sep 11 2026 | **NOT-YET** | 13 days, one city. Needs ~4+ weeks before any trend claim. Worth re-checking in October. |
| `swdi-nx3hail` | 222 / 135 | Aug 10–29 2026 | **NOT-YET** | Radar hail cells over a 20-day window. No seasonal baseline to compare against yet. |
| `usda-soil` | 2 / 1 | Sep 2026 | **THIN** | Static reference (soil type, drainage class). Context, never a trend. |
| `arr-collection-schedule` | 1 | Sep 2026 | **NOT-YET** | Ingest metadata (row counts, fingerprint), not a homeowner metric. |
| `ercot`, `fema-nfhl`, `tdi-losses`, `tx-forest-service` | 1 each | — | **NOT-YET** | `status: sample`. CLAUDE.md: sample is never presented as fact. Not a data problem, a provenance one. |

## The topics that stay dead, and why

These carry the highest reader interest in `article_topics.yaml` and remain unbuildable. Naming
them is the discipline — the temptation is always to reach.

| Topic | Interest | Missing | Honest verdict |
|---|---|---|---|
| `property-tax-worst-in-texas` | 1.00 | `appraisal_change` — no feed | **NOT-YET.** The highest-interest topic THI has. TCAD has a probe workflow; nothing generates a series. |
| `cheaper-to-own-round-rock` | 0.85 | `cost_to_own` | **NOT-YET.** Needs tax + insurance + price, none of which exist as a series. |
| `austin-water-bills-fastest` | 0.75 | `water_bill_index` | **NOT-YET.** `austin-water-stage` is a restriction stage, not a bill. |
| `insurance-follows-hail` | 0.70 | `insurance_trend` (marked unavailable) + `hail_window` | **NOT-YET.** `tdi-losses` is `sample`. The hail half exists; the insurance half does not. |
| `sa-grid-less-reliable` | 0.70 | `grid_stress` | **NOT-YET.** `ercot` is `sample`, one observation. |
| `crime-by-area` | 0.95 | `crime_rate` + gated | **GATED, and stays gated.** Not a data question. |

---

# Step 2 — the priority order

Ranked as instructed: data reliability, then reader interest, then brand safety, then cadence
value. **Cadence value is the tiebreaker that matters most** — a builder that can write a fresh
angle each month is worth more than one that fires once.

| # | Builder | Reliability | Interest | Recurs? | Cadence value |
|---|---|---|---|---|---|
| 1 | `summer-hotter-than-normal` | 12 actuals + fixed normals | med | **monthly** | **High** — every new month is a new reading against a fixed normal. Runs indefinitely. |
| 2 | `austin-ac-rush-vs-the-heat` | two 12-month series, same months | high | **monthly** | **High** — the relationship is re-checkable every month. |
| 3 | `san-antonio-improvement-boom` | 7 trades × 12 months | med-high | **monthly** | **High** — mirrors article 2 for the other metro. |
| 4 | `texas-power-most-expensive-month` | 13 months, one clean series | high | seasonal | **Medium** — the seasonal argument refreshes but slowly. |
| 5 | `texas-drought-direction` | 56 weekly, longest held | med | **weekly** | **Medium** — flat for 12 weeks, so it recurs but often has nothing new to say. |
| 6 | `austin-roofing-season` | 12 months, clear shape | med | annual | **Low** — genuinely useful, but the seasonal shape is the same story next month. |
| 7 | `austin-busiest-trade` | 5 trades, own baselines | med | **monthly** | **Medium** — ranking within one city; refreshes monthly but overlaps #3. |
| 8 | `san-antonio-tree-permits` | 12 months, at series max | low-med | monthly | **Low** — a real local signal, narrow audience, and needs careful framing (filings, not trees). |

**Recommended build order: 1, 2, 3.** All three recur monthly, so three builders buy real
cadence rather than three one-shots. 4 and 5 next as variety. 6–8 only if cadence demands it.

**Not building:** everything in the NOT-YET table. `noaa-storm-events` is the one worth
unblocking, and unblocking it is two specific tasks — confirm NOAA's publication lag, then set a
staleness bound that reflects it — not a builder.
