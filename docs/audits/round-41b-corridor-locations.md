# Round 41b — New Braunfels and San Marcos

Date: 2026-09-30 · Branch: `claude/thi-v3-round41b-corridor-locations`, from `origin/main` at
`a3af8ea` — the Round 41d merge.

**Base note (Rule 1):** 41a, 41c and 41d are in base. **41e is not merged** — its audit and
backlog item 24 are still branch-only, so this round used 41e's *findings* directly. Both
branches append to `BACKLOG.md` and will conflict there.

---

## 1 · Grounding

### ZIPs — none are claimed, and that is the answer

Round 41c established the repo has **no ZIP→city source**: the crosswalk is Census
ZCTA→County. "78132 is New Braunfels" would be my assertion, not a sourced fact.

**So neither page names a ZIP.** Both are anchored on the county, which is sourced, and on the
Census place FIPS for city-grain data. Nothing on either page implies a ZIP list, and nothing
had to be invented to avoid one.

### 78130 — untouched, and now inconsistent in a way worth knowing

`/dashboard/78130/` says, verbatim and unchanged:

> 78130 is in Comal County. The readings shown are for **Bexar County**, which is the county we
> publish for the San Antonio metro — so they describe nearby conditions rather than Comal
> County itself. This ZIP spans 2 counties in the metro. It also crosses the Austin–San Antonio
> metro boundary; we report it under San Antonio.

plus a separate boundary note naming both metros. None of it changed.

**The consequence is a real inconsistency:** `/new-braunfels/` publishes **Comal** readings while
`/dashboard/78130/` publishes **Bexar** ones for the same ZIP. The city page is the more accurate
surface. Backlogged as item 25 rather than reconciled here — the dashboard's own copy already
tells the reader the readings are Bexar's and why, so it is inconsistent rather than false.

### Both pre-check defects bit, both fixed

- **`LocationHub.astro`** rendered *"Backed by local data"* from `SERVICE_SIGNALS[svc.id]` —
  keyed by the SERVICE, not by whether that location has the data. Now it also requires the
  signal's data page to exist for that location, the same resolution `ServicePage.astro` uses.
- **`/data/` catalog** promised *"Weather & storm exposure, permit activity, drought conditions"*
  for every listed location. Now derived from what each actually publishes — New Braunfels reads
  *"Measured conditions for Comal County."*

---

## 2 · The location entity

`src/data/locations.ts`. A location **belongs to a metro**, and carries its own county FIPS, its
own Census Gazetteer point, its own place FIPS, and optionally its own weather station.

```ts
export const LOCATIONS = [...] as const satisfies readonly LocationDef[];
export type LocationSlug = (typeof LOCATIONS)[number]["slug"];
export function locationDef(slug: string): LocationDef  // resolves or throws
```

Round 40's pattern throughout: the union is derived rather than declared, `locationDef` throws
on an unknown slug rather than defaulting, and a module-load guard rejects a location naming an
area that does not exist.

**The field that carries the round's whole argument** is `climateStation?`. Its absence is not a
gap to fill — it *is* San Marcos' withheld reading, enforced in code:

```ts
function locationSite(slug: string): ClimateSite {
  const loc = locationDef(slug);
  if (!loc.climateStation) {
    throw new Error(`noaa-climate: "${slug}" has no climateStation … so no cooling-load
      reading may be ingested for it.`);
  }
```

Registering San Marcos by accident fails the run. The decision stays enforced rather than
remembered.

---

## 3 · Did anything need a special case? No — and that was the test

Both fetchers generalised to a **config row**.

**`censusAcs.ts`** hardcoded `for=county:{fips}`. ACS takes `for=place:{fips}` through the
identical endpoint, variables and parsing, so the geography became a descriptor and the two
constructors differ only in which clause they build:

```ts
function countyGeography(area: AreaId): AcsGeography
function placeGeography(slug: string): AcsGeography
```

The value now carries `geography: { grain, label, fips }` **beside the number**. That is Round
41a's lesson as a data shape: a county figure and a city figure are indistinguishable once they
are two decimals in a card, and the difference here is not cosmetic — **San Marcos city is 30.5%
owner-occupied against Hays County's 64%**.

**`noaaClimate.ts`** took a metro id and looked its point up from `ZIP_AREAS`, which made the
metro the only geography a cooling-load reading could have. It now takes a **site** — a name for
the output file and a point to search around — which is all the resolution ever needed.

**The selection rule is unchanged.** New Braunfels is not handed a pre-chosen station; it is
resolved from its own point by the same code that resolves Austin's. The ingestion run landed on
`USW00012971`, which is what Round 41e measured independently.

`servicePages: false` on the locations schema is the third config row — a generalised field, not
a slug list in a route.

---

## 4 · What each page carries

| | New Braunfels | San Marcos |
|---|---|---|
| Severe weather | **13** events, Comal County, Oct 2025 – Jun 2026 | **5** events, Hays County, May – Jun 2026 |
| Drought | **D1** Moderate, Comal County, 5 weeks | **D1** Moderate, Hays County, 5 weeks |
| Cooling load | **3,144** CDD/yr, *measured 5.2 mi from New Braunfels* | **withheld, with reason** |
| Housing stock | **65.2%** owner-occupied, median age 21 yrs, *New Braunfels city* | **30.5%**, median age 28 yrs, *San Marcos city* |
| Permits | **stated as unavailable** | **stated as unavailable** |

New Braunfels' 3,144 matches Round 41e's independent measurement exactly.

**Every card renders the grain it was measured at**, on the card rather than only in the heading:
`Measured: Comal County` · `Measured: 5.2 mi from New Braunfels` · `Measured: New Braunfels city`.

**The station's name never appears.** `USW00012971` is published by NOAA as `AUSTIN SAN ANTONIO`,
which on a New Braunfels page would read as an error. Asserted: neither the name nor the id
appears in either page's HTML. The card leads with the distance, which is what qualified the
station in the first place.

**Five weeks is not a trend, and the copy cannot imply otherwise.** Each card states its record
count and date range — *"5 records, Aug 25, 2026 – Sep 22, 2026"* — so a reader sees the depth
beside the value. Travis and Bexar have 58 weeks; these have 5.

---

## 5 · One thing the new pages revealed, unchanged

The housing card renders **OUT OF DATE**. That is correct and **pre-existing**: `VINTAGE` in
`censusAcs.ts` is pinned to 2023 with a standing `TODO(owner)` to bump it, and
`dataFreshness.ts` gives `census-acs` a 400-day window. Every ACS row on the site — Austin and
San Antonio included — is the 2023 vintage and equally stale.

Nothing was changed for it. Bumping the vintage needs someone to confirm the next release is
actually published, which is the owner seam the TODO already names. The badge is the site's
freshness discipline working, not a defect these pages introduced.

---

## 6 · Verification

**Existing output:** 275 pages changed, and the diff on each is **only** the CSS hash, the
approved nav eyebrow, and the two dropdown entries. Verified page-by-page on `/austin/`,
`/dashboard/78704/` and `/austin/roofing/`. **No existing reading moved.**

- **check-links 0 · check-orphans 0** — both hubs reachable from the Locations nav.
- **JSON-LD valid** on both pages: Organization, WebSite, Article, BreadcrumbList.
- **Sitemap** includes `/new-braunfels/` and `/san-marcos/`, and **no** service pages for either.
- **Determinism:** `dist/client` identical across two consecutive builds.
- **`npm run check`:** 0 errors, 0 warnings, 0 hints.
- **Sweep 27/29** — `weeklyunit` and `r9render`, both pre-existing on `main` (item 18).

### The link gate earned its keep twice

Adding the two YAMLs produced **14 broken links** immediately: `ServicePage.astro`'s cyclic
cross-link and `/services/` both still assumed every location has service pages. Neither is
something a page-level review would have caught. Both now honour `servicePages`, which is the
field doing its job.

### Two tests encoded the old shape and were updated

- **`verify-content`** asserted exactly 2 locations. Now 4, with a separate count for the 2 that
  have services — so the location×service product still means what it says.
- **`climateunit`** asserted "both launch metros registered", a count. The meaningful assertion
  is not a count: it is that **New Braunfels IS registered and San Marcos is NOT**, which is the
  withholding decision. Both are asserted by name now.

**And the climate unit caught a real bug I introduced** — `resolveNormals`'s failure message
still referenced `location` after the parameter became `site`, so the refusal path threw
`location is not defined` instead of naming what it rejected. That path only runs when every
station fails, which is exactly when the message matters.

---

## 7 · Not done

- **Item 25** — the 78130 inconsistency, logged not reconciled.
- **Hail and air quality** for these cities: out of scope per the round. 41c settled both — hail
  needs the bbox pad decided (item 23), and air quality has no monitor within 25 miles, with
  AirNow answering by reporting area.
- **Items 16 and 24 are closed** by this round.
