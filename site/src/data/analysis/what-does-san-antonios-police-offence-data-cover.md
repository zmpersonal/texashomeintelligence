---
title: "What does San Antonio's police offence data actually cover?"
description: "San Antonio publishes 538,978 offence records covering January 2023 to August 2026. Eight columns, no blanks, no address, and 8.5% of rows share a report ID with another — a row is an offence, not a report. What the file contains, measured against the file itself."
publishedAt: "2026-09-25"
published: true
metrics:
  - sapd_offences_recorded
sources:
  - name: "City of San Antonio — SAPD Offenses"
    asOf: "2026-08-31"
card:
  question: "What does San Antonio's police offence data actually cover?"
  headline: "538,978 records"
  subhead: "44 months, 8 columns, no address"
  source: "City of San Antonio"
  asOf: "Aug 2026"
---

## The short answer

**Three and a half years of recorded offences, at ZIP-code level, with no address and no map
coordinate.** San Antonio publishes 538,978 offence records covering report dates from 1 January
2023 to 31 August 2026 — 44 complete months — in a file of eight columns with no blank value in
any of them (City of San Antonio — SAPD Offenses, as of 31 August 2026).

That is a more complete public record than many cities publish, and it is narrower than most
people expect. Both halves are worth knowing before anyone quotes a number from it.

## A row is an offence, not a report

The file's 538,978 rows carry 493,052 distinct report IDs. **45,926 rows — 8.52% — share a report
ID with at least one other row** (City of San Antonio — SAPD Offenses, as of 31 August 2026).

The file lists offences rather than reports, which is what a repeated report ID means: one report
recorded more than one offence. It matters because the two counts are not interchangeable. Counting rows answers
"how many offences were recorded"; counting distinct report IDs answers "how many reports were
filed". A figure quoted from this file without saying which one it is will be wrong by roughly
one in twelve.

## What is in a row

Eight columns, and every one of them populated on every row:

| column | what it holds |
|---|---|
| `Report_ID` | the report a row belongs to — repeats across rows |
| `Report_Date` | the date the report was filed |
| `NIBRS_Code_Name` | the offence, one of 49 names |
| `NIBRS_Crime_Against` | person, property or society |
| `NIBRS_Group` | the offence group, one of 24 |
| `Service_Area` | one of 7 SAPD service areas |
| `Zip_Code` | one of 69 ZIP codes |
| `DateTime` | the same value on every row — see below |

The composition across the whole file: **374,232 offences against property (69.4%), 114,968
against a person (21.3%), and 49,778 against society (9.2%)**. The largest single group is
larceny and theft at 180,014 offences, a third of everything recorded
(City of San Antonio — SAPD Offenses, as of 31 August 2026).

## The dates are report dates, and there is only one kind

**`Report_Date` is when a report was filed. The file carries no date for when anything
happened.** There is no occurrence timestamp, so nothing here supports a statement about when an
offence took place, how long afterwards it was reported, or how a given week compared with the
week it describes rather than the week it was filed in.

The `DateTime` column looks at first like it might be that missing field. It is not. **Every one
of the 538,978 rows carries the same value — 1 September 2026 — which is later than every report
date in the file.** That is an extract stamp: the moment the file was generated. It tells you the
data was pulled on 1 September covering reports through 31 August, which is useful for knowing
how current the file is, and tells you nothing about any individual offence.

## What it does not locate

**The finest geography in the file is the ZIP code.** There is no street address, no block, no
latitude and longitude, no council district and no neighbourhood. A row says an offence was
recorded somewhere in one of 69 ZIP codes, and one of 7 service areas, and that is the end of it.

A ZIP code in San Antonio holds tens of thousands of people. Anything finer than that — a street,
a block, a home — is not in this file and cannot be derived from it.

## How many per month, and why that does not answer the question people ask

Recorded offences by year, on report dates:

| year | offences recorded | months | per month |
|---|---|---|---|
| 2023 | 159,575 | 12 | 13,298 |
| 2024 | 153,882 | 12 | 12,824 |
| 2025 | 136,703 | 12 | 11,392 |
| 2026 | 88,818 | 8 (to 31 Aug) | 11,102 |

Across all 44 months the average is 12,250 offences recorded per month.

The obvious next question is whether that decline means San Antonio has less crime. **This file
cannot answer it, and the reason is structural rather than a caveat.** The file counts *recorded
offences* — things reported to police and written down. A fall in that count can mean fewer
events happened, or that fewer of them were reported, or that recording practice changed. Those
are three different things and **nothing in these eight columns separates them.** There is no
field for whether an incident was reported, no measure of reporting rates, and no record of
changes to how offences are classified or counted. Reading a trend in recorded offences as a
trend in crime requires evidence this file does not contain.

## What this file is good for

It is a clean, complete, well-formed public record of what San Antonio police wrote down, by
month, by offence type, and by ZIP. It is current to within about a month. Every column is
populated. For questions of the form "how many offences of this type were recorded in this
period", it answers directly and the answer is checkable.

For questions about a street, a block, a specific address, or about when offences happened rather
than when they were filed, it holds no data at all — and no amount of processing will produce
what was never published.

## Sources

The figures on this page were computed once, on 25 September 2026, over the complete file rather
than a sample. That distinction matters here: the published CSV is ordered by offence category,
not by date, so a first-or-last slice of it cannot establish a date range or a period count. Every
figure above comes from a pass over all 538,978 rows.
