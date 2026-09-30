# Claim ledger — What does San Antonio's police offence data actually cover?

The unit of verification is the claim, not the article. `data` traces to the feed; `derived` is arithmetic on feed figures with its working shown; `official` is a dated published source; `external` may never be stated and survives only hedged.

**The file this ledger verifies against.** City of San Antonio, SAPD Offenses, retrieved 2026-09-25T19:03:15Z from
`https://data.sanantonio.gov/dataset/04991fd6-25aa-47ed-946c-4ea204ab3558/resource/f36bb931-8fb4-481c-83d9-a3589108bb20/download/pubsafedash_offenses.csv`
— 55,002,185 bytes, sha256 `1642797a0d4f951009da6a07acdc1638`. Every figure below was computed in one pass over all 538,978 rows, not over a sample.

| # | tier | claim | figure | source | as of | derivation |
|---|---|---|---|---|---|---|
| C1 | `data` | The file holds 538,978 offence records. | 538,978 records | City of San Antonio — SAPD Offenses | 2026-08-31 | row count over the complete file |
| C2 | `data` | Report dates run from 1 January 2023 to 31 August 2026. | 2023-01-01 – 2026-08-31 | City of San Antonio — SAPD Offenses | 2026-08-31 | min and max of `Report_Date` |
| C3 | `derived` | That is 44 complete months. | 44 months | City of San Antonio — SAPD Offenses | 2026-08-31 | 2023-01 to 2026-08 inclusive; August 2026 holds 11,302 rows, inside its neighbours' range of 10,950–11,554, so the final month is not partial |
| C4 | `data` | No column holds a blank value on any row. | 0 blanks, 8 columns | City of San Antonio — SAPD Offenses | 2026-08-31 | per-column count of empty, `NULL`, `null` and `N/A` over all rows: zero in each |
| C5 | `derived` | 8.52% of rows share a report ID with at least one other row. | 45,926 rows, 8.52% (stated as 8.5% in the description and 8.52% in the body) | City of San Antonio — SAPD Offenses | 2026-08-31 | 538,978 rows − 493,052 distinct `Report_ID` = 45,926; 45,926 ÷ 538,978 = 8.52% |
| C6 | `data` | The file carries 493,052 distinct report IDs. | 493,052 | City of San Antonio — SAPD Offenses | 2026-08-31 | distinct count of `Report_ID` |
| C7 | `data` | The finest geography is the ZIP code: 69 of them, and 7 service areas. | 69 ZIPs, 7 service areas | City of San Antonio — SAPD Offenses | 2026-08-31 | distinct counts of `Zip_Code` and `Service_Area`; the column list carries no address, block or coordinate field |
| C8 | `derived` | Offences against property are 69.4% of the file. | 374,232 = 69.4% | City of San Antonio — SAPD Offenses | 2026-08-31 | 374,232 ÷ 538,978 = 69.43% |
| C9 | `derived` | Offences against a person are 21.3%. | 114,968 = 21.3% | City of San Antonio — SAPD Offenses | 2026-08-31 | 114,968 ÷ 538,978 = 21.33% |
| C10 | `derived` | Offences against society are 9.2%. | 49,778 = 9.2% | City of San Antonio — SAPD Offenses | 2026-08-31 | 49,778 ÷ 538,978 = 9.23% |
| C11 | `data` | There are 49 offence names and 24 offence groups. | 49 names, 24 groups | City of San Antonio — SAPD Offenses | 2026-08-31 | distinct counts of `NIBRS_Code_Name` and `NIBRS_Group` |
| C12 | `derived` | Larceny and theft is the largest group, a third of everything recorded. | 180,014 = 33.4% | City of San Antonio — SAPD Offenses | 2026-08-31 | 180,014 ÷ 538,978 = 33.40% |
| C13 | `data` | Every row carries the same `DateTime` value, 1 September 2026, later than every report date in the file. | 2026-09-01, 1 distinct value | City of San Antonio — SAPD Offenses | 2026-08-31 | distinct count of `DateTime` = 1; the difference `Report_Date − DateTime` is negative on 100% of rows (p0 −1,339 days, p50 −720, p100 −1) |
| C14 | `data` | Recorded offences by year: 159,575 · 153,882 · 136,703 · 88,818. | see figure | City of San Antonio — SAPD Offenses | 2026-08-31 | rows bucketed by `Report_Date` year; 2026 covers 8 months to 31 August |
| C15 | `derived` | Per-month rates by year: 13,298 · 12,824 · 11,392 · 11,102. | see figure | City of San Antonio — SAPD Offenses | 2026-08-31 | each year's total ÷ its month count: 159,575÷12, 153,882÷12, 136,703÷12, 88,818÷8 |
| C16 | `derived` | The average across the whole file is 12,250 offences recorded per month. | 12,250 per month | City of San Antonio — SAPD Offenses | 2026-08-31 | 538,978 ÷ 44 = 12,249.5 |
| C17 | `external` *(refused, never stated)* | Whether the decline in recorded offences means crime fell. | — | — | — | Stated in the article as unanswerable **with the reason**: the file counts recorded offences, so a fall can mean fewer events, fewer reports, or changed recording practice, and no column separates them |

## Notes

- **C3** — "Complete" is established from the shape of the final month rather than asserted. A partial month would sit well below its neighbours; August 2026 does not.
- **C5** — Two forms of the same figure appear: **8.5%** in the page description and **8.52%** in the body. Both are this claim; the rounded form is recorded here so a figure-to-ledger check matches the page verbatim rather than only its precise form.
- **C5 / C6** — The article states this as *a row is an offence, not a report*. The explanation given is what a repeated report ID means in this file, inferred from the file. It deliberately does **not** assert a rule about how NIBRS works, which would be an unsourced claim about a standard rather than a measurement of this data.
- **C13** — Named as an extract stamp on the evidence: one distinct value, no time component, and later than every report date. The field's own documentation was not consulted — it is a PDF on the portal, and this round fetched one URL only.
- **C14–C16** — Report dates, not occurrence dates. The file publishes no occurrence date at all, which is why no claim here describes when anything happened.
- **C17** — The refusal is the finding, not a disclaimer. It is stated in the same breath as the numbers it qualifies, and it names the three things the count cannot separate.
- **Method** — The published CSV is ordered by offence category, not by date, so a head or tail slice cannot establish a date range or a period count. Round 37 recorded that trap; every figure here comes from a pass over the complete file.
