"""
post_template.py — deterministic, code-filled posts built from `social-feed.json` stories.

NOT the caption generator. The real captions are the one model call per cycle, and they need
`specs/VOICE-GUIDE.md`'s angle taxonomy, which is loaded but not yet approved for use (Phase 4
is held). This module exists so Phase 3 can prove the gate suite against the REAL feed rather
than against invented fixtures: it fills a minimal compliant piece using ONLY values the engine
supplied, so anything the validator rejects here is a genuine gate finding, not a model artifact.

It is also the shape the model must write into — every numeral comes from `story["figure"]`,
and `source`/`as_of` appear in the caption AND on the card, because G2 checks both.
"""

from __future__ import annotations

AREA_NAME = {"austin_metro": "Austin metro", "san_antonio_metro": "San Antonio metro",
             "texas": "Texas"}
# Digit-free by construction: a numeral in a URL would read as an unbacked claim under G1.
HERO_LINK = {"austin_metro": "https://texashomeintelligence.com/data/austin/",
             "san_antonio_metro": "https://texashomeintelligence.com/data/san-antonio/",
             "texas": "https://texashomeintelligence.com/data/"}


def build(story: dict, platform: str = "facebook", media_url: str | None = None) -> dict:
    place = story.get("county") and f"{story['county']} County" or AREA_NAME.get(
        story["area_id"], story["area_id"])
    figure, source, as_of = story["figure"], story["source"], story["as_of"]
    link = HERO_LINK.get(story["area_id"], HERO_LINK["texas"])

    caption = (
        f"{place}: {figure} "
        f"(source: {source}, as of {as_of}). "
        f"Worth checking your own before it costs you. "
        f"See the breakdown → {link} "
        f"Send this to a neighbour who should see it."
    )
    return {
        "platform": platform,
        "angle": story["angle"],
        "caption": caption,
        "on_screen_text": [figure, f"{source} · {as_of}"],
        "media_url": media_url or ("data:image/png;base64," + "A" * 800),
        "has_media": True,
        "has_source_card": True,
        "destination_url": link,
        "destination_theme": story["metric"],
        "card_kind": "reveal",
        "card_rows": [figure],
        "card_numeric_cells": 1,
        "story_rank": story["rank"],
    }
