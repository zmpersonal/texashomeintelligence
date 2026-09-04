# Data Labeling Spec

The site already commits publicly to labeling every number by where it came from. This is the product's credibility mechanism and its most distinctive design problem. It must be solved deliberately, not decorated.

**The promise, in the site's own words:** every number falls into one of four buckets, and each is labeled so you always know what you're looking at.

---

## The four buckets

| Bucket | Meaning | Examples in the tools |
|---|---|---|
| **Public / observed** | Directly reported by an authoritative source | Permit dates and valuations, CAD year built and area, recorded hail size, drought category, PPI and wage series, electricity price |
| **Historical context** | How a current value compares with past or seasonal norms | Hail frequency vs. the 10-year average, cost index vs. last year, permit velocity vs. seasonal baseline |
| **THI analysis** | Our interpretation of what the data may mean | Runtime multiplier, effective system age, pipe-era probability, repair-vs-replace verdict, replacement window |
| **Estimates & homeowner-reported** | Modeled values, and anything the homeowner told us | Cost ranges, homeowner-entered year built or square footage, symptom-derived diagnoses |

---

## Design requirements

The THI design system presumably already carries a label treatment for these four buckets, since the homepage commits to them publicly. This section is about the *behavior* required in the tools, not about inventing the visual — extend what exists.

**1. Legible at a glance, without a legend.** A homeowner scanning a report should be able to tell records from modeling without reading anything. That likely means the distinction is carried by more than color — weight, an icon, a border treatment, or a container difference.

**2. Works in three contexts.** The tools put these labels in tighter spaces than the homepage does. The same label must read correctly:
- Inside a compact fact chip (very tight space)
- In a table cell alongside a value
- Attached to a number inside a sentence

**3. The records/modeled boundary is the one that matters most.** Public-observed and Estimates are the two the user genuinely needs to distinguish. Historical context and THI analysis are refinements. If space forces a simplification, collapse toward that primary distinction rather than dropping labels entirely.

**4. Homeowner-reported must be visibly distinct from records.** When a user edits a prefilled field, or supplies a value because no record was found, the label must change visibly at the moment of edit. This is the single most important interaction in the labeling system — it's what keeps a degraded run honest, and in San Antonio it's the common case.

**5. Never decorative.** These carry meaning and must be announced to screen readers. Not `aria-hidden`.

---

## Companion metadata

Two more pieces of provenance ride alongside the labels. Both already appear on the homepage data cards and should carry into the tools.

**Dual dating.** Every value shows both how far the underlying records run *and* when the feed was last confirmed. These differ, sometimes by months, and showing both is a genuine differentiator — most publishers show neither.

```
Data through Aug 28, 2026 · Confirmed Aug 30, 2026
```

**Source attribution.** Named source, linked to the primary source where one exists. Never a third-party aggregator when the original is available.

Some feeds carry an explicit citation requirement — the Dallas Fed series on FRED among them — so attribution is a hard requirement on any surface using them, not a nicety.

---

## Range and confidence display

Cost figures are ranges, never points. The design needs to express three levels of confidence, and the difference must be visible without reading the number:

- **Tight** — sufficient local permit volume, recent data
- **Wide** — thin volume, aggregated geography, or stale anchor
- **Withheld** — below the volume floor. Show why, not a number

The geography actually used must appear whenever it differs from what the user asked for. A metro figure shown in response to a ZIP query, unlabeled, is the kind of quiet imprecision that would undo the whole positioning.

---

## Model versioning

Calculator outputs carry a small, visible model version. When a published number changes, users and reporters need to be able to tell whether the market moved or the model did. Low prominence, but present.

---

## Anti-patterns

- Four equally loud colored pills on every number — turns the page into confetti and stops carrying information
- Labels only in a legend at the bottom
- Hiding provenance behind a tooltip or an info icon as the *only* affordance
- Treating `#sources` as footer chrome
- Any treatment that makes an estimate look like a record
