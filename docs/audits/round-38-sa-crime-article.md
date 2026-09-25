# Round 38 — one San Antonio crime article

Date: 2026-09-25 · Branch: `claude/thi-v3-round38-sa-crime-article`, from `main` at `639c2e8` —
the Round 37 merge, confirmed with `git merge-base --is-ancestor`.

Added: `site/src/data/analysis/what-does-san-antonios-police-offence-data-cover.md`,
`autoposter/articles/what-does-san-antonios-police-offence-data-cover/claim-ledger.md`.
Changed: `docs/audits/round-37-crime-data-probe.md` (one correction), `docs/v3/BACKLOG.md`.

Published at `/analysis/what-does-san-antonios-police-offence-data-cover/`. Every figure on the
page traces to a ledger claim, verified by string match rather than by reading.

---

## 1 · The source, recorded here once

**This is the authoritative record of the resource URL.** Round 37's audit said it carried one
and did not; that is corrected there, pointing here.

```
https://data.sanantonio.gov/dataset/04991fd6-25aa-47ed-946c-4ea204ab3558/resource/f36bb931-8fb4-481c-83d9-a3589108bb20/download/pubsafedash_offenses.csv
```

- **Retrieved** 2026-09-25T19:03:15Z · **55,002,185 bytes** · sha256
  `1642797a0d4f951009da6a07acdc1638`
- **Licence:** Creative Commons Attribution, per the portal's own field. **No version number** —
  the portal states "Creative Commons Attribution" with the opendefinition `cc-by` URL and names
  no version, so none is claimed.
- **robots.txt:** this path matches no `Disallow` rule. `data.sanantonio.gov` disallows `/api/`
  for `User-agent: *`, so **no `/api/3/action/` call was made** — the correction Round 37 recorded
  against its own probe was carried as a hard constraint. The resource path was the only URL this
  round fetched.

---

## 2 · How the figures were computed

**A temporary Actions workflow, deleted.** The 55 MB of offence rows never entered the
repository: the workflow streamed the CSV in the runner, computed aggregates, and committed a
single 16 KB JSON. `.github/workflows/` holds only the eight pre-existing workflows.

**Over the whole file, never a slice.** Round 37 established that the published CSV is **ordered
by offence category, not by date**, so a head or tail slice cannot establish a date range or a
period count. Every figure here comes from one pass over all 538,978 rows: counts, distinct
counts, per-column blank counts, month buckets and composition, all computed in the same pass.

**Three runs, one of them a failure worth recording.** Pass 1 aggregated the file but kept only
the twelve smallest `Report_Date − DateTime` differences, which established that some are around
1,300 days negative and nothing else — not enough to say what the column is. Pass 2, which added
a proper distribution, **failed**: the percentile expression was written as a nested lambda and
raised. Pass 3 replaced it with a plain function and succeeded.

**What that bought: the `DateTime` column, identified.** Every one of the 538,978 rows carries the
same value, **2026-09-01**, with no time component, later than every report date in the file
(p0 −1,339 days, p50 −720, p100 −1; 100% negative). It is an extract stamp, not an event time.
That is stated in the article as an inference from those measurements, and the ledger says so —
the field's own documentation is a PDF on the portal and this round fetched one URL only.

**It also settled a Round 37 inference.** Monthly publication was inferred there from slice dates.
The extract stamp measures it: pulled 1 September, covering reports through 31 August.

---

## 3 · The candidate, and why the choice was forced

**Chosen: §E candidate 2 — the records piece.** The other two were not available:

- **Candidate 1 is Austin**, out of scope by D7c.
- **Candidate 3, the reporting-lag piece, is not computable for San Antonio.** The file carries
  **no occurrence date** — `Report_Date` is its only event-side date, and `DateTime` is the
  extract stamp above. Round 37's "occurrence dates run back to 2006" is an **Austin** fact and
  does not transfer. A lag cannot be measured from one date.

So the records piece was not preferred over the others; it was the only one the data supports.
It also sits furthest inside the §F framing constraint, being about the record rather than about
any place.

---

## 4 · The framing constraints, and where each is met

| constraint | how it is met |
|---|---|
| Metro-level only | No ZIP, service area, council district or neighbourhood figure appears. The ZIP count (69) and service-area count (7) describe the file's **structure** — how coarse it is — and no ZIP is named or counted. |
| No cross-metro comparison | Austin is not mentioned. |
| No rate per head | No population denominator anywhere. |
| No score, rank or comparison | No index, no ranking, no "vs average". |
| No recommendation line | The article ends on what the file is good for and what it holds no data about. Nothing tells a reader to do anything. |
| Never characterise an area or its people | The one paragraph that could — the yearly decline — carries its refusal in the same breath, per the owner's instruction. |

**The refusal, stated as a reason rather than a disclaimer.** The article gives the yearly totals
and then says the file counts *recorded offences*, so a fall can mean fewer events, fewer reports,
or changed recording practice, and **nothing in these eight columns separates them** — no field
for whether an incident was reported, no reporting-rate measure, no record of classification
changes. That is why the trend question cannot be answered here, and it is ledger claim **C17**,
tier `external`, marked *refused, never stated*.

---

## 5 · Verification

**Figures match the ledger by string comparison, not by reading.** Every number-like token was
extracted from the rendered page, the template's own date chrome and bare years removed, and each
remaining figure checked for a verbatim match in the ledger: **32 distinct figures, 0 missing.**

That check earned its place on the first run. The page carried **8.5%** — the rounded form in the
approved description — while the ledger held only **8.52%**. The ledger now records both forms
against claim C5, because a check that tolerates "close enough" is not a check.

```
npm run build       Complete · 273 pages
npm run check       0 errors, 0 warnings, 0 hints
npm run sweep       27/27 steps
  analysisrender    148 → 176 assertions, all passing
  check-links       0 broken · check-orphans 0 orphans
```

**Round 31b's design held.** `analysisrender` asserts the section's shape per article rather than
pinning a fixed list, so the sixth article was covered by 28 new assertions **with no edit to the
replay** — which is exactly what that round built it for.

**Rendered furniture**, confirmed in the built page: `analysis-dateline`, `analysis-standfirst`,
`analysis-keyfigure` with headline, subhead and provenance, `analysis-sources` with per-source
name and as-of, `analysis-more` related reading. JSON-LD emits Organization, WebSite, **Article**
and BreadcrumbList; the Article block carries headline, description, url, publisher, author,
articleSection, datePublished and dateModified. `/analysis/` lists it first, six articles total.

**The as-of line**, as approved: report dates 1 Jan 2023 – 31 Aug 2026, file extracted
1 Sep 2026, retrieved 25 Sep 2026 — report-date based, and the article says so in its own words.

**One thing deliberately not done:** the source is named without a link. The dataset's human page
is almost certainly `…/dataset/sapd-offenses`, but this round did not fetch it, and the schema's
optional `url` exists so that a source can be named rather than given an invented link.

---

## 6 · What was left behind

Nothing. The temporary workflow is deleted, `tmp/` is gone, and no crime data of any kind is in
the repository — the article's figures live as verified claims in its ledger, which is the same
shape the five articles before it use. There is **no crime ingestion path**, by scope: these
figures were computed once, on a file identified by checksum, and will not update themselves.
