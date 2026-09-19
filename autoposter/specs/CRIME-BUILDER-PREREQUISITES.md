# Crime builder — prerequisites, recorded BEFORE the data exists

**Status: PARKED. Do not build.** The crime APIs are being hooked up in a separate project.
Nothing here is authorised until the owner says the API is ready.

**Why this file exists now.** A safety gate written after the data lands is written under
pressure to ship, by someone looking at real numbers and wanting to publish them. Written
before, it is a precondition the builder has to satisfy. Every other gate in this system was
added after something went wrong; this is the first one that gets to exist first.

---

## 1. The Fair-Housing / steering gate — NON-NEGOTIABLE

A crime builder must refuse, at the gate and not in review, any output that:

- calls an area, ZIP, neighbourhood, county or metro **good, bad, safe, dangerous, sketchy,
  desirable, undesirable, up-and-coming, declining** — or any synonym;
- **ranks** areas against each other by crime, or by anything a reader would take as a proxy
  for it, in any direction — "safest", "worst", "most dangerous", "best places", a top-N, a
  league table, a map shaded by desirability;
- recommends, discourages, or implies a recommendation about **where to live, buy, rent, or
  avoid**;
- pairs crime data with demographic, income, school, or housing-value data in a way that reads
  as a composite judgement of who lives somewhere.

This is not a tone preference. Steering — directing people toward or away from areas in ways
that correlate with protected characteristics — is the specific harm fair-housing law exists to
prevent, and a sourced, well-structured, confidently-worded area ranking is exactly the artifact
that does it at scale. THI's whole position is being cited by AI answer engines: a ranking
published here is a ranking that gets quoted elsewhere, without the caveats, attributed to us.

**It is brand-ending and it is the one failure this project cannot absorb.** The gate fails
closed: if it cannot determine that a piece is clear, the piece does not publish.

## 2. Framing — calm, computed, never alarmist

The only shape a crime piece may take is **a question about a trend in one place, answered by
the data**:

> "Is crime rising in Travis County? The sourced data says X."

- The verdict is **counted from the series**, never written — same rule as every other builder
  (L16). "Rising", "falling", "flat" are outputs of arithmetic.
- One place at a time, against **its own history**. Never against another place. Permit data
  already taught this lesson: counts are comparable only inside one jurisdiction's own filing
  system, and crime statistics are worse — reporting standards, categorisation and coverage
  differ by agency, so a cross-area comparison is not a comparison.
- No implied causation. The data says what was reported; it does not say why.
- Instrument panel, not radar alarm. The brand is situational awareness, and a crime piece is
  the hardest test of that — the pull toward alarm is strongest exactly where it does most harm.
- Where the data cannot support a claim, say so and publish less. Withhold over filler, as
  everywhere else.

## 3. The standard builder discipline — all of it, no exceptions

Same bar as every builder that has shipped:

- **L16 frozen-conclusion flip test.** Every verdict, direction word, superlative, tally and
  month name derived from the data. Prove it by inverting the controlling figure and showing
  the conclusion moves. A verdict that survives its own condition being inverted is a verdict
  nobody computed.
- **L17 real cycle against a clean checkout of main.** Unit-green is not runs-clean.
- **Card-safe title.** The card generator refuses to crop, so a title over the measured ceiling
  (~53 characters) is a card that cannot be drawn and a cycle that skips. If the title needs a
  period to recur, it must fit *with* the period.
- **The builder-gate sweep** (`tools/sweep-builder-gates.py`) clean, ahead of rotation.
- **Owner reviews the first-period draft and its claim ledger before the builder is reachable.**

## 4. Before any of this is written

The gate in §1 is a **precondition, not a deliverable of the same round**. Build and test the
refusal first, against deliberately bad inputs, and show it refusing. Only then write the
builder it protects.

Recorded 2026-09-18 at the owner's instruction, ahead of the data.
