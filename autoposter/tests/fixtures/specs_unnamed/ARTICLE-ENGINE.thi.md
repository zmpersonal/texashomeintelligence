# ARTICLE-ENGINE.thi.md — THI editorial spec (the soul, not the plumbing)

The editorial identity for **TexasHomeIntelligence.com** articles. Consumed by the shared process
skeleton `ARTICLE-ENGINE.md` when `site="thi"`. This file defines WHAT THI writes and HOW it sounds;
the skeleton defines the process; `PUBLISH-TARGET.someothersite.md` defines where it publishes. All three are
required — the engine HALTS if this file or the target is missing.

- **Site:** texashomeintelligence.com  · **Publish target:** `PUBLISH-TARGET.someothersite.md` (self-id:
  `texashomeintelligence.com`; engine asserts match before writing).
- **Cadence:** one deep article every 1–2 weeks.
- **Format:** the **myth-buster** — a viral, question-shaped title with a rigorous sourced answer.
  ("Is Austin's property tax really the worst in Texas?")

## THI's article promise
The calm, sourced, in-depth read nobody else bothers to do. THI's edge was never "we have data" —
it's the rigorous interpretation. Each article answers a question Texans are actually asking, from
our own data, with the receipts on the page (live-data embed). Interesting whether the answer is
yes, no, or "it's complicated" — the *answer* is the story, so THI is never stuck on a quiet week.

## Topic universe (what THI writes about)
Home **risk** and **cost** for Texas homeowners, Austin + San Antonio first:
- Property tax / appraisal (once CAD data lands) — the highest-arousal money lane.
- Cost of ownership + comparisons ("cheaper to own in Round Rock than Austin now?").
- Water bills / drought, energy cost, grid reliability, insurance premium pressure.
- Weather/hail risk, HVAC/roof risk, permit/building-boom signals.
Draw candidates from: local discussion scans, THI's own traffic/queries, and the movers engine's
anomaly flags.

## Voice
Per `VOICE-GUIDE.md`: calm insider, poppy in the framing/headline, dead-sober in every claim. The
market is saturated with alarm; THI owns the calm answer to it. Emotion from money, local pride,
and being in-the-know — never fear.

## Topic-score weights (THI tuning, money-tilted)
`public_interest .25 · data_strength .25 · citability .20 · brand_safety (penalty) .20 ·
money_bonus .10`. Data-strength weighted high because THI's whole credibility is "we can actually
prove this." Tune against real output.

## THI brand-safety lines (HARD — enforced at topic stage)
- **CRIME is NOT a launch topic and is gated.** Crime rankings tied to places people live collide
  with (a) THI's calm-not-alarm brand and (b) Fair Housing steering liability. Allowed only AFTER
  calm-authority is established, only with the calm-analytical treatment, only framed as "is the
  *perception* true, and what does the sourced data actually say" — never "which area is dangerous"
  — and only with a legal-reviewed guardrail set. Until then: penalize hard in the scorer.
- **No desirability/steering framing** about who lives where, ever (global VALIDATOR G8).
- **No alarm/fear framing** regardless of topic — scam-tell, off-brand.
- **Launch topics (safe + viral):** property tax, water/energy bills, grid reliability, cost-to-own
  comparisons, insurance premiums. Prove the myth-buster format on these before anything harder.

## Article structure (THI house style)
1. Question-shaped H1 (the viral hook = the search query = the AEO query).
2. **Direct answer in the first 2–3 sentences** (what AI engines extract) — hedged honestly if the
   data is mixed.
3. The sourced case: the numbers, each inline-cited with source + `as_of`.
4. **Live-data embed** (chart/table from THI's live feeds — differentiator + citability booster).
5. Context / counter-argument (where Manus/Perplexity research earns its place, verified).
6. What it means for a homeowner + the one calm action.
7. Internal links to the relevant network property + related THI articles (cluster authority for
   the #1 KPI).

## Handoff
Publish via `PUBLISH-TARGET.someothersite.md` (deploy-on-command, 🔴). On live URL, hand to `social-autoposter`
+ `REELS-ENGINE.md`; every social piece links back to the THI article URL. Voice-match the lead-in
to the promo hook (`VOICE-GUIDE.md`).

## Example launch slate (safe, viral, THI-defensible)
- "Is Austin's property tax really the worst in Texas?" (gated until CAD data ~2 wks)
- "Are Austin water bills actually rising faster than anywhere in Texas?"
- "Is San Antonio's grid really less reliable than Austin's?"
- "Is it actually cheaper to own in Round Rock than Austin now?"
- "Are Texas home insurance premiums rising fastest where the hail is?" (ties THI's own hail data)
