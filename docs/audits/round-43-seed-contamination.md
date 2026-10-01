# Round 43 — removing the fabricated rows from production

Date: 2026-10-01 · Branch: `claude/thi-v3-round43-seed-contamination`, from `origin/main` at
`2745153`. Round 42 is deliberately **not** in this base — the ACS pin is still 2023 here, as
§3 of the brief requires.

**The nine rows were ten.** Round 42's inventory anchored its search on the `2026-08-23`
bootstrap timestamp, and `airnow/san-antonio.json` was seeded a day later, on `2026-08-24`. The
new detector found it on its first run. That is the same class of error as the guard it
replaces — an incidental property standing in for the real one — and it is worth saying plainly
rather than quietly correcting the count.

---

## 1 · The full inventory

Eleven rows across nine files are reproducible from `seed.ts`. Ten carried no `seed: true`
stamp. **Seven are deleted, three are tagged and kept, one was already correct.**

| File | Status | Key | Value | Flagged? | Action |
|---|---|---|---|---|---|
| `eia-electricity/texas.json` | live | `2026-06` | `13.58` ¢/kWh | no | **deleted** |
| `eia-electricity/texas.json` | live | `2026-07` | `13.73` ¢/kWh | no | **deleted** |
| `eia-electricity/texas.json` | live | `2026-08` | `13.88` ¢/kWh | no | **deleted** |
| `airnow/austin.json` | live | `2026-07` | AQI 42, Good | no | **deleted** |
| `airnow/san-antonio.json` | live | `2026-07` | AQI 42, Good | no | **deleted** ⟵ *missed in R42* |
| `census-acs/austin.json` | live | `2026-07` | 34 yrs / 58% | no | **deleted** |
| `nws-api/austin.json` | live | `2026-07` | 96°F / 74°F | no | **deleted** |
| `ercot/texas.json` | sample | `2026-07` | Normal, 61,500 MW | no | tagged, kept |
| `tdi-losses/austin.json` | sample | `2026-07` | Wind/Hail, $482,000 | no | tagged, kept |
| `tx-forest-service/texas.json` | sample | `2026-07` | Moderate | no | tagged, kept |
| `fema-nfhl/austin.json` | sample | `2026-07` | `X (SAMPLE)` | **yes** | unchanged |

The three kept rows are in `status: sample` datasets, which is what a sample dataset is for: a
marked placeholder that `latest()` refuses to serve. They are now tagged, so they are visible to
every guard rather than only to this one.

### Which were published, and what the real series says instead

Only one of the ten reached a rendered figure — but it reached eight pages.

**`eia-electricity`.** The real EIA series is **ten months, August 2025 to May 2026**, ending at
**16.44¢** (May 2026). The feed has not added a month since 2026-08-24 despite ingesting daily.
The three fabricated rows sat on top of it as 2026-06/07/08, and `latest()` takes the newest, so
13.88¢ was the published Texas electricity price.

| | fabricated | real |
|---|---|---|
| Latest month | August 2026 | **May 2026** |
| Latest price | **13.88¢** | **16.44¢** |
| Freshness | `LIVE`, "Data through Aug 1, 2026" | **`OUT OF DATE`**, "Data through May 1, 2026" |
| Record count | 13 | **10** |
| Direction over the window | falling | **rising — +6.3% since August 2025** |

The fabricated tail was not just a wrong number. It was **masking a four-month-old feed**: the
badge read LIVE only because a fabricated row carried a recent date. The honest badge is OUT OF
DATE, and it now says so.

The real series in full: `15.46, 15.83, 16.10, 16.04, 15.87, 15.69, 15.41, 16.39, 16.99, 16.44`
(Aug 2025 → May 2026). Peak **16.99¢** in April 2026; low **15.41¢** in February 2026; average
**16.02¢**. Largest one-month move: **+6.36%**, February to March 2026.

**The other nine did not reach a rendered figure** — `census-acs/austin` (nothing reads
`census-acs` for `austin`), `nws-api` and `airnow` (not the newest row in their files), and the
four sample-status rows (`latest()` returns nothing for a sample dataset). They did reach the
**stress index**, which is §3.

---

## 2 · A · The detection, fixed at the root

### What was wrong

Three guards — `runIngestion`'s retirement filter, `verify-content`'s `looksSeeded`, and
`purge-seed-observations`' `isSeed` — all answered "is this a seed row?" the same way:
`seed === true`, **or** a `sample-` key prefix, **or** the literal `SAMPLE` inside the value.
The purge script called those *"the two fingerprints `seed.ts` has **always** written."*

Measured against `seed.ts`:

| Fingerprint | Generators that write it |
|---|---|
| `sample-` key prefix | 2 of 13 — `noaaStormEvents`, `municipalPermits` |
| `SAMPLE` in the value | 3 more — `fema-nfhl`, `usdm-drought`, `usda-soil` |
| **neither** | **8 of 13** — `eia-electricity`, `nws-api`, `tdi-losses`, `airnow`, `census-acs`, `bls`, `ercot`, `tx-forest-service` |

Those eight were invisible to every guard. The single counter-example proves the mechanism:
`fema-nfhl` is the **only** row in the tree that ever kept its `seed: true`, and it is the one
whose value says `"X (SAMPLE)"` — so the purge could see it and tag it.

### What replaces it

**Reproduction, not recognition.** `seed.ts`'s `Generator` is now a pure function of
`(rand, ingestedAt, now)` — `monthsAgo` read the wall clock directly before — so
`seedObservationsFor(datasetId, location, runDate)` regenerates exactly what seeding wrote on
any past date. `mulberry32` is seeded from `${datasetId}/${location}` and nothing else.

> **A row is seed output iff some candidate run date reproduces its key AND its value exactly.**

This is the PRNG comparison the brief authorised, and it is the method used. It cannot be wrong
in the way a description can, because it never has an opinion about key formats: a fourteenth
generator added tomorrow is covered the day it is written. `seedIfMissing` now goes through the
same function, so the writer and the detector are **one code path** rather than a code path and
a description of it.

`ingestedAt` is deliberately not compared — it is the one field a generator does not determine,
and keying on it is exactly how Round 42's inventory lost `airnow/san-antonio`.

**New:** `src/ingest/seedDetection.ts`. **Rewritten:** `scripts/purge-seed-observations.ts`
(was `.mjs`; it now asks the detector). **Corrected:** `verify-content.mjs`'s `looksSeeded`
keeps its cheap SAMPLE check — a real upstream record containing the word SAMPLE is still a
citation liability — but its comment no longer claims to be authoritative, and it names
`seedunit` as the check that is.

### The one residual failure mode, stated rather than hidden

Because the run date is searched, a generator's values are matchable at any key inside the
window. For `eia-electricity` — the only feed whose real keys share the generator's key format —
a future real reading landing exactly on one of the ten distinct PRNG floats would be deleted.

That is the right trade in both directions, and the reason is structural: **a wrongly deleted
row is self-healing.** `mergeObservations` is keyed on `key`, so the next successful fetch
re-adds it. A fabricated row left in place is not self-healing — it is what put 13.88¢ on the
homepage for six weeks. The seed unit measures the collision surface on every run (§4 of it)
rather than arguing it away.

---

## 3 · B · The standing assertion

`scripts/replays/seedunit.ts`, registered in the sweep. **36 checks, 0 failures.**

The brief's phrasing is the design constraint: *"A guard that has never caught anything is not a
guard."* So it does not only assert absence:

| § | What it proves | Result |
|---|---|---|
| 1 | No reproducible row in any non-sample dataset, over the whole committed tree | **8,806 observations scanned, 0 offenders** |
| 2 | Every generator id is a really-registered dataset | 13 generators, 13 of 18 feeds seedable |
| 3 | **Positive control** — every row of every registered generator is detected | 22 dataset/location pairs, 71 rows, all detected |
| 4 | **Negative control** — measured rows, a near-miss value, and a right-value-wrong-key are *not* flagged | 111 measured rows across 3 live feeds, 0 flagged |
| 5 | **The blind spot, reproduced** — the dead fingerprint test re-run over the same output | **misses 22 of 71**, across all 7 contaminated datasets |
| 6 | Determinism — same answer from three different `now` values | identical |

§5 is the non-vacuity proof that matters: it fails if the fingerprint test ever stops missing
anything, which would mean this round bought nothing. §3's positive control is what makes §1's
"found nothing" meaningful.

**The unit caught its own bug while being written.** The first near-miss control used 13.89¢ as
a value "one cent off" — and 13.89 is *in* the PRNG series, twice. The detector correctly
flagged it and the control failed. It now uses 13.87, which is genuinely absent.

---

## 4 · C · Every page whose figures changed

Measured, not reasoned: `origin/main`'s generated data was built, the rendered text of all 328
built files snapshotted, then the same for this branch. **108 files differ.**

### 4.1 · The electricity figure — 6 pages

| Page | Before | After |
|---|---|---|
| `/` (homepage below-hero) | **13.88¢** · Latest (August 2026) · **LIVE** · Data through Aug 1, 2026 | **16.44¢** · Latest (May 2026) · **OUT OF DATE** · Data through May 1, 2026 |
| `/austin/hvac/` | 13.88¢ per kWh · LIVE | 16.44¢ per kWh · OUT OF DATE |
| `/san-antonio/hvac/` | 13.88¢ per kWh · LIVE | 16.44¢ per kWh · OUT OF DATE |
| `/tools/ac-lifespan/` | 13.88¢ · LIVE | 16.44¢ · OUT OF DATE |
| `/data/texas/electricity-prices/` | see below | see below |
| `/data/texas/electricity-prices/electricity-prices.csv` | 13 records | 10 records |

The data page's computed key findings, before and after:

> **Before** — "Texas households paid an average of **13.88¢** per kilowatt-hour in **August
> 2026** — about **$139** a month on a 1,000 kWh bill. Across the **13** months between August
> 2025 and August 2026, the average was **15.49¢**, ranging from **13.58¢ in June 2026** to
> 16.99¢ in April 2026. **Over the window the price fell 1.58¢ — 10.2% lower than August
> 2025.**" · `LIVE`

> **After** — "Texas households paid an average of **16.44¢** per kilowatt-hour in **May 2026** —
> about **$164** a month on a 1,000 kWh bill. Across the **10** months between August 2025 and
> May 2026, the average was **16.02¢**, ranging from **15.41¢ in February 2026** to 16.99¢ in
> April 2026. **Over the window the price rose 0.98¢ — 6.3% higher than August 2025.**" ·
> `OUT OF DATE`

**The direction of the published trend reverses.** The same page that read as a fall now reads
as a rise, because the fall was the fabrication. Note the last sentence of each: the data page
was publishing its own *"10.2% lower than August 2025"* independently of the article, computed
from the same fabricated row. The article was not the only place that figure appeared.

### 4.2 · Badges and record counts — 4 pages

`/data/`, `/data/texas/`, `/methodology/` and `/methodology/home-stress-index/` all carried the
electricity feed's status. Each moves `LIVE → OUT OF DATE`, `Data through Aug 1 → May 1, 2026`,
and `/data/texas/` moves `13 records → 10 records`.

### 4.3 · The Austin stress index — 96 ZIP dashboards + `/home/`

Removing `nws-api/austin`'s fabricated 96°F day and `airnow/austin`'s fabricated AQI 42 changed
the HVAC signal's inputs:

| Measure | Before | After |
|---|---|---|
| Forecast days in window | 53 | **52** |
| AQI readings in window | 50 | **49** |
| Mean AQI | 49.3 | **49.5** |
| Days ≥ 100°F | 29 of 53 | **29 of 52** |
| Days ≥ 105°F | 7 of 53 | **7 of 52** |
| HVAC score | **34** | **35** |
| Composite (Austin) | **43** — Moderate | **43** — Moderate *(unchanged)* |
| Week-over-week delta | `0` — "No change since the same reading on Sep 23" | `−1` — **"Down 1 point since the same reading on Sep 23"** |

The fabricated rows were *suppressing* the HVAC score — a mild 96°F day and a clean AQI 42 both
pulled it down. The composite is unchanged at 43 because +1 on a 0.2-weighted signal rounds to
the same number. The **delta** moves because `dashboard.ts` recomputes the prior week rather than
storing it, so the prior-week composite moved 43 → 44 and the difference now reads −1.

**San Antonio's stress index is byte-identical.** Its airnow row was removed too, but SA's HVAC
signal reads `nws-api`, which is Austin-only (BACKLOG 17), so nothing moved.

### 4.4 · One page that did NOT change

`/analysis/are-texas-electricity-prices-still-going-up/` — because its figures are static prose,
not computed. That is §5.

---

## 5 · D · The article

**Not rewritten, per the brief.** This is the recomputation and the recommendation.

### Verification status, stated plainly

`dist/` was grepped for every one of the ten fabricated values. **Zero hits everywhere except
three, all in this one article's surfaces:**

| Value | Hits | Where |
|---|---|---|
| `13.58` | 1 | the article body |
| `13.73` | 0 | — |
| `13.88` | 2 | the article body, and its card subhead on `/analysis/` |
| all seven others | 0 | — |

Every data-driven surface is clean. The residue is entirely static copy in the artefact reserved
for the owner, so §5's "zero hits" is met for everything this round was permitted to touch and
unmet for the one thing it was not. Unpublishing is a one-line frontmatter change
(`published: true` → `false`); it is not applied.

### Claim-by-claim recomputation, real series only

| # | tier | as published | recomputed on the real series |
|---|---|---|---|
| **C1** | `data` | "13.88¢/kWh in August 2026" | **No such observation.** The latest real month is **May 2026 at 16.44¢**. |
| **C2** | `derived` | "down 10.2% year over year" | **Not computable at all.** The series spans ten months, so **no month has a year-earlier counterpart**. This cannot be corrected; there is no YoY figure to put in its place. |
| **C3** | `derived` | "down 18.3% from the peak" | **−3.2%** — 16.44¢ (May 2026) against the 16.99¢ April peak. |
| **C4** | `derived` | "16.44¢ in May to 13.58¢ in June, a 17.4% fall in one month" | **No such move exists.** June 2026 is not in the data. The largest one-month move in the real series is **+6.36%**, February to March 2026. |
| C5 / C5n / C5d | `data`/`official`/`derived` | Austin 644 CDD vs 644.8 normal, −0.1% | **Unaffected.** `noaa-climate` is in `NEVER_SEED` and carries zero bootstrap rows. |
| C8 / C8n / C8d | same | San Antonio 607 vs 643.3, −5.6% | **Unaffected**, same reason. |
| **C9** | `external` *(hedged)* | "we cannot say what caused the step down between May and June 2026" | **There is no step down.** The article's most careful claim is a hedge about an artefact. |

### What the ledger recorded, and against what

The ledger is sound as a mechanism and it did its job exactly as specified. The gap is in the
specification.

- **C1 is tier `data`, defined in the ledger's own header as "traces to the feed."** It *did*
  trace to the feed. **The `data` tier verifies provenance to the THI dataset file, not to the
  upstream agency** — and a seed row is in the dataset file. A fabricated row satisfies the
  `data` tier by construction.
- **C2, C3 and C4 are tier `derived`, and their arithmetic is all exactly right.** 13.88/15.46,
  13.88/16.99 and 13.58/16.44 each give the stated percentage to one decimal. Correct arithmetic
  on a fabricated input is still a published falsehood, and `derived` has no way to notice.
- **The verification method cannot catch this.** Round 38 established figure checking by *string
  match against the ledger* — "32 distinct figures, 0 missing." A figure that is in the ledger
  and in the dataset passes every check there is.
- **The card carried it off-site.** `card.headline` is `13.88¢/kWh`, `card.subhead` is
  `down 10.2% year over year`, and the generated OG alt text reads *"13.88¢/kWh, down 10.2% year
  over year. Source: U.S. Energy Information Administration, Aug 2026."*
- **It was posted.** `autoposter/data/published-posts.json` records a Facebook post on
  **2026-09-11**, `post_publish_verified: true`, at
  `facebook.com/1335273942995805_122106384285466373`. The fabricated figure has left the site.
  Nothing has been done about that — it is outward-facing and the owner's.

### Recommendation: **withdraw, do not correct**

Of the brief's three outcomes this is the second — *the real data supports a different answer* —
with the third attached: *and the series cannot answer the question as of today.*

A correction note with fixed figures is not available, for four separate reasons:

1. **C1 has no replacement.** The month the article reports on does not exist in the data.
2. **C2 cannot be recomputed in any form** — a ten-month series supports no year-over-year
   comparison. It is the headline answer *and* the social card's subhead.
3. **C4 is the article's structural claim** — "almost all of it landed in a single month" — and
   there is no such month.
4. **The answer flips.** The article says **No**. `/data/texas/electricity-prices/`, reading the
   same dataset, now renders *"the price rose 0.98¢ — 6.3% higher than August 2025."* Leaving
   the article published puts two THI pages in direct contradiction on the same feed.

And a rewritten article still could not answer its own title: the real series ends in May 2026
and now carries an OUT OF DATE badge. "Are prices still going up?" has no current answer here.

If a page should remain at that URL, the honest form is a **different article** about the window
that does exist — Aug 2025 to May 2026, a 6.3% rise peaking in April — under a title that does
not claim currency, plus a dated correction note recording what the old figures were and why
they were withdrawn. That is a new article, not a correction, and it is a separate round.

**The Facebook post is a separate decision from the page**, and also the owner's.

---

## 6 · Verification

| Check | Result |
|---|---|
| `npm run check` | 0 errors, 0 warnings, 0 hints (216 files) |
| `npm run build` | complete |
| Grep `dist/` for all ten fabricated values | **0 hits**, except 3 in the article's own static copy (§5) |
| `node scripts/run-sweep.mjs` | **28/30** — `weeklyunit` and `r9render`, both pre-existing |
| `seedunit` | 36 checks, 0 failures; positive and negative controls both non-vacuous |
| `check-links` | none broken |
| `check-orphans` | none |
| Build determinism | two consecutive builds byte-identical across 328 files |
| Purge idempotence | re-run changes 0 files; finds only the 4 tagged sample placeholders |

### One test was wrong, and the fix exposed it

`aclifespanrender` failed on "four-bucket badges render". It selects
`.live-badge,.sample-badge,.stale-badge,.unavailable-badge` — but `DataStatus.astro` has **five**
classes and that list gets two wrong: there is no `unavailable-badge` (it is `error-badge`), and
**`aged-badge` is missing entirely**. The assertion passed only while the electricity badge read
LIVE. The moment the fabricated row stopped masking a stale feed, the badge became OUT OF DATE
(`aged-badge`), the selector stopped seeing it, and a correct page failed a stale test.

Fixed the way 41e fixed the station bar: the replay now **reads the class names out of
`DataStatus.astro`** instead of carrying a hand-copied list, so it cannot drift again. 48/48.

---

## 8 · The withdrawal (added after owner approval)

`published: false` is set on `are-texas-electricity-prices-still-going-up`.

### What that alone does to the URL — measured on the built worker

| URL | Status | Note |
|---|---|---|
| `/analysis/are-texas-electricity-prices-still-going-up/` | **404** | 4,347 bytes, Astro's generic fallback |
| `/analysis/this-never-existed/` | **404** | 4,322 bytes — **the same answer** |
| `…-still-going-up` (no trailing slash) | 301 → slash form | then 404 |
| `/analysis/` | 200 | the article is gone from the hub list |

`getStaticPaths` filters on `published === true`, so the route, the sitemap entry, the hub
listing and every related-reading link all disappear together. But the URL's answer is
indistinguishable from one that never existed — a 404 tells a crawler "this may come back."
It was published on 2026-09-11, indexed, and linked.

### 410 is available, and is now what it returns

A status code is a response header, and a prerendered file has no say in how it is served, so
410 needs a rendered response. Two files:

- **`src/data/withdrawnArticles.ts`** — the registry: slug, title, both dates, and the reason in
  one sentence. Entries are permanent; removing one turns the 410 back into a 404 and loses the
  record. A withdrawal is a retraction, not a relocation — a page that *moved* is still a 301.
- **`src/pages/analysis/[...withdrawn].astro`** — `prerender = false`, the second such family in
  the repo after `/api/*`. It renders a brand page and sets **410** for a registry hit, **404**
  for anything else. It reads no dataset, no binding and no network, so the serving work is nil;
  it simply is not pre-done.

Measured after the change:

| URL | Status |
|---|---|
| the withdrawn article | **410 Gone** |
| all five published articles | 200 |
| `/analysis/`, `/`, `/data/texas/electricity-prices/`, `/methodology/` | 200 |
| `/analysis/this-never-existed/` | **404** — a typo is not a retraction |

A rest route under `/analysis/` is exactly the kind of thing that can silently swallow its
siblings, so **`scripts/replays/withdrawnrender.mjs`** asserts all three properties together —
the 410 and its body, that nothing else was shadowed, and that an unknown slug still 404s. It
reads the published list and the registry out of source rather than restating them, so adding or
withdrawing an article updates its coverage automatically. **24 checks, 0 failures**, registered
in the sweep.

### The grep, with the article gone

All ten fabricated values plus the three derived percentages, over 330 text files in
`dist/client`: **0 hits.** Not "0 except the article" — zero.

### ⚠️ One fabricated figure is still publicly served, and the grep cannot see it

`/images/og/are-texas-electricity-prices-still-going-up.png` is a **static asset in `public/`**,
unaffected by `published: false`. It returns **200**, 62 KB, and it is the 1200×630 card reading
*"13.88¢/kWh · down 10.2% year over year · Source: EIA, Aug 2026."*

A text grep of `dist/` reports zero hits because the figure is pixels. Deleting the file is a
one-line change — **but it is the image the live Facebook post of 2026-09-11 embeds**, so
removing it and leaving the post up replaces a wrong figure with a broken image on a page we do
not control. The two are one decision, and both are the owner's (BACKLOG 29).

### Copy status

The 410 page's body and the registry's `reason` string are **copy, drafted not approved** —
shipped only because a status code needs a body. The public correction note for `/methodology/`
is drafted in `docs/drafts/round-43-methodology-correction-note.md` and **is not in the site**.
That draft also notes that `/methodology/`'s existing answer to *"Do you ever publish placeholder
numbers?"* currently claims bootstrap rows "are retired automatically the first time a real fetch
succeeds" — the clause this incident disproves — so the note is two changes, not one.

---

## 7 · What is still open

1. ~~**The article** (§5) — withdraw or rewrite.~~ **Withdrawn** on owner approval; see §8. The
   URL returns 410.
2. **The Facebook post of 2026-09-11** carrying the fabricated card — and with it
   `/images/og/are-texas-electricity-prices-still-going-up.png`, which still returns 200 and
   still shows 13.88¢. One decision, outward-facing, owner's. See §8.
5. **The public correction note** for `/methodology/` — drafted in `docs/drafts/`, not applied.
   Copy is the owner's.
3. **The ledger's `data` tier** means "traces to the THI dataset file," not "traces to the
   upstream source," and nothing in the verification method distinguishes them. Logged as
   BACKLOG 28.
4. **Round 42 stays unmerged** and its audit's count of nine should be read as ten; the figure
   tables there are unaffected.
