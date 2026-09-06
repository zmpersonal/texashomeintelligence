"""
build_feed.py — the local generator (decision B as re-decided in Phase 0).

Reads THI's committed datasets READ-ONLY, computes signals, ranks stories, and writes
`autoposter/data/social-feed.json` — but only after the document validates against
`schema/social-feed.schema.json`. An invalid artifact is never written: a half-written feed
is a feed the next stage trusts.

Everything here is deterministic. The model is not involved. Every numeral a caption may use
is produced here as a pre-formatted `figure` string, so the caption step never computes.
"""

from __future__ import annotations

import json
from datetime import date, datetime, timezone
from pathlib import Path

import yaml

import minischema
import movers_engine as movers
import thi_source

ROOT = Path(__file__).resolve().parents[1]

# Angle per metric family. Deterministic — the model never picks the angle.
# NOTE: the four-angle taxonomy is defined in VOICE-GUIDE.md, which has not been delivered.
# These assignments are a placeholder mapping and must be confirmed against it before any
# caption is generated. Flagged in RUNLOG, not silently assumed.
ANGLE_BY_METRIC = {
    "drought_stage": "warning",
    "energy_price_cents_kwh": "reveal",
    "cooling_degree_days": "reveal",
}
DEFAULT_ANGLE = "reveal"

METRIC_LABEL = {
    "drought_stage": "drought stage",
    "energy_price_cents_kwh": "residential electricity price",
    "cooling_degree_days": "cooling demand",
}


def load_config(path: Path | None = None) -> dict:
    return yaml.safe_load((path or ROOT / "config.yaml").read_text())


def _pct(new: float, old: float) -> float | None:
    return None if not old else (new - old) / old * 100.0


def _figure(series: thi_source.Series, delta: float, crossed: str | None) -> str:
    """The EXACT string a caption may reproduce verbatim. VALIDATOR G1 checks generated
    numerals against this, so anything not written here cannot legally appear in a post."""
    latest, period = series.latest, series.points[-1].period
    if series.metric == "drought_stage":
        stage = f"D{int(latest)}" if latest else "no drought (D0)"
        if crossed:
            return f"{crossed} — now {stage}"
        move = "unchanged at" if delta == 0 else (f"up {abs(delta):.0f} stage(s) to"
                                                 if delta > 0 else f"down {abs(delta):.0f} stage(s) to")
        return f"{move} {stage} (week of {period})"
    if series.metric == "energy_price_cents_kwh":
        change = _pct(latest, series.points[-2].value)
        tail = "" if change is None else f", {change:+.1f}% month over month"
        return f"{latest:.2f}¢ per kWh ({period[:7]}){tail}"
    if series.metric.startswith("permit_activity_"):
        trade = series.metric.removeprefix("permit_activity_")
        change = _pct(latest, series.points[-2].value)
        tail = "" if change is None else f", {change:+.0f}% month over month"
        return f"{latest:,.0f} {trade} permits in {period[:7]}{tail}"
    if series.metric == "cooling_degree_days":
        change = _pct(latest, series.points[-2].value)
        tail = "" if change is None else f", {change:+.0f}% vs the prior month"
        return f"{latest:,.0f} cooling degree-days in {period[:7]}{tail}"
    return f"{latest:,.2f} ({period})"


def compute_signals(series: thi_source.Series, cfg: dict, coverage: dict,
                    today: date, upto: int | None = None) -> dict:
    """Normalized 0..1 signals for one series.

    `upto` truncates the series to its first N points, so the calibration backtest can replay
    a past week using only the data that existed then — no lookahead.
    """
    points = series.points[:upto] if upto else series.points
    values = [p.value for p in points]
    deltas = [b - a for a, b in zip(values, values[1:])]
    latest_delta = deltas[-1] if deltas else 0.0
    crossed = movers.crossed_threshold(series.metric, values[-2], values[-1]) if len(values) > 1 else None

    return {
        "magnitude": movers.normalize_magnitude(latest_delta, deltas[:-1] or deltas),
        "self_deviation": movers.self_deviation(values[-1], values[:-1]),
        "threshold_crossed": bool(crossed),
        "threshold_label": crossed,
        "audience_coverage": coverage.get(series.area_id, 0.5),
        "freshness": movers.freshness(points[-1].period,
                                      cfg.get("staleness_hours", {}).get(series.metric), today),
        "is_money_metric": series.metric in cfg["movers"]["money_metrics"],
        "_delta": latest_delta,
        "_crossed": crossed,
    }


def build_rows(history: list[thi_source.Series], cfg: dict, coverage: dict,
               today: date, upto: int | None = None) -> list[dict]:
    rows = []
    for series in history:
        points = series.points[:upto] if upto else series.points
        if len(points) < cfg["movers"]["history_min_weeks"]:
            continue
        signals = compute_signals(series, cfg, coverage, today, upto)
        rows.append({
            "area_id": series.area_id,
            "metric": series.metric,
            "angle": ANGLE_BY_METRIC.get(series.metric, DEFAULT_ANGLE),
            "figure": _figure(series, signals["_delta"], signals["_crossed"]),
            "source": series.source,
            "as_of": points[-1].period,
            "signals": signals,
        })
    return rows


def build_feed(cfg: dict, today: date | None = None) -> tuple[dict, list[dict]]:
    today = today or datetime.now(timezone.utc).date()
    history = thi_source.load_history(today, min_points=cfg["movers"]["history_min_weeks"])
    coverage = thi_source.audience_coverage()

    rows = build_rows(history, cfg, coverage, today)
    # G6 at the feed level: a metric whose ingest has not landed never becomes a story.
    gated = cfg.get("gated_metrics", {})
    rows = [r for r in rows
            if gated.get(r["metric"], {}).get("available", True) is not False]

    stories = movers.build_stories(rows, cfg["movers"]["surprise_weights"], recent_history=[])
    week_mode = movers.decide_week_mode(stories, cfg["movers"]["quiet_week_threshold"])

    areas = {}
    for series in history:
        area = areas.setdefault(series.area_id, {
            "id": series.area_id,
            "type": thi_source.AREA_TYPE[series.area_id],
            "metrics": {},
        })
        values = series.values
        metric = {
            "value": round(values[-1], 4),
            "source": series.source,
            "as_of": series.points[-1].period,
            "vs_baseline": round(values[-1] - (sum(values[:-1]) / len(values[:-1])), 4)
            if len(values) > 1 else 0.0,
        }
        # The schema defines `wow` as week-over-week and `mom` as month-over-month. A monthly
        # series' delta emitted under `wow` is a mislabelled figure — small, and exactly the
        # class of false precision the honesty gate exists to stop. The delta goes in the
        # field that matches the series' actual cadence.
        if len(values) > 1:
            delta = round(values[-1] - values[-2], 4)
            metric["mom" if series.cadence == "monthly" else "wow"] = delta
        area["metrics"][series.metric] = metric

    feed = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "coverage": sorted(areas),
        "week_mode": week_mode,
        "areas": [areas[a] for a in sorted(areas)],
        "stories": [{
            "rank": s["rank"],
            "area_id": s["area_id"],
            "metric": s["metric"],
            "angle": s["angle"],
            "surprise_score": s["surprise_score"],
            "why": s["why"],
            "figure": s["figure"],
            "source": s["source"],
            "as_of": s["as_of"],
            "suppressed": False,
        } for s in stories],
    }
    return feed, stories


def write_feed(feed: dict, cfg: dict) -> Path:
    """Validate, THEN write. Never the other way round."""
    schema = json.loads((ROOT / "schema" / "social-feed.schema.json").read_text())
    minischema.assert_valid(feed, schema, "social-feed.json")
    out = ROOT / "data" / "social-feed.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(feed, indent=2, ensure_ascii=False) + "\n")
    return out


if __name__ == "__main__":
    cfg = load_config()
    feed, stories = build_feed(cfg)
    path = write_feed(feed, cfg)
    print(f"\nwrote {path.relative_to(ROOT.parent)}  "
          f"week_mode={feed['week_mode']}  areas={len(feed['areas'])}  "
          f"stories={len(feed['stories'])}\n")
    for s in feed["stories"]:
        print(f"  {s['rank']:2d}. {s['surprise_score']:.3f}  {s['area_id']:18s} "
              f"{s['metric']:28s} {s['angle']:8s} {s['figure']}")
        print(f"      why: {s['why']}  · {s['source']} · {s['as_of']}")
