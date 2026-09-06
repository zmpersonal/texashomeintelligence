"""The brand's own reference copy must pass the brand's own gates.

`specs/VOICE-GUIDE.md` carries four exemplars at full volume — the tone the caption call is
meant to hit. If the validator rejects those, the validator is wrong, not the copy: an
over-strict gate gets switched off by whoever it blocks, and a switched-off gate protects
nothing. This suite is what keeps the tone filters (G7 calm action, G9 real ask) honest as they
are tightened.

The exemplars are transcribed with their `{{slots}}` filled from their own `[EXAMPLE]` lines,
since an unfilled slot is itself a reject (baseline).
"""
import os
import sys
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import validator as v  # noqa: E402
import yaml  # noqa: E402

CFG = yaml.safe_load(open(os.path.join(os.path.dirname(__file__), "..", "config.yaml")))
# One day after the exemplars' as_of. VOICE-GUIDE.md's dates are illustrative tone references,
# not freshness cases — at a week old, G5 correctly rejects the hail exemplar against its 48h
# bound. That is the gate working, so the clock moves, not the bound.
TODAY = date(2026, 5, 14)
MEDIA = "data:image/png;base64," + "A" * 800

STORY_APPRAISAL = {"metric": "appraisal_change", "figure": "up 18% year-over-year",
                   "source": "Travis Central Appraisal District", "as_of": "2026-05-13"}
STORY_HAIL = {"metric": "hail_window", "figure": "elevated over the next 7-10 days",
              "source": "NOAA/NWS SPC", "as_of": "2026-05-13"}

# G6 gates appraisal off until CAD lands, which is correct and not what this suite tests —
# so the tone exemplars run against a config where the metric is available.
CFG_UNGATED = dict(CFG, gated_metrics={})


def _piece(caption, story, on_screen=None, angle="reveal"):
    return {
        "platform": "facebook", "angle": angle, "caption": caption,
        "on_screen_text": on_screen or [story["figure"], f"{story['source']} · {story['as_of']}"],
        "media_url": MEDIA, "has_media": True, "has_source_card": True,
        "destination_url": "https://texashomeintelligence.com/data/austin/",
        "destination_theme": story["metric"], "card_rows": [story["figure"]],
        "card_kind": "reveal", "card_numeric_cells": 1,
    }


REVEAL = (
    "Travis County neighbors — read this before your next tax bill. Median appraisals moved "
    "up 18% year-over-year (source: Travis Central Appraisal District, as of 2026-05-13). "
    "Translation: a lot of you are about to be billed on a number you're allowed to challenge — "
    "and most won't, because nobody handed them the receipt. Breakdown by area → "
    "https://texashomeintelligence.com/data/austin/ "
    "Share with a Travis County homeowner who hasn't opened their notice."
)

WARNING = (
    "Travis County — sourced heads-up, not a scare. Hail probability elevated over the next "
    "7-10 days (source: NOAA/NWS SPC, as of 2026-05-13). If your roof is 15+ years old, this "
    "is the week to get it looked at — before the storm, so you pick the inspector instead of "
    "the one knocking on your door. Send this to a Travis County homeowner who'll thank you "
    "later. https://texashomeintelligence.com/data/austin/"
)

VERDICT = (
    "Travis County graded this quarter on appraisal movement: up 18% year-over-year "
    "(source: Travis Central Appraisal District, as of 2026-05-13). Agree? Too generous? "
    "Drop your grade and defend it — and name the ZIP dragging the county down. "
    "https://texashomeintelligence.com/data/austin/"
)


def test_reveal_exemplar_passes():
    r = v.validate_post(_piece(REVEAL, STORY_APPRAISAL), STORY_APPRAISAL, CFG_UNGATED,
                        now=TODAY)
    assert r.ok, r.failures


def test_warning_exemplar_passes():
    piece = _piece(WARNING, STORY_HAIL, angle="warning")
    r = v.validate_post(piece, STORY_HAIL, CFG_UNGATED, now=TODAY)
    assert r.ok, r.failures


def test_verdict_exemplar_passes():
    piece = _piece(VERDICT, STORY_APPRAISAL, angle="verdict")
    r = v.validate_post(piece, STORY_APPRAISAL, CFG_UNGATED, now=TODAY)
    assert r.ok, r.failures


def test_the_voice_guides_own_never_list_still_gets_caught():
    """The exemplars pass, but the things VOICE-GUIDE.md forbids must still be rejected —
    the gates are loose enough for the real voice, not loose enough for the scam voice."""
    scam = REVEAL.replace("read this before your next tax bill",
                          "you won't BELIEVE what just happened!!")
    assert not v.validate_post(_piece(scam, STORY_APPRAISAL), STORY_APPRAISAL,
                               CFG_UNGATED, now=TODAY).ok


if __name__ == "__main__":
    fns = [f for n, f in sorted(globals().items()) if n.startswith("test_")]
    ok = 0
    for f in fns:
        try:
            f(); ok += 1; print("PASS", f.__name__)
        except AssertionError as e:
            print("FAIL", f.__name__, str(e)[:400])
    print(f"{ok}/{len(fns)} passed")
    sys.exit(0 if ok == len(fns) else 1)
