# Round 32 — zero broken internal links

Date: 2026-09-22 · Branch: `claude/thi-v3-round32-links`, from `main` at `ace0d4c`.
`c467845` (the Round 31 + 31b merge) is an ancestor of that base, confirmed with
`git merge-base --is-ancestor`.

Changed: `site/src/lib/dataPages/index.ts`, `site/src/lib/analysis.ts`,
`site/src/lib/belowHeroReadings.ts`, `site/src/lib/roofScan.ts`,
`site/src/pages/tools/roof-scan/index.astro`, `site/package.json`.
Added: `site/scripts/check-links.mjs`, `site/scripts/replays/datalinksrender.mjs`.

No copy changed. No data page was added. Nothing under `site/src/data/analysis/` or
`autoposter/` was touched.

---

## 1. Grounding

### The claim: confirmed, at both hrefs named

Both call sites assembled the path from a location slug, unconditionally:

```
site/src/lib/roofScan.ts:129          href: `/data/${metro}/storms/`,
site/src/lib/belowHeroReadings.ts:254 href: `/data/${location}/storms/`,
```

Built output before the fix, from `dist/client`:

```
BROKEN INTERNAL LINKS (href to a path nothing serves): 1
  /data/austin/storms/
     linked from: /austin/roofing/, /tools/roof-scan/
```

Served: `GET http://127.0.0.1:9400/data/austin/storms/` → **404**. One broken target, two
pages, both indexed.

### Why there is no `/data/austin/storms/` — the config answer, corrected

The round asked whether Austin is missing from config or missing the data. Neither, exactly.
**Austin's NOAA storm-events dataset is already published.** It is published as
`/data/austin/roofing/`.

| spec file | `location` | `topic` | `datasetId` | `h1` |
|---|---|---|---|---|
| `austinRoofing.ts` | `austin` | **`roofing`** | `noaa-storm-events` | Austin Hail & Storm Events |
| `sanAntonioStorms.ts` | `san-antonio` | **`storms`** | `noaa-storm-events` | San Antonio Storm & Flood Events |

Both specs read the same feed. The two metros' files are the same shape and both publishable:

```
austin        status=live  non-seed=88  counties=7  window=2025-10-24..2026-06-15
              types={'Wind': 33, 'Hail': 20, 'Flood': 34, 'Tornado': 1}
san-antonio   status=live  non-seed=94  counties=8  window=2025-08-31..2026-06-20
              types={'Flood': 53, 'Wind': 27, 'Hail': 11, 'Tornado': 3}
```

So the href was broken by a **topic slug**, not by a missing dataset and not by a skipped
page. Austin's spec was written with `topic: "roofing"` in an earlier round, when the Austin
authority cluster was roofing; San Antonio's was written with `topic: "storms"`. The readings
layer hard-coded `storms` for every metro and one of them did not have it.

`/data/austin/roofing/` is not a roofing subset of the record — its own description reads
"hail, wind, flood and tornado events for the seven-county Austin area". It is the whole
Austin file, framed for a roofing reader.

### A third unguarded caller, found while grounding

`site/src/lib/belowHeroReadings.ts:336` builds `/data/${location}/drought/` the same way. It
resolves today — `drought.ts` registers `austin` (line 254) and `san-antonio` (line 262) —
so it is not broken, only unguarded. It is routed through the registry with the other two.

### What was already safe

The `/data/{location}/` hub links on `ServicePage.astro:155,206` and `LocationHub.astro:81,113`
are guarded by `hasDataHub(locationSlug)`. Every other `/data/…` href in `src/` is built from
a `spec` that came out of `publishedDataPages()`, so it cannot name a page that did not build.
`BelowHero.astro:352` already rendered its link conditionally; `ContextReading.href` was
already optional. The one render site that did **not** guard was
`src/pages/tools/roof-scan/index.astro:229`.

---

## 2. The fix, at the source

`dataPageLink(datasetId, location, topic?)` and `dataPageHref(...)` live in the registry
(`src/lib/dataPages/index.ts`), beside `publishedDataPages()` and `hasDataHub()`. They return
`undefined` when no such page builds. All four cross-link callers now resolve through them:

| caller | was | now |
|---|---|---|
| `roofScan.ts:133` | `` `/data/${metro}/storms/` `` | `dataPageHref("noaa-storm-events", metro, "storms")` |
| `belowHeroReadings.ts:255` | `` `/data/${location}/storms/` `` | `dataPageHref("noaa-storm-events", location, "storms")` |
| `belowHeroReadings.ts:337` | `` `/data/${location}/drought/` `` | `dataPageHref("usdm-drought", location, "drought")` |
| `analysis.ts:101` | its own copy of the lookup (Round 31) | delegates to `dataPageLink()` |

`ConfirmedHailReading.href` became optional, and the roof-scan render site now guards the
link the way `BelowHero.astro` already did.

**`topic` is not decoration.** The first version of this fix looked up by dataset alone, and
the Austin storms reading silently re-pointed at `/data/austin/roofing/` — a page that exists,
under a heading the link text does not match ("Full storm and flood event data…" landing on
"Austin Hail & Storm Events"). That is a change to what a link means, which is the owner's
call, not a side effect of a link fix. Naming the topic makes the lookup exact: a caller gets
the page it asked for or it gets nothing. `dataPageFor()` (articles) passes no topic, because
a chart's `series` knows only the dataset — Round 31's behaviour there is unchanged.

**The link is withheld, the provenance is not.** The Austin storm-events card on
`/austin/roofing/` and `/tools/roof-scan/` still renders its value, its note, its `LIVE`
badge, *Data through Jun 15, 2026 · Updated: Sep 22, 2026 · Source: NOAA Storm Events
Database*, and its publisher-lag note. It lost one line: the onward link.

---

## 3. The gate

`site/scripts/check-links.mjs` (`npm run check-links`) walks `dist/client`, reads every `href`
out of every built page with `<script>` blocks stripped, normalizes it the way
`trailingSlash: "always"` does, and asserts something serves it. **It exits 1 when one does
not** — that is the point of the round.

A path counts as served if it is a file in `dist/client` **or** matches a route that opts into
SSR. The SSR patterns are read out of `src/pages/**` by looking for
`export const prerender = false`, so adding a server route needs no edit to the checker. Round
31b's ad-hoc version was hand-fed that list and produced three false positives from it.

Run unchanged against the pre-fix tree, it reproduces the finding and fails:

```
272 built pages · 293 distinct internal link targets (21 under /data/) · 354 served paths · 21 server routes
BROKEN INTERNAL LINKS (href to a path nothing serves): 1
  /data/austin/storms/
     linked from: /austin/roofing/, /tools/roof-scan/
[exit 1]
```

After:

```
272 built pages · 292 distinct internal link targets (20 under /data/) · 354 served paths · 21 server routes
BROKEN INTERNAL LINKS (href to a path nothing serves): 0
  none
[exit 0]
```

`site/scripts/replays/datalinksrender.mjs` asks the same question of the **served** site: it
collects every `/data/…` href on every built page and fetches each one through the worker, so
a route that exists as a file and 404s in front of a reader fails too. 34 assertions, 20
distinct `/data/` targets, all 200. Its last section pins the rule: the Austin card keeps its
source, its as-of and its data-through, and carries no link.

`npm run check-orphans` was added to `package.json` at the same time — the script was committed
in Round 29 but was never wired to a script name.

---

## 4. Decision for the owner — an Austin storms page (NOT built)

Out of scope by the round's own terms, and it is a new indexed page over live data, so it is
brought here rather than shipped.

The situation, restated: Austin's 88 storm-event records are published at
`/data/austin/roofing/` under a roofing frame. San Antonio's 94 are published at
`/data/san-antonio/storms/` under a severe-weather frame. The readings layer wanted a
storms-framed Austin page and there isn't one.

**Option A — leave it. (Recommended.)** The link is withheld, the reading keeps its source and
date, nothing is broken, and no second page competes with `/data/austin/roofing/` for the same
records. Cost: an Austin reader looking at a storm-events card has no onward link, where a San
Antonio reader does.

**Option B — point the Austin reading at `/data/austin/roofing/`, with link text that matches
it.** One line in `roofScan.ts` and one in `belowHeroReadings.ts` (drop the `topic`), plus new
link text, because "Full storm and flood event data" is not what that page is called. Gives
Austin the onward link at no new indexed page. Cost: it is copy, and copy is frozen unless you
replace it; and on `/austin/roofing/` the card would link a page the same page already links
elsewhere.

**Option C — build `/data/austin/storms/`.** A new spec beside `sanAntonioStorms.ts`, a new
indexed page, a new CSV. The data supports it — same shape, same publishable state. Cost, and
the reason it is not the recommendation: it would publish the **same 88 records** already at
`/data/austin/roofing/` under a second URL. Against KPI #1 that is two pages splitting one
record set, which is the kind of near-duplicate an answer engine resolves by picking one. If
you want it, the honest version is probably the reverse — one Austin storm-events page with
the roofing reading as a section of it — and that is a URL change with a 301, not an addition.

---

## 5. Verification

Build · check · verify-content, then the full replay suite against the built worker on 9400.

```
npm run build            Complete (272 pages)
npm run check            205 files — 0 errors, 0 warnings, 0 hints
npm run verify-content   ✓ 2 locations × 7 services, 18 data sources, 8 FAQ entries
npm run check-links      0 broken  [gate, exit 0]
npm run check-orphans    0 orphans [exit 0]
wrangler deploy --dry-run  58 modules, 1041 KiB, 4 bindings resolved, exit 0
determinism              two consecutive builds, 354 files, byte-identical (0 differing)
```

Replays — 12 render, 9 unit, all green:

```
aclifespanrender  48    analysisrender  148    dashmobile       38    datalinksrender  34
footerchrome      63    r7replay         68    r9render         18    roofscanrender  105
saservicerender  315    signinrender     18    toolshubrender   44    triagerender    127
alertcopyunit     23    citationcheckunit 13   noticefreshunit  32    climateunit      45
hailunit          46    privacyunit      31    badgeunit  ok  r10unit  ok  weeklyunit  ok
```

`r7replay` reported 4 failures on its first run, all in the CONDITION CARD section, and they
were not this change: that section reads a local fixture artifact written into `dist/` by
`npm run fixture`, and `npm run build` deletes `dist/`. Re-seeded, 68/68.

**Tailwind token leak: none.** `Base.w000Tajl.css` hashes to `0c0f473d…` before and after, and
`index.gO7Hi_YV.css` to `9429c884…` — the sitewide stylesheet is byte-identical, so nothing in
the new comments or code emitted a utility.

Render checks at 390px and 1366px on `/austin/roofing/` and `/tools/roof-scan/`, before and
after, over the NOAA storm-events card:

```
before  austin-roofing  card hrefs=["/data/austin/storms/"]
        …Source: NOAA Storm Events Database / …lag note / "Full storm and flood event data, sources and limitations →"
after   austin-roofing  card hrefs=[]
        …Source: NOAA Storm Events Database / …lag note        (link line gone, nothing else)
before  roof-scan       card hrefs=["/data/austin/storms/"]
after   roof-scan       card hrefs=[]
```

San Antonio is unchanged: `/data/san-antonio/storms/` is still linked from 11 pages and still
returns 200.
