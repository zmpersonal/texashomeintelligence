"""
movers_engine.py — the analysis layer. 100% deterministic. ZERO model tokens.

Turns THI's history into normalized signals, scores each (area, metric) by how *surprising*
it is, ranks them, and decides whether the week has a real story at all. The caption/write
step reads the ranked `stories[]` and nothing else; every numeral it may use is supplied here,
in code, as a pre-formatted `figure` string.

PHASE 2 — METRO-GRAIN REWRITE (owner decision, 2026-09-06)
The package scored at ZIP/county grain and spent 0.35 of the score on `rank_extremity` and
`neighbor_divergence` — both cross-area comparisons. THI resolves almost everything at metro
grain, so with two metros there is nothing to compare against and both terms are degenerate.
They are removed from the function, not zeroed and left in: a term multiplied by a config
value is a term someone can silently re-enable without the data to support it. `assert_weights`
raises if the config still carries them non-zero.

The freed weight was NOT redistributed proportionally. With cross-area comparison gone, the
only surviving evidence of "surprising" is an area's own past — so `self_deviation` and
`magnitude` carry the load, and `threshold_crossed` is the one editorial-grade binary.
"""

from __future__ import annotations

import statistics as stats
from datetime import date, datetime, timezone

METRO_GRAIN_TERMS = ("magnitude", "self_deviation", "threshold_crossed",
                     "audience_coverage", "freshness")
REMOVED_TERMS = ("rank_extremity", "neighbor_divergence")


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def assert_weights(weights: dict) -> None:
    """Fail loudly on a config that contradicts this engine's grain.

    Two ways that happens: a cross-area term is re-enabled without the data (someone raises
    `neighbor_divergence` after reading the package), or the additive terms stop summing to 1
    (scores silently rescale and every calibrated threshold quietly means something else).
    """
    for term in REMOVED_TERMS:
        if weights.get(term, 0.0):
            raise ValueError(
                f"config weight {term}={weights[term]} is non-zero, but this engine scores at "
                f"METRO grain where cross-area comparison is degenerate (n=2). Either restore "
                f"county-grain data and re-add the term to surprise_score(), or set it to 0."
            )
    missing = [t for t in METRO_GRAIN_TERMS if t not in weights]
    if missing:
        raise ValueError(f"config is missing surprise weights: {missing}")
    total = sum(weights[t] for t in METRO_GRAIN_TERMS)
    if abs(total - 1.0) > 1e-6:
        raise ValueError(
            f"additive surprise weights sum to {total:.4f}, not 1.0 — scores would rescale and "
            f"quiet_week_threshold would silently change meaning"
        )


def surprise_score(signals: dict, weights: dict) -> float:
    """Weighted blend, 0..1. `money_bonus` is a multiplier on cost-flavoured metrics."""
    money_mult = 1.0 + (weights.get("money_bonus", 0.0) if signals.get("is_money_metric") else 0.0)
    base = (
        weights["magnitude"] * _clamp01(signals.get("magnitude", 0.0))
        + weights["self_deviation"] * _clamp01(signals.get("self_deviation", 0.0))
        + weights["threshold_crossed"] * (1.0 if signals.get("threshold_crossed") else 0.0)
        + weights["audience_coverage"] * _clamp01(signals.get("audience_coverage", 0.0))
        + weights["freshness"] * _clamp01(signals.get("freshness", 0.0))
    )
    return _clamp01(base * money_mult)


# ---------------------------------------------------------------- signal normalisers

def normalize_magnitude(delta: float, deltas: list[float]) -> float:
    """This period's move against the series' own typical move. 3σ saturates."""
    if len(deltas) < 2:
        return 0.0
    sd = stats.pstdev(deltas)
    if sd <= 0:
        return 1.0 if delta else 0.0      # a dead-flat series that finally moved IS the story
    return _clamp01(abs(delta) / (3 * sd))


def self_deviation(latest: float, baseline: list[float]) -> float:
    """z-score of the latest reading against this area's own history, squashed to 0..1."""
    if len(baseline) < 2:
        return 0.0
    sd = stats.pstdev(baseline)
    if sd <= 0:
        return 1.0 if latest != baseline[-1] else 0.0
    return _clamp01(abs(latest - stats.mean(baseline)) / sd / 3)


def freshness(as_of: str, bound_hours: float | None, now: date) -> float:
    """1.0 at publication, decaying to 0 at the metric's staleness bound. No bound -> neutral."""
    if not bound_hours:
        return 0.5
    try:
        observed = datetime.fromisoformat(as_of[:10]).date()
    except ValueError:
        return 0.0
    age_hours = (now - observed).days * 24
    return _clamp01(1.0 - age_hours / bound_hours)


# ---------------------------------------------------------------- thresholds
# ONLY thresholds that exist as a named external standard. An invented threshold is an
# invented claim: "crossed into Severe Drought" is the U.S. Drought Monitor's own category
# boundary and is citable; "crossed 1,000 permits" is a number we made up to sound important.
NAMED_THRESHOLDS = {
    "drought_stage": {
        1.0: "Moderate Drought (D1)", 2.0: "Severe Drought (D2)",
        3.0: "Extreme Drought (D3)", 4.0: "Exceptional Drought (D4)",
    },
}


def crossed_threshold(metric: str, previous: float, latest: float) -> str | None:
    table = NAMED_THRESHOLDS.get(metric)
    if not table:
        return None
    for level in sorted(table, reverse=True):
        if previous < level <= latest:
            return f"crossed into {table[level]}"
        if latest < level <= previous:
            return f"fell back out of {table[level]}"
    return None


# ---------------------------------------------------------------- suppression

def is_suppressed(story: dict, recent_history: list[dict]) -> tuple[bool, str]:
    """Drop stories that are technically high-scoring but not worth publishing.

    The no-movement rule is the one that matters most in practice. `self_deviation` scores the
    LEVEL and `magnitude` scores the MOVE, so a reading that has sat unchanged for months at an
    unusual level scores well on deviation while nothing has actually happened. Austin's drought
    stage did exactly that in the first real run: it ranked 8th of 17 with the figure "unchanged
    at D2" and a `why` claiming it was outside the area's range. Both statements were true and
    together they were incoherent — and this is the MOVERS engine. A standing level is a state,
    not a mover; it belongs in an evergreen piece, not a weekly headline.
    """
    signals = story["signals"]
    if not signals.get("threshold_crossed") and signals.get("_delta", 0.0) == 0.0:
        return True, "no movement this period — a state, not a mover"
    if signals.get("magnitude", 0) > 0.8 and signals.get("self_deviation", 0) < 0.1:
        return True, "big move that is normal for this area"
    for prior in recent_history:
        if prior.get("area_id") == story["area_id"] and prior.get("metric") == story["metric"]:
            if signals.get("magnitude", 0) <= prior.get("magnitude", 1.0):
                return True, "same area+metric headlined recently without acceleration"
    return False, ""


# ---------------------------------------------------------------- assembly

def build_stories(rows: list[dict], weights: dict, recent_history: list[dict]) -> list[dict]:
    """rows: one per (area, metric) carrying `signals` + figure/source/as_of. Ranked, 1-based."""
    assert_weights(weights)
    scored = []
    for row in rows:
        story = dict(row)
        story["surprise_score"] = round(surprise_score(row["signals"], weights), 3)
        suppressed, why = is_suppressed(story, recent_history)
        story["suppressed"] = suppressed
        if suppressed:
            story["suppressed_because"] = why
            continue
        story.setdefault("why", _why(row))
        scored.append(story)
    scored.sort(key=lambda s: (-s["surprise_score"], s["area_id"], s["metric"]))
    for i, story in enumerate(scored, 1):
        story["rank"] = i
    return scored


def decide_week_mode(stories: list[dict], quiet_threshold: float) -> str:
    top = stories[0]["surprise_score"] if stories else 0.0
    return "live" if top >= quiet_threshold else "evergreen"


def _why(row: dict) -> str:
    """The audit trail behind a rank, and the headline rationale.

    Kept coherent with the `figure` on purpose: a `why` that claims a large move beside a
    figure reading "unchanged" is the kind of small contradiction that makes a sourced brand
    look automated. Movement claims are made only when the series actually moved.
    """
    signals, bits = row["signals"], []
    moved = signals.get("_delta", 0.0) != 0.0
    if signals.get("threshold_crossed"):
        bits.append(str(signals.get("threshold_label") or "crossed a named threshold"))
    if moved and signals.get("magnitude", 0) > 0.6:
        bits.append("a large move against its own history")
    if signals.get("self_deviation", 0) > 0.6:
        bits.append("at a level well outside this area's own range")
    if signals.get("is_money_metric"):
        bits.append("a cost signal")
    if not bits:
        bits.append("a modest move against its own history" if moved else "no change this period")
    return "; ".join(bits)
