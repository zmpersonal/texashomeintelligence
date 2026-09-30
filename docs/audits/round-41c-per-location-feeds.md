# Round 41c — can the point-based feeds resolve per location?

Date: 2026-09-30 · Branch: `claude/thi-v3-round41c-per-location`, from `origin/main` at
`60ac24c` — the Round 41a merge, confirmed with `git merge-base`.

Added: this file. **No fetcher was changed.** Why not is §6, and it is the substance of the
round rather than an omission.

Measured through a temporary Actions workflow (deleted — §8), carrying Round 39's robots guard.
24 requests on the final pass across five hosts; 5 refused by the guard.

---

## 0 · Two findings that outrank the question I was asked

Both are about **shipped ingestion code**, found because the probe applied the robots guard to
hosts the production fetchers already use.

### `www.ncdc.noaa.gov/robots.txt` disallows the path the hail fetcher requests

```
User-agent: *
Disallow: /*.csv
…
Disallow: /swdiws/
```

`swdiHail.ts` requests `https://www.ncdc.noaa.gov/swdiws/csv/nx3hail/{window}?bbox=…`, which is
matched by **both** rules. This feed is live: it publishes on `/data/austin/roofing/` and
`/data/san-antonio/storms/`.

### `www.ncei.noaa.gov/robots.txt` disallows the monthly-normals path

```
User-agent: *
Disallow: /data*
Disallow: /orders*

Allow: /data/oceans/coris/library*
```

`noaaClimate.ts` uses four NCEI URLs. Exactly one family is refused:

| URL in the shipped fetcher | Path | Status |
|---|---|---|
| `access/services/data/v1` (GSOM observations) | `/access/…` | allowed |
| `pub/data/ghcn/daily/ghcnd-stations.txt` | `/pub/data/…` | allowed |
| `pub/data/swdi/stormevents/csvfiles/` (storm events) | `/pub/data/…` | allowed |
| **`data/normals-monthly/1991-2020/access/`** — the index **and** each station's CSV | `/data/…` | **disallowed** |

The only `Allow:` is for a coral-reef library and does not rescue it.

### What I did about it: nothing, deliberately

Changing either fetcher would break a live reading — the hail count and the cooling-load
normals — and the choice is not mine. I am also not going to argue the project out of its own
standard: Round 37's correction established that this project treats `robots.txt` as binding and
fetches only permitted paths, and Round 39 turned that into a mechanism.

**The honest counter-argument, so you can weigh it:** `swdiws` is *SWDI Web Service* and the
Access Data Service is likewise published for programmatic use. A scheduled API client is not a
crawler, and a reasonable person can hold that `robots.txt` governs crawling rather than API
consumption. That reading is available to you. What is not available is the current position —
a written standard that says one thing while two shipped fetchers do another.

**This needs your ruling before any of §1–§4 can be implemented**, because two of the four feeds
are on those exact hosts.

---

## 1 · City coordinates, sourced

Nothing here was typed from memory. U.S. Census Bureau 2023 Gazetteer, place file for Texas
(`2023_gaz_place_48.txt`), internal points:

| Place | GEOID | Internal point | Land area |
|---|---|---|---|
| New Braunfels city | 4850820 | 29.699306, −98.115127 | 45.0 sq mi |
| San Marcos city | 4865600 | 29.872399, −97.936022 | 38.9 sq mi |
| Austin city | 4805000 | 30.298622, −97.754134 | 326.4 sq mi |
| San Antonio city | 4865000 | 29.462809, −98.524635 | 498.9 sq mi |

**Distance from the metro point THI already uses** (`ZIP_AREAS[].point`):

| City | to Austin point | to San Antonio point |
|---|---|---|
| New Braunfels | 45.1 mi | **29.6 mi** |
| San Marcos | **29.6 mi** | 45.6 mi |

Both sit almost exactly 30 miles from their metro's centre. That number is the whole round: it
is far enough that a metro reading is not a local one, and close enough that a wide query box
around the city overlaps the metro's heavily.

---

## 2 · The per-feed table

| Feed | A · finer grain available? | B · nearest real source | C · implemented | D · history |
|---|---|---|---|---|
| **Census ACS** | **Yes — `for=place:`** | the city itself | **no — blocked on 41b** | **5 vintages, 2019–2023** |
| **Cooling load** (GHCND) | Yes — station id | **NB 5.2 mi · SM 4.2 mi** | **no — normals are robots-disallowed** | unmeasurable (same reason) |
| **Hail** (SWDI) | Yes — `bbox` already | n/a | **no — host disallows `/swdiws/`** | unmeasurable (same reason) |
| **Air quality** (AirNow) | Yes — `zipCode` already | **none within 25 mi** | **no — there is no reading** | n/a |

### Census ACS — the one unambiguous pass

The fetcher queries `for=county:{fips}&in=state:48`. The same API accepts `for=place:{fips}`,
which is the incorporated city, not the county. Measured, ACS 5-year 2023:

| Grain | Median year built | Housing units | Owner-occupied |
|---|---|---|---|
| **New Braunfels city** | 2005 | 38,483 | 25,095 |
| Comal County | 2003 | 67,651 | 51,991 |
| **San Marcos city** | 1998 | 27,606 | 8,408 |
| Hays County | 2005 | 94,499 | 60,587 |

City and county genuinely differ, so this is not a relabelled county figure. San Marcos is the
sharpest case: **30% owner-occupancy against Hays County's 64%** — a university town, and a page
that showed the county number under the city's name would mislead badly.

**History:** place-level data returned for **every vintage 2019 through 2023**. This is the only
one of the four feeds with real depth for these cities.

### Cooling load — a genuinely local station, and I cannot confirm it works

First-order (`USW`) stations, the same filter the fetcher applies, by distance from each city's
Census internal point:

| From | Station | Distance |
|---|---|---|
| **New Braunfels** | USW00012971 "AUSTIN SAN ANTONIO" | **5.2 mi** |
| | USW00012911 Randolph AFB | 14.5 mi |
| **San Marcos** | USW00012910 "SAN MARCOS GARY AFB" | **4.2 mi** |
| | USW00012979 "SAN MARCOS MUNI AP" | **4.5 mi** |
| *(for scale)* Austin core | USW00013958 Camp Mabry | 1.6 mi |
| *(for scale)* San Antonio core | USW00012921 San Antonio Intl | 6.1 mi |

**Both cities have a first-order station nearer than San Antonio's own.** On distance this is the
strongest result in the round.

But distance is not sufficiency. Round 19c established that station *quality* decides this, not
proximity — Kelly AFB sits 6.1 mi from San Antonio and was rejected because every row of its
normals carried `years=2` and `comp_flag=E`. **The file that would answer the same question for
these two stations is `/data/normals-monthly/…`, which §0 shows is disallowed.** So:

> There is a station 5 miles from New Braunfels. Whether it has a usable 1991–2020 normal is
> **unknown, and unmeasurable under the current robots posture.**

That is not "no". It is "not yet answerable", and §0 is what stands between the two.

### Hail — free to resolve, and blocked at the host

`swdiHail.ts` already queries a bounding box built from a point, so pointing it at New Braunfels
needs no new parameter. Two things stand in the way.

**The host disallows it** (§0), so no count could be measured for any city — not even the
existing metros, which is why this round produced no hail numbers at all.

**And the query shape would not mean what a reader assumes.** `BOX_PAD_DEGREES = 0.5` is a
±0.5° box — roughly 69 miles across. Two such boxes centred 29.6 miles apart share most of
their area. A "New Braunfels" hail count and a "San Antonio" hail count drawn that way would be
largely the same storms counted twice, and the difference between them would be an artefact of
box placement rather than of weather. If this feed is ever made per-location, **the pad has to
shrink with it**, and the existing `areaBasis` note ("signatures near the city, never in Travis
County") has to be restated per city. I could not measure the overlap fraction because the
requests were refused; the geometry above is arithmetic on the sourced coordinates, not a
measurement of the feed.

### Air quality — there is nothing to resolve

The endpoint already takes a ZIP. Measured, with `distance=25`:

| ZIP | | Reporting area returned |
|---|---|---|
| 78701 | Austin core | Austin |
| 78205 | San Antonio core | San Antonio |
| **78130** | New Braunfels | **no rows** |
| **78132** | New Braunfels | **no rows** |
| **78666** | San Marcos | **no rows** |
| 78640 | Kyle | **Austin** |

New Braunfels and San Marcos have **no monitor within 25 miles that reports**, so there is no
local reading to publish — not a labelling problem, an absence.

Kyle is the instructive one: it returns a reading, and the reading is **Austin's**. That is the
shape §3 of the round forbids — a metro value arriving under a city's name through a parameter
that looks local. AirNow answers by *reporting area*, so the ZIP is a lookup key, not a
measurement location. **If this feed is ever extended, it must publish `ReportingArea` as the
label**, because that is the grain it measures at.

---

## 3 · Against the governing rule

> *A reading labelled with a location must be measured at that location.*

| Feed | Verdict for a New Braunfels page |
|---|---|
| Census ACS | **Label it the city.** Measured at the city. |
| Drought *(from 41a)* | **Label it Comal County.** Measured at the county — 5 weeks of record. |
| Storms *(from 41a)* | **Label it Comal County.** 13 events, Oct 2025 – Jun 2026. |
| Cooling load | **Undecided.** A 5.2-mile station would qualify if its normals qualify, and that cannot be checked today. |
| Hail | **Withhold**, and not only for robots: the current box geometry cannot separate New Braunfels from San Antonio. |
| Air quality | **Withhold.** No monitor reports within 25 miles. |

---

## 4 · Existing readings

**Unchanged — no fetcher, spec or generated file was touched.** `dist/client` is byte-identical
to `main` across all 355 files; `check-links` 0, `check-orphans` 0, `npm run check` clean, sweep
27/29 with the two pre-existing failures (`weeklyunit`, `r9render`, backlog item 18).

No correction to an existing reading was required by anything found here.

---

## 5 · Corrections made during the round

**My robots parser was wrong, in the direction that manufactures findings.** Pass 1 refused
`www2.census.gov` entirely and would have reported "the Census Bureau does not permit fetching
its Gazetteer". The file opens with a bare `User-agent: *` carrying no rules, a blank line, then
`User-agent: RavenCrawler` / `Disallow: /`. RFC 9309 §2.2.1 makes the blank line end the group;
my parser skipped blank lines and merged the two.

Pass 2's fix did nothing, because it closed the group only `if cur['rules']` — and the `*` group
has none. An empty group is still a group. Pass 3 closed it unconditionally, verified against
the saved file before pushing.

Worth stating plainly: **a guard that errs toward refusing is not automatically safe.** It
produces false findings about other people's sites, and here it would have produced one against
a federal statistical agency. The guard also carried Round 39 pass 4's path-plus-query fix.

Pass 4 fixed my own reading of the Gazetteer: its header's last cell is `INTPTLONG` followed by
whitespace, so the key is not `INTPTLONG`.

---

## 6 · Why nothing was implemented

§2C asked me to implement the feeds that pass. One passed, and it is blocked on something this
round was told not to build.

- **Hail** and **cooling load** sit on the two hosts in §0. Implementing either means either
  overriding the project's own robots standard or changing it. That is your call, not mine.
- **Air quality** has no data for these cities. There is nothing to implement.
- **Census ACS** passes cleanly — and `censusAcs.ts` writes `census-acs/{location}.json` keyed by
  `AreaId`. A place is not an `AreaId`. Giving New Braunfels one would make it a metro, which
  Round 41's own scope excludes, and the location entity that should hold it is exactly what 41b
  exists to create.

So the shape of the answer is: **the only feed that can be resolved per location cannot be
stored per location until 41b gives a location somewhere to live.** Building it now would mean
inventing that entity here, in a round whose first line is "Still no location pages."

I would rather hand you a measured table and stop than build the wrong thing quietly.

---

## 7 · What a New Braunfels page could honestly say today

On the evidence above, without any further work:

- **Comal County drought** — current category, 5 weeks of record, labelled Comal County.
- **Comal County storm events** — 13 events, Oct 2025 – Jun 2026, labelled Comal County.
- **Nothing else**, and the page would have to say so.

With the ACS work (needs 41b's location entity): **New Braunfels city housing stock** — median
year built 2005, 38,483 units, 25,095 owner-occupied, five vintages of history, labelled the
city because it is measured at the city.

With your ruling on §0, potentially: **cooling load from a station 5.2 miles away** — subject to
that station's normals qualifying, which is currently unmeasurable.

---

## 8 · Cleanup

`.github/workflows/tmp-perloc-probe.yml` — **deleted**; `.github/workflows/` holds only the
eight pre-existing files. `tmp/perloc/` — **deleted**. No bulk rows landed: 24 requests on the
final pass, all metadata, station coordinates, four ACS rows and six AirNow lookups. Every
figure in this audit is recorded above; nothing is cited to `tmp/`.
