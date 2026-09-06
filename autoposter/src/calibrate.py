"""
calibrate.py — recalibrate `quiet_week_threshold` against THI's real history.

WHY THIS EXISTS: the Phase 0 reweighting (dropping the two cross-area terms and redistributing
0.65 unevenly) changed the score distribution, so the package's inherited 0.45 no longer means
what it meant. It was flagged `calibrated: false` rather than carried over. A threshold nobody
measured is a coin toss dressed as a rule.

METHOD — a walk-forward replay, no lookahead. For each calendar week from the first week where
any series had the minimum history, to today: truncate every series to the readings that
EXISTED that week, score them exactly as the live engine would, and record the week's top
score. The distribution of those weekly maxima is what the threshold has to sit in.

The threshold answers one question: how often should a cycle produce no live story and fall
back to evergreen? That is an editorial choice about the brand's tolerance for a quiet week,
so this script reports the distribution and PROPOSES a value. A human sets it.
"""

from __future__ import annotations

import statistics
from datetime import date, timedelta

import build_feed
import movers_engine as movers
import thi_source


def _truncate(series: thi_source.Series, cutoff: date) -> thi_source.Series | None:
    points = [p for p in series.points if p.period <= cutoff.isoformat()]
    if not points:
        return None
    clone = thi_source.Series(series.area_id, series.metric, points, series.source,
                              points[-1].period, series.unit, series.cadence, series.note)
    return clone


def weekly_maxima(cfg: dict, history: list[thi_source.Series],
                  coverage: dict) -> list[tuple[str, float, str]]:
    min_points = cfg["movers"]["history_min_weeks"]
    weights = cfg["movers"]["surprise_weights"]

    starts = []
    for series in history:
        if len(series.points) >= min_points:
            starts.append(series.points[min_points - 1].period)
    if not starts:
        return []
    first = date.fromisoformat(min(starts))
    last = date.fromisoformat(max(s.points[-1].period for s in history))

    out = []
    cutoff = first - timedelta(days=first.weekday())
    while cutoff <= last:
        rows = []
        for series in history:
            trimmed = _truncate(series, cutoff)
            if not trimmed or len(trimmed.points) < min_points:
                continue
            signals = build_feed.compute_signals(trimmed, cfg, coverage, cutoff)
            rows.append({
                "area_id": trimmed.area_id, "metric": trimmed.metric,
                "angle": "reveal", "figure": "", "source": trimmed.source,
                "as_of": trimmed.points[-1].period, "signals": signals,
            })
        stories = movers.build_stories(rows, weights, recent_history=[])
        if stories:
            top = stories[0]
            out.append((cutoff.isoformat(), top["surprise_score"],
                        f"{top['area_id']}/{top['metric']}"))
        cutoff += timedelta(days=7)
    return out


def report(cfg: dict) -> dict:
    history = thi_source.load_history(min_points=cfg["movers"]["history_min_weeks"])
    coverage = thi_source.audience_coverage()
    rows = weekly_maxima(cfg, history, coverage)
    scores = sorted(r[1] for r in rows)
    if not scores:
        raise SystemExit("no replayable weeks — cannot calibrate")

    def pct(p: float) -> float:
        return scores[min(len(scores) - 1, int(round(p / 100 * (len(scores) - 1))))]

    print(f"\nWALK-FORWARD REPLAY — {len(scores)} weekly cycles, "
          f"{rows[0][0]} to {rows[-1][0]}")
    print(f"  weeks replayed : {len(scores)}")
    print(f"  min / median / max of weekly top score : "
          f"{scores[0]:.3f} / {statistics.median(scores):.3f} / {scores[-1]:.3f}")
    print(f"  mean {statistics.mean(scores):.3f}   stdev {statistics.pstdev(scores):.3f}\n")
    print("  percentile  top-score")
    for p in (5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 90, 100):
        print(f"     p{p:<3d}      {pct(p):.3f}")

    print("\n  histogram of weekly top scores")
    edges = [i / 10 for i in range(11)]
    for lo, hi in zip(edges, edges[1:]):
        n = sum(1 for s in scores if lo <= s < hi or (hi == 1.0 and s == 1.0))
        print(f"    {lo:.1f}-{hi:.1f}  {'#' * n}{'' if n else '·'} ({n})")

    inherited = cfg["movers"]["quiet_week_threshold"]
    quiet_at = lambda t: sum(1 for s in scores if s < t) / len(scores) * 100
    print(f"\n  evergreen rate at candidate thresholds")
    for t in (0.25, 0.30, 0.35, 0.40, inherited, 0.50):
        print(f"    {t:.2f} -> {quiet_at(t):5.1f}% of cycles evergreen"
              f"{'   <- inherited, uncalibrated' if t == inherited else ''}")
    return {"scores": scores, "rows": rows, "p20": pct(20), "p25": pct(25),
            "median": statistics.median(scores)}


if __name__ == "__main__":
    report(build_feed.load_config())
