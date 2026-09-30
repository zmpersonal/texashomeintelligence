# Round 39 — metro expansion probe

Date: 2026-09-30 · Branch: `claude/thi-v3-round39-metro-probe`, from `main` at `b144db3` —
the Round 38 merge, confirmed with `git merge-base`.

Added: this file. Changed: `docs/v3/BACKLOG.md`.
**Nothing was built. No metro was added. No bulk data landed in the repo.**

Measured through a temporary GitHub Actions workflow (`.github/workflows/tmp-metro-probe.yml`),
because no host is reachable from a Claude Code session. **That workflow and its
`tmp/metro/` output are deleted** — see §8.

---

## 0 · What adding a metro costs today

Answering this first, because it is half the decision. Counted by reading the code, not
estimated.

**Generates automatically from config — no per-metro work at all:**

| Surface | Driven by |
|---|---|
| `/{metro}/` hub page | `getStaticPaths` over the `locations` collection |
| `/{metro}/{service}/` — every service page | same |
| `/dashboard/{zip}/` for every new ZIP | the ZIP crosswalk CSV |
| `/data/{metro}/` hub, `/data/` catalog entry, the CSV endpoints | the data-page registry |
| Sitemap, `llms.txt`, internal cross-links | derived from the above |

**Hand edits, in order. This is the real bill:**

1. **`site/src/data/zip-area-crosswalk.csv`** — new rows. The committed file is the Census 2020
   ZCTA-to-County Relationship File *filtered to the Austin and San Antonio MSAs only*, supplied
   by the owner and retrieved 2026-08-29. A new metro needs its MSA's rows cut from the same
   source file. **This is an owner seam, not something to synthesise** — a ZIP absent from the
   file correctly returns "not covered yet", and a guessed row would be a fabricated coverage
   claim.
2. **`site/src/data/zip-areas.ts`** — one `ZIP_AREAS` entry: `primaryCounty`, `droughtCounties`,
   `stormCounties`, metro centroid `point`.
3. **Eight fetchers carry a hardcoded `"austin" | "san-antonio"` union type** that must be
   widened. Three of them need nothing else, because they already derive from `ZIP_AREAS`:

   | Fetcher | Widen union | Also needs a lookup row |
   |---|---|---|
   | `usdm.ts` (drought) | ✔ | — (counties come from `ingestCounties`) |
   | `noaaClimate.ts` (cooling degree days) | ✔ | — (station resolves from the centroid) |
   | `swdiHail.ts` (radar hail) | ✔ | — (point from `ZIP_AREAS`) |
   | `noaaStormEvents.ts` | ✔ | `COUNTIES_BY_LOCATION` — county-name set |
   | `airnow.ts` (air quality) | ✔ | `ZIP_BY_LOCATION` — one downtown ZIP |
   | `censusAcs.ts` | ✔ | `COUNTY_FIPS` |
   | `blsWages.ts` | ✔ | `CBSA` code |
   | `usdaSoil.ts` | ✔ | `REPRESENTATIVE_POINT` |

4. **A new permits fetcher — code, not config.** `austinPermits.ts` (Socrata SODA) and
   `sanAntonioPermits.ts` (CKAN CSV) are bespoke per city, each with hardcoded column
   resolution for that city's header quirks. There is no generic permit fetcher to configure.
5. **`site/src/ingest/registry.ts`** — ~10 import and `entry(...)` lines.
6. **`permitTradeActivity.ts` + `tradeCategories.ts`** — the metro's own permit-type strings have
   to be mapped into THI's trade categories. Austin and San Antonio needed different mechanisms
   (`permit-type` vs `description-text`); a third metro is a third mapping.
7. **`site/src/data/locations/{metro}.yaml`** — 8 lines. Genuinely config.
8. **`site/src/lib/dataPages/`** — `drought.ts` and `permits.ts` each export one spec per metro;
   a storms spec if the metro gets one.
9. **`site/src/lib/stressIndex/signals.ts`** — one `PRIMARY_FIPS` row.
10. **`site/src/components/Nav.astro`** — the Locations dropdown, plus the literal eyebrow string
    `"Austin & San Antonio • more Texas metros coming soon"`.
11. **`site/src/data/acLifespan.ts`, `roofScan.ts`, `src/components/ZipPicker.astro`** — each holds
    its own metro option list.

**One landmine, worth fixing before any metro is added.** `site/src/lib/account/alerts.ts:134`:

```ts
function areaLabel(areaId: string): string {
  return areaId === "san-antonio" ? "San Antonio" : "Austin";
}
```

A third metro does not fail here — it is **silently labelled "Austin"** in account alerts. It
typechecks, it builds, and it is wrong. Flagged under Rule 1; not changed in this round.

**Summary:** a metro is roughly **15 files, one of them an owner-supplied data file, and one
genuinely new fetcher.** It is not config-only, and the claim "adding a metro = config" in
CLAUDE.md holds for *pages* but not for *feeds*.

---

## A · PERMITS — per metro

### Houston — no compliant machine-readable access

`data.houstontx.gov` is a CKAN portal. Its `robots.txt` (HTTP 200, 79 rules in the
`User-agent: *` group) contains, verbatim:

```
Disallow: /datastore/*
Disallow: /api/
```

Those are CKAN's two machine-readable routes. The probe's robots guard **refused the request
rather than making it** — `SKIPPED_BY_ROBOTS`, recorded in the log, no fetch attempted.

Houston was then given the same second look that turned Fort Worth viable: three candidate
ArcGIS Hub hostnames (`cohgis-mycity.opendata.arcgis.com`, `mycity.maps.arcgis.com`,
`houston-hub-coh.hub.arcgis.com`). All three returned **404** on the DCAT feed. Past that point
I would have been guessing hostnames, so Houston stops there.

**No workaround was attempted and none should be.** If Houston matters, the route is an
approach to the city, not a crawler.

### Dallas — publishes building permits only as closed historical snapshots

`www.dallasopendata.com` is Socrata and its robots permits `/resource/` and `/api/views/`
(only `/api/odata/` and `/api/collocate*` are disallowed), so this was measured properly.

`e7gq-4sah` "Building Permits" — **126,840 rows**, 11 columns
(`permit_number, permit_type, issued_date, mapsco, contractor, value, area, work_description,
land_use, street_address, zip_code`), **licence: `null`**.

Its metadata is self-contradictory: `rowsUpdatedAt = 1598778914` (**2020-08-30**) while the same
block claims `"Update Frequency": "Daily"` and `"Automated Updates": "Yes"`. So I asked the data
instead of the metadata. Counting rows by year:

| Year | Rows |
|---|---|
| 2019 | 52,037 |
| 2020 | 27,459 |
| 2021–2026 | **0 each** |

**The dataset stops in 2020.** (`issued_date` is a *text* column holding `"12/31/19"`, which is
why `date_trunc_ym` returns HTTP 400 and why `max()`/`min()` on it sort lexicographically rather
than chronologically — see §7, that nearly became a false finding.)

Dallas was then asked what else it publishes, scoped to its own domain. Every currently-updating
permit dataset on `www.dallasopendata.com` is **right-of-way permits** (`ROW Permits - Lines`,
`ROW Permits - Points`, updated 2026-09-20) — street-cut and utility work, not homeowner
construction. Every *building* permit dataset is closed: `Permit Points` last updated
**2018-02-09**; `Building Permits for Fiscal Year 2011-2012 / 2013-2014 / 2015-2016 /
2017-2018` are labelled archives.

### Fort Worth — a live, well-structured feed. The one clear win.

The dataset id and CC BY 4.0 licence that a cross-domain Socrata search attached to Fort Worth in
the first pass were a **false match** — `data.fortworthtexas.gov` 404s on both `/api/catalog/v1`
and `/api/views/`, and its `robots.txt` is byte-identical to `hub.arcgis.com`'s apart from the
sitemap host. It is an **ArcGIS Hub** site. Asked through its own DCAT feed (53 datasets):

**`CFW Development Permits Table`** — publisher **City of Fort Worth**

- **1,616,404 rows.** `modified: 2026-09-30T11:25:29.883Z` — the day of the probe.
- GeoServices REST:
  `https://services5.arcgis.com/3ddLCBXe1bRt7mzj/arcgis/rest/services/CFW_Open_Data_Development_Permits_View/FeatureServer/0`
- Also offered as **CSV** and **ZIP** downloads. `maxRecordCount: 1000`, `supportsPagination: true`.
- Fields include `Permit_No`, `Permit_Type`, `Permit_SubType`, `Permit_Category`,
  `B1_WORK_DESC`, `Zip_Code`, `Full_Street_Address`, **`File_Date` (a real
  `esriFieldTypeDate`, not text)**, `Current_Status`, `Status_Date`, `JobValue`.
- A companion `CFW Development Permits Points` layer (770,067 rows) carries lat/lon.

**Licence — quoted, not summarised.** The feed declares
`https://creativecommons.org/licenses/by/4.0`. The obligation that creates, from the legal code
at `https://creativecommons.org/licenses/by/4.0/legalcode.txt` (fetched 2026-09-30):

> Section 3 -- License Conditions.
>
>   a. Attribution.
>
>        1. If You Share the Licensed Material (including in modified
>           form), You must:
>
>             a. retain the following if it is supplied by the Licensor
>                with the Licensed Material:
>
>                  i. identification of the creator(s) of the Licensed
>                     Material and any others designated to receive
>                     attribution […];
>
>                 ii. a copyright notice;
>
>                iii. a notice that refers to this Public License;
>
>                 iv. a notice that refers to the disclaimer of
>                     warranties;
>
>                  v. a URI or hyperlink to the Licensed Material to the
>                     extent reasonably practicable;
>
>             b. indicate if You modified the Licensed Material and
>                retain an indication of any previous modifications; and
>
>             c. indicate the Licensed Material is licensed under this
>                Public License, and include the text of, or the URI or
>                hyperlink to, this Public License.

This is stricter than what THI's data pages currently render for Austin and San Antonio: it
requires a **licence notice and a warranty-disclaimer notice**, not just a source credit. A Fort
Worth data page would need that added.

**Two flags, per Rule 1:**

- **`Owner_Full_Name` is in the feed.** THI must not ingest it. The existing permit fetchers
  select columns explicitly, so this is a discipline to apply, not a blocker — but it must be an
  explicit exclusion, not an oversight.
- **`robots.txt` sets `Crawl-delay: 60`.** At 1,000 rows per page, a full backfill of 1.6M rows
  respecting that delay is ~27 hours of wall clock. An incremental fetch filtered on `File_Date`
  is a few requests. Backfill strategy needs a decision (COST.md).

### New Braunfels · San Marcos · Round Rock · Kyle — none publishes a permit feed

Checked twice: a hostname probe (`data.{city}.gov`, `{city}.opendata.arcgis.com`,
`opendata-{city}.hub.arcgis.com` — every one either does not resolve or 404s) and then a search of
both the ArcGIS Hub catalogue and the Socrata cross-domain catalogue per city. Nothing. The only
permit-shaped hits belonged to **other cities entirely** — Grand Chute WI, Pflugerville, Norman OK,
Madison County KY.

One line each, as instructed. **None of the four publishes a machine-readable building-permit
feed. A monthly PDF, if one exists, is not a feed and was not pursued.**

---

## B · WEATHER / DROUGHT / STORM

**The corridor question dissolves here, and this is the most useful finding in the round.**

All four corridor cities' ZIPs are **already in the committed crosswalk, already resolve to a
metro, and are already flagged `drought_county_granular=yes`**:

| City | ZIP | Resolves to | County |
|---|---|---|---|
| New Braunfels | 78130 | *both* — assigned `san-antonio` | Hays (Austin) / Comal (SA) |
| New Braunfels | 78132 | `san-antonio` | Comal |
| San Marcos | 78666 | *both* — assigned `austin` | Hays / Comal |
| Round Rock | 78664, 78665, 78681 | `austin` | Travis, Williamson |
| Kyle | 78640 | `austin` | Hays |

A homeowner in any of the four **already gets the full weather, drought, storm, hail, air-quality
and cooling-load read today**, from the existing fetchers, with no new code. They are inside the
Austin and San Antonio MSAs — the BLS series the site already ingests is literally labelled
*"San Antonio-New Braunfels MSA"*.

What they lack is **permits only**, because permit data is scoped to the issuing city and these
are separate permitting jurisdictions. That is the whole gap.

**For Fort Worth**, every weather signal resolves without new external dependencies, but not
without edits — each one needs the union widened and, for four of them, a county/FIPS/CBSA row:

- **USDM drought** — reads `droughtCounties` from the `ZIP_AREAS` entry. Tarrant County FIPS
  `48439`. No new source.
- **NOAA storm events** — needs Tarrant and its neighbours added to `COUNTIES_BY_LOCATION`. The
  NOAA files are national; no new feed.
- **NOAA climate / cooling degree days** — resolves its own GHCND station from the metro centroid
  by distance and station quality. **Widening the union is sufficient.**
- **SWDI radar hail** — same; point comes from `ZIP_AREAS`.
- **AirNow** — one downtown ZIP.
- **NWS forecast** — **currently Austin-only** (`Record<"austin", …>`; San Antonio was never
  wired). Not a Fort Worth problem, but noted: this signal is single-metro today.

---

## C · VOLUME, and what the floor should be

Round 6's ruling governs: permits are an **activity instrument, not a price instrument** —
counts, timing, seasonality and trade mix *within one city*, never across cities and never a
cost figure. Fort Worth's `JobValue` field is **not** to be read as a homeowner cost; Round 6
settled that declared valuation is an applicant's fee-basis statement to the city, and nothing in
this dataset bridges that gap.

**The floor already exists in code and it is self-scaling.** `site/src/lib/tradeActivity.ts`
computes `noisePct = 100/√mean` — the counting-noise floor a claim must clear — and
`clearsThreshold` gates the reading. So the right question is not "is the count big enough" in
the abstract, but "at what count does that gate stop opening". For reference, the shipped series:

| Metro | Trade | Mean/month | Noise floor | Half-over-half | Reportable |
|---|---|---|---|---|---|
| Austin | electrical | 1,328 | 2.74% | +17.8% | yes |
| Austin | roofing | 155 | 8.03% | −8.1% | yes, barely |
| Austin | solar | 107 | 9.68% | +21.2% | yes |
| San Antonio | plumbing | 2,040 | 2.21% | +0.5% | **no** |
| San Antonio | roofing | 402 | 4.99% | −1.3% | **no** |
| San Antonio | solar | 56 | 13.41% | −43.2% | yes |

**Fort Worth, same 13-month window (2025-09 … 2026-09), all permit types:**

```
5586  6018  4957  5145  5315  7048  8201  7440  6531  6759  6812  6223  5407
```

Trade mix over that window: Electrical 17,439 · Plumbing 17,195 · Residential Building 14,974 ·
Mechanical 12,888 · Plumbing Backflow 8,615. Per month that is ~1,341 / 1,322 / 1,152 / 991 —
**every one of them above Austin's electrical series**, with noise floors of 2.7–3.2%. Fort
Worth has more than enough volume.

**Roofing needs a caveat.** `Permit_Category = "ReRoof"` returns only 258 rows — but
`Permit_Category` is `"NA"` on **76,051 of 81,442** rows in the window, so that number describes
an unpopulated field, not the city's roofing activity. Matching `B1_WORK_DESC LIKE '%ROOF%'`
returns **2,070** rows, ~159/month — right alongside Austin's roofing series. That 2,070 is an
**upper bound**: `%ROOF%` also matches "waterproof", and Round 6 had to do exactly this
disambiguation for Austin. A Fort Worth roofing reading needs that work done first, not assumed.

**What the floor should be, stated plainly.** No new fixed threshold is needed — `100/√mean`
already does the job, and the empirical answer it gives is that a trade series needs roughly
**100+ permits in a typical month** before month-over-month movement is worth reporting (at
mean 100 the floor is 10%; at 30 it is 18%, which no real change clears). The corridor cities
are moot on this, since none publishes counts at all.

---

## D · VERDICT

| Metro | Verdict | Why |
|---|---|---|
| **Fort Worth** | **FULL** | Live CC BY 4.0 permit feed, 1.6M rows, real date field, trade mix and volume above Austin's. Every weather signal resolves. Cost: the §0 list plus a third fetcher shape (ArcGIS GeoServices). |
| **Dallas** | **NOT VIABLE** *(for permits)* | The city publishes building permits only as closed snapshots — the current dataset stops in 2020, the rest are 2011–2018 archives. The only live permit data is right-of-way work. Weather/drought/storm would all work; **a Dallas page would be a metro with no activity instrument**, which is the signal that distinguishes THI. |
| **Houston** | **NOT VIABLE** *(as measured)* | Its open-data portal disallows `/api/` and `/datastore/*` to `User-agent: *` — both of CKAN's machine-readable routes. No alternate publisher found. Not a data-quality verdict: a data-access one, and reversible by an approach to the city rather than by code. |
| **New Braunfels** | **ALREADY SERVED, minus permits** | 78130/78132 are in the crosswalk today and get every weather signal. No permit feed exists. |
| **San Marcos** | **ALREADY SERVED, minus permits** | 78666 is in the crosswalk today. No permit feed exists. |
| **Round Rock** | **ALREADY SERVED, minus permits** | 78664/78665/78681 in the crosswalk today. Its ArcGIS layers are development-project boundaries, not permits. |
| **Kyle** | **ALREADY SERVED, minus permits** | 78640 in the crosswalk today. No permit feed exists. |

**The honest summary: of the three major candidates, only Fort Worth is viable.** Dallas and
Houston both fail, for different and unrelated reasons. The four corridor cities were never
really the question they looked like — they are already inside the two metros THI serves, and the
only thing they are missing is city-issued permit data that none of them publishes.

---

## E · EFFORT — Fort Worth only

Against COST.md. Fort Worth is the only metro this section applies to.

**Not config-only.** It is §0's ~15-file list, plus:

1. **A new fetcher, `fortWorthPermits.ts`** — a third API shape. Austin is Socrata SODA, San
   Antonio is CKAN CSV, Fort Worth is ArcGIS GeoServices REST (`/query` with `where`,
   `outStatistics`, `resultOffset` paging at 1,000/page). Genuinely new code, not a copy.
2. **A trade mapping** in `tradeCategories.ts` for Fort Worth's own type names
   (`Electrical`, `Plumbing`, `Mechanical`, `Residential Building Permit`, …) plus the
   description-text path for roofing, with the `%ROOF%` / "waterproof" disambiguation done
   properly.
3. **Crosswalk rows** for the Dallas-Fort Worth-Arlington MSA, cut from the same Census 2020
   file the existing rows came from. **Owner-supplied — this is the seam.**
4. **An explicit exclusion of `Owner_Full_Name`** from anything ingested or stored.
5. **A licence notice** meeting CC BY 4.0 §3(a)(1) on any Fort Worth data page — including the
   warranty-disclaimer reference, which the current Austin/San Antonio pages do not carry.
6. **A backfill decision** given `Crawl-delay: 60` against 1.6M rows.

**Running cost:** no paid API, no key, no new vendor. The feed is free and keyless, like every
other feed in the ingest path. The marginal cost is one more Actions job per cadence and a larger
generated JSON — inside the "boring, cheap, reliable" envelope COST.md asks for.

**One thing I did not do and would not do without a decision:** I did not check whether Fort Worth
sits far enough outside the Austin/San Antonio brand story to need its own positioning. Adding
DFW makes "Austin and San Antonio" a stale line in the nav and arguably in the brand. That is an
owner call, not a data one.

---

## 7 · Corrections made during this round, before anything reached a verdict

Recording these because three of them would each have produced a confidently wrong finding, and
one of them is the same error twice.

1. **Dallas nearly died on a lexicographic max.** `issued_date` is a *text* column holding
   `"12/31/19"`. `max()`/`min()` therefore sorted strings: a row reading `"01/15/20"` sorts below
   `"12/31/19"` on its first character and would have been invisible to both extremes.
   "Oldest 01/01/19, newest 12/31/19" looked like a clean 2019-only finding and established
   nothing. Replaced with per-year row counts, which is what §A reports.
2. **Dallas' year counts then came back all-zero — my URL encoding, not an empty dataset.** I had
   left `%` in the quoting safe-list, so the `LIKE` wildcards reached the server as raw percent
   signs. A zero produced by my own encoding is exactly the kind of result that kills a metro on
   a false finding.
3. **A federated catalogue read as the city's own — twice.** The cross-domain Socrata search
   matched Chicago, Calgary and Howard County MD for "building permits", and attached a dataset
   id and a CC BY 4.0 licence to Fort Worth that belong to a different publisher. Then, two
   passes later, I asked `www.dallasopendata.com` for its permit datasets and read the answer as
   Dallas' — it is federated, and the list it returned included `3syk-w9eu`, which is **Austin's
   Issued Construction Permits, the dataset this site already ingests**. Same mistake, same fix:
   scope by domain and check the domain on every row.
4. **Fort Worth was nearly written off as "not Socrata, therefore nothing".** Its robots.txt being
   byte-identical to `hub.arcgis.com`'s is what identified it as an ArcGIS Hub site and led to the
   DCAT feed — and the only viable metro in the round.
5. **"Only 258 ReRoof permits" was a statement about an unpopulated field**, not about Fort
   Worth's roofing activity. `Permit_Category` is `"NA"` on 93% of rows.
6. **A failed probe run threw away data it had already gathered.** Pass 3 collected every answer,
   wrote them to disk, then died on a stale `print` of a key it no longer built — and the commit
   step had no `if: always()`, so the run discarded the lot. It *looked* like the data was
   unavailable. Fixed with `if: always()`.
7. **The robots matcher compared rules against the path only.** Dallas' rules are query-scoped
   (`Disallow: /browse?*&q=`), so every one of them was being silently ignored. Now matches path
   plus query. None of the requests made would have been affected, but the guard was weaker than
   it claimed to be — which is precisely Round 37's failure mode.

**The robots guard worked as designed**, and that is the point of having built it as a mechanism
rather than a promise: Houston's `Disallow: /api/` was caught by code and recorded as
`SKIPPED_BY_ROBOTS`, with no request made. Round 37's error could not have happened here.

---

## 8 · Cleanup

- `.github/workflows/tmp-metro-probe.yml` — **deleted.** `.github/workflows/` holds only the eight
  pre-existing files.
- `tmp/metro/` (probe JSON and cached `robots.txt` files) — **deleted.** Every number in this
  audit is recorded above; nothing is cited to `tmp/`.
- **No bulk data landed in the repo.** Total network use across the ten committed passes:
  **90 requests**, all metadata, row counts, catalogue queries and `robots.txt`. **No permit row
  was ever downloaded** — every count in §C came from a server-side aggregate
  (`returnCountOnly`, `outStatistics`, SoQL `count(1)`), never from reading rows.

**One robots detail, recorded because Round 37's failure was an unexamined assumption.** Three
hosts answered something other than 200 for `robots.txt`: `services5.arcgis.com` returned **403**,
`mapit.fortworthtexas.gov` returned **404**, and `creativecommons.org` returned `Disallow:` with
an empty value. The guard treats a non-200 as an empty rule set, i.e. allow — which is what
RFC 9309 specifies for a 4xx other than 429, and an empty `Disallow:` means allow by the
standard's own definition. So the requests to those three hosts were permitted, not merely
unrefused.

---

## 9 · What I did not do

Per the round's scope: no metro was built, no crime work, no content, routes, pages or SEO, and
nothing from the rest of the backlog. The verdict table is the deliverable; **which metros, and
in what order, is the owner's call.**
