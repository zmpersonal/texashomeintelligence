# Round 40 — make a third metro possible

Date: 2026-09-30 · Branch: `claude/thi-v3-round40-third-metro`, from `origin/main` at `b144db3`
— the Round 38 merge.

**No metro was added.** 25 files changed. `dist/client` is byte-identical to `main`.

**Base note (Rule 1):** Round 39 is not merged, so `origin/main` does not carry
`docs/audits/round-39-metro-expansion-probe.md`. This branch is cut from `main` as the round
specified; the Round 39 audit was read from its own branch. Both branches append to
`docs/v3/BACKLOG.md`, so **merging them in either order will conflict in that file** — the
conflict is two independent new sections at the end, not a contested edit.

---

## 1 · What was actually wrong

Round 39 found one landmine. The sweep found **eleven more of the same shape**, and they are not
all cosmetic. Three published a *wrong measured value*, not just a wrong name:

| Where | What a third metro got | Kind |
|---|---|---|
| `lib/account/alerts.ts` | labelled **"Austin"** in alert headlines | wrong place name |
| `lib/belowHeroReadings.ts` | storm rows filtered to **Travis County** | **wrong county on a real reading** |
| `pages/api/intake/[project_id]/complete.ts` | **Austin's** storm + drought readings in its brief | **wrong metro's data** |
| `lib/stressIndex/signals.ts` (`PRIMARY_FIPS`) | `undefined` → storms, drought and trees-yard all silently unavailable | **signal loss, unexplained** |
| `pages/home/index.astro` | "San Antonio metro" | wrong place name |
| `pages/home/setup.astro` | "San Antonio metro" optgroup | wrong place name |
| `pages/data/stress-index/[area].json.ts` | a **San Antonio ZIP** to build its view from | wrong data |
| `layouts/ServicePage.astro` | cross-linked to Austin; three metros would collide | wrong link |
| `components/ZipPicker.astro` | **omitted** — ZIP works if typed, invisible if looked for | silent omission |
| `pages/start/index.astro` | **omitted from the page** | silent omission |
| `pages/services/index.astro` | **omitted from the page** | silent omission |
| `pages/methodology/index.astro` | **omitted from every status badge** | silent omission |
| `data/acLifespan.ts`, `data/roofScan.ts` | **omitted from the tool's picker** | silent omission |

Every one of these typechecked, built, and rendered. None of them failed.

The two `["austin", "san-antonio"]` arrays on `/start/` and `/services/` are the ones worth
naming: they read as *orderings* and were in fact *selections* — `ORDER.map((id) => find(id))`
builds the list from the array, so a metro that had a hub, service pages, a dashboard and live
feeds would simply not have appeared on either page.

---

## 2 · A · The ternary

`lib/account/alerts.ts` no longer has a local label function. It imports one:

```ts
export function areaLabel(areaId: string): string {
  const area = ZIP_AREAS.find((a) => a.areaId === areaId);
  if (!area) {
    throw new Error(
      `areaLabel("${areaId}"): no entry in ZIP_AREAS. Known areas: ` +
        `${ZIP_AREAS.map((a) => a.areaId).join(", ")}. Add the area to ` +
        `src/data/zip-areas.ts rather than defaulting to a metro.`,
    );
  }
  return area.label;
}
```

It reads the same `ZIP_AREAS` config every page renders from, and **throws rather than
defaulting** — the same rule `lib/zipAreas.ts` already applied to a crosswalk row with no area
entry. `primaryCountyName()` was added alongside it for the county case, which is the more
dangerous one: a wrong county attached to a real storm count is a false statement about a
homeowner's area, dressed as a measurement.

---

## 3 · B · The eight fetchers

**The union is no longer declared. It is derived:**

```ts
export const ZIP_AREAS = [ … ] as const satisfies readonly ZipArea[];
export type AreaId = (typeof ZIP_AREAS)[number]["areaId"];
```

Every module that wrote `"austin" | "san-antonio"` by hand now writes `AreaId`. Adding an entry
to the config widens the union everywhere at once, so the union and the config **cannot drift,
because there is only one of them**. The eight hand-written copies are gone.

The lookups that genuinely need a per-metro value are typed `Record<AreaId, …>`, which turns
adding a metro into a **compile error naming the exact missing row** rather than a successful
build with silent gaps.

**Proven, not asserted.** Section 4 of the new unit test adds a third metro to the live config,
runs `tsc`, and checks which files break:

| Fetcher | Needs a human edit? |
|---|---|
| `usdm.ts` | **no** — counties come from `ingestCounties` |
| `noaaClimate.ts` | **no** — station resolves from the centroid |
| `swdiHail.ts` | **no** — point comes from `ZIP_AREAS` |
| `airnow.ts` | yes — `ZIP_BY_LOCATION` (one ZIP) |
| `blsWages.ts` | yes — `CBSA` code |
| `censusAcs.ts` | yes — `COUNTY_FIPS` |
| `noaaStormEvents.ts` | yes — `COUNTIES_BY_LOCATION` |
| `usdaSoil.ts` | yes — `REPRESENTATIVE_POINT` |

**The honest number is six, not five.** Round 39 predicted five; the test failed until the list
was corrected. The sixth is `SAMPLE_ZIP` in `pages/data/stress-index/[area].json.ts` — created
*by this round*, by typing the representative ZIP as `Record<AreaId, string>` instead of leaving
it a ternary that handed a third metro a San Antonio ZIP. Trading a silent wrong value for a
compile error is the right trade, and it is still one more row a human has to fill in. The
compiler names all six.

---

## 4 · What adding a metro costs now

Round 39 counted **~15 files, none of which failed loudly.** The count is similar; what changed
is which of them the machine finds for you.

**The compiler stops you and names the file — 6:**
`airnow.ts` · `blsWages.ts` · `censusAcs.ts` · `noaaStormEvents.ts` · `usdaSoil.ts` ·
`data/stress-index/[area].json.ts`

**Config and data you add deliberately — 4:**

1. `src/data/zip-area-crosswalk.csv` — MSA rows from the Census file. **Owner seam.** Unchanged
   by this round and not automatable: a guessed row is a fabricated coverage claim.
2. `src/data/zip-areas.ts` — the one entry everything else now derives from.
3. `src/data/locations/{metro}.yaml` — 8 lines.
4. `src/lib/dataPages/` — the drought and permits specs, plus a storms spec if the metro gets one.

**New code, its own round — 3:**
a permits fetcher (a third API shape) · a `tradeCategories.ts` mapping · `registry.ts` lines.

**Twelve files no longer need touching at all**, where before they either needed a hand edit or —
worse — silently did the wrong thing: `alerts.ts`, `belowHeroReadings.ts`, `signals.ts`,
`ZipPicker.astro`, `ServicePage.astro`, `home/index.astro`, `home/setup.astro`,
`start/index.astro`, `services/index.astro`, `methodology/index.astro`, `acLifespan.ts`,
`roofScan.ts`.

**Still hand-edited, and deliberately not touched — 2.** See §8.

---

## 5 · Proof that nothing moved

**`dist/client` is byte-identical to `main`. All 355 files, 273 of them HTML.** sha256 of every
built file, compared against a build of `origin/main` at `b144db3`:

```
diff base-client.txt final-client.txt   →   (no output)
```

Re-verified after each batch of changes, four times, including after the last three fixes.

**Two honest limits on that proof:**

1. **It covers prerendered output only.** 21 routes are `prerender = false` and are not in
   `dist/client`. Three of them were changed here: `/home/`, `/home/setup/` and
   `/api/intake/[project_id]/complete`.
2. **`dist/server` is not byte-reproducible even on an unchanged tree.** Building `main` twice
   produces a differing `chunks/default-handler_*.mjs` — an internal prerender-manifest chunk-id
   map. File *names* are stable across builds; that one file's contents are not. Pre-existing,
   unrelated to this round, and the reason the proof is stated over `dist/client`.

**The SSR routes were checked by serving them.** The built worker was run against the local
fixture on both `main` and this branch, and `/home/`'s precision note captured per account:

| Fixture account | Area | `main` | branch |
|---|---|---|---|
| POP | austin | Travis County / **Austin** metro | same |
| NOTRASH | austin | Travis County / **Austin** metro | same |
| SA | san-antonio | Bexar County / **San Antonio** metro | same |
| EMPTY | austin | Travis County / **Austin** metro | same |
| FIRED | `fixture-condition` | Travis County / **San Antonio** metro | Travis County / **Austin** metro |

**The one deliberate change, and why.** `FIRED` is the condition-card fixture. Its area id is
`fixture-condition`, deliberately synthetic — `scripts/fixture-condition.ts` asserts the id is
*absent* from `zipAreas.ts` so a fixture can never be mistaken for a real metro — and it borrows
**Austin's** artifact and observations.

The old ternary resolved anything that was not `"austin"` to `"San Antonio"`. So that page has
been rendering *"Readings are for Travis County and the San Antonio metro"* — Travis County is
in the Austin metro. A sentence contradicting itself, over Austin's data, produced by exactly
the defaulting this round removes.

The fix is not a special case for the fixture. `/home/` now takes the label from
`index.areaLabel` — **the same artifact the readings come from** — so the label cannot disagree
with the data it sits beside. For Austin and San Antonio the value is identical, as the table
shows. For the fixture it is now "Austin", which is what the data is.

---

## 6 · The test

`site/scripts/replays/thirdmetrounit.ts`, wired into `npm run sweep`. **40 checks, 0 failures.**

1. **An unknown area has no silent answer** — `areaLabel` and `primaryCountyName` throw, never
   return `"Austin"`, and the message names the known areas so the fix is obvious.
2. **Every known area resolves to its own values**, and no two areas share a label.
3. **Derived lists cannot drift** — `PRIMARY_FIPS` is derived, not hand-keyed; both tools'
   `METROS` equal the config list in config order.
4. **A third metro breaks the build, in named files.** Writes a third entry into the live
   config, runs `tsc`, asserts it fails, asserts each of the six lookups is implicated, asserts
   the three config-driven fetchers are **not**, and asserts nothing else is. The config is
   restored in a `finally`, and **the restore is itself asserted**.
5. **The fixed assumptions stay fixed** — eleven regression guards, one per pattern removed,
   matched against non-comment lines only (the comments quote the old code on purpose).

Section 4 is the one that matters: it tests the claim rather than restating it. It is also what
caught the five-versus-six error above.

---

## 7 · Sweep

**26/28.** The two failures are **pre-existing on `main`** — the same two, verified by stashing
this branch and running the sweep on a clean tree:

- **`weeklyunit`** — reads `/tmp/austin.bak.json` unconditionally at line 34. That file is a
  leftover from a previous run; in a fresh container it does not exist and the unit dies with
  `ENOENT`. A gate that depends on `/tmp` state is not a gate. Backlogged.
- **`r9render`** — fails identically on `main`. Not diagnosed here; out of scope. Backlogged.

Neither is metro-related. Everything else passes, including all thirteen render replays.
`npm run check`: **0 errors, 0 warnings, 0 hints** across 208 files.

**Determinism:** `dist/client` was built four times from an unchanged tree and was byte-identical
every time.

---

## 8 · Not fixed, and why

Two remain. Both are listed rather than stretched into this round.

1. **`components/Nav.astro`** — the Locations dropdown, and the eyebrow string
   `"Austin & San Antonio • more Texas metros coming soon"`. The dropdown could be derived from
   the locations collection in one line. **The eyebrow is owner copy, and CLAUDE.md freezes copy
   once provided.** Deriving the links while leaving a line that names two metros would be worse
   than leaving both alone, because the page would then disagree with itself. This needs
   replacement copy from the owner, which is not mine to write. Held together as one item.

2. **`ingest/fetchers/nws.ts` — the NWS forecast fetcher is Austin-only.** `Record<"austin", …>`;
   San Antonio was never wired to it, and the only export is `nwsAustin`. Left alone
   deliberately: wiring San Antonio means ingesting a feed that is not ingested today, which is
   new data and a behaviour change, and this round's constraint was that nothing moves. Worth
   knowing that this gap is **not** about a third metro — it is a gap in the second one.

**Correct as they stand, checked and left:** `MunicipalCard.astro`'s `isAustin`,
`municipal/watering.ts`, `municipal/match.ts`, `municipal/stageReading.ts`, and
`home/index.astro`'s ARR shard read. All are explicit `areaId !== "austin"` guards that return
*unavailable* / *withheld* / `null` with a stated reason. They fail closed, name the reason, and
are right: those are Austin utility feeds, and no other metro has them.
`lib/dataPages/index.ts`'s `LOCATION_ORDER` is genuinely an ordering — unknown locations sort
last rather than being dropped — so it needed no change.

---

## 9 · Files changed

25. No metro added, no crosswalk row, no permits fetcher, no content, no pages, no SEO.
