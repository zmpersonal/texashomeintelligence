"""Phase 3 prove-gate: the full gate suite against the REAL social-feed.json.

Every story the engine produced is turned into a code-filled piece (src/post_template.py) and
must pass every gate. Then each gate is proved to BITE by mutating a passing piece one way at a
time — a gate suite that has never rejected anything has not been tested.

Run: python3 tests/test_gates_against_feed.py
"""
import json
import os
import sys
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import post_template  # noqa: E402
import validator as v  # noqa: E402
import yaml  # noqa: E402

HERE = os.path.dirname(__file__)
CFG = yaml.safe_load(open(os.path.join(HERE, "..", "config.yaml")))
FEED = json.load(open(os.path.join(HERE, "..", "data", "social-feed.json")))
TODAY = date(2026, 9, 6)
STORIES = FEED["stories"]


def _check(post, story=None, feed=None, **kw):
    return v.validate_post(post, story if story is not None else STORIES[0],
                           CFG, feed=feed or FEED, now=TODAY, **kw)


def _good(i=0):
    return post_template.build(STORIES[i])


# ---------------------------------------------------------------- the real feed

def test_the_feed_has_stories_to_validate():
    assert len(STORIES) >= 5, "expected a populated feed"


def test_every_real_story_produces_a_passing_piece():
    """The prove-gate proper: all 15 real stories, all gates, no exceptions."""
    failures = []
    for i, story in enumerate(STORIES):
        result = _check(post_template.build(story), story)
        if not result.ok:
            failures.append(f"rank {story['rank']} {story['metric']}: {result.failures}")
    assert not failures, "\n".join(failures)


def test_g5_passes_on_every_real_as_of():
    """G5 is newly wired; prove it accepts the real feed's ages, not just a fixture's."""
    for story in STORIES:
        r = v.GateResult(ok=True)
        v._check_freshness({}, story, CFG, r, now=TODAY)
        assert r.ok, f"{story['metric']} as_of {story['as_of']}: {r.failures}"


# ---------------------------------------------------------------- each gate bites

def test_g1_altered_numeral_rejected():
    p = _good(); p["caption"] = p["caption"].replace("permits", "9999 permits")
    assert any("G1" in f for f in _check(p).failures)


def test_g1_subtly_altered_numeral_rejected():
    """VALIDATOR.md names this fixture explicitly: a numeral nudged off the source."""
    story = dict(STORIES[0], figure="224 solar permits in 2026-08")
    p = post_template.build(story)
    p["caption"] = p["caption"].replace("224", "225")
    p["on_screen_text"] = ["225 solar permits in 2026-08", p["on_screen_text"][1]]
    assert any("G1" in f for f in _check(p, story).failures)


def test_g2_source_missing_from_caption_rejected():
    p = _good(); p["caption"] = p["caption"].replace(STORIES[0]["source"], "a source")
    assert any("G2" in f for f in _check(p).failures)


def test_g2_source_on_caption_but_not_card_rejected():
    p = _good(); p["on_screen_text"] = [STORIES[0]["figure"], "no provenance here"]
    assert any("G2" in f for f in _check(p).failures)


def test_g2_as_of_missing_rejected():
    p = _good(); p["caption"] = p["caption"].replace(STORIES[0]["as_of"], "recently")
    assert any("G2" in f for f in _check(p).failures)


def test_g3_missing_source_card_rejected():
    """VALIDATOR.md's survives-the-splice fixture."""
    p = _good(); p["has_source_card"] = False
    assert any("G3" in f for f in _check(p).failures)


def test_g4_destination_mismatch_rejected():
    p = _good(); p["destination_theme"] = "energy_price_cents_kwh"
    assert any("G4" in f for f in _check(p, STORIES[0]).failures)


def test_g5_stale_as_of_rejected():
    story = dict(STORIES[0], as_of="2025-01-01")
    p = post_template.build(story)
    assert any("G5" in f for f in _check(p, story).failures)


def test_g5_future_as_of_rejected():
    story = dict(STORIES[0], as_of="2027-01-01")
    assert any("G5" in f for f in _check(post_template.build(story), story).failures)


def test_g5_unbounded_metric_rejected_not_waved_through():
    """An unconfigured metric is an unanswered question, not a pass."""
    story = dict(STORIES[0], metric="a_metric_nobody_bounded")
    p = post_template.build(story); p["destination_theme"] = story["metric"]
    fails = _check(p, story).failures
    assert any("G5" in f and "no staleness bound" in f for f in fails)


def test_g6_gated_metric_rejected():
    story = dict(STORIES[0], metric="appraisal_change")
    p = post_template.build(story); p["destination_theme"] = "appraisal_change"
    assert any("G6" in f for f in _check(p, story).failures)


def test_g6b_live_angle_on_an_evergreen_week_rejected():
    """The gate that stops the machine faking urgency on slow data."""
    p = _good()
    fails = _check(p, feed=dict(FEED, week_mode="evergreen")).failures
    assert any("G6b" in f for f in fails)


def test_g6b_live_angle_without_a_story_rejected():
    p = _good()
    assert any("G6b" in f for f in v.validate_post(p, None, CFG, feed=FEED, now=TODAY).failures)


def test_g7_alarm_rejected():
    p = _good(); p["caption"] = "SHOCKING disaster!! " + p["caption"]
    assert any("G7" in f for f in _check(p).failures)


def test_g7_risk_claim_without_a_calm_action_rejected():
    p = _good()
    p["caption"] = (f"Travis County: hail probability elevated "
                    f"(source: {STORIES[0]['source']}, as of {STORIES[0]['as_of']}). "
                    f"Send this to a neighbour.")
    assert any("G7" in f for f in _check(p).failures)


def test_g8_steering_rejected():
    p = _good(); p["caption"] = "Best zips to live in Travis. Send this to a neighbour."
    assert any("G8" in f for f in _check(p).failures)


def test_g8_applies_to_the_title_and_the_card_too():
    p = _good(); p["title"] = "The safest neighborhood in Bexar"
    assert any("G8" in f for f in _check(p).failures)
    q = _good(); q["on_screen_text"] = q["on_screen_text"] + ["good neighborhood"]
    assert any("G8" in f for f in _check(q).failures)


def test_g9_generic_bait_rejected():
    p = _good(); p["caption"] = p["caption"].split("Send this")[0] + "do you agree? 👇"
    assert any("G9" in f for f in _check(p).failures)


def test_g9_no_ask_at_all_rejected():
    p = _good(); p["caption"] = p["caption"].replace(
        "Send this to a neighbour who should see it.", "")
    assert any("G9" in f for f in _check(p).failures)


# ---------------------------------------------------------------- baseline

def test_unfilled_slot_rejected():
    p = _good(); p["caption"] = p["caption"].replace("Send this", "{{ask}} Send this")
    assert any("BASE" in f for f in _check(p).failures)


def test_media_that_does_not_resolve_rejected():
    p = _good(); p["media_url"] = "https://example.invalid/missing.png"
    fails = _check(p, media_opener=lambda u: (False, "HTTP 404")).failures
    assert any("BASE" in f and "media does not resolve" in f for f in fails)


def test_placeholder_sized_media_rejected():
    p = _good(); p["media_url"] = "data:image/png;base64,AAAA"
    assert any("media does not resolve" in f for f in _check(p).failures)


def test_zero_row_card_rejected():
    p = _good(); p["card_rows"] = []
    assert any("zero body rows" in f for f in _check(p).failures)


def test_ranking_card_with_no_numeric_cells_rejected():
    p = _good(); p["card_kind"] = "ranking"; p["card_numeric_cells"] = 0
    assert any("no numeric cells" in f for f in _check(p).failures)


def test_over_platform_limit_rejected():
    p = _good(); p["platform"] = "x"      # 280 chars
    assert any("exceeds x limit" in f for f in _check(p).failures)


def test_unknown_platform_rejected_not_ignored():
    p = _good(); p["platform"] = "mastodon"
    assert any("unknown platform" in f for f in _check(p).failures)


def test_pinterest_missing_required_fields_rejected():
    p = _good(); p["platform"] = "pinterest"
    fails = _check(p).failures
    assert sum("pinterest missing" in f for f in fails) >= 2


if __name__ == "__main__":
    fns = [f for n, f in sorted(globals().items()) if n.startswith("test_")]
    ok = 0
    for f in fns:
        try:
            f(); ok += 1; print("PASS", f.__name__)
        except AssertionError as e:
            print("FAIL", f.__name__, str(e)[:300])
    print(f"{ok}/{len(fns)} passed")
    sys.exit(0 if ok == len(fns) else 1)
