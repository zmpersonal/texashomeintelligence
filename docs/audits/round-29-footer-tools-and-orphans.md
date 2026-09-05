# Round 29 — /tools/ made reachable; the Services contradiction, corrected

Date: 2026-09-05 · Branch: `claude/thi-governance-post-launch`
Changed: `site/src/components/Footer.astro` (one `<li>`),
`site/scripts/replays/footerchrome.mjs` (the assertion it was missing).
Added: `site/scripts/check-orphans.mjs`.

---

## 1. The footer link

`<li><a href="/tools/">Tools</a></li>`, in the **Company** column, between **Data Catalog** and
**Methodology**.

Why that column: it already carries Data Catalog and My Dashboard, so it is in practice the
published-surfaces column rather than a company column, and Tools is the same kind of thing as
the two it now sits between — a hub over what the site publishes. A fifth column would change the
footer grid on every page for no benefit. Tools stays **out of the header nav**, which CLAUDE.md
fixes at Data · Locations · My Dashboard.

**How the link was lost, since it was never deliberately removed.** `THI-round-homepage-nav.md`
gave `/tools/` three inbound routes: a primary nav item (§2), a hero secondary CTA — *"Explore
Free Tools" → `/tools/`* (§4) — and one of four below-hero cards (§5). The Round 2 nav change
dropped the nav item; the homepage rebuild dropped the hero CTA and the four cards. Each removal
was correct on its own and none of them was about Tools. Nothing replaced any of them, and no
check noticed, because every check the site had asked whether a link **resolved**, never whether
a page was **reached**.

---

## 2. ⚠️ Correction: Round 28's Services finding was wrong

Round 28's closing paragraph said *"the footer still carries a Services column that
`footerchrome.mjs` actively asserts is reachable."* **Both halves are wrong, and I should have
read the file before writing it.**

Measured now, across all 266 built pages:

- **No page's footer links `/services/`. Zero of 266.** Round 10b removed that link and left a
  comment saying why. The column *heading* still reads "Services", but every link under it goes
  to `/austin/{service}/` — the seven indexed location×service content pages.
- **`footerchrome.mjs` asserts the opposite of what I claimed.** Its actual assertion, on every
  sampled page, is `` `${path} — no /services/ link` `` — it enforces the *absence*. What it
  separately checks is that `/services/` is not orphaned by that removal, and its comment already
  records the Round 15 refinement of exactly that point.

So the footer needed no Services change, and this round made none.

### The residual contradiction, stated precisely

There is still a tension, but it is not in the footer.

> **ROADMAP.md:83-84** — "Bring these back in later rounds; do **not** build them now: … **Services**
> anywhere (permanently removed from nav — do not re-add or link)."

> **CLAUDE.md:85** — "**Services** anywhere (removed permanently from nav; do not re-add)."

> **CLAUDE.md:95** — "Methodology lives in the footer. No Tools, no Services."

Against what the site does: `/services/` renders 200, carries **no** robots directive (so it is
indexed and is in the sitemap), and has **10 inbound links** — from both location hubs and from
eight service pages, all in body content, none in chrome.

**Recommendation: CLAUDE.md's wording is the right one, and the current state is correct as it
stands.** ROADMAP's "or link" should be read as *do not re-add a Services nav item and do not link
the `/services/` hub from navigation* — not *never link anything service-shaped*. What makes me
think so:

1. **CLAUDE.md is declared the superseding document** ("This file **supersedes** the previous
   `CLAUDE.md`… it is the hub"), and its version of the same rule omits "or link" entirely.
2. **Both mentions sit in a clause about navigation.** ROADMAP's is inside the nav-change bullet
   ("drop Tools + the section directly below the homepage hero; no Services"); CLAUDE.md's is
   inside the nav-for-this-build paragraph.
3. **The strict reading contradicts CLAUDE.md's own architecture rule.** "Location×service pages,
   hubs, and data pages generate from content collections… Adding a metro or service = config" is
   a non-negotiable engineering rule in the same file. Fourteen of those pages are indexed
   content and the footer's seven links are a substantial share of the site's internal linking;
   the strict reading would orphan them, which is the defect this very round exists to fix.

**The one open item for the owner, which is genuinely a decision and not an inference:**
`/services/` the hub page is still indexed and still linked in-body from ten pages. If "do not
link" was meant to cover that page too, the fix is to noindex it and drop the ten in-body links —
a small, contained round. If it was meant to cover navigation only, the current state is already
right and ROADMAP's line is worth softening to match CLAUDE.md's. **I recommend the latter**, but
it is a wording decision about intent, so it is yours rather than mine, and I have not edited
ROADMAP.

---

## 3. The orphan report

Run over all 266 built pages: every internal `href` in the whole document (chrome included,
because a crawler does not care which region a link is in), against robots directives and the
sitemap. `scripts/check-orphans.mjs` is committed so it can be re-run.

**Definition:** indexed + in the sitemap + no inbound link from any page outside its own path
subtree.

### Before

| page | status |
|---|---|
| **`/tools/`** | **ORPHAN** — inbound only from `/tools/ac-lifespan/`, `/tools/plumbing-triage/`, `/tools/roof-scan/`, i.e. its own children's breadcrumbs |
| everything else | reachable |

**And it compounded.** Each of the three tools had exactly **one** inbound source outside its own
subtree — `/tools/` — so the whole tools subtree, four indexed pages including three working
tools, hung off a page nothing pointed to.

### After

**Zero orphans.** All four tool pages are now reachable from every page on the site.

### One deliberate exclusion, stated so it cannot hide anything

The homepage. Every path begins with `/`, so "outside its own subtree" excludes the entire site
for the root and it reports as an orphan on any site whatsoever. It is excluded by rule in the
script's header, not by a silent special case.

### What else the measurement caught

- **`/start/` is noindexed and linked from three indexed pages** (`/`, `/privacy/`, `/tools/`).
  The inverse pattern: readers routed to a page search engines are told to ignore. Deliberate for
  the two governance links, arguably fine, reported rather than changed.
- **`/start/` renders no `<h1>`** — `footerchrome.mjs` prints `"undefined"` for it. Pre-existing,
  noindexed, untouched.
- **229 indexed pages have exactly one inbound source outside their subtree.** 225 of those are
  `/dashboard/<zip>/` hanging off `/dashboard/`, which is the selector working as designed. The
  other four are `/data/texas/` (← `/data/`) and the three tools (← `/tools/`). Not a defect; the
  number is worth knowing, because "one link away from a hub" is one accidental removal from the
  state this round just fixed. The check prints the non-dashboard ones every run for that reason.
- **No page is indexed but missing from the sitemap.**

---

## 4. The Tailwind leak: a guard is possible, and the problem is larger than five occurrences

I probed the guard the round proposed — *does the compiled stylesheet contain a class the site
does not use?* — before recommending it.

**The naive form is unusable: 134 of 273 class selectors in the compiled sheet never appear in any
built HTML.** Most of that is a false positive of my own probe: the `v2-*`, `sig-*`, `citysvc-*`,
`muni-*`, `queue-*` and `notify-*` families are the signed-in dashboard's, which is server-rendered
and has no static file to scan. A usable version has to render the SSR routes first.

**But it found something the round did not anticipate, and it changes the framing.** After setting
the component classes aside, roughly **thirty Tailwind utilities are emitted into the sitewide
stylesheet that nothing on the site uses.** Traced to source, every one comes from the word
appearing in prose, a CSS property name, or an identifier:

| utility emitted | where the word actually appears |
|---|---|
| `isolate` | `src/ingest/fetchers/austinWaterStage.ts` |
| `ordinal` | `src/lib/stressIndex/config.ts` |
| `shrink` | `src/ingest/fetchers/usdaSoil.ts` |
| `lowercase` | `src/ingest/tradeCategories.ts` |
| `blur` | `scripts/replays/climateunit.ts` |
| `invisible` | `scripts/replays/saservicerender.mjs` |
| `filter`, `fixed` | `src/components/BelowHero.astro` |
| `rounded`, `grow`, `shadow` | `src/styles/thi/readme.md` |
| …and ~20 more | prose and identifiers across `src/` and `scripts/` |

**So this is not a Round-25-onwards regression. It has been happening continuously since the
project started, and the stylesheet already carries a standing accumulation of it.** Rounds 25-28
only *noticed* three of them because they happened to change a content hash in the middle of a
round that was proving nothing else changed. The other thirty went in silently.

### Recommendation

**A snapshot check, not a semantic one.** Keep a committed list of the utility class names the
compiled stylesheet is expected to contain; fail the check when a new one appears. It is precise
(no inference about whether a class is "used"), it has no false positives, it catches the leak on
the first build after it happens, and its remedy is a deliberate one-line decision — reword the
token, or update the snapshot on purpose.

**Not implemented here.** The round said to implement only if it is genuinely a one-line addition
to an existing check, and it is not: it needs a generated baseline, a comparison step, and a
documented update path. It also should not be added in the same round that changes the stylesheet's
inputs. **Recommended as its own small round**, and worth doing — thirty utilities of dead CSS is
minor as bytes and significant as a signal that the build has an unwatched input.

---

## 5. Verification

`npm run build` · `npm run check` (0 errors, 0 warnings, 0 hints) · `npx tsc --noEmit` clean ·
`npm run verify-content` clean · `node scripts/check-orphans.mjs` → **0 orphans**.

Full cold-start replay suite green: **63** footerchrome (up from 46 — the new assertions) + 44
tools hub + 104 roof-scan + 38 dashboard + 48 ac-lifespan + 127 triage + 315 service + 68 r7 + 18
sign-in + 18 r9, plus every unit replay.

### Reachability, clicked rather than inspected

`/tools/` opened by clicking the footer link from four pages outside its subtree — `/`,
`/austin/roofing/`, `/data/`, `/dashboard/78704/` — each landing on
*"What we have built, and what we will not publish"*.

**All 15 footer links resolve 200.**

### Phone widths

| width | scrollWidth | past the edge (whole page / footer) | footer grid |
|---|---|---|---|
| 320px | 320 | 0 / 0 | `128px 128px` |
| 360px | 360 | 0 / 0 | `148px 148px` |
| 390px | 390 | 0 / 0 | `163px 163px` |

The footer is a two-track grid on a phone and the added item reflows with the column. The Tools
link measures 34×18px — the same 18px line-height every footer and breadcrumb link on the site
has, which is the standing sitewide tap-target finding from Round 26, unchanged and still
recommended for its own accessibility round.

### The comparison used, and why

**The stylesheet's content hash did not change** (`Base.CXq_0MfF.css` before and after), so the
Round 26 hash-normalisation is not what this round needs. The change is one `<li>` in shared
chrome, which alters every page's bytes, so:

- **Raw bytes:** 266 of 343 artefacts differ — every HTML page, as expected, and the 77 non-HTML
  artefacts identical.
- **Footer stripped, then compared byte-for-byte:** **343 of 343 identical, 0 differ.**
- **Across all 266 changed pages there is exactly ONE distinct footer delta**, and it is the
  added list item — computed as a diff, not asserted.

The six service pages, all three tools, `/methodology/home-stress-index/`, both
`data/stress-index/*.json` and **`sitemap-0.xml`** are unchanged (the last three byte-identical
outright).
