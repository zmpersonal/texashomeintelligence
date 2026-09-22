# Round 31 — Analysis discoverability and article formatting

Date: 2026-09-22 · Branch: `claude/thi-v3-round31-analysis`, from `main` at `a995ebc`.

Changed: `site/src/components/Footer.astro` (one `<li>`),
`site/src/pages/analysis/index.astro`, `site/src/pages/analysis/[slug].astro`,
`site/src/styles/global.css`, `site/scripts/replays/roofscanrender.mjs` (one stale assertion).
Added: `site/src/lib/analysis.ts`, `site/scripts/replays/analysisrender.mjs`,
`docs/v3/BACKLOG.md`.

**No article copy changed.** `git diff --stat main -- site/src/data/analysis/` is empty, and so
is the same diff for `autoposter/`.

---

## 1. Grounding: what the backlog got right, and the one thing it got wrong

The backlog's notes were written from a chat read of `main` at `a995ebc`. Verified against the
repo before building, per Rule 1 and the Round 30 precedent.

### Item 10 — the orphan claim: **confirmed for the hub, refuted for the articles**

The backlog says *"The hub and every article appear to be orphans."* Half of that is right, and
the half that is wrong matters, because it changes what fixes it.

`scripts/check-orphans.mjs` on unmodified `main`:

```
272 built pages · 268 sitemap entries

indexed pages with only ONE inbound source outside their subtree: 234
  /analysis/are-texas-electricity-prices-still-going-up/      <- /analysis/
  /analysis/did-austins-ac-rush-follow-the-heat-in-august-2026/ <- /analysis/
  /analysis/is-austins-home-improvement-boom-cooling-off/     <- /analysis/
  /analysis/san-antonio-home-improvement-boom-august-2026/    <- /analysis/
  /analysis/was-august-2026-hotter-than-normal-in-texas/      <- /analysis/
  …
ORPHANS (indexed, in the sitemap, nothing outside the subtree links them): 1
  /analysis/
     inbound, all from inside its own subtree: [the five articles' breadcrumbs]
```

- **`/analysis/` is an orphan.** Indexed, in the sitemap, and its only inbound links are the
  breadcrumbs of its own five children.
- **The five articles are not orphans.** Each has exactly one inbound link from outside its own
  subtree — the hub. They were unreachable *in practice* because the thing linking them was
  itself unreachable, which is not the same fact and is fixed by one link rather than five.

This is the identical shape Round 29 found at `/tools/`: a hub nothing points to, with the real
pages hanging off it. The objective was unchanged, so the round continued.

### Item 9 — the formatting claims: **all confirmed**

Checked against the built HTML of `/analysis/are-texas-electricity-prices-still-going-up/`:

| Claim | Verdict | Evidence |
|---|---|---|
| No visible publish/updated date; metadata only | ✅ | `"2026-09-11" in article text: False`; `datePublished` present in JSON-LD |
| "The short answer" renders as ordinary prose | ✅ | `<h2 id="the-short-answer">The short answer</h2>`, no styling |
| Headline figure not elevated, though `card` holds it | ✅ | the template never read `card` |
| Sources list is bare text | ✅ | `<li>U.S. Energy Information Administration — as of 2026-08-01</li>` |
| No related reading, no link to the data page | ✅ | no "More analysis"; no `href="/data/…"` in the article |

### The schema, as found

`content.config.ts` → `analysis`: `title`, `description`, `publishedAt`, `updatedAt?`,
`published` (the deploy-on-command gate), `metrics`, `sources[{name, asOf}]`, `embed?{series,
caption}`, `card?{question, headline, subhead, source, asOf}`. The backlog described the `card`
block correctly.

Two findings that shaped the build:

- **`sources` has no URL field.** So sources are named, not linked. A proposal is in §6.
- **All five articles are `published: true`, all five carry a `card` block, and none carries
  `updatedAt`.** So every article shows a key-figure strip, and every date line reads
  "Published …" with no "Updated" — which is the honest rendering, not a missing feature.

### One correction to the round prompt's own framing

The prompt says to base the work on `main` at `a995ebc`. This session's clone was on the Round 29
branch, 140 commits behind, with no `/analysis/`, no articles and no `autoposter/`. The branch was
cut fresh from `origin/main` at `a995ebc` before anything was read or written.

---

## 2. Reachability

One `<li>` in the footer's Company column, between **Data Catalog** and **Tools** — where Round 29
placed Tools, and for the same reason: that column already carries the site's published surfaces.

```
ORPHANS … : 1   →   ORPHANS … : 0
```

The "More analysis" block is the second half of the effect. Four of the five articles went from
one inbound source to several; only the oldest still sits at one, because it falls outside the
three most recent that the newer articles link back to.

Reachability was verified by **clicking**, not by reading markup: from `/`, `/austin/roofing/`,
`/data/` and `/tools/`, the footer link lands on `/analysis/`.

---

## 3. The hub

Newest first. Each entry: date, title, standfirst, and — where the article stores one — the
headline figure, its movement and its provenance, in the mono/eyebrow/value rhythm the data cards
use. `CollectionPage` with an `ItemList` built from the same array the page renders, so the schema
cannot describe a different set of articles than the reader sees (5 items, contiguous positions,
every item carrying `url` and `name`).

---

## 4. The article template

- **A visible date line.** "Published Sep 18, 2026". `updatedAt` renders only when stored.
- **The answer box.** Styled off `h2#the-short-answer` plus its following paragraphs. The shape
  was measured, not assumed: all five articles render that heading followed by exactly two
  paragraphs, and `analysisrender.mjs` asserts it, so a sixth article with a different shape fails
  the check rather than rendering oddly. It is a tinted panel with a navy rule, and it degrades
  rather than breaks — a future third paragraph renders as ordinary prose, a shorter panel rather
  than a torn one.
- **The key-figure strip.** Rendered from the `card` block and nothing else. No `card`, no strip.
- **Sources**, named with their `asOf`, formatted honestly (see §5).
- **"More analysis"** — the three other most recent published articles, at build time.
- **A link to the underlying data page** where `embed.series` names one, resolved through the
  existing `publishedDataPages()` registry rather than a URL assembled from the slug, so it cannot
  point at a page that does not build.
- **A reading measure** — see §7, which is where this turned up something.

**One amber accent per view**, per BRAND.md: the key-figure strip's left rule is the only Caliche
Amber on an article page, which is why the answer box below it is deliberately navy-on-mist.

---

## 5. The honesty gate, item by item

- **Every figure traces to stored text or the `card` block.** `analysisrender.mjs` compares the
  rendered strip string-for-string against the frontmatter for all five articles — headline,
  subhead, and `source · asOf`. Nothing is computed at render time.
- **Dates are the frontmatter dates, labelled.** With one correction the round surfaced: the
  shared `machineDate()` normalises through `toISOString()`, turning `"2026-09-18"` into
  `"2026-09-18T00:00:00.000Z"`. That is a valid timestamp and the wrong fact — it asserts midnight
  UTC, which a consumer rendering in local time shows as **September 17 across the Americas**, a
  published date one day earlier than the article's. The thirteen other callers of that helper pass
  real timestamps where the time component is genuine, so `articleDatetime()` is local to the
  analysis layer: a date-only value in, the same date-only value out.
- **Sources are named, not linked.** The schema stores no URL, and inventing one is exactly the
  plausible-looking detail this site does not publish.
- **`asOf: "1991-2020"` renders as a period, not a date.** The field holds two different kinds of
  value; `asOfDisplay()` formats what is a date and passes through what is not, and only the former
  gets a `datetime` attribute. On the page: *"as of Aug 1, 2026"* beside *"as of 1991-2020"*.

### Typographic minus signs: measured, and deliberately not done

The round scoped this as "only if it can be done in the template layer without altering the stored
text". Measured across all five articles, every hyphen-before-a-digit is:

```
  . Climate Normals 1991-2020"      ← a date range, ×5
  . Climate Normals 1991-2020).
  . Climate Normals 1991-2020,
  d against a fixed 1991-2020
  ed against NOAA's 1991-2020
  oling degree-days, or -5.6%       ← the only true negative number
```

**One genuine negative figure exists.** A blanket transform would corrupt five date ranges into
`1991−2020`. A rule narrow enough to be safe (space before, digit after, no digit before) is
implementable as a rehype text-node plugin — but Astro's markdown config is global, so it would
apply to every collection on the site to fix one character. Not built. It is a proposal in §6.

---

## 6. Decisions for you

### D10a · "Analysis" in the header nav — **left blank, so not built**

**Recommendation: yes.** The analysis layer is the site's most citable surface and KPI #1 is
citation. CLAUDE.md fixes the nav at `Data · Locations · My Dashboard`, so this is a Rule 1 change
to that line rather than a build detail. **Placement: between Data and Locations** — it reads as
a sibling of Data (both are "what we publish") and keeps My Dashboard in its locked top-right slot.
The footer link this round shipped already removes the orphan, so the nav item is an amplifier,
not a fix.

### D10b · Homepage "Latest analysis" module — **left blank, so not built**

**Recommendation: yes, three most recent, rendered at build time.** Placement: below the hero and
above the existing content, as a three-card row reusing the hub's card markup — no new components.

**The copy slot is one line and it is yours:** a section heading of two to four words. The module
needs nothing else written; every other string on it comes from the articles. Suggested shapes,
none of them adopted: "Latest analysis", "Recent analysis", "What we've been measuring".

*Note on frozen copy:* the homepage carries provided copy. This module adds a section rather than
editing one, so no frozen string is touched — but the heading has to come from you under the copy
rule.

### Schema proposal · an optional `url` on `sources[]`

Sources currently render as names only, because the collection stores no URL. A citable page whose
sources are unlinked is doing less than it could for KPI #1.

**Proposal:** `sources: z.array(z.object({ name, asOf, url: z.string().url().optional() }))` —
**additive and optional**, so every existing article and every article the autoposter writes today
remains valid. The template would link a source only when a URL is present and render a bare name
otherwise. Surfaced rather than applied: the autoposter writes against this schema, and a schema
change is its decision to make as much as the site's.

### A second proposal · the typographic minus

As §5 measures: one occurrence, and the safe fix is a global markdown plugin. Worth doing only if
you want it applied across all collections, not for this one character.

---

## 7. Findings this round surfaced but did not fix

### The article column had no gutter

Measured at 390px: the article's text began at **x=0**, flush against the viewport edge, while
every other page on the site starts at x=20. The `<article>` was a direct child of the layout with
no `.wrap`. Full-bleed prose hid it; giving the article a reading measure made it plain.

**Fixed, because "a comfortable reading measure" is this round's scope.** The article now sits in
the site's standard centred column: 20px gutter at 390px, and a 653px measure starting at x=300 on
desktop.

### A broken internal link, pre-existing, out of scope

The link check found four candidates. Three are false positives of the checker — `/home/` and
`/home/sign-in/` are SSR routes with no static file, and `/dashboard/${e}/` is a template literal
inside a script string. **One is real:**

```
  BROKEN /data/austin/storms/ from ['/austin/roofing/', '/tools/roof-scan/']
```

`lib/roofScan.ts:129` and `lib/belowHeroReadings.ts:254` both build `/data/${location}/storms/`,
but only San Antonio has a storms data page (`dataPages/sanAntonioStorms.ts` is
`location: "san-antonio"`). So both Austin surfaces link a page that does not exist.

**Pre-existing on `main`** — confirmed by building unmodified `main` and finding the same link and
the same absent route. Not fixed here: service pages and tool pages are explicitly out of this
round's scope. The fix shape is either an Austin storms data page, or guarding the href against the
published registry — which is what `dataPageFor()` in `lib/analysis.ts` now does for articles, and
is reusable.

### A stale assertion, flipped by good news

`roofscanrender.mjs` failed on arrival — **on unmodified `main` as well as on this branch**, which
was checked before anything was touched. The cause is that the SWDI ingestion Round 27 was waiting
for has landed: `swdi-nx3hail` is now committed and live with 268 Austin and 190 San Antonio
signatures, so the radar card carries a real count where it used to say "Not published yet". Round
27's assertion described the old state.

The assertion is now state-aware: it asserts the unavailable state when no dataset is committed and
a real, box-scoped, radar-derived count when one is — so it holds in both worlds and cannot go
stale again. What it checks in either state is unchanged: never a bare zero standing in for a feed
we do not hold, and always the product named as radar-derived rather than confirmed hail.

---

## 8. Verification

`npm run build` · `npm run check` (0 errors, 0 warnings, 0 hints) · `npx tsc --noEmit` clean ·
`npm run verify-content` clean · `node scripts/check-orphans.mjs` → **0 orphans** ·
`wrangler deploy --dry-run` clean (all four bindings resolve).

**Determinism:** two consecutive builds, **354 of 354 artefacts identical**.

**Replay suite, all green:** analysisrender **110** (new) · toolshub 44 · footerchrome 63 ·
roofscan 105 · dashmobile 38 · ac-lifespan 48 · triage 127 · sign-in 18 · r9 18 · saservice 315 ·
r7 68, plus every unit replay (alertcopy 23, citationcheck 13, climate 45, hail 46, noticefresh 32,
privacy 31, r10, weekly, badge, trade-mapping 14).

`check-citations.ts` reports 11/11 unresolved. That is this sandbox's standing condition — every
cited host is proxy-denied — and is why `citationcheckunit` exists and passes: it tests the checker
rather than the network.

**Widths:** `/analysis/` and all five articles, 390px and 1280px — scrollWidth equals clientWidth,
**0 elements past the edge**, at every width.

**With scripting disabled:** the date line, the key figure, Sources and "More analysis" are all in
the served HTML, and the hub lists all five articles.

**Performance**, mobile viewport, three runs each, median (Lighthouse is not installed and COST.md
asks before a dependency, so this is the browser's own `PerformanceObserver` — the same entries
Lighthouse reads):

| | LCP median | CLS median |
|---|---|---|
| `main` | 84 ms (runs: 96 · 84 · 64) | 0 |
| this branch | 100 ms (runs: 100 · 100 · 88) | 0 |

**No CLS regression.** The LCP difference sits inside overlapping run-to-run noise at these
magnitudes on a local worker; both are an order of magnitude under any budget.

### What changed, and what did not

The footer is on every page and the stylesheet is content-hashed, so raw bytes differ on all 272
pages. Normalising the site footer and the stylesheet filename:

- **347 of 354 artefacts identical.** The 7 that differ are the analysis hub, the five articles,
  and the superseded stylesheet filename.
- **Exactly one distinct site-footer delta across every page**, computed as a diff:
  `+<li><a href="/analysis/">Analysis</a></li>`.
- **The compiled stylesheet gained 24 classes, all of them this round's `.analysis-*` rules, and
  removed none** — no Tailwind scan leak.
- The six service pages, all three tools, `/methodology/home-stress-index/`, both
  `data/stress-index/*.json` and **`sitemap-0.xml`** are unchanged.
