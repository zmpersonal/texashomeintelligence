"""The three hand-steps that got post #1 out the door, now as code — and tested as code.

Post #1 was clean because I did three things by hand at post time: pointed the media at the
site's OG card, remembered that a verification run goes stale, and re-checked the link after
publishing because it seemed prudent. Each worked once. None of them was a rule, and a habit
standing in for a rule is a defect that has not surfaced yet (RUNLOG §73).

Every test below is written to FAIL IF THE HAND-STEP COMES BACK — that is, if the code stops
deriving, stops enforcing freshness, or lets a publish happen with no post-check. They are
regression tests for a process, not just for a function.

Run: python3 tests/test_hardening.py   (or python3 -m pytest tests/)
"""
import json
import os
import re
import sys
import tempfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import article_engine as engine     # noqa: E402
import media                        # noqa: E402
import publish_gate                 # noqa: E402
import run_article                  # noqa: E402
import yaml                         # noqa: E402

HERE = Path(__file__).resolve().parent
CFG = yaml.safe_load((HERE.parent / "config.yaml").read_text())
TODAY = date(2026, 9, 6)
NOW = datetime(2026, 9, 11, 19, 0, 0, tzinfo=timezone.utc)
OK_LINK = lambda url: (True, "resolved 200")     # noqa: E731


def _promo(config=CFG):
    r = engine.run("thi", write_fn=run_article.write,
                   build_claims_fn=run_article.build_claims, today=TODAY)
    return engine.build_facebook_promo(r["article"], r["claims"], config, TODAY,
                                       link_opener=OK_LINK, media_opener=OK_LINK)


# =========================================================== (1) derived media

def test_link_post_media_is_derived_from_the_destination():
    """The hand-step: at post time I edited media_url to the OG card. Now it is computed."""
    post, _ = _promo()
    assert post["media_url"] == "https://texashomeintelligence.com/images/og-card.jpg"
    assert post["destination_url"].startswith("https://texashomeintelligence.com/")


def test_media_url_is_never_a_placeholder_data_uri():
    """The old default. A data: URI passes the media gate on byte count while showing the
    reader nothing — the exact shape of a gate that is green and wrong."""
    post, _ = _promo()
    assert not post["media_url"].startswith("data:")


def test_media_follows_the_destination_rather_than_a_constant():
    """THE REGRESSION TEST. Hard-coding the current OG URL would pass every test above.

    Move the site and the media must move with it. A constant cannot do this; only derivation
    can, so this fails the moment someone re-hardcodes the value.
    """
    cfg = json.loads(json.dumps(CFG))
    cfg["publish"] = dict(cfg["publish"], og_image_path="/images/social/link-card.png")
    post, _ = _promo(cfg)
    assert post["media_url"] == "https://texashomeintelligence.com/images/social/link-card.png"
    origin = "/".join(post["destination_url"].split("/")[:3])
    assert post["media_url"].startswith(origin + "/")


def test_the_derived_media_is_what_the_gate_actually_checks():
    """Derivation is only worth anything if the media gate resolves the derived URL. This
    asserts the URL handed to the opener is the one on the post, not an unchecked field."""
    seen = []
    r = engine.run("thi", write_fn=run_article.write,
                   build_claims_fn=run_article.build_claims, today=TODAY)

    def watching(url):
        seen.append(url)
        return True, "resolved 200"

    post, gate = engine.build_facebook_promo(r["article"], r["claims"], CFG, TODAY,
                                             link_opener=OK_LINK, media_opener=watching)
    assert gate.ok, gate.failures
    assert post["media_url"] in seen


def test_the_configured_og_path_matches_what_the_SITE_actually_declares():
    """The one duplicated constant, watched.

    `publish.og_image_path` is THI's OG image path written down a second time; the site's own
    layout is the first. Deriving the URL removes the hand-step but not the duplication, so
    this reads the site's declaration (read-only — Rule 0) and fails if the two drift. The
    failure mode it prevents is silent: the post still builds, the card is just gone.
    """
    base = HERE.parents[1] / "site" / "src" / "layouts" / "Base.astro"
    if not base.exists():                       # the site is outside this project's boundary
        return                                  # and may not be checked out beside it
    declared = re.search(r'OG_IMAGE\s*=\s*\{\s*path:\s*"([^"]+)"', base.read_text())
    assert declared, "could not read the site's OG image declaration — check this by hand"
    assert declared.group(1) == CFG["publish"]["og_image_path"], (
        f"site declares {declared.group(1)!r}, autoposter config says "
        f"{CFG['publish']['og_image_path']!r} — the link card would 404")


# ============================================ (2) the Actions resolver + freshness

def _log(url, code=200, checked_at=None, run_id=1):
    """A job log in the real shape: timestamp-prefixed lines wrapping the JSON payload."""
    payload = {"requested_url": url, "http_code": code,
               "checked_at": (checked_at or NOW).isoformat().replace("+00:00", "Z")}
    body = json.dumps(payload, indent=2)
    return "\n".join(f"2026-09-11T19:00:0{i % 10}.0000000Z {line}"
                     for i, line in enumerate(body.splitlines()))


def _resolver(*, logs=None, conclusion="success", status="completed", run_id=99,
              dispatch=None, max_age_seconds=600, now=NOW):
    return media.actions_resolver(
        dispatch=dispatch or (lambda url, host: run_id),
        get_run=lambda rid: {"status": status, "conclusion": conclusion},
        get_logs=logs or (lambda rid: ""),
        max_age_seconds=max_age_seconds,
        now=lambda: now)


URL = "https://texashomeintelligence.com/analysis/x/"


def test_a_fresh_successful_run_resolves():
    ok, reason = _resolver(logs=lambda rid: _log(URL))(URL)
    assert ok, reason
    assert "run 99" in reason


def test_a_STALE_verification_is_REJECTED():
    """THE REGRESSION TEST for the freshness habit.

    Eleven minutes is a long time in a deploy: the article can 404 inside it. Before today the
    only thing stopping an hour-old green run from vouching for a post was me remembering.
    """
    stale = NOW - timedelta(seconds=660)
    ok, reason = _resolver(logs=lambda rid: _log(URL, checked_at=stale))(URL)
    assert not ok
    assert "660s old" in reason and "limit 600s" in reason


def test_the_freshness_bound_comes_from_config_not_a_literal():
    """The bound is policy, so it lives in config.yaml. A run inside the configured window
    passes and one outside it fails, with the SAME code and a different config."""
    bound = CFG["verification"]["max_age_seconds"]
    assert isinstance(bound, int) and bound > 0
    inside = NOW - timedelta(seconds=bound - 30)
    outside = NOW - timedelta(seconds=bound + 30)
    assert _resolver(logs=lambda rid: _log(URL, checked_at=inside),
                     max_age_seconds=bound)(URL)[0]
    assert not _resolver(logs=lambda rid: _log(URL, checked_at=outside),
                         max_age_seconds=bound)(URL)[0]


def test_a_run_that_checked_a_DIFFERENT_url_cannot_vouch_for_this_one():
    other = "https://texashomeintelligence.com/analysis/something-else/"
    ok, reason = _resolver(logs=lambda rid: _log(other))(URL)
    assert not ok and "cannot vouch for another" in reason


def test_a_failed_run_is_a_rejection():
    ok, reason = _resolver(logs=lambda rid: _log(URL), conclusion="failure")(URL)
    assert not ok and "concluded 'failure'" in reason


def test_a_run_that_never_completes_is_INDETERMINATE_not_a_pass():
    ok, reason = _resolver(logs=lambda rid: _log(URL), status="in_progress")(URL)
    assert not ok and reason.startswith(media.UNREACHABLE)


def test_a_run_with_no_readable_payload_is_a_rejection():
    ok, reason = _resolver(logs=lambda rid: "2026-09-11T19:00:00Z nothing useful here")(URL)
    assert not ok and "no readable result" in reason


def test_a_dispatch_failure_is_INDETERMINATE_not_a_pass():
    def boom(url, host):
        raise RuntimeError("403 from the API")
    ok, reason = _resolver(dispatch=boom)(URL)
    assert not ok and reason.startswith(media.UNREACHABLE)


def test_a_future_dated_verification_is_rejected():
    """A clock-skewed or fabricated timestamp must not buy unlimited freshness."""
    ok, reason = _resolver(logs=lambda rid: _log(URL, checked_at=NOW + timedelta(hours=2)))(URL)
    assert not ok and "future" in reason


def test_the_resolver_plugs_into_the_real_gate_as_an_opener():
    """Relocatable verification: the gate takes an opener, so where the check runs is a
    deployment detail. A stale Actions run must fail the promo, not just the unit test."""
    stale = lambda rid: _log(URL, checked_at=NOW - timedelta(hours=1))   # noqa: E731
    r = engine.run("thi", write_fn=run_article.write,
                   build_claims_fn=run_article.build_claims, today=TODAY)
    url = r["article"]["canonical_url"]
    opener = media.actions_resolver(
        dispatch=lambda u, h: 99,
        get_run=lambda rid: {"status": "completed", "conclusion": "success"},
        get_logs=lambda rid: _log(url, checked_at=NOW - timedelta(hours=1)),
        max_age_seconds=CFG["verification"]["max_age_seconds"], now=lambda: NOW)
    _, gate = engine.build_facebook_promo(r["article"], r["claims"], CFG, TODAY,
                                          link_opener=opener, media_opener=OK_LINK)
    assert not gate.ok
    assert any("does not resolve" in f or "UNVERIFIED" in f for f in gate.failures)


# ================================================= (3) the post-publish GATE

POST = {"platform": "facebook", "page_id": "1335273942995805",
        "destination_url": URL, "caption": "c"}


def _published(_post):
    return {"post_url": "https://facebook.com/1_2", "submission_id": "sub-1"}


def _tmp_ledger():
    return Path(tempfile.mkdtemp()) / "published-posts.json"


def test_publishing_records_the_post_and_its_verification():
    path = _tmp_ledger()
    record = publish_gate.publish_with_verification(
        POST, publish_fn=_published, verify_opener=OK_LINK, streak_after=2,
        article_slug="x", ledger_path=path, now=lambda: NOW)
    assert record["post_publish_verified"] is True
    entries = json.loads(path.read_text())
    assert len(entries) == 1 and entries[0]["post_url"] == "https://facebook.com/1_2"
    assert entries[0]["streak_after"] == 2


def test_a_destination_that_dies_AFTER_publish_HALTS_loudly():
    """THE REGRESSION TEST for the habit of re-checking.

    The post is already live, so nothing can be prevented — but a human must be told, and the
    ledger must say so. Silence here is the failure: it looks identical to success.
    """
    path = _tmp_ledger()
    try:
        publish_gate.publish_with_verification(
            POST, publish_fn=_published, verify_opener=lambda u: (False, "HTTP 404"),
            streak_after=2, ledger_path=path, now=lambda: NOW)
    except publish_gate.PostPublishHalt as e:
        assert "a human must decide" in str(e)
        entries = json.loads(path.read_text())
        assert len(entries) == 1 and entries[0]["post_publish_verified"] is False
        return
    raise AssertionError("a dead destination after publish must HALT, not pass quietly")


def test_the_failed_post_is_still_recorded_before_the_halt():
    """A post that went out is history whether or not its link survived. The ledger records
    what is TRUE, not what is tidy — otherwise the worst posts are the ones missing from it."""
    path = _tmp_ledger()
    try:
        publish_gate.publish_with_verification(
            POST, publish_fn=_published, verify_opener=lambda u: (False, "HTTP 404"),
            streak_after=2, ledger_path=path, now=lambda: NOW)
    except publish_gate.PostPublishHalt:
        pass
    assert json.loads(path.read_text())[0]["submission_id"] == "sub-1"


def test_verification_runs_AFTER_the_publish_not_before():
    """Order is the whole point: a pre-publish check cannot catch a link that dies during the
    publish. This asserts the sequence, which is what makes the gate different from the
    pre-flight gate that already exists."""
    order = []

    def publish_fn(post):
        order.append("publish")
        return _published(post)

    def verify(url):
        order.append("verify")
        return True, "resolved 200"

    publish_gate.publish_with_verification(
        POST, publish_fn=publish_fn, verify_opener=verify, streak_after=2,
        ledger_path=_tmp_ledger(), now=lambda: NOW)
    assert order == ["publish", "verify"]


def test_there_is_no_publish_path_that_skips_verification():
    """THE REGRESSION TEST for 'I chose to re-check'.

    publish_with_verification takes verify_opener as a REQUIRED keyword. If someone later adds
    a default — the natural way to make the check optional again — this fails.
    """
    import inspect
    sig = inspect.signature(publish_gate.publish_with_verification)
    verify = sig.parameters["verify_opener"]
    assert verify.default is inspect.Parameter.empty, (
        "verify_opener acquired a default — post-publish verification became optional")
    try:
        publish_gate.publish_with_verification(POST, publish_fn=_published, streak_after=1)
    except TypeError:
        return
    raise AssertionError("publishing without a verifier must be impossible, not merely unusual")


def test_a_corrupt_ledger_HALTS_rather_than_being_rewritten():
    """Losing the record of what went public is worse than failing to add to it."""
    path = _tmp_ledger()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("{ this is not json")
    try:
        publish_gate.append_ledger({"post_url": "x"}, path)
    except RuntimeError as e:
        assert "HALT" in str(e)
        return
    raise AssertionError("a corrupt ledger must never be silently reinitialised")


def test_the_ledger_appends_rather_than_overwrites():
    path = _tmp_ledger()
    for i in range(3):
        publish_gate.publish_with_verification(
            POST, publish_fn=_published, verify_opener=OK_LINK, streak_after=i,
            ledger_path=path, now=lambda: NOW)
    assert [e["streak_after"] for e in json.loads(path.read_text())] == [0, 1, 2]


def test_post_1_is_in_the_real_ledger():
    """The record of what actually went public. Prose in a run log is not a ledger."""
    entries = json.loads(publish_gate.LEDGER.read_text())
    first = entries[0]
    assert first["post_url"].startswith("https://facebook.com/1335273942995805_")
    assert first["article_slug"] == "are-texas-electricity-prices-still-going-up"
    assert first["post_publish_verified"] is True
    assert first["streak_after"] == 1


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
