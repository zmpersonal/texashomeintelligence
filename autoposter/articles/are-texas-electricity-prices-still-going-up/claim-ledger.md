# Claim ledger — Are Texas electricity prices still going up?

The unit of verification is the claim, not the article. `data` traces to the feed; `derived` is arithmetic on feed figures with its working shown; `official` is a dated published source; `external` may never be stated and survives only hedged.

| # | tier | claim | figure | source | as of | derivation |
|---|---|---|---|---|---|---|
| C1 | `data` | Texas residential electricity averaged 13.88 cents per kilowatt-hour in August 2026. | 13.88 cents per kilowatt-hour | U.S. Energy Information Administration | 2026-08-01 | — |
| C2 | `derived` | That is lower than a year earlier, not higher. | down 10.2% year over year | U.S. Energy Information Administration | 2026-08-01 | 13.88 (Aug 2026) vs 15.46 (Aug 2025) = -10.2% |
| C3 | `derived` | It is also well below this cycle's peak. | down 18.3% from the peak | U.S. Energy Information Administration | 2026-08-01 | 13.88 (Aug 2026) vs 16.99 (Apr 2026 peak) = -18.3% |
| C4 | `derived` | Almost the whole decline happened in a single month. | a 17.4% fall in one month | U.S. Energy Information Administration | 2026-08-01 | 16.44 (May 2026) to 13.58 (June 2026) = -17.4% |
| C5 | `data` | Austin recorded 644 cooling degree-days in July 2026. | 644 cooling degree-days | NOAA NCEI Global Summary of the Month | 2026-07-01 | — |
| C5n | `official` | Austin's July normal is 644.8 cooling degree-days. | 644.8 cooling degree-days | NOAA NCEI U.S. Climate Normals 1991-2020 | 1991-2020 | — |
| C5d | `derived` | Austin's July was close to its normal, not unusually mild. | -0.1% against the normal | NOAA NCEI U.S. Climate Normals 1991-2020 | 2026-07-01 | 644 vs 644.8 = -0.1% |
| C8 | `data` | San Antonio recorded 607 cooling degree-days in July 2026. | 607 cooling degree-days | NOAA NCEI Global Summary of the Month | 2026-07-01 | — |
| C8n | `official` | San Antonio's July normal is 643.3 cooling degree-days. | 643.3 cooling degree-days | NOAA NCEI U.S. Climate Normals 1991-2020 | 1991-2020 | — |
| C8d | `derived` | San Antonio's July was close to its normal, not unusually mild. | -5.6% against the normal | NOAA NCEI U.S. Climate Normals 1991-2020 | 2026-07-01 | 607 vs 643.3 = -5.6% |
| C9 | `external` *(hedged)* | We cannot say from the data we hold what caused the step down between May and June 2026… | — | — | — | — |

## Notes

- **C1** — Dataset: EIA Electricity Data (Texas, residential), via THI's ingest.
- **C5n** — A 1991-2020 climate normal is a fixed reference period, not a current reading, so the freshness bound does not apply to it.
- **C8n** — A 1991-2020 climate normal is a fixed reference period, not a current reading, so the freshness bound does not apply to it.
- **C9** — A causal explanation would be the single most repeatable wrong thing in this article. Nothing in THI's feeds measures fuel cost, contract mix, or rate changes, so the cause is named as unknown rather than guessed at.
