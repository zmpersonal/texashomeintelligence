"""Phase 4 gate: the two-lock publish guard, the claim ledger, and the one-model-call budget.

Every case here is a HALT case. A guard that has only ever been observed succeeding has not been
tested — the whole value of the two-lock design is what it refuses to do.
"""
import os
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import article_engine as engine     # noqa: E402
import claim_ledger as cl           # noqa: E402
import publish_target as pt         # noqa: E402
import run_article                  # noqa: E402
import topic_scorer                 # noqa: E402
import yaml                         # noqa: E402

HERE = Path(__file__).resolve().parent
CFG = yaml.safe_load((HERE.parent / "config.yaml").read_text())
TODAY = date(2026, 9, 6)
MISMATCH = HERE / "fixtures" / "specs_mismatch"
UNNAMED = HERE / "fixtures" / "specs_unnamed"


def _halts(fn, *a, **kw):
    try:
        fn(*a, **kw)
    except (pt.PublishHalt, cl.LedgerHalt) as e:
        return e
    raise AssertionError("expected a HALT")


# ---------------------------------------------------------------- two-lock guard

def test_correct_pair_resolves():
    assert pt.resolve("thi")["site_domain"] == "texashomeintelligence.com"


def test_target_self_identifying_another_domain_halts():
    assert "two locks disagree" in str(_halts(pt.resolve, "thi", MISMATCH))


def test_editorial_spec_naming_another_target_halts():
    assert "not found" in str(_halts(pt.resolve, "thi", UNNAMED))


def test_unknown_site_halts_rather_than_defaulting():
    e = _halts(pt.resolve, "someothersite")
    assert "does not fall back to a default site" in str(e)


def test_destination_on_the_wrong_host_halts():
    t = pt.resolve("thi")
    assert "not the self-identified domain" in str(_halts(
        pt.assert_destination, t, repo="r", content_path="a/b.md",
        canonical_url="https://austinhomeintelligence.com/analysis/x/"))


def test_lookalike_host_halts():
    """A substring check would pass this. The guard compares the HOST, not the string."""
    t = pt.resolve("thi")
    assert "not the self-identified domain" in str(_halts(
        pt.assert_destination, t, repo="r", content_path="a/b.md",
        canonical_url="https://texashomeintelligence.com.evil.example/analysis/x/"))


def test_full_run_halts_before_writing_anything():
    e = _halts(engine.run, "thi", write_fn=run_article.write,
               build_claims_fn=run_article.build_claims, today=TODAY, specs_dir=MISMATCH)
    assert "two locks disagree" in str(e)


# ---------------------------------------------------------------- one model call

def test_second_model_call_raises():
    b = engine.Budget(limit=1)
    b.spend()
    try:
        b.spend()
    except engine.ModelBudgetExceeded as e:
        assert "should be code" in str(e); return
    raise AssertionError("a second model call must raise")


def test_a_real_run_spends_exactly_one():
    r = engine.run("thi", write_fn=run_article.write,
                   build_claims_fn=run_article.build_claims, today=TODAY)
    assert r["model_calls"] == 1


# ---------------------------------------------------------------- claim ledger

def test_unhedged_external_claim_is_refused():
    claims = [cl.Claim("X", "Prices fell because the grid got cheaper.", tier="external")]
    assert not cl.verify_ledger(claims, CFG, TODAY).ok


def test_hedged_external_claim_must_actually_hedge_in_its_text():
    claims = [cl.Claim("X", "Prices fell because the grid got cheaper.",
                       tier="external", hedged=True)]
    r = cl.verify_ledger(claims, CFG, TODAY)
    assert not r.ok and "uncertainty marker" in r.failures[0]


def test_derived_claim_without_its_arithmetic_is_refused():
    claims = [cl.Claim("X", "Down a lot.", tier="derived", figure="down 10.2%",
                       source="EIA", as_of="2026-08-01", metric="energy_price_cents_kwh")]
    r = cl.verify_ledger(claims, CFG, TODAY)
    assert not r.ok and "redo it" in r.failures[0]


def test_timeless_claim_must_say_why_it_skips_freshness():
    claims = [cl.Claim("X", "The normal is 644.8.", tier="official", figure="644.8",
                       source="NOAA", as_of="1991-2020", metric="cooling_degree_days",
                       timeless=True)]
    assert not cl.verify_ledger(claims, CFG, TODAY).ok


def test_the_real_ledger_verifies():
    feed = engine.load_feed()
    claims = run_article.build_claims(feed, CFG, TODAY)
    r = cl.verify_ledger(claims, CFG, TODAY)
    assert r.ok, r.failures
    assert r.checked >= 10


def test_prose_with_an_unbacked_numeral_is_refused():
    feed = engine.load_feed()
    claims = run_article.build_claims(feed, CFG, TODAY)
    body = run_article.write({"question": "q"}, claims, feed)["body"]
    assert cl.verify_prose(body, claims, CFG).ok
    assert not cl.verify_prose(body + " Prices fell 42% in Bexar.", claims, CFG).ok


def test_prose_stripped_of_a_source_is_refused():
    feed = engine.load_feed()
    claims = run_article.build_claims(feed, CFG, TODAY)
    body = run_article.write({"question": "q"}, claims, feed)["body"]
    assert not cl.verify_prose(body.replace("NOAA NCEI Global Summary of the Month", "NOAA"),
                               claims, CFG).ok


# ---------------------------------------------------------------- topic scoring

def test_gated_topic_is_unbuildable_however_popular():
    ranked = topic_scorer.score_topics(engine.load_feed(), CFG)
    crime = next(t for t in ranked if t["id"] == "crime-by-area")
    assert not crime["buildable"] and crime["public_interest"] >= 0.9


def test_topic_with_no_feed_support_is_unbuildable():
    ranked = topic_scorer.score_topics(engine.load_feed(), CFG)
    tax = next(t for t in ranked if t["id"] == "property-tax-worst-in-texas")
    assert not tax["buildable"] and tax["data_strength"] == 0.0


def test_virality_vs_brand_safety_tension_is_surfaced_not_buried():
    notes = topic_scorer.surface_tension(topic_scorer.score_topics(engine.load_feed(), CFG))
    assert any("crime-by-area" in n for n in notes)


# ---------------------------------------------------------------- the promo

def test_facebook_promo_passes_the_full_social_suite():
    r = engine.run("thi", write_fn=run_article.write,
                   build_claims_fn=run_article.build_claims, today=TODAY)
    post, gate = engine.build_facebook_promo(r["article"], r["claims"], CFG, TODAY)
    assert gate.ok, gate.failures
    assert "HELD" in post["status"]


def test_promo_targets_only_the_pinned_thi_page():
    import channel_guard
    assert channel_guard.postable_platforms(CFG) == ["facebook"]


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
