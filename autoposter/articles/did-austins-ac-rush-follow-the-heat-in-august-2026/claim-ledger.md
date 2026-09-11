| # | tier | claim | figure | source | as of | derivation |
|---|---|---|---|---|---|---|
| H1 | `data` | Austin issued 1,037 HVAC permits in August 2026. | 1,037 HVAC permits | City of Austin Issued Construction Permits (Socrata) | 2026-08-01 | — |
| H2 | `derived` | HVAC permits fell from July 2026. | down 15% month over month | City of Austin Issued Construction Permits (Socrata) | 2026-08-01 | 1037 (August 2026) vs 1226 (July 2026) = -15% |
| C1 | `data` | Austin recorded 755 cooling degree-days in August 2026. | 755 cooling degree-days | NOAA NCEI Global Summary of the Month | 2026-08-01 | — |
| C2 | `derived` | That is the most cooling demand in the 12 months we hold. | the highest of the last 12 months | NOAA NCEI Global Summary of the Month | 2026-08-01 | 755 ranks 1 of 12 monthly readings held |
| C3 | `derived` | Cooling demand also rose from July 2026. | up 17% month over month | NOAA NCEI Global Summary of the Month | 2026-08-01 | 755 vs 644 = 17% |
| H3 | `data` | Austin issued 1,226 HVAC permits in July 2026. | 1,226 HVAC permits | City of Austin Issued Construction Permits (Socrata) | 2026-08-01 | — |
| HX | `external` *(hedged)* | We cannot say from these two series why they moved apart. A permit is filed days or wee… | — | — | — | — |