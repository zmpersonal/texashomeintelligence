"""Hunt frozen conclusions: sentences that never change across periods but assert direction.

THE BUG CLASS THIS EXISTS FOR
A recurring builder that writes its conclusion into prose — "they moved in opposite directions",
"roofing is the slower lane" — publishes a false claim the first month the data flips. Every
gate stays green: G1 checks numerals, G2 checks sources, C1a/C1b check the card's slots, and
none of them reads an argument.

HOW TO READ THE OUTPUT
Each builder runs against six as-of dates, giving six different "latest months" of real history.
Sentences appearing in EVERY period are invariant; those that also carry directional language
are candidates. A candidate is not automatically a defect. Three kinds show up:

  * DEFINITIONS ("a normal is not last year") — invariant on purpose, assert nothing about now.
  * COMPUTED-BUT-CONSTANT — derived, but the condition happened not to flip across the sampled
    periods. San Antonio's tally is the standing example.
  * GENUINELY FROZEN — the defect. A conclusion typed rather than derived.

This tool cannot tell the second from the third. That is what the flip tests in
tests/test_card.py are for: they invert the controlling figure and assert the conclusion moves.
Use this to FIND candidates; use a flip test to prove each one.

Run: python3 tools/audit-frozen-conclusions.py
"""

import sys, re, itertools
sys.path.insert(0, "src")
from datetime import date
import article_engine as engine, run_article as ra

CFG = engine.load_config()
# Six as-of dates -> six different "latest months" of real history.
PERIODS = [date(2026, m, 15) for m in (4, 5, 6, 7, 8)] + [date(2026, 9, 11)]

# Words that make a sentence an ASSERTION ABOUT DIRECTION rather than a statement of fact.
DIRECTIONAL = re.compile(
    r"\b(above|below|rose|fell|rising|falling|up|down|higher|lower|more|less|most|least|"
    r"hottest|coldest|highest|lowest|peak|opposite|same way|no\b|not\b|never|only|"
    r"busier|quieter|cooling|holding|slower|faster)\b", re.I)

BUILDERS = {
    "summer-hotter-than-normal": (ra.build_summer_claims, ra.write_summer),
    "austin-ac-rush-vs-heat":    (ra.build_acrush_claims, ra.write_acrush),
    "san-antonio-improvement-boom": (ra.build_sa_claims, ra.write_sa),
    "austin-improvement-boom-cooling": (ra.build_permit_claims, ra.write_permits),
    "electricity-still-rising":  (ra.build_claims, ra.write),
}

def sentences(text):
    for raw in re.split(r"(?<=[.!?])\s+|\n", text):
        s = " ".join(raw.split())
        if len(s) > 25:
            yield s

for name, (build, write) in BUILDERS.items():
    per_period = {}
    errors = []
    for d in PERIODS:
        try:
            feed = engine.load_feed()
            claims = build(feed, CFG, d)
            art = write({"question": "q"}, claims, feed)
            per_period[d] = set(sentences(art["body"]))
        except Exception as exc:
            errors.append(f"{d}: {type(exc).__name__}: {str(exc)[:80]}")
    print("=" * 100)
    print(f"{name}   ({len(per_period)} periods built, {len(errors)} failed)")
    for e in errors:
        print(f"   !! {e}")
    if len(per_period) < 2:
        print("   (cannot audit: fewer than two periods built)")
        continue
    invariant = set.intersection(*per_period.values())
    varying = set.union(*per_period.values()) - invariant
    frozen = [s for s in invariant if DIRECTIONAL.search(s)]
    print(f"   sentences: {len(invariant)} invariant, {len(varying)} varying")
    if frozen:
        print(f"   ⚠️  {len(frozen)} INVARIANT SENTENCES THAT ASSERT DIRECTION:")
        for s in sorted(frozen):
            print(f"      • {s[:150]}")
    else:
        print("   ✅ no invariant sentence asserts direction")
