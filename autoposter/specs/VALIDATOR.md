# VALIDATOR.md — the content-quality floor (code gates, steps 8b → 11b)

Build this **before any generation logic** (social-autoposter step 11b). Proving posting *works*
(step 9) says nothing about whether content is *fit to publish*. This gate is THI's moat in code:
it's what lets the copy be poppy while the data stays bulletproof.

**Governing principle:** every content-quality problem is a CODE GATE, never a model instruction.
"Be accurate" in a prompt decays; "any numeral not in `social-feed.json` does not publish" does
not. When the model wants a value a rule forbids, **supply the figure in code — never relax the
rule.** On failure: **halt, retry once at most, then halt. Never publish a degraded version.**

## Baseline gates (from the skill — every post)
Reject + halt if:
- text is empty / whitespace-only / under min length
- text matches an error pattern: `Error:|Failed to load|undefined|null|No response|NaN|\{\{.*\}\}`
  (an unfilled `{{slot}}` reaching output = reject)
- text exceeds the platform character limit
- a per-platform required field is missing. **Pinterest requires: title, description, alt text,
  destination link.** All linked pieces require a resolvable destination URL.
- media absent or its URL does not resolve
- rendered card has zero body rows / a comparison or ranking card with no numeric cells

## THI-specific gates (the moat — build these, they are not optional)

**G1 — No numeral without provenance.** Every number that appears in a piece must exist in the
`stories[]` entry it was generated from (see `MOVERS-ENGINE.md` — the caption call consumes
`stories[]`, and each story carries a verbatim `figure` + `source` + `as_of`). Cross-check
rendered numerals against that story object; **any numeral not present → reject.** No
model-authored figures, ever. (This is the single most important gate, and the `stories[]`
contract is what makes it enforceable.)

**G2 — Source + timestamp present ON THE PIECE.** Every risk/cost claim must carry a `source`
and `as_of` visible on the artifact itself — the caption AND the on-screen card. Not in a
pinned comment, not in the hub description only.

**G3 — Sourcing survives atomization.** For every atomized short, assert the clip's own frames
carry the `source + as_of` for the claim it makes. A short whose risk claim's source was left
behind in a different segment → reject. (This is why the hub is built as self-contained segments;
this gate enforces it at output time.)

**G4 — Claim ↔ destination agreement.** The piece's theme/claim and its hero link must match
(a drought Warning must not link the energy-cost page). One destination per piece; mismatch →
reject.

**G5 — Freshness bound.** Reject if `as_of` is older than the theme's staleness limit (e.g.
hail/weather Warning `as_of` > 48h old = reject; appraisal data has a longer bound). Stale data
read as current is the scam-tell; withhold beats guess (harness meta-rule 6).

**G6 — Gated-angle guard.** If the record lacks the fields an angle needs (e.g. appraisal fields
before CAD ingest lands), that angle **does not generate.** No placeholder, no "data coming."

**G6b — Quiet-week guard.** If `social-feed.json` reports `week_mode: "evergreen"` (max surprise
score below threshold — see `MOVERS-ENGINE.md`), the live Movers/Verdict/Wager formats must NOT
generate; only the evergreen fallback bank is eligible. A loud timely format on a no-story week is
manufactured drama — reject. This gate is what stops the machine from faking urgency on slow data.

**G7 — Alarmism / tone filter.** Reject on fear-framing patterns: caps-lock words, exclamation
stacks (`!!`), scare phrases (`terrifying|disaster|you won't believe|shocking|panic`), and any
risk claim without a paired calm action. Poppy villain-framing is allowed; panic is not.

**G8 — Fair-Housing / steering guard.** Reject any desirability or demographic framing about a
place — patterns around "good/bad neighborhood," "safe/unsafe area," or who lives somewhere.
Verdicts must reference only weather/cost/condition metrics. This gate protects the whole brand
from a fatal liability; err strict and flag borderline cases to the human.

**G9 — Ask present.** Every post must end in a real local ask (guess / defend / tag / save /
"which street"). A post with no participation ask or with generic bait (`do you agree? 👇`) →
reject. (Bait underperforms and the algorithms discount it.)

## Testing (step 11b done-criteria)
- Unit-test each gate: known-bad rejected, known-good passes.
- Include a fixture where a numeral is subtly altered from source (G1), one where a short is cut
  without its source card (G3), one gated-angle-without-data case (G6), and one steering-adjacent
  verdict (G8) — these are the failure modes that would most damage the brand.
- Where real historical failures accumulate, test against them, not only fixtures.

## When a gate fires
Halt the cycle → retry once → halt → 🔴 BLOCKED to `#thi-autoposter` with the gate id, the piece,
and the offending value. The human clears it. Recurring firings of the same gate = a `LEARNINGS.md`
candidate (fold into the voice guide or tighten the gate — never loosen it to keep the run alive).
