"""The common ancestor of every DESIGNED refusal, so a halt can be told from a fault.

── WHY THIS EXISTS ───────────────────────────────────────────────────────────
Round 48. `autopilot.evaluate` wrapped the engine's whole run in

    except engine.NothingDefensible:   -> "nothing_to_say", quiet and correct
    except Exception:                  -> "the article could not be produced cleanly"

so every other outcome arrived as one undifferentiated fault. Three unlike things landed
there: a GATE REFUSING (the ledger, the card, the pin, the two-lock, the duplicate check — all
of them working), a PROGRAMMING FAULT (a KeyError in a builder), and a DISCIPLINE BREACH
(`ModelBudgetExceeded`). The cadence then failed eighteen consecutive days reporting "the
article could not be produced cleanly" when what had actually happened was a claim-staleness
refusal that named its own reason precisely. If the notice had read "topic 0 halted: claims
2472h old, bound 2160h", somebody would have looked on day one.

── WHY A BASE CLASS AND NOT A TUPLE OF TYPES ─────────────────────────────────
All six refusal types already existed. What did not exist was anything they had in common, so
telling them apart from a fault meant a tuple of imported names in the driver — and a tuple is
the thing that rots: the seventh gate gets added, nobody updates the tuple, and its refusal
reads as a crash. Membership is inherited here, so a new gate is in the set by construction.

── WHAT IS DELIBERATELY NOT A GateHalt ───────────────────────────────────────
* `article_engine.NothingDefensible` — nothing RANKED; no gate was reached and nothing refused.
  It already has its own quiet outcome, and it is the normal state between periods.
* `article_engine.ModelBudgetExceeded` — not a judgement about data. Something that should be
  code migrated into model reasoning, which is a defect and must stay red.
* Anything unrecognised. A buggy builder can produce claims that legitimately fail the ledger,
  so the classification is on the exception TYPE and never on a heuristic over its message.
  Unknown means fault. Fail closed on the classification itself.
"""

from __future__ import annotations


class GateHalt(Exception):
    """A gate refused. The pipeline is working; the piece is not publishable as it stands.

    Subclasses carry their own reasons and, where useful, a `gate` label. Nothing is raised
    directly as a `GateHalt` — it exists to be caught.
    """
