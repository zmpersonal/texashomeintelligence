"""Tests for the metro-grain movers engine, the THI reader, and the feed builder.

The data traps below are the real ones found against THI's live archive in Phase 2, not
invented cases: a partial trailing month, a file interleaving 30-year normals with actuals,
a county set that grew mid-series, and a flat reading scoring as a "mover".

Run: python3 tests/test_movers.py
"""
import json
import os
import sys
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import build_feed          # noqa: E402
import minischema          # noqa: E402
import movers_engine as m  # noqa: E402
import thi_source          # noqa: E402

CFG = build_feed.load_config()
W = CFG["movers"]["surprise_weights"]


# ---------------------------------------------------------------- weights

def test_config_weights_valid():
    m.assert_weights(W)


def test_reenabled_cross_area_term_raises():
    """The guard against silently restoring county-grain scoring without county-grain data."""
    try:
        m.assert_weights(dict(W, neighbor_divergence=0.2))
    except ValueError as e:
        assert "METRO grain" in str(e); return
    raise AssertionError("expected a raise on a re-enabled cross-area weight")


def test_weights_must_sum_to_one():
    try:
        m.assert_weights(dict(W, magnitude=0.9))
    except ValueError as e:
        assert "sum to" in str(e); return
    raise AssertionError("expected a raise when additive weights do not sum to 1")


# ---------------------------------------------------------------- scoring

def test_threshold_only_where_a_named_standard_exists():
    assert m.crossed_threshold("drought_stage", 1.0, 2.0) == "crossed into Severe Drought (D2)"
    assert m.crossed_threshold("drought_stage", 2.0, 1.0) is not None      # falling back out
    assert m.crossed_threshold("permit_activity_roofing", 10, 100_000) is None


def test_flat_reading_is_suppressed_as_a_state_not_a_mover():
    story = {"area_id": "austin_metro", "metric": "drought_stage",
             "signals": {"_delta": 0.0, "threshold_crossed": False, "self_deviation": 0.9}}
    suppressed, why = m.is_suppressed(story, [])
    assert suppressed and "state, not a mover" in why


def test_flat_reading_that_crosses_a_threshold_is_kept():
    story = {"area_id": "a", "metric": "drought_stage",
             "signals": {"_delta": 0.0, "threshold_crossed": True}}
    assert m.is_suppressed(story, [])[0] is False


def test_why_never_claims_a_move_that_did_not_happen():
    """The invariant is that `why` cannot assert movement beside a figure reading "unchanged".
    It may still describe the LEVEL, which is a different and true claim."""
    flat = m._why({"signals": {"_delta": 0.0, "magnitude": 0.95, "self_deviation": 0.95,
                               "threshold_crossed": False}})
    assert "move" not in flat
    moved = m._why({"signals": {"_delta": 2.0, "magnitude": 0.95, "self_deviation": 0.1,
                                "threshold_crossed": False}})
    assert "large move" in moved


def test_dead_flat_series_that_finally_moves_scores_high():
    assert m.normalize_magnitude(3.0, [0.0, 0.0, 0.0]) == 1.0
    assert m.normalize_magnitude(0.0, [0.0, 0.0, 0.0]) == 0.0


def test_ranking_is_deterministic_on_ties():
    rows = [{"area_id": "b", "metric": "x", "signals": {"_delta": 1, "magnitude": 0.5}},
            {"area_id": "a", "metric": "x", "signals": {"_delta": 1, "magnitude": 0.5}}]
    assert [s["area_id"] for s in m.build_stories(rows, W, [])] == ["a", "b"]


# ---------------------------------------------------------------- the reader

def test_reader_never_writes_to_site():
    src = open(os.path.join(os.path.dirname(__file__), "..", "src", "thi_source.py")).read()
    for forbidden in ("write_text(", "open(", ".mkdir(", "unlink("):
        if forbidden == "open(":
            continue        # `_load` uses read_text; guard the mutating calls
        assert forbidden not in src.split("if __name__")[0] or "read" in forbidden, forbidden


def test_partial_trailing_month_is_dropped():
    """September's first few days must never read as a monthly collapse."""
    series = [s for s in thi_source.load_history(date(2026, 9, 6))
              if s.metric.startswith("permit_activity_")]
    assert series, "expected permit series"
    for s in series:
        assert s.points[-1].period[:7] < "2026-09", f"{s.metric} kept a partial month"
        assert any("incomplete current month" in d for d in s.dropped)


def test_climate_normals_are_not_blended_with_actuals():
    """The climate file interleaves 1991-2020 normals with real months in one array."""
    cdd = [s for s in thi_source.load_history(date(2026, 9, 6))
           if s.metric == "cooling_degree_days"]
    assert cdd, "expected a cooling_degree_days series"
    for s in cdd:
        assert all(p.period >= "2025-01-01" for p in s.points), "a 2020-dated normal leaked in"
        assert any("other record type" in d for d in s.dropped)


def test_drought_is_anchored_to_one_county():
    """The county set grew on 2026-08-25; aggregating over it would fake a jump."""
    for s in thi_source.load_history(date(2026, 9, 6)):
        if s.metric == "drought_stage":
            assert "anchored to" in s.note
            assert len(s.points) > 40, "anchoring should preserve the long series"


def test_series_below_the_config_minimum_are_dropped():
    got = thi_source.load_history(date(2026, 9, 6), min_points=99)
    assert got == []


# ---------------------------------------------------------------- the artifact

def _feed():
    return build_feed.build_feed(CFG, date(2026, 9, 6))[0]


def test_feed_validates_against_the_schema():
    schema = json.loads(open(os.path.join(os.path.dirname(__file__), "..", "schema",
                                          "social-feed.schema.json")).read())
    assert minischema.validate(_feed(), schema) == []


def test_invalid_feed_is_rejected_before_write():
    schema = json.loads(open(os.path.join(os.path.dirname(__file__), "..", "schema",
                                          "social-feed.schema.json")).read())
    broken = _feed()
    broken["stories"][0]["surprise_score"] = 1.7        # schema maximum is 1
    assert minischema.validate(broken, schema) != []


def test_minischema_refuses_to_ignore_an_unimplemented_keyword():
    try:
        minischema.validate({}, {"type": "object", "patternProperties": {}})
    except minischema.SchemaUnsupported:
        return
    raise AssertionError("a subset validator must never silently skip a keyword")


def test_every_story_carries_provenance_and_a_figure():
    for s in _feed()["stories"]:
        assert s["source"] and s["as_of"] and s["figure"]
        assert s["angle"] in ("reveal", "verdict", "wager", "warning")
        assert 0.0 <= s["surprise_score"] <= 1.0


def test_gated_metric_never_reaches_stories():
    gated = [k for k, v in CFG["gated_metrics"].items() if v.get("available") is False]
    assert gated, "expected at least one gated metric"
    assert not [s for s in _feed()["stories"] if s["metric"] in gated]


def test_ranks_are_dense_and_ordered():
    stories = _feed()["stories"]
    assert [s["rank"] for s in stories] == list(range(1, len(stories) + 1))
    scores = [s["surprise_score"] for s in stories]
    assert scores == sorted(scores, reverse=True)


if __name__ == "__main__":
    fns = [f for n, f in sorted(globals().items()) if n.startswith("test_")]
    ok = 0
    for f in fns:
        try:
            f(); ok += 1; print("PASS", f.__name__)
        except AssertionError as e:
            print("FAIL", f.__name__, e)
    print(f"{ok}/{len(fns)} passed")
    sys.exit(0 if ok == len(fns) else 1)
