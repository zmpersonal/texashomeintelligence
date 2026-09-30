# Round 41a — the drought pages were labelling three counties as one

Date: 2026-09-30 · Branch: `claude/thi-v3-round41a-drought-county`, from `origin/main` at
`8e730e8` — the Round 40 merge, with Rounds 39 and 40 confirmed by `git merge-base`.

**No location pages were built.** 41b follows.

---

## 1 · The before state, quoted

This is the record of what was live on `texashomeintelligence.com` before this branch.

### `/data/austin/drought/`

Lede, verbatim:

> Every weekly U.S. Drought Monitor reading recorded for **Travis County** in this window — and
> what a sustained dry stretch means for foundations, trees and watering around a home.

What it rendered: **68 rows**, from **three counties** — Travis (58), Williamson (5), Hays (5).
**Three rows dated Sep 22 2026**, none of them labelled:

| observation key | value as stored | actually |
|---|---|---|
| `48453-…` | D3 — Extreme Drought (22% of county) | Travis |
| `48491-…` | D3 — Extreme Drought (14% of county) | Williamson |
| `48209-…` | D1 — Moderate Drought (99% of county) | **Hays** |

### `/data/san-antonio/drought/`

> Every weekly U.S. Drought Monitor reading recorded for **Bexar County** in this window — …

**68 rows** from Bexar (58), Comal (5), Guadalupe (5); three rows dated Sep 22 2026 —
61%, 50% and 100% of "the county", under one county's name.

### How it happened

`makeDroughtSpec` took a `countyName` — **but only as a word to put in copy.** Nothing filtered
by it. That was harmless while `usdm-drought/austin.json` held one county, which it did when the
page was written. Round 4b added Williamson and Hays to the same file so the stress index could
read neighbouring counties, and nothing told the page its file had stopped being one county.

The page was not wrong when it shipped. It was made wrong by a change somewhere else, silently.

---

## 2 · Two further defects the fix surfaced

### The homepage was publishing a thirteen-month-old number as current

`src/pages/index.astro` built its own observation list and **never sorted it**, so the drought
stat was `observations[0]` — the first row in the file, not the newest. The card read:

> Austin drought conditions · **D1** · Current category · **LIVE** · Data through Sep 22, 2026

`D1` is the reading from **2025-08-19**. The date and the LIVE badge came from the dataset's
freshness, which was correct; only the number was stale. So a current date and a live badge sat
next to a figure thirteen months old, **understating drought by two categories** — the true
current reading is D3, Extreme Drought.

### Every "weeks" count was counting rows

The window is **58 weeks**. The pages said:

> 68 of the 68 weekly readings in this window recorded some level of drought — 100% of the period.
> 57 weeks reached severe drought (D2) or worse.

There are no 68 weeks. It was counting county-weeks and calling them weeks — on the two data
pages, both location hubs, and both tree-trimming service pages.

---

## 3 · The fix

**One place, not six.** Six surfaces each rebuilt the observation list by hand
(`.filter(not seed).sort(desc)`): the data page, its CSV endpoint, the location hub, the service
pages, the homepage and the live conditions panel. All six now call one helper.

```ts
// src/lib/dataPages/scope.ts
export function specObservations<T>(spec, dataset): Observation<T>[] {
  return dataset.observations
    .filter((o) => !o.seed)
    .filter((o) => (spec.scope ? spec.scope(o) : true))
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt));
}
```

**A spec now declares its own scope.** `DataPageSpec.scope` is optional — omitted means the whole
file, which is right for a feed whose file is already one page's worth. The drought spec sets it:

```ts
scope: (o) => o.key.startsWith(`${countyFips}-`),
```

and `countyFips` is now a **required** option. That is the point: `countyName` was a word, and a
word cannot enforce anything. The keys are `{fips}-{mapDate}`, so taking the FIPS makes the
county claim and the rows check each other.

**The headline is deterministic by construction.** "Current category" is `observations[0]`. With
three counties in the file that was whichever of three rows sharing the newest date sorted first
— a tie broken by array order. One county has one reading per week, so newest-first now has a
single answer. **The rule is: narrow to the page's scope first, then take the newest.**

**Two modules moved so this layer could be tested at all.** `earliestObservedAt` /
`latestObservedAt` (six lines each, pure) left `datasets.ts`, and `specObservations` was kept out
of the `dataPages/index.ts` barrel. Both of those pull `import.meta.glob`, which exists only
under Vite — so until now the layer that decides which rows a page speaks for could only be
tested by building the whole site and reading the HTML back. Both are re-exported; no caller
changed.

---

## 4 · The survey — what else has this defect

Round 4b added counties to the ingest, so everything reading those files was checked.

| Reader | Verdict |
|---|---|
| `dataPages/drought.ts` | **The defect.** Fixed. |
| `dataPages/austinRoofing.ts`, `sanAntonioStorms.ts` | **Correct.** They claim *"Travis County and its bordering counties — N counties with reports in this window"*, group by county, and name the county on each finding. They claim what they render. |
| `dataPages/permits.ts` | Correct — `municipal-permits` is city-scoped, one scope per file. |
| `dataPages/texasElectricity.ts` | Correct — statewide. |
| `stressIndex/signals.ts` | Correct — filters `o.key.startsWith(fips)` via `droughtSeries`. |
| `lib/signalSeries.ts` | Correct — same FIPS filter. |
| `lib/belowHeroReadings.ts` | **Same class, milder.** Fixed — see below. |
| `pages/api/intake/…/complete.ts` | Correct — names no county. |

**`belowHeroReadings.ts`** took the newest row across the whole file and labelled it
`${value.county} County`. It was *correctly labelled* — never a wrong county name — but **which**
county it named was a tie broken on array order. It landed on the metro's own county; nothing
made it do so. Now scoped to `primaryCountyFips(location)`. Output unchanged on all four pages
that render it (`/austin/roofing/`, `/austin/plumbing/`, and the San Antonio pair).

Nothing was found that is out of scope and still broken.

---

## 5 · The decision — Option A vs Option B

Both were built and measured. **Option A is what this branch contains.**

### Option A — one county per page (in the branch)

| | Austin | San Antonio |
|---|---|---|
| table rows | **68 → 58** | **68 → 58** |
| rows dated Sep 22 2026 | 3 → **1** | 3 → **1** |
| CSV rows | 58, matching the table | 58, matching the table |
| headline | D3 (Travis) | D1 (Bexar) |
| copy | **unchanged, and now true** | **unchanged, and now true** |

### Option B — all ingested counties, each row labelled (measured, not shipped)

Adds a County column and widens the scope to the area's three drought counties. It renders 68
rows and resolves every one (0 unlabelled), so it is more data:

```
Sep 22, 2026 | Travis County     | D3 — Extreme Drought  | 22%
Sep 22, 2026 | Williamson County | D3 — Extreme Drought  | 14%
Sep 22, 2026 | Hays County       | D1 — Moderate Drought | 99%
```

**But B is not finished, and three of the unfinished parts are copy:**

1. **The lede must change** — "recorded for Travis County" becomes a claim about several
   counties. Copy is yours (CLAUDE.md), so B cannot ship this round regardless.
2. **The headline is still order-dependent.** B does not fix the tie: three rows still share the
   newest date. It needs an *additional* explicit "the primary county's latest" rule. The test in
   §6 fails on B for exactly this reason.
3. **Every "weeks" count is still wrong under B.** The screenshot shows B still saying *"68 of
   the 68 weekly readings"* over a 58-week window, and *"57 weeks reached D2 or worse"*. Those
   figures count county-weeks. Under A they become 58 and 54 and are simply correct; under B
   every one needs re-framing, and that is copy again.

### Recommendation — A

**A makes the copy you already approved true, and needs no new copy to do it.** It is the
minimal change that removes the false statement, and it is strictly a correction: nothing on the
page means something different afterwards, it just stops being wrong.

B is a genuinely better *page* — a metro reader probably does want to see Hays alongside Travis —
but it is a **new page**, not a fix to this one, and it needs three copy decisions before it is
honest. The right sequence is to ship A now so nothing false is live, and treat B as its own
round with copy from you. Backlogged as item 19.

One caveat worth your attention either way: **Hays and Comal have only five weeks of drought
history** (2026-08-25 → 09-22) against Travis's and Bexar's 58, because the neighbouring counties
were only added to the ingest recently. That matters for 41b — a New Braunfels page can state a
current condition but not a trend.

---

## 6 · The test

`site/scripts/replays/datascopeunit.ts`, wired into `npm run sweep`. **31 checks, 0 failures.**

1. **Every row is inside its spec's declared scope** — and, so the assertion is not vacuous,
   that out-of-scope rows genuinely exist in the file (10 of 68 on each drought page).
2. **A county-scoped page renders exactly one county FIPS**, with **no duplicated week** — the
   defect's visible signature was three rows on one date — and the file really does hold more
   than one county, so the check cannot pass on a file that never had the problem.
3. **Stats are identical under a reshuffled file.** The file is reversed and interleaved, and
   every spec's stats must come back byte-identical.

**Proven non-vacuous.** Run against the spec with `scope` removed, it fails 5 of 32:

```
FAIL  austin/drought: exactly one county FIPS in the rendered rows — 48453, 48491, 48209
FAIL  austin/drought: no duplicated week — 68 rows, 58 distinct weeks
FAIL  san-antonio/drought: exactly one county FIPS in the rendered rows — 48029, 48091, 48187
FAIL  san-antonio/drought: no duplicated week — 68 rows, 58 distinct weeks
FAIL  austin/drought: stats identical under a reshuffled file
        — {"label":"Current category","value":"D3"} vs {"label":"Current category","value":"D1"}
```

That last line is the determinism defect demonstrated rather than asserted: the same file, in a
different order, produced a different published headline.

---

## 7 · Verification

**Nine built files changed, and every change is a correction:**

| File | Before → after |
|---|---|
| `/index.html` | drought stat **D1 → D3** (stale 2025-08-19 → current) |
| `/data/austin/drought/` + its CSV | 68 → 58 rows, one county |
| `/data/san-antonio/drought/` + its CSV | 68 → 58 rows, one county |
| `/austin/`, `/san-antonio/` | "68 of the 68 weekly readings" → "58 of the 58" |
| `/austin/tree-trimming/` | same, plus "57 weeks at D2+" → **54** |
| `/san-antonio/tree-trimming/` | "68 of the 68" → "58 of the 58" |

Nothing else in the 355-file output moved.

- **check-links: 0** · **check-orphans: 0**
- **Determinism:** `dist/client` byte-identical across three consecutive builds.
- **`npm run check`:** 0 errors, 0 warnings, 0 hints.
- **Sweep: 27/29.** The two failures are `weeklyunit` and `r9render`, both **pre-existing on
  `main`** and backlogged as item 18 — neither is drought-related.
- **Screenshots** at 390px and 1366px for both pages, before / Option A / Option B.
- A page and its own CSV now come from the same helper, so they cannot disagree about scope.

---

## 8 · What this says about the class of defect

The page did not break. **The dataset under it changed meaning, and the page had no way to
notice.** `countyName` looked like it carried the county claim; it only carried the word. The
general rule this round adds: *a surface that speaks for a subset must declare the subset in a
form the data can be checked against* — here a FIPS the observation keys actually use, not a
name only a human reads.

That is also the reason 41b is worth doing carefully. A New Braunfels page is a page whose whole
identity is "this county, not that one", built on the layer that until today could not tell them
apart.
