"""The card gate: built from the ledger, backed by the ledger, or it does not publish.

The first card's frontmatter was typed by hand from the claim ledger. It was right, and it was
a hand-step — correct once, with nothing to catch the second article drifting (L14). These
tests assert the auto-path produces that same approved card, and then try to get a bad card
past the gate the way a real mistake would: a hand-edited block, a plausible wrong number, a
source nobody cited, a card that was never rendered.

Run: python3 tests/test_card.py   (or python3 -m pytest tests/)
"""
import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import date
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import article_engine as engine     # noqa: E402
import card as card_mod            # noqa: E402
import run_article                 # noqa: E402
from claim_ledger import Claim     # noqa: E402

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
TODAY = date(2026, 9, 6)
CFG = engine.load_config()
OK = lambda url: (True, "resolved 200")     # noqa: E731

SIDECAR = {
    "path": "/images/og/are-texas-electricity-prices-still-going-up.png",
    "width": 1200, "height": 630, "alt": "…",
    "rendered": {
        "question": "Are Texas electricity prices still going up?",
        "headline": "13.88¢/kWh",
        "subhead": "down 10.2% year over year",
        "source": "EIA",
        "asOf": "Aug 2026",
    },
}


def _run():
    return engine.run("thi", write_fn=run_article.write,
                      build_claims_fn=run_article.build_claims, today=TODAY)


def _card():
    r = _run()
    return r["card"], r["claims"], r["article"]


# ============================================ the card is BUILT, not typed

def test_the_engine_emits_the_card_block():
    r = _run()
    assert r["card"]["headline"] == "13.88¢/kWh"
    assert r["card"]["subhead"] == "down 10.2% year over year"
    assert r["card"]["source"] == "EIA" and r["card"]["asOf"] == "Aug 2026"


def test_the_built_block_matches_the_card_the_owner_APPROVED():
    """THE PROOF THAT THE AUTO-PATH REPLACES THE HAND ONE.

    The frontmatter on the card PR was written by hand from the ledger and approved on sight.
    If the engine's emitted block is not that same block, character for character, then the
    automation is producing a different card from the one that was judged — which is worse than
    the hand-step it replaces, because it looks automated.
    """
    live = subprocess.run(
        ["git", "show", "autoposter/og-card-minimum:site/src/data/analysis/"
         "are-texas-electricity-prices-still-going-up.md"],
        capture_output=True, text=True, cwd=REPO).stdout
    if not live:                       # the card branch is not fetched here
        return
    approved = re.search(r"^card:\n(?:  .*\n)+", live, re.M)
    assert approved, "could not find the approved card block — check this by hand"
    assert engine.run("thi", write_fn=run_article.write,
                      build_claims_fn=run_article.build_claims,
                      today=TODAY)["card_frontmatter"] == approved.group(0).rstrip()


def test_the_hero_figure_is_a_MEASURED_claim_not_a_derived_one():
    """A card that leads on arithmetic leads on the weakest thing it has."""
    card, claims, _ = _card()
    lead = next(c for c in claims if c.tier == "data" and c.figure in
                (card["headline"], "13.88 cents per kilowatt-hour"))
    assert lead.tier == "data"


def test_compaction_may_never_change_a_digit():
    """The one transform this module performs is a UNIT rewrite. If it ever touched a numeral
    it would be deriving, which is the architecture line."""
    assert card_mod._compact("13.88 cents per kilowatt-hour") == "13.88¢/kWh"
    assert card_mod._compact("644 cooling degree-days") == "644 CDD"
    assert card_mod._compact("no known unit here") == "no known unit here"


def test_a_reference_PERIOD_is_not_mistaken_for_a_month():
    """`1991-2020` is a climate normal's reference period and matches the shape of a date.
    Parsed naively it is month 20. Found by running the gate against the real ledger."""
    assert card_mod._as_month("1991-2020") is None
    assert card_mod._as_month("2026-08-01") == "Aug 2026"
    assert card_mod._as_month("2026-13-01") is None


# ============================================ the gate: numerals must be ledger-backed

def test_a_plausible_WRONG_number_is_refused():
    """THE MUTATION. 13.88 becomes 13.98 — a typo, not a lie, and the kind of thing that
    survives a proofread. The ledger cannot back it, so the card cannot ship."""
    card, claims, article = _card()
    bad = dict(card, headline="13.98¢/kWh")
    result = card_mod.verify_card(bad, claims, article=article)
    assert not result.ok
    assert any(f.startswith("C1") and "13.98" in f for f in result.failures)


def test_a_FROZEN_card_is_caught_when_the_reading_moves():
    """THE MUTATION THAT JUSTIFIES C1a. A hand-typed block is right the day it is typed.

    Next month the reading moves and the block does not. The card then shows a real, sourced,
    correct-last-month number over a current article — the most convincing kind of wrong. Worse,
    a numerals-anywhere check CANNOT see it: the old figure survives inside the movement claim's
    own derivation string ("13.88 vs 15.46 = -10.2%"), so it still looks backed. The card has
    exactly two claim slots, so the gate checks those two slots exactly.
    """
    import copy
    card, claims, article = _card()
    moved = copy.deepcopy(claims)
    for c in moved:                         # only the reading moves; the derivation lags
        if c.metric == "energy_price_cents_kwh" and c.tier == "data":
            c.figure = "12.10 cents per kilowatt-hour"
    result = card_mod.verify_card(card, moved, article=article)
    assert not result.ok
    assert any(f.startswith("C1a") for f in result.failures), result.failures
    # and the proof that the backstop alone would have missed it
    import validator
    allowed = set()
    for c in moved:
        if c.tier in ("data", "official", "derived"):
            allowed |= validator._extract_numerals(c.figure)
            allowed |= validator._extract_numerals(c.derivation)
    assert "13.88" in allowed, ("the stale figure is still somewhere in the ledger — which is "
                                "exactly why the slot-exact check has to exist")


def test_the_subhead_slot_is_checked_exactly_too():
    card, claims, article = _card()
    bad = dict(card, subhead="down 10.2% from the peak")   # true of C3, not of the card's claim
    result = card_mod.verify_card(bad, claims, article=article)
    assert not result.ok and any(f.startswith("C1b") for f in result.failures)


def test_a_number_the_ledger_DOES_back_still_passes():
    """The other half of the claim: the gate is not rejecting everything."""
    card, claims, article = _card()
    assert card_mod.verify_card(card, claims, article=article).ok


def test_a_source_the_article_never_cited_is_refused():
    card, claims, article = _card()
    bad = dict(card, source="ERCOT")   # a real Texas authority this article never cites
    result = card_mod.verify_card(bad, claims, article=article)
    assert not result.ok and any(f.startswith("C2") for f in result.failures)


def test_a_card_may_not_read_fresher_than_its_reading():
    card, claims, article = _card()
    bad = dict(card, asOf="Sep 2026")
    result = card_mod.verify_card(bad, claims, article=article)
    assert not result.ok and any(f.startswith("C3") for f in result.failures)


def test_a_card_asking_a_different_question_than_the_page_answers_is_refused():
    card, claims, article = _card()
    bad = dict(card, question="Why are Texas electricity prices soaring?")
    result = card_mod.verify_card(bad, claims, article=article)
    assert not result.ok and any(f.startswith("C4") for f in result.failures)


# ============================================ the gate: the card must actually exist

def test_a_MISSING_sidecar_refuses_to_publish():
    """THE MUTATION for the rendered card. Nothing about the article changes; the PNG simply
    was never generated. Publishing then promotes a page whose card 404s."""
    card, claims, article = _card()
    result = card_mod.verify_card(card, claims, slug="x", article=article,
                                  sidecar=None, require_sidecar=True)
    assert not result.ok
    assert any(f.startswith("C5") and "does not exist" in f for f in result.failures)


def test_a_STALE_rendered_card_refuses_to_publish():
    """The article's figures moved and the PNG was not regenerated. The post would carry last
    month's number over this month's article — true once, wrong now."""
    card, claims, article = _card()
    stale = {"path": SIDECAR["path"],
             "rendered": dict(SIDECAR["rendered"], headline="15.46¢/kWh")}
    result = card_mod.verify_card(card, claims, slug="x", article=article,
                                  sidecar=stale, require_sidecar=True)
    assert not result.ok and any("stale" in f for f in result.failures)


def test_a_draft_does_NOT_require_a_rendered_card():
    """Order matters: the article is written before the site renders its card. Requiring the
    PNG at draft time would make the gate impossible to satisfy rather than strict."""
    card, claims, article = _card()
    assert card_mod.verify_card(card, claims, article=article, require_sidecar=False).ok


# ============================================ the promo points at the real card

def _promo():
    r = _run()
    return engine.build_facebook_promo(r["article"], r["claims"], CFG, TODAY,
                                       link_opener=OK, media_opener=OK)


def _sidecar_exists():
    return card_mod.sidecar_path("are-texas-electricity-prices-still-going-up", CFG).exists()


def test_the_promo_points_at_the_ARTICLE_card_not_the_sitewide_one():
    if not _sidecar_exists():
        return                          # the card system is not merged into this checkout yet
    post, gate = _promo()
    assert post["media_url"].endswith(
        "/images/og/are-texas-electricity-prices-still-going-up.png")
    assert "og-card.jpg" not in post["media_url"]
    assert gate.ok, gate.failures


def test_the_promo_HALTS_when_the_card_was_never_rendered():
    """THE REGRESSION TEST for the whole round. If a future change makes a missing card fall
    back to the sitewide logo, the post goes out looking fine and the round is undone."""
    if not _sidecar_exists():
        return
    original = card_mod.sidecar_path("are-texas-electricity-prices-still-going-up", CFG)
    moved = original.with_suffix(".json.hidden")
    original.rename(moved)
    try:
        _promo()
    except card_mod.CardHalt as e:
        assert "does not exist" in str(e)
        return
    finally:
        moved.rename(original)
    raise AssertionError("a missing rendered card must HALT, never fall back to the logo card")


def test_the_post_declares_a_source_card_and_has_earned_it():
    if not _sidecar_exists():
        return
    post, _ = _promo()
    assert post["has_source_card"] is True
    assert any("EIA" in t and "Aug 2026" in t for t in post["on_screen_text"])


def test_G2_accepts_the_short_label_ONLY_because_the_story_declares_it():
    """The gate change this round required. An abbreviation is provenance when the piece says
    which source it abbreviates; it is noise when the gate guesses. Strip the declaration and
    the same card fails, which is what keeps this from being a loosening."""
    import validator
    post = {"caption": "U.S. Energy Information Administration, as of 2026-08-01: 13.88",
            "on_screen_text": ["13.88¢/kWh", "EIA · Aug 2026"], "has_media": True,
            "piece_kind": "text_with_link"}
    story = {"figure": "13.88", "source": "U.S. Energy Information Administration",
             "as_of": "2026-08-01"}
    declared = dict(story, source_short="EIA", as_of_display="Aug 2026")

    undeclared_result = validator.GateResult(ok=True)
    validator._numeral_gates(post, story, undeclared_result)
    assert any("source not visible on the card" in f for f in undeclared_result.failures)

    declared_result = validator.GateResult(ok=True)
    validator._numeral_gates(post, declared, declared_result)
    assert not any(f.startswith("G2") for f in declared_result.failures), declared_result.failures


def test_G2_still_refuses_a_short_label_that_is_not_the_declared_one():
    """The card says EPA, the story declares EIA. A gate that accepted initials would pass
    this; one that checks the declared form cannot."""
    import validator
    post = {"caption": "U.S. Energy Information Administration, as of 2026-08-01: 13.88",
            "on_screen_text": ["13.88¢/kWh", "EPA · Aug 2026"], "has_media": True,
            "piece_kind": "text_with_link"}
    story = {"figure": "13.88", "source": "U.S. Energy Information Administration",
             "as_of": "2026-08-01", "source_short": "EIA", "as_of_display": "Aug 2026"}
    result = validator.GateResult(ok=True)
    validator._numeral_gates(post, story, result)
    assert any("source not visible on the card" in f for f in result.failures)


def test_the_caption_still_carries_the_FULL_source():
    """The card's exemption is about space. A caption has space, so it keeps the full name."""
    import validator
    post = {"caption": "EIA, as of 2026-08-01: 13.88",
            "on_screen_text": ["13.88¢/kWh", "EIA · Aug 2026"], "has_media": True,
            "piece_kind": "text_with_link"}
    story = {"figure": "13.88", "source": "U.S. Energy Information Administration",
             "as_of": "2026-08-01", "source_short": "EIA", "as_of_display": "Aug 2026"}
    result = validator.GateResult(ok=True)
    validator._numeral_gates(post, story, result)
    assert any("source not visible in the caption" in f for f in result.failures)


# ============================================ the two copies of one map

def test_the_source_labels_agree_with_the_SITE_renderer():
    """`SOURCE_SHORT` here and `SOURCE_FULL` in the card renderer are one map written twice.
    They disagree the day someone adds a source to one of them (read-only — Rule 0)."""
    renderer = REPO / "site" / "scripts" / "generate-og-cards.mjs"
    if not renderer.exists():
        return
    block = re.search(r"const SOURCE_FULL = \{(.*?)\};", renderer.read_text(), re.S)
    assert block, "could not read SOURCE_FULL from the renderer — check this by hand"
    site_map = dict(re.findall(r'(\w+):\s*"([^"]+)"', block.group(1)))
    for short, full in site_map.items():
        assert card_mod.SOURCE_SHORT.get(full) == short, (
            f"the site renderer maps {short} -> {full!r}; the autoposter does not agree")


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
