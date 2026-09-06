"""
topic_scorer.py — ARTICLE-ENGINE.md Stage 1, in deterministic code.

The model does not decide what THI writes about. Candidates come from `article_topics.yaml`,
their data strength is MEASURED against the real feed, brand safety is a high-weighted penalty,
and the human picks from the ranked shortlist. Nothing here is a judgement call at runtime.

Weights come from `config.topic_score_weights` (THI's money-tilted tuning):
    public_interest .25 · data_strength .25 · citability .20 · brand_safety (PENALTY) .20
    · money_bonus .10
"""

from __future__ import annotations

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]


def load_topics(path: Path | None = None) -> list[dict]:
    return yaml.safe_load((path or ROOT / "article_topics.yaml").read_text())["topics"]


def data_strength(topic: dict, feed: dict, config: dict) -> tuple[float, str]:
    """MEASURED, not asserted: how well can we actually defend this from our own data?

    Scores on the metrics present in the feed and the depth of their history. A topic whose
    metrics are gated or simply absent scores 0 and is unpickable — which is the point: it is
    the same 'gate the data before the feature' rule the whole build runs on, applied to
    editorial choice.
    """
    required = topic.get("requires_metrics", [])
    if not required:
        return 0.0, "no metrics declared"

    gated = config.get("gated_metrics") or {}
    present = {a["id"]: a["metrics"] for a in feed.get("areas", [])}
    found, missing, depth = [], [], []

    for metric in required:
        if gated.get(metric, {}).get("available") is False:
            missing.append(f"{metric} (gated)")
            continue
        areas = [a for a, metrics in present.items() if metric in metrics]
        if areas:
            found.append(metric)
            depth.append(len(areas))
        else:
            missing.append(f"{metric} (no feed)")

    if not found:
        return 0.0, "no supporting metric in the feed: " + ", ".join(missing)

    coverage = len(found) / len(required)
    # A metric carried by more than one area is more defensible than one carried by a single
    # series — but capped, since breadth is not depth.
    breadth = min(1.0, (sum(depth) / len(depth)) / 2.0)
    score = round(0.7 * coverage + 0.3 * breadth, 3)
    note = f"{len(found)}/{len(required)} metrics live"
    if missing:
        note += "; missing " + ", ".join(missing)
    return score, note


def citability(topic: dict) -> float:
    """Question-shaped, answerable, and specific enough to be quoted. ARTICLE-ENGINE.thi.md's
    myth-buster format IS the citability asset, so this reads the question's own shape."""
    q = topic["question"].strip()
    score = 0.0
    if q.endswith("?"):
        score += 0.5
    if q.lower().startswith(("is ", "are ", "was ", "does ", "do ", "did ", "which ", "how ")):
        score += 0.3
    if any(place in q for place in ("Texas", "Austin", "San Antonio", "Round Rock")):
        score += 0.2
    return round(min(1.0, score), 3)


def score_topics(feed: dict, config: dict, topics: list[dict] | None = None) -> list[dict]:
    weights = config["topic_score_weights"]
    out = []
    for topic in (topics if topics is not None else load_topics()):
        strength, note = data_strength(topic, feed, config)
        cite = citability(topic)
        risk = float(topic.get("brand_safety_risk", 0.0))
        score = (weights["public_interest"] * float(topic["public_interest"])
                 + weights["data_strength"] * strength
                 + weights["citability"] * cite
                 - weights["brand_safety_penalty"] * risk
                 + weights["money_bonus"] * (1.0 if topic.get("money") else 0.0))
        out.append({
            **topic,
            "data_strength": strength, "data_note": note, "citability": cite,
            "score": round(max(0.0, score), 3),
            "buildable": strength > 0.0 and risk < 0.5,
            "blocked_because": ("brand-safety gated" if risk >= 0.5
                                else ("data" if strength == 0.0 else "")),
        })
    out.sort(key=lambda t: (-t["score"], t["id"]))
    return out


def surface_tension(ranked: list[dict]) -> list[str]:
    """ARTICLE-ENGINE.md: the scorer must SURFACE any virality-vs-brand-safety tension so the
    human decides consciously rather than by drift. A high-interest topic held back only by its
    brand-safety penalty is exactly that tension, and it gets named."""
    notes = []
    for topic in ranked:
        if topic.get("brand_safety_risk", 0) >= 0.5 and topic["public_interest"] >= 0.7:
            notes.append(
                f"{topic['id']}: public_interest {topic['public_interest']:.2f} — one of the "
                f"highest here — held back ONLY by the brand-safety penalty. "
                f"{topic.get('gated_reason', '').strip()}")
    return notes
