# Round 26 — The dashboard overflowed a phone, and what was actually causing it

Date: 2026-09-05 · Branch: `claude/thi-governance-post-launch`
Changed: `site/src/styles/global.css` (two rules, 45 bytes compiled).
Added: `site/scripts/replays/dashmobile.mjs` (38 assertions).

REVIEW.md §5 requires "no horizontal scroll" at phone widths. `/dashboard/[zip]/` had
been failing it.

---

## 1. Before — measured, not inferred

Every element whose border box left the viewport, at 320 / 360 / 390px, on the public ZIP
dashboard, all three signed-in fixtures, the ZIP prompt, and three control pages.

| page | 320px | 360px | 390px | elements past the edge @320 |
|---|---|---|---|---|
| `/dashboard/78704/` | **451** | **451** | **451** | **17** |
| `/home/` (POP) | 320 | 360 | 390 | 0 |
| `/home/` (FIRED, condition active) | 320 | 360 | 390 | 0 |
| `/home/` (EMPTY, no home yet) | 320 | 360 | 390 | 0 |
| `/dashboard/` (ZIP prompt) | 320 | 360 | 390 | 0 |
| `/austin/hvac/` (control) | 320 | 360 | 390 | 0 |
| `/tools/plumbing-triage/` (control) | 320 | 360 | 390 | 0 |
| `/tools/ac-lifespan/` (control) | 320 | 360 | 390 | 0 |

**`scrollWidth` was 451 at every width.** A page that overflows because text will not wrap
gets *worse* as the viewport narrows; one that reports the same number at 320, 360 and 390
is being held open by a **fixed minimum**. That reading is what sent the investigation to
intrinsic sizing rather than to the copy.

### The chain, from the browser

```
body                 rect 320   @0..320
main                 rect 320   @0..320
section.dash-hero    rect 320   @0..320
div.wrap             rect 320   @0..320    padding: 0 20px
div.dash-hero-grid   rect 280   @20..300   grid-template-columns: 430.531px   ← here
div.dash-score-panel rect 431   @20..451   min-width: auto
```

`.dash-hero-grid` **is 280px and fits.** Its single `1fr` column resolved to **430.531px**
and overflowed it. A grid container does not grow to contain an oversized track and does not
clip one — the track simply hangs out, and every item in it is stretched to match.

### Cause per element

**Cause A — a grid item's automatic minimum size (2 elements, and the reason for the 451).**
`min-width: auto` on a grid item resolves to `min-content`, not to zero. The track was
therefore sized to the widest unshrinkable descendant of either panel.

| element | width | why |
|---|---|---|
| `div.dash-picker-panel` | 431px | **the driver.** Measured min-content 431px = its own content's 393px + 18px padding and 1px border each side |
| `div.dash-score-panel` | 431px | not a driver — measured min-content well under 280px; stretched to the track its sibling set |

**Cause B — a non-wrapping flex line inside the driver.** These two are what make the
driver's min-content 393px. Only the button leaves the viewport itself; the select sits
at `right: 281px` and is listed here because it sets the width, not because it overflows.

| element | width | why |
|---|---|---|
| `select#zip-select` | 242px natural | a `<select>` is intrinsically as wide as its widest option. 225 ZIPs; widest is `76511 — Williamson County`. `min-width: 0` lets it *shrink* but does not reduce its **min-content contribution**, which is what the grid track consumed |
| `button.btn` "Show the read" | 143px | `white-space: nowrap` (deliberate — a two-word label should not break) + 18px side padding. Genuinely unshrinkable |

`242 + 8 gap + 143 = 393px` on one `flex-wrap: nowrap` line. That is the 393, and the 431,
and the 451.

**Passengers — no cause of their own (13 elements).** `h1.dash-h1`, `div.dash-score-row`,
`div.dash-score-read`, `p.dash-verdict`, `p.dash-interpret`, `p.dash-delta`, `p.dash-cadence`,
`p.dash-caveat`, `p.dash-links`, `form.zip-picker`, `p.zip-picker-note`, `p.dash-precision`,
and a `<time>` inside `.dash-delta`. Every one had `scrollWidth === clientWidth` — their
content fit; they were being stretched.

**Eleven of the seventeen elements past the edge are the score panel and its contents, and the
score panel was never the problem.** Round 25's incidental report named `.dash-score-panel`,
`.dash-h1` and `.dash-score-row` as the offenders — all three are passengers, and the actual
driver, the ZIP picker, was not in that list. Counting elements at the edge would have sent
this round at the score panel and it would have found nothing wrong with it.

### Not the cause, checked because Round 25 found exactly this on another page

**No unbreakable string.** The probe recorded the longest whitespace-free token directly
inside every overflowing element. Nothing over 18 characters, no bare URL, no `white-space:
nowrap` outside the button, no table. This was not the AC Lifespan defect a second time.

### Confirming experiment

Injecting `.dash-hero-grid > * { min-width: 0 }` at runtime, before any file was edited:
`scrollWidth` **451 → 320, 0 elements past the edge**. That is the proof that the panels'
own content fits at 280px and that nothing needed to be redesigned, shrunk or removed.

---

## 2. The signed-in dashboard

**Clean at all three widths, and not by luck.** `/home/` renders **none** of the offending
components — no `.dash-hero-grid`, no `.dash-picker-panel`, no `.zip-picker-row`, no
`.dash-score-panel`. It shares only `.dash-verdict`, `.dash-caveat` and `.dash-links`, which
are plain text blocks with no intrinsic minimum. Its own grid containers
(`.v2-status-grid`, `.v2-act-grid`, `.v2-keep-grid`) all report a 280px track in a 280px
container at 320px. The defect could not have reached it.

All three fixture states were tested: POP (normal), FIRED (a condition actively firing, which
renders the alert card), EMPTY (signed in with no home yet).

---

## 3. The fix — one rule per cause

Both in `site/src/styles/global.css`. **No `overflow-x: hidden`, no scroll container, no
`max-width` band-aid, no markup change.**

```css
/* Cause A */
.dash-hero-grid > * { min-width: 0; }

/* Cause B */
.zip-picker-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
```

**Either one alone takes `scrollWidth` to 320.** They are both here because they fix
different things:

- `min-width: 0` makes the **track track the container**. Without it the page overflows.
- `flex-wrap: wrap` decides **what happens to the picker once it must fit**. Without it,
  `min-width: 0` crushes the select to `280 − 8 − 143 = 129px` and the selected ZIP reads
  `78704 — Trav…`. The number would be green and the control would be worse. Wrapping lets
  the button drop below the select and both keep their full size.

That second point is the BRAND.md line: the fit was not bought with type or spacing. Measured
after the change at 320px — `.dash-h1` 22.4px, `.ring-score` 32px, `.dash-verdict` 16.32px,
`.dash-interpret` 16px, `.dash-cadence` 12px, ring 108px, hero padding `32px 0 36px`, picker
padding `18px` — **all identical to before.** Above roughly 430px of column width the picker
row is unchanged, so the desktop layout is untouched.

---

## 4. After

| page | 320px | 360px | 390px | elements past the edge |
|---|---|---|---|---|
| `/dashboard/78704/` | **320** | **360** | **390** | **0 / 0 / 0** |
| `/dashboard/78201/` (San Antonio) | 320 | 360 | 390 | 0 / 0 / 0 |
| `/home/` × 3 fixtures | 320 | 360 | 390 | 0 / 0 / 0 |
| `/dashboard/` | 320 | 360 | 390 | 0 / 0 / 0 |
| `/austin/hvac/`, `/tools/plumbing-triage/`, `/tools/ac-lifespan/` | 320 | 360 | 390 | 0 / 0 / 0 |

**It fits because it lays out, not because something clipped** — asserted, not assumed:

- elements clipping horizontal content: **0** (no element with `overflow-x: hidden/clip/scroll`
  has `scrollWidth > clientWidth`)
- `.dash-hero-grid` track **280px** in a 280px container
- both hero panels **280px**
- the select renders at its full natural **242px**, showing `78704 — Travis County` entire
- the button is **143×54** and sits on its own line

---

## 5. Nothing else moved

The change is to a stylesheet every page loads, so **every page's `<link>` href changed** —
the filename carries a content hash. Raw bytes are therefore the wrong comparison and would
report 268 changed pages that are identical documents. Compared with the hashed stylesheet
filename normalised to a constant:

- **344 of 345 build artefacts unchanged.** The one that changed is the stylesheet itself.
- Its **entire** delta, diffed against the previous build: `.dash-hero-grid>*{min-width:0}`
  and `flex-wrap:wrap;`. 45 bytes. Nothing else.
- Content-compared explicitly: the six service pages, `/tools/plumbing-triage/`,
  `/tools/ac-lifespan/` and `/methodology/home-stress-index/` — **all unchanged**.
- `data/stress-index/austin.json` and `san-antonio.json` — **byte-identical**.
- The rendered reading is asserted against the served artifact rather than a pinned number:
  page score **45** = artifact score 45, band `MODERATE` = `Moderate`, five signal cards, and
  the methodology link still present at 320px (BRAND.md allows no score without it).

`build` · `check` (0 errors, 0 warnings, 0 hints) · `tsc --noEmit` · `verify-content` clean.
Full cold-start replay suite green: **38** new + 48 ac-lifespan + 127 triage + 315 service +
68 r7 + 46 footer + 18 sign-in + 18 r9, plus every unit replay.

---

## 6. The breadcrumb tap target — its own round, not this one

Round 25 measured breadcrumb links at **17px** tall against WCAG 2.2 SC 2.5.8's 24px minimum.
**Different cause, and it does not belong here.**

- The overflow is one page's **intrinsic sizing**. The tap target is **sitewide chrome's line
  height** — it measures 17px on `/austin/hvac/` and `/tools/ac-lifespan/` too, at every
  width, and it is 17px on a 1440px desktop where nothing overflows at all. Neither fix
  touches the other's code.
- The two rules here are scoped to `.dash-hero-grid` and `.zip-picker-row`. A breadcrumb fix
  is a change to `.breadcrumbs a` on all 268 pages — a different blast radius, needing its own
  before/after across the site rather than on one page.
- It is also not purely mechanical: reaching 24px means added padding or line-height in the
  chrome, which BRAND.md governs (header at locked height, restrained spacing). That is a
  brand decision to put to the owner, not a bug to fix inside a layout round.

**Recommendation: a small sitewide accessibility round** covering the breadcrumbs and anything
else under 24px in shared chrome, measured across the site before and after.

---

## 7. Two things found while measuring, not fixed (Rule 1)

1. **`.signal-grid` has the same class of latent defect.** It is
   `repeat(auto-fit, minmax(280px, 1fr))`, and at 320px its container is exactly 280px — the
   track fits with **zero margin**. Below 320px it overflows for the same reason
   `.dash-hero-grid` did: a floor that cannot shrink. The standard one-token fix is
   `minmax(min(280px, 100%), 1fr)`, which is a no-op at 320px and above. Not applied: it
   changes nothing at any width this round was asked to fix, and "make the number go down at a
   width nobody measured" is the move this round was told to avoid.
2. **The signed-in dashboard breaks below 300px**, at 280px: `scrollWidth 289`, driven by
   `.citysvc-chip--shown`. Outside the three widths this round covers (320 is the narrowest
   phone viewport in common use), and recorded here rather than fixed.
