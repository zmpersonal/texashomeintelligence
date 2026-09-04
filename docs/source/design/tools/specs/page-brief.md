# Page Brief — Tools Hub & Nine Tool Pages

**Assumes the existing THI design system.** Tokens, components, type scale, and color are already settled — this file is about page composition: what goes where, in what order, at what weight, and how it behaves.

**Round scope:** `/tools/` hub + nine tool pages. Nothing else changes.
**Reference build:** `ac-lifespan`, complete. Four tools share its skeleton; the other five are two more skeletons.

---

## 1. The three page skeletons

Nine tools, three layouts.

**Type A — Address scan** (`roof-scan`, `pipe-report`, `ac-lifespan`, `storm-check`)
Full-bleed interactive hero. Sequential. Ends in a gated report.

**Type B — Calculator** (`roof-cost-calculator`, `ac-cost-calculator`, `water-heater-calculator`)
Split hero: controls one side, live result the other. Never empty — loads with a real default range.

**Type C — Triage** (`plumbing-triage`, `ac-triage`)
Single-column, mobile-first, one decision per screen. No hero image, no chrome. This is someone standing in water.

---

## 2. Type A layout

### Above the fold

The tool occupies the full viewport height on desktop, and the first screen is *one input*. Address field, headline, trust line. Nothing else competing.

```
┌─────────────────────────────────────────────┐
│  H1 (large, one line if possible)           │
│  Sub — one sentence, muted                  │
│                                             │
│  ┌───────────────────────────┐  [ → ]       │
│  │  Address field            │              │
│  └───────────────────────────┘              │
│  No phone number required.                  │
└─────────────────────────────────────────────┘
```

The field should be the visual center of gravity — oversized relative to normal form inputs. This is the only thing we're asking for and it should look easy.

### After submit — the reveal

The layout transforms rather than navigating. Header compresses upward, the input shrinks to a small confirmed-address bar, and the results region expands into the space. Same page, no route change, no scroll jump.

**Left/main: the visual.** For `roof-scan` this is the satellite image with the footprint drawing on — the single most persuasive moment in the product. For `ac-lifespan` and `pipe-report` there's no satellite payoff, so the visual is the property card (year built, size, permit timeline) rendering as a small dossier.

**Right/below: the fact chips.** Three chips, stacked on mobile, in a row on desktop. Each carries value, unit, label chip, as-of date.

Chips should feel like *findings*, not stat cards. Slight asymmetry helps — they're not a dashboard, they're three things we learned about your house.

### The gate

Steps replace the chip area rather than appearing below it. One question per screen, chips remain visible above as accumulated context — the user should feel like they're building something, not filling a form.

Progress indication should be honest and quiet: "2 of 4," not a segmented bar that implies more work than there is.

Step 5 (contractor options) must give the three radio options equal visual weight, with "just send my report" preselected. No emphasis, no color, no ordering trick on the contractor options.

### Below the fold — the citation layer

Structurally fixed, visually free:

```
#answer     Largest text on the page after the H1. Pull-quote weight.
            This is the extraction target and it should look important.
#data       Table. Dense is fine. Dense is good.
#method     Two sentences, link out.
#context    This ZIP vs metro vs state. Comparison, ideally visual.
#faq        Accordion acceptable here (and only here).
#sources    Named feeds, dated, linked. Treat as content, not footer.
#changelog  Dated entries, compact.
```

`#answer` is the one to get right. It's the paragraph a language model will lift, and it deserves to look like the thesis of the page rather than an intro.

---

## 3. Type B layout

Split, and **it computes on load.** A calculator with an empty result is a wasted first impression — default to the most common scope for the detected metro and show a number immediately. The user adjusts from a real answer rather than assembling one.

```
┌──────────────────┬──────────────────────────┐
│  Scope controls  │  $12,400 – $18,900       │
│  ZIP             │  ████████░░░░  band       │
│  Squares         │                          │
│  Pitch           │  Based on 214 permits     │
│  Layers          │  Escalated to Aug 2026    │
│  Stories         │  How this is calculated → │
└──────────────────┴──────────────────────────┘
```

The result must recompute visibly on every change — a number that updates without acknowledgment feels broken. Small transition, no delay.

**The band is the design problem.** The range is the honest output, and a wide band must look *deliberately* wide, not like a UI failure. Consider making the band width itself the primary visual and the numbers secondary. When confidence drops (thin permit volume, aggregated geography), the band widens and a note appears — that behavior should read as integrity.

Below fold: same citation stack, plus the permit-valuation caveat which should sit near the number, not buried.

---

## 4. Type C layout

Mobile-first, and design it for one hand, at night, under stress.

- Symptom buttons: full-width, large, one per row. Generous tap targets, generous spacing between them. Assume mis-taps.
- One decision per screen. No scrolling to find the options.
- Back is always present and obvious.
- No hero imagery, no marketing copy above the first choice. The question is the page.

**The shutoff instruction is the most important layout in the entire product.** When someone selects "water on the floor," the next screen is one instruction, large, high contrast, minimal surrounding chrome. Nothing else on screen competes. It should be readable at arm's length on a phone in a dim laundry room.

**Safety interrupts** (gas, sewage, electrical + water) are a distinct full-screen layout, not a banner. The flow stops. The only actions are the safety action and an explicit acknowledgment.

Verdict screens: verdict first and large, cost range second, three-questions block third and copyable.

---

## 5. Hub layout

Nine cards, and the sorting principle is *urgency*, not alphabet or vertical:

1. Triage tools first — someone with a live problem needs them fastest
2. Address scans second
3. Calculators third

Two card treatments distinguishing "instant, no email" from "free report by email," legible at a glance without reading the badge.

The hub is a router. Keep it light — no embedded tools, no nine simultaneous API budgets on one page load.

---

## 6. Structural rules that must survive

- Below-hero block order is fixed. Restyle freely; don't reorder, remove, or hide behind tabs.
- `#sources` is content.
- Every number carries its label and date, everywhere, including inside the hero.
- Ranges never collapse to a single number.
- Degraded states are first-class layouts, not error styling — in San Antonio they're the default until the records request lands.
- The homeowner-reported label must visibly change the moment a user edits a prefilled field.

---

## 7. Companion files

- `motion-and-imagery.md` — animation moments, effects, what the imagery actually is
- `component-states.md` — every state to design
- `copy-deck.md` — real strings; the line lengths here determine the layout
- `data-labeling-spec.md` — the four-bucket labeling behavior
- `thi-tools-hero-scope.md` · `cost-model-spec.md` · `caliza-architecture.md` — data and build context

---

## 8. Blocking input

**Address autocomplete provider** (Google Places vs Smarty). Field behavior, suggestion rendering, and error cases differ enough that step one of four tools depends on it.
