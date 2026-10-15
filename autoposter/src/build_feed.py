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


def _mom_refusal(series: thi_source.Series) -> str | None:
    """POLICY A, Round 52. The tail that replaces a month-over-month figure when the two
    periods being compared straddle a recorded source change — a figure computed across one
    is two instruments subtracted from each other, and there is no honest percentage to print.

    REACHABLE ONLY IF THE MINIMUM MOVES, and tested directly for that reason. The last two
    points straddle a break exactly when the newest point is the first period at or after it,
    which leaves one period on the near side — and policy C's six-period minimum drops such a
    series before `_figure` is called. So no live series reaches this branch today. It stays
    because the thing stopping a straddling month-over-month claim would otherwise be a tuned
    number rather than a rule: lower `MIN_SEGMENT_MONTHS` and this is what refuses.
    `test_discontinuities.py` builds the straddling series by hand and reads the string back.
    """
    if not series.mom_breaks:
        return None
    return (", month over month withheld — the source changed how it files this work from "
            f"{series.mom_breaks[-1]['fromMonth']}")


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
        tail = _mom_refusal(series) or ("" if change is None else f", {change:+.1f}% month over month")
        return f"{latest:.2f}¢ per kWh ({period[:7]}){tail}"
    if series.metric.startswith("permit_activity_"):
        trade = TRADE_DISPLAY.get(series.metric.removeprefix("permit_activity_"),
                                  series.metric.removeprefix("permit_activity_"))
        change = _pct(latest, series.points[-2].value)
        tail = _mom_refusal(series) or ("" if change is None else f", {change:+.0f}% month over month")
        return f"{latest:,.0f} {trade} permits in {period[:7]}{tail}"
    if series.metric == "cooling_degree_days":
        change = _pct(latest, series.points[-2].value)
        tail = _mom_refusal(series) or ("" if change is None else f", {change:+.0f}% vs the prior month")
        return f"{latest:,.0f} cooling degree-days in {period[:7]}{tail}"
    return f"{latest:,.2f} ({period})"


#: How a trade reads in COPY. The feed's `figure` is the legal source of every numeral a post
#: may contain, so a raw metric suffix leaking into it is a copy defect, not a cosmetic one.
#:
#: Round 50 is why this exists here rather than only in `run_article.py`: the new
#: `energy_storage` category rendered as "188 energy_storage permits in 2026-09" — an underscore,
#: in a figure the model is bound to quote verbatim. `hvac` had the same shape ("1,137 hvac
#: permits") and was only ever fixed downstream in the article builders, which left the feed
#: itself wrong for anything that read it.
TRADE_DISPLAY = {
    "hvac": "HVAC",
    "energy_storage": "battery-storage",
    "trees": "tree",
}


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
        # POLICY C, Round 52. Ranking is a comparison too — `magnitude` and
        # `self_deviation` measure the newest period against its own history, and
        # across a source change that history belongs to a different instrument.
        # Austin's battery-storage series is the live case: 4 permits in May against
        # 188 in September is the largest deviation in the feed and most of it is a
        # filing-practice change, so it would have been the week's top story on the
        # strength of the defect. A series whose near side is too short to compare
        # within is not ranked at all; the feed still carries its current count,
        # which is a fact, with `withheld` saying what was not computed from it.
        if series.withheld:
            continue
        signals = compute_signals(series, cfg, coverage, today, upto)
        rows.append({
            "area_id": series.area_id,
            "county": series.county,
            "metric": series.metric,
            "angle": ANGLE_BY_METRIC.get(series.metric, DEFAULT_ANGLE),
            "figure": _figure(series, signals["_delta"], signals["_crossed"]),
            "source": series.source,
            "as_of": points[-1].period,
            "signals": signals,
        })
    return rows


def assert_states_its_omissions(metric: dict, withheld_fields: set[str],
                                expected: list[str], where: str) -> None:
    """Every comparison field is either computed or explained — never just missing.

    Its own function so it can be called with a silent omission and seen to raise.
    Inside `_area_metric` there is no input that produces one: a field is dropped only
    on a branch that registers the reason in the same breath. That makes this
    unreachable in production and worth keeping anyway — it is the thing that would
    catch the next branch somebody adds, and a guard nobody can watch run is a guard
    nobody should trust (`test_discontinuities.py` runs it).
    """
    for name in expected:
        if name not in metric and name not in withheld_fields:
            raise AssertionError(
                f"build_feed: {where} emits no `{name}` and does not say why. A field absent "
                f"for an unstated reason reads as no change to anything consuming this feed "
                f"— state it in `withheld` or compute it.")


def _area_metric(series: thi_source.Series) -> dict:
    """One area metric in the feed. The CURRENT READING is always published — a count of
    what a city issued last month is a fact, and a source changing how it files does not
    unmake it. What a source change takes away is the right to COMPARE, so this is where
    Round 52's two switches land on the artifact.

    Policy A — a delta whose two periods straddle a break is not emitted.
    Policy C — `vs_baseline` is the near side of the newest break and nothing before it,
               and is not emitted at all when that side is too short.

    Nothing is dropped silently. Every field left out names itself in `withheld` with the
    reason, and the assertion at the bottom is what makes that a property of the function
    rather than of my having remembered: an absent field with no stated reason is
    indistinguishable from a bug, and reads as "no change" to anything consuming the feed.
    """
    values = series.values
    segment = [p.value for p in series.current_segment]
    withheld: list[str] = []
    withheld_fields: set[str] = set()

    def withhold(fields: list[str], reason: str) -> None:
        withheld_fields.update(fields)
        withheld.append(f"{', '.join(fields)}: {reason}")

    metric = {
        "value": round(values[-1], 4),
        "source": series.source,
        "as_of": series.points[-1].period,
    }

    # `vs_baseline` — the near side only, per policy C.
    if series.withheld:
        withhold(["vs_baseline"], series.withheld)
    elif len(segment) > 1:
        metric["vs_baseline"] = round(
            segment[-1] - (sum(segment[:-1]) / len(segment[:-1])), 4)
    else:
        metric["vs_baseline"] = 0.0

    # The schema defines `wow` as week-over-week and `mom` as month-over-month. A monthly
    # series' delta emitted under `wow` is a mislabelled figure — small, and exactly the
    # class of false precision the honesty gate exists to stop. The delta goes in the
    # field that matches the series' actual cadence.
    field = "mom" if series.cadence == "monthly" else "wow"
    if len(values) > 1:
        if series.mom_breaks:
            # Policy A. The named threshold is withheld with it: `crossed_threshold` compares
            # the same two periods, so a crossing reported across a break would be a
            # threshold crossed by the source rather than by the weather.
            withhold([field, "crossed"],
                     "the source changed how it files this work from "
                     f"{series.mom_breaks[-1]['fromMonth']}, so the last two periods are "
                     "not comparable with each other")
        else:
            metric[field] = round(values[-1] - values[-2], 4)
            crossed = movers.crossed_threshold(series.metric, values[-2], values[-1])
            if crossed:
                metric["crossed"] = [crossed]

    if withheld:
        metric["withheld"] = withheld

    if len(values) > 1:
        assert_states_its_omissions(metric, withheld_fields, [field, "vs_baseline"],
                                    f"{series.area_id}/{series.metric}")
    return metric


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
        area["metrics"][series.metric] = _area_metric(series)

    feed = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "coverage": sorted(areas),
        "week_mode": week_mode,
        "areas": [areas[a] for a in sorted(areas)],
        "stories": [{
            "rank": s["rank"],
            "area_id": s["area_id"],
            **({"county": s["county"]} if s.get("county") else {}),
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
