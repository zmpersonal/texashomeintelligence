# Round 34 — the free-account eyebrow carries the accent

Date: 2026-09-22 · Branch: `claude/thi-v3-round34-eyebrow`, from `main` at `34c94ae` — the
Round 33 merge, confirmed with `git merge-base --is-ancestor`.

Changed: `site/src/styles/global.css` (one rule added), `site/src/components/LaunchNotify.astro`
(one class), `site/scripts/run-sweep.mjs` (one entry).
Added: `site/scripts/replays/eyebrowrender.mjs`.

No copy changed. No token changed. No new shade of amber.

---

## 1. Grounding

### Where the eyebrow is, and where it is not

`LaunchNotify.astro` is imported by exactly one file — `src/pages/dashboard/[zip]/index.astro` —
so the card is on the **225 ZIP dashboards and nowhere else**. The homepage does not carry it:
`index.astro` contains no `.card-tag` and no "Free account" string. The round's brief expected
the homepage to be in the list; it is not.

### `.card-tag` is shared, which is what made scope a real question

| eyebrow | where |
|---|---|
| Free account · Two minutes | `LaunchNotify.astro` → the 225 ZIP dashboards |
| Modeled — per-ZIP coming soon | the same page, the compare module |
| \<alert\> · condition detected | `/home/`, the signed-in dashboard |

Restyling `.card-tag` would have repainted all three. **Owner's decision: the free-account
eyebrow only, through a modifier.** The other two are data labels and read quiet.

### What it looked like

`#33414F` on `#EEF1F5`, IBM Plex Sans 600, uppercase, `letter-spacing: 0.06em`, 4px radius,
3×10px padding — **9.22:1**, and no amber.

**It renders at 15.04px, not the 12px its own rule asks for.** `.card-tag` sets
`font-size: var(--thi-fs-label)` = `0.75rem`, but `.card p { font-size: .94rem }` is more
specific and wins, because the eyebrow is a `<p>` inside a `.card`. Pre-existing, affects all
three eyebrows, and out of scope here — logged as **BACKLOG item 12**. It does not move the
contrast question either way: 15.04px at weight 600 is not WCAG large text (that needs 18.66px
**and** bold), so the normal-text threshold of **4.5:1** applies at either size.

### Amber already in the view

On a ZIP dashboard there was exactly **one** amber element: the header wordmark's "Intelligence"
(`#C4772E`). **Owner's ruling: the wordmark is brand chrome, not a content accent.** So the
eyebrow is now the one content accent on the page, and the replay counts them that way —
excluding `header` and `footer` by position rather than by name, so a second amber cannot slip
in beside the wordmark unnoticed.

For the record, and not this round's to fix: the **homepage carries three** amber uses — the
wordmark, a sparkline dot, and `.analysis-card-figure`'s left border.

### The contrast estimate in the brief: conclusion right, number slightly worse

`#C4772E` on `#EEF1F5` measures **3.08:1**, not the 3.2–3.5 estimated. It **fails AA** for this
text, as the brief said it would. (On white it is 3.49:1 — also failing.)

---

## 2. The options, measured

All eight were rendered from the real eyebrow on `/dashboard/78704/` and shown side by side
before anything was built.

| | treatment | ratio | verdict |
|---|---|---|---|
| — | current — slate-700 on mist | 9.22:1 | passes, no amber |
| — | the ask — amber text on the current pill | **3.08:1** | **fails AA** |
| A | navy `#0C2340` on an amber pill | 4.53:1 | passes **by 0.03** |
| **A2** | **ink `#0E1726` on an amber pill** | **5.15:1** | **chosen** |
| B | navy on the current pill + 3px amber left rule | text 13.94:1 · rule 3.08:1 | passes |
| B2 | navy on the current pill + 1px amber border | text 13.94:1 · border 3.08:1 | passes |
| C1 | amber-deep `#9E5E22` on the current mist pill | 4.55:1 | passes, but not the logo's amber |
| C2 | amber-deep on a white pill + amber left rule | text 5.15:1 · rule 3.49:1 | passes |

The brief's estimate for A — "≈4.5:1, borderline" — was exact: **4.53:1**. Owner's decision:
**A2, because 0.03 of margin is not margin.** Ink and amber are both existing brand tokens, so
nothing here is a brand change.

---

## 3. What shipped

```css
.card-tag-accent { color: var(--thi-ink); background: var(--thi-amber); }
```

One rule, one class added to one element. The modifier exists so the two quiet labels cannot
inherit the accent, and so that moving the colour onto `.card-tag` later is a visible change
rather than a silent one — `eyebrowrender.mjs` asserts both of them stay on mist.

---

## 4. Verification

`scripts/replays/eyebrowrender.mjs`, new, 21 assertions, and in `npm run sweep`. It computes the
WCAG ratio from the colours the browser actually painted rather than from the hex values in the
source, walking up for the backdrop if an element's own background is transparent.

```
/dashboard/78704/ @1366   5.15:1  rgb(14,23,38) on rgb(196,119,46)  15.04px/600 (normal text)
/dashboard/78704/  @390   5.15:1   …identical
/dashboard/78205/ @1366   5.15:1   …identical
/dashboard/78205/  @390   5.15:1   …identical

amber in the view:  chrome   span                          (text)      ← the wordmark
                    CONTENT  p.card-tag.card-tag-accent    (background)
  exactly one amber content accent on a ZIP dashboard — and it is the eyebrow

quiet labels:  /dashboard/78704/  "MODELED — PER-ZIP COMING SOON"  bg=rgb(238,241,245)
               /home/             "EXTREME HEAT · CONDITION DETECTED"  bg=rgb(238,241,245)

scripting off: card-tag card-tag-accent|FREE ACCOUNT · TWO MINUTES|rgb(14,23,38)|rgb(196,119,46)
```

**The `/home/` assertion passed vacuously on its first run and that was fixed, not accepted.**
The signed-in dashboard needs a session, so without one there was no "condition detected" label
on the page and "no accented label found" counted as a pass — an assertion looking at a page
that could not disprove it. It now loads the FIRED fixture session, requires the label to be
**present** as well as quiet, and asserts separately that the page did not redirect: `/home/`
redirects to a ZIP dashboard when the signed-in view cannot render, which is what a missing
local fixture artifact looks like, and without that check the symptom read as "label not found".

Full sweep, from a cold build:

```
npm run sweep   27/27 steps
  build · check (0 errors, 0 warnings, 0 hints) · fixture re-seeded
  13 units and gates   … check-links 0 broken · check-orphans 0 orphans
  13 render replays    toolshubrender 44 · roofscanrender 105 · dashmobile 38
                       aclifespanrender 48 · triagerender 127 · signinrender 18 · r9render 18
                       saservicerender 315 · footerchrome 93 · analysisrender 148
                       datalinksrender 34 · eyebrowrender 21 · r7replay 68
```

Screenshots: the unlock card on `/dashboard/78704/` at 390px and 1366px, before and after.
