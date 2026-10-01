# Round 42 — the ACS five-year vintage: what is served, and what moved

Date: 2026-10-01 · Branch: `claude/thi-v3-round42-acs-vintage`, from `origin/main` at `961346f`
— the Round 41b merge, with 41e and 41b confirmed in base.

40 requests to `api.census.gov`: **30 × 200, 10 × 404, 0 refused by the robots guard.** Every
404 is a 2025 request; `api.census.gov/robots.txt` disallows nothing on these paths.

The pin moved `2023 → 2024`. Four published figures changed, on two pages.

> **Superseded in part by Round 43.** §5 below reports the seed-contamination finding as **nine
> rows**; the true count is **ten** — `airnow/san-antonio.json` was seeded on 2026-08-24 and this
> round's scan anchored on 2026-08-23. Round 43 removed them, added reproduction-based detection
> and a sweep assertion, and withdrew the electricity article. See
> `docs/audits/round-43-seed-contamination.md`. **§1–§4 and §6 of this document — the vintage
> tables, the variable check and every ACS figure — are unaffected**, and were re-verified after
> rebasing onto the Round 43 merge: the four published figures render identically and no
> 2023-vintage value survives anywhere in `dist/`.

---

## 1 · A · Which vintages the API actually serves

Measured per geography, not inferred from the newest vintage existing. All six read
`in=state:48`; counties as `for=county:NNN`, places as `for=place:NNNNN`.

| Geography | `for=` | 2022 | 2023 | 2024 | 2025 |
|---|---|:---:|:---:|:---:|:---:|
| Travis County | `county:453` | YES | YES | **YES** | no |
| Bexar County | `county:029` | YES | YES | **YES** | no |
| Comal County | `county:091` | YES | YES | **YES** | no |
| Hays County | `county:209` | YES | YES | **YES** | no |
| New Braunfels city | `place:50820` | YES | YES | **YES** | no |
| San Marcos city | `place:65600` | YES | YES | **YES** | no |

**2024 is the newest served vintage, and it is served for all six.** 2025 is not a thin or
place-only gap — it 404s on the dataset discovery document itself
(`/data/2025/acs/acs5.json`), on all three variables, and on all six value queries. The dataset
does not exist yet; this is not a geography problem.

2022 was carried as a control precisely so a total 2024 failure could be told apart from an API
problem. It did not need to be used.

**§2D does not bite. No geography lags, so there is no mixed-vintage decision to make.** The
site is on one vintage across all six geographies before this round and after it.

---

## 2 · B · Do the three variables still mean the same thing?

The real risk: a variable redefined without being renamed moves a published number silently.
Compared field by field from `/data/{vintage}/acs/acs5/variables/{var}.json`.

| Variable | Field | 2023 | 2024 | |
|---|---|---|---|---|
| `B25035_001E` | label | `Estimate!!Median year structure built` | *identical* | ✓ |
| | concept | `Median Year Structure Built` | *identical* | ✓ |
| | group / predicateType | `B25035` / `string` | *identical* | ✓ |
| `B25003_001E` | label | `Estimate!!Total:` | *identical* | ✓ |
| | concept | `Tenure` | *identical* | ✓ |
| | group / predicateType | `B25003` / `int` | *identical* | ✓ |
| `B25003_002E` | label | `Estimate!!Total:!!Owner occupied` | *identical* | ✓ |
| | concept | `Tenure` | *identical* | ✓ |
| | group / predicateType | `B25003` / `int` | *identical* | ✓ |

**All three are identical in every compared field.** Every figure below is therefore a real
change in the estimate, not an artifact of a changed definition.

---

## 3 · C · Every figure that changed, per geography

Computed exactly as `censusAcs.ts` computes them: `medianHomeAgeYears = 2026 − B25035_001E`,
`ownerOccupiedPct = round(B25003_002E / B25003_001E × 1000) / 10`. Underlying counts included so
the derived figures can be checked rather than taken.

### The two published figures

| Geography | Median year built | Median home age | Owner-occupied |
|---|---|---|---|
| | 2023 → 2024 | 2023 → 2024 | 2023 → 2024 |
| Travis County | 1997 → **1999** (+2) | 29 → **27** (−2) | 53.0% → **52.1%** (−0.9) |
| Bexar County | 1989 → **1990** (+1) | 37 → **36** (−1) | 59.1% → **58.8%** (−0.3) |
| Comal County | 2003 → **2005** (+2) | 23 → **21** (−2) | 76.9% → **76.6%** (−0.3) |
| Hays County | 2005 → **2007** (+2) | 21 → **19** (−2) | 64.1% → **64.1%** (±0.0) |
| New Braunfels city | 2005 → **2006** (+1) | 21 → **20** (−1) | 65.2% → **65.3%** (+0.1) |
| San Marcos city | 1998 → **2001** (+3) | 28 → **25** (−3) | 30.5% → **30.8%** (+0.3) |

### The underlying counts

| Geography | Total occupied units | Owner-occupied units |
|---|---|---|
| Travis County | 561,491 → 583,747 | 297,755 → 304,165 |
| Bexar County | 740,402 → 750,939 | 437,637 → 441,921 |
| Comal County | 67,651 → 71,354 | 51,991 → 54,667 |
| Hays County | 94,499 → 99,849 | 60,587 → 64,042 |
| New Braunfels city | 38,483 → 40,991 | 25,095 → 26,765 |
| San Marcos city | 27,606 → 28,013 | 8,408 → 8,630 |

Every direction is coherent: housing stock grew everywhere, median year built moved later
everywhere, and owner-occupied share slipped slightly in the three large counties while the two
places held. San Marcos's +3 years is the largest single move and is consistent with its
owner-occupied share being the lowest of the six (30.8%) — a student-heavy rental market adding
new units fast.

### What of this actually reaches a page

**Four numbers, on two pages.** Confirmed by grepping the built output for every old and new
value, not assumed from the data flow:

| Page | Figure | Before | After |
|---|---|---|---|
| `/new-braunfels/` | owner-occupied | 65.2% | **65.3%** |
| `/new-braunfels/` | median home age | 21 years | **20 years** |
| `/san-marcos/` | owner-occupied | 30.5% | **30.8%** |
| `/san-marcos/` | median home age | 28 years | **25 years** |

As rendered on `/san-marcos/`:

> Housing stock, San Marcos — **30.8%** Owner-occupied · median home age **25 years**
> Measured: San Marcos city · 2 records, Jan 1, 2023 – Jan 1, 2024 · OUT OF DATE

**The four county figures — Travis, Bexar, Comal, Hays — render nowhere.** No old value
(`53.0%`, `59.1%`, `76.9%`, `29 years`, `37 years`, `23 years`) survives anywhere in
`dist/client`, and none of the new ones appears either. `census-acs` is in the stress index's
`EXCLUDED_INPUTS`, so no score moves; no `DataPageSpec` reads it. The counties are ingested and
stored, not published.

**San Marcos's −3 years is the one figure worth flagging on its own.** It is the largest move,
it is on an indexed page, and "median home age 28 years" was live and citable until this branch.

Rows are appended, not replaced: all four `census-acs/*.json` now carry both `acs5-2023` and
`acs5-2024`, per "store history, never overwrite."

---

## 4 · The badge does not clear, and no vintage can clear it

The `TODO(owner)` on `VINTAGE` was written against the OUT OF DATE badge. **Bumping the vintage
does not clear it, and this is not a vintage problem.**

`resolveDisplayStatus` marks a dataset out of date when `dataAgeDays(dataThrough)` exceeds
`maxDataAgeDays`, and `census-acs` is allowed **400 days**. `observedAt` for an ACS 5-year row
is 1 January of the vintage year:

| Vintage | `observedAt` | Age at 2026-10-01 | Within 400 days? |
|---|---|---|---|
| 2023 (before) | 2023-01-01 | 1,369 days | no |
| 2024 (after) | 2024-01-01 | **1,004 days** | no |
| 2025 (hypothetical) | 2025-01-01 | 638 days | no |

**Even a vintage that does not exist yet would not clear it.** The Census Bureau releases an ACS
five-year vintage roughly 12 months after its reference year ends, so the freshest this series
can ever be on release day is already past 400 days — and it then ages a further year before the
next one lands. A 400-day window is not satisfiable by an annual series dated to the start of its
reference period.

This is a **freshness-rule** question, not a vintage one, and it is the owner's: the honest fix
is either a `census-acs` window that reflects the real release cadence (~800 days would mark a
genuinely skipped vintage and nothing else), or dating the row to the end of the five-year
window rather than the start. Both change what a published badge says, so neither was done here.
The measurement is recorded in the `VINTAGE` doc comment in `censusAcs.ts` so the next person
does not re-derive it.

---

## 5 · Beyond the brief — fabricated rows that outlived the seed retirement

Found while tracing an unexplained row in `census-acs/austin.json`. It is not an ACS problem and
it is **not confined to ACS**. Nothing here was changed; it is reported, not fixed.

### What is on disk

Nine rows across eight generated datasets, all written by one bootstrap run at
`2026-08-23T07:05:17`, all carrying values **byte-identical to `seed.ts`'s `GENERATORS`**, and
**none carrying `seed: true`**:

| File | Status | Row(s) | Value | Newest row in file? |
|---|---|---|---|---|
| `eia-electricity/texas.json` | **live** | `2026-06/07/08` | 13.58 / 13.73 / 13.88 ¢ | **yes** |
| `census-acs/austin.json` | live | `2026-07` | 34 yrs / 58% | **yes** |
| `nws-api/austin.json` | live | `2026-07` | 96°F / 74°F | no |
| `airnow/austin.json` | stale | `2026-07` | AQI 42, Good | no |
| `ercot/texas.json` | sample | `2026-07` | Normal, 61,500 MW | yes |
| `tdi-losses/austin.json` | sample | `2026-07` | Wind/Hail, $482,000 | yes |
| `tx-forest-service/texas.json` | sample | `2026-07` | Moderate | yes |

The `eia-electricity` rows are **provably** seed output, not coincidence: re-running
`mulberry32(seedFromString("eia-electricity/texas"))` through `eiaElectricityPrice` reproduces
the 12-month series `14.27, 14.16, 13.99, 13.89, 13.89, 13.6, 13.53, 13.82, 13.82, 13.58,
13.73, 13.88` — and its last three values are exactly the three rows on disk. Real EIA fetches
replaced the first nine; the real series stops at **2026-05**.

### Why they are permanent

Three separate guards all key on the same flag or fingerprint, and all three miss these rows:

1. `runIngestion` retires seeds with `existing.observations.filter((o) => !o.seed)` — no flag,
   no retirement, on every successful fetch, forever.
2. `verify-content.mjs`'s `looksSeeded` and `purge-seed-observations.mjs`'s `isSeed` are the same
   three-way test: `seed === true`, **or** a `sample-` key prefix, **or** the literal string
   `SAMPLE` in the value.
3. `purge-seed-observations.mjs` describes those as "the two fingerprints `seed.ts` has **always**
   written." **That claim is false.** The `sample-` prefix comes only from two of the three
   multi-row generators, `noaaStormEvents` and `municipalPermits`; `eiaElectricityPrice` writes a
   bare `monthKey`, and so does the `single()` helper behind all ten stub feeds (`"2026-07"`).
   And only three of those ten embed the word SAMPLE in their value — `fema-nfhl`,
   `usdm-drought`, `usda-soil`. **Eight of the thirteen generators carry neither fingerprint**,
   and they are exactly the ones in the table above.

That asymmetry is the whole explanation, and it is confirmed by the single counter-example:
`fema-nfhl/austin.json` is the **only** row in the entire tree still carrying `seed: true`, and
it is the one whose value says `"X (SAMPLE)"` — so the purge could see it, and its file being
`status: sample` sent it down the tag-and-keep branch rather than the delete branch.

The fingerprint gap explains the surviving rows on its own, with no appeal to history.

> **Correction (Round 43b).** This paragraph originally read *"this repo's history begins at
> `a220599` (2026-09-11), so when the stamp was added … cannot be established from here."* That
> was wrong: the session's clone is **shallow** (`clone_depth` 50). `origin/main` carries 461
> commits and the history runs well before the bootstrap. Nothing here depends on it, but the
> stated reason was a false premise.

### What is published as a result

`latest()` filters `!o.seed`, so it takes the fabricated rows. **13.88¢ is rendered on eight
built pages**, including:

- **the homepage**, as `Texas electricity prices · 13.88¢ · Latest (August 2026)` under a
  **LIVE** badge, `Data through Aug 1, 2026`, sourced to *EIA Electricity Data (Texas,
  residential)*
- **`/data/texas/electricity-prices/`** — "Texas households paid an average of 13.88¢ per
  kilowatt-hour in August 2026 — about $139 a month on a 1,000 kWh bill", the FAQ answer "…the
  most recent month the EIA has published", the recorded-records table, and the downloadable CSV
- **`/analysis/are-texas-electricity-prices-still-going-up/`** — whose entire argument is built
  on it. Its headline answer to the title is "**No**", on the strength of "13.88¢/kWh, down
  **10.2%** year over year", "down **18.3%** from the peak", and "from 16.44¢ in May 2026 to
  13.58¢ in June 2026, a **17.4% fall in one month**". The article even goes looking for a cause,
  checks July cooling degree-days against normal, and concludes they are "not nearly enough to
  explain a fall of this size" — correctly, because the fall is not real
- `/austin/hvac/`, `/san-antonio/hvac/`, `/tools/ac-lifespan/`, `/analysis/`

The fabricated tail sits roughly 2.5¢ **below** the real series (which runs 15.46–16.99¢), so it
does not read as noise — it reads as a sharp, recent price decline, and an indexed analysis
article argues exactly that. This is the citation liability CLAUDE.md's "sample data is never
presented as fact / no SAMPLE on an indexed page" rule exists to prevent.

The other strays do **not** currently reach a rendered figure — verified by grep, not assumed.
`census-acs/austin`'s 34 yrs / 58% appears nowhere (nothing reads `census-acs` for `austin`);
`nws-api` and `airnow`'s rows are not the newest in their files; the three `sample`-status files
are correctly withheld, because `latest()` returns nothing for a sample dataset.

**But that is luck, not protection.** `eia-electricity` is what happens when a real feed stalls
and a fabricated row becomes the newest. `nws-api` and `airnow` are one feed outage away from
the same thing.

### Recommended fix — not applied

1. Delete the nine rows. `purge-seed-observations.mjs` will not find them; they need either an
   explicit list or a widened fingerprint.
2. Widen the fingerprint at its source, so this cannot recur: have `seed.ts` write a `sample-`
   prefixed key from **every** generator, not just the multi-row ones, and correct the comment
   in `purge-seed-observations.mjs` that asserts it already does.
3. Re-run the gates. `verify-content` passes today **because** `looksSeeded` cannot see these
   rows — it is not evidence they are absent.

This removes a published figure from the homepage, a data page, a CSV and an analysis article,
so it is a separate round and the owner's call.

---

## 6 · What this round asks for

**Decision 1 — ship the 2024 vintage?** It is clean: served for all six geographies, all three
variables identical, every delta measured and coherent, four numbers moving on two pages.
`/san-marcos/` median home age moves 28 → 25 years and was citable at 28.

**Decision 2 — the freshness window (§4).** The badge the original TODO was about cannot be
cleared by any vintage. Nothing was changed; the options are stated above.

**Decision 3 — the fabricated rows (§5).** Separate round, and the most urgent of the three:
a fabricated electricity price is live on the homepage, a data page, a CSV and an analysis
article right now, on this branch and on `main` alike.

---

## 7 · Gates

| Gate | Result |
|---|---|
| `npm run check` | 0 errors, 0 warnings, 0 hints (214 files) |
| `npm run build` | complete |
| `npm run verify-content` | ✓ 4 locations, 18 data sources, 8 FAQ entries |
| `node scripts/run-sweep.mjs` | **27/29** — `weeklyunit` and `r9render`, both pre-existing |
| Temporary probe | `.github/workflows/tmp-acs-probe.yml` and `tmp/acs/` deleted; 8 workflows remain |
