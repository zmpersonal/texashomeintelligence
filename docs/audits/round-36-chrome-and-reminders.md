# Round 36 — Pinterest, the eyebrow type fix, and two catalogue rows

Date: 2026-09-22 · Branch: `claude/thi-v3-round36-chrome-reminders`, from `main` at `65e6dd6` —
the Round 35/35b merge. Every round through 35b is in the base, confirmed with
`git merge-base --is-ancestor`.

Changed: `site/src/components/Footer.astro`, `site/src/styles/global.css` (one rule),
`site/src/lib/account/reminders.ts`, and three replays.

Three items, each a few lines, none of which grew. No copy changed.

---

## A · Pinterest in the footer

Added to the `socialProfiles` array beside Facebook — which is why it is a data change rather
than a markup one. Same treatment: a real `<a href>` to the exact URL, `rel="me noopener"`,
`aria-label="Texas Home Intelligence on Pinterest"`, the official P-in-circle mark as a single
inline `<path>` in `currentColor`, the `<svg>` hidden from the accessibility tree, and a 44×44
target. No YouTube — that account does not exist, and nothing stands in for it.

**The height question, measured.** Two 44px icons with an 8px gap are 96px wide in a 163px
column, so the Connect block does not gain a row:

| | before | after |
|---|---|---|
| footer grid @1366px | 226px | **226px** |
| footer grid @390px | 753px | **753px** |
| icons / rows @390px | 1 icon, 1 row | **2 icons, 1 row** |

No before/after pair at 390px was needed for a reflow, because there was none.

---

## B · Item 12 — the specificity override

### The fix

```css
.card .card-tag { font-size: var(--thi-fs-label); }
```

`.card p { font-size: .94rem }` is one class plus an element; `.card-tag` is one class. The more
specific rule won, so every eyebrow inside a card rendered at **15.04px** while its own rule
asked for the 12px label token. Two classes take it back **without touching `.card p`**, so no
other paragraph in any card moves.

**Blast radius, verified rather than argued.** Two builds, diffed at the rule level: **one rule
added, none removed, none changed.** Nothing else in the sitewide stylesheet moved, and no
Tailwind utility leaked.

It is scoped to `.card-tag` rather than to the accent modifier on purpose: all three eyebrows
were affected, and the two quiet ones have as much claim to the label scale as the accented one.

### Contrast at the new size

**5.15:1, unchanged** — ink `#0E1726` on amber `#C4772E`, measured from the painted colours at
390px and 1366px on both metros. The size change cannot move a contrast ratio; what it could
have moved is the *threshold*, and it does not: 12px at weight 600 is **not** WCAG large text
(that needs 18.66px **and** bold), so the 4.5:1 requirement applies at 12px exactly as it did at
15.04px. `eyebrowrender` now asserts the computed size as well as the ratio — it previously
reported the size in a note and asserted nothing, which is how a 3px drift survived.

### Wrapping — the fix removes wraps, it does not cause them

The round's stop condition was a wrap introduced by 12px. Measured across both sizes at three
widths, on both affected page types:

| eyebrow | 15.04px (before) | 12px (after) |
|---|---|---|
| ZIP · MODELED — PER-ZIP COMING SOON | 2L @390 · 2L @360 · 2L @320 | **1L @390 · 1L @360** · 2L @320 |
| ZIP · FREE ACCOUNT · TWO MINUTES | 1L · 1L · 2L @320 | 1L · 1L · **1L @320** |
| /home/ · EXTREME HEAT · CONDITION DETECTED | 2L @390 · 2L @360 · 2L @320 | **1L @390** · 2L @360 · 2L @320 |

**The label size never adds a line at any width, and removes four.** Two of the three eyebrows
were already wrapping at the design width before this round and nobody had measured it.

One case remains: the signed-in condition eyebrow wraps at **360px and narrower**, at *either*
size — the string is simply longer than the column. That is copy length, not type size, and
reverting to 15.04px would not fix it; it would re-break the other four cases. Nothing clips at
any width. Flagged rather than fixed, since shortening the label is a copy change.

*Method note:* the before/after matrix was produced by overriding the eyebrow's own font-size on
the built page. The eyebrow is an inline-block pill, so its size cannot change its container's
width, which makes the override equivalent for this question — and it was validated against the
real pre-fix build at 390px, which measured the same two-line result on both pages.

---

## C · Item 13 — two catalogue rows

```ts
{ key: "exterior-lighting", label: "Exterior lighting check", defaultCadenceDays: 180,
  note: "Bulbs and photocells fail quietly; a walk round after dark finds them." },
{ key: "locks-latches", label: "Locks and alarm test", defaultCadenceDays: 180,
  note: "Deadbolts and window latches stiffen with use; test alongside the alarms." },
```

**Both at 180 days, and the cadence is an argument about batching rather than a finding.** The
catalogue's existing rows cluster there — the smoke/CO test, gutters, both filters, seasonal
HVAC at 182 — and the twice-a-year moment when a homeowner is already walking the house testing
alarms is when both of these get done. Like every row in the file, both are defaults the
homeowner can change, which is what the file's own header says they are for.

The alarm test is deliberately bundled into the locks row rather than given an annual cadence of
its own: hardware alone would justify twelve months, but an alarm should not go a year, and the
existing smoke/CO row already sets the six-month rhythm this one rides.

**They read as maintenance because that is what they are.** Hardware wears and bulbs fail.
Neither names an area, neither implies a threat, and both pass the same banned-phrase guard
every rendered action passes — asserted, not assumed. That follows Round 35b: the useful part of
the crime idea was the upkeep, never a figure attached to a place.

---

## Replays — exactly what changed expectation

**Only two assertions in the whole suite changed what they expect, both in `footerchrome`:**

1. **"exactly one social profile ships" → "2 social profiles ship"**, and the per-profile checks
   (exact URL, `rel`, accessible name, inline hidden `<svg>`) now loop over a `PROFILES` list in
   order rather than hard-coding Facebook. **Why:** a second account now exists.
2. **"no YouTube or Pinterest icon" → "no YouTube icon".** **Why:** Round 33 wrote that
   assertion when neither account existed. Pinterest now does; YouTube still does not, and the
   assertion still says so.

Everything else is **added**, and nothing else's expectation moved:

- `footerchrome`: every icon target 44px both ways, and the icons sit on **one row** — the check
  that would have caught a Connect block reflowing on a phone. **63 → 93 → 99.**
- `eyebrowrender`: the computed size is the 12px label token; every eyebrow is one line at the
  design width and on the whole ZIP surface at 360px; nothing clips at 390/360/320. **21 → 36.**
- `r7replay`: both new rows are offered, pass the banned-phrase guard, and name no area or
  threat; one can be added, renders as a row, and **recalculates its next due date from the day
  it is marked done** — the behaviour that makes a catalogue row a reminder rather than a label.
  **68 → 77.**

---

## Verification

```
npm run sweep   27/27 steps
  build · check (0 errors, 0 warnings, 0 hints) · fixture re-seeded
  13 units and gates   … check-links 0 broken · check-orphans 0 orphans
  13 render replays    toolshubrender 44 · roofscanrender 105 · dashmobile 38
                       aclifespanrender 48 · triagerender 127 · signinrender 18 · r9render 18
                       saservicerender 315 · footerchrome 99 · analysisrender 148
                       datalinksrender 34 · eyebrowrender 36 · r7replay 77
CSS rule-level diff    1 rule added, 0 removed, 0 changed
```

Screenshots: the footer, the unlock card and each eyebrow, before and after, at 390px and
1366px, on both affected page types.
