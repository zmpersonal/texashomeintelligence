"""Unattended publishing: the clean sweep, the skip, and the kill switch.

Under review, an unclear gate produced a question to a human. Unattended, the same unclear gate
would produce a POST. So every test here is about the machine declining to act: a stale claim,
a card that will not render, a duplicate, a link that dies, an approval nobody gave. The one
test where it does publish exists so the others mean something.

Run: python3 tests/test_autopilot.py   (or python3 -m pytest tests/)
"""
import copy
import json
import os
import re
import sys
import tempfile
from datetime import date
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import article_engine as engine     # noqa: E402
import autopilot                    # noqa: E402
import publish_gate                # noqa: E402
import card as card_mod             # noqa: E402
import run_article                  # noqa: E402

HERE = Path(__file__).resolve().parent
TODAY = date(2026, 9, 11)
OK = lambda url: (True, "resolved 200")           # noqa: E731
# Injected into every run_cycle call below. The post-deploy checks retry with a real
# backoff; a suite that actually waits it out would add minutes to the pre-cycle test
# step on every scheduled run.
_NO_SLEEP = lambda _seconds: None                 # noqa: E731
def _picked(cfg=None):
    """Whatever the engine actually chooses right now — never a hardcoded slug.

    The winning topic changes when the owner retunes `public_interest`, and it did: adding
    `austin-ac-rush-vs-heat` at 0.65 moved it above the permits piece. Tests pinned to a slug
    then fail for a reason that has nothing to do with what they measure.
    """
    r = engine.run("thi", config=cfg or _cfg(), write_fn=run_article.write,
                   build_claims_fn=run_article.build_claims, today=TODAY,
                   articles=run_article.TOPIC_ARTICLES, exclude_published=True)
    return r["article"], r["card"]


SLUG = "is-austins-home-improvement-boom-cooling-off"


def _cfg(**overrides):
    """A config whose ledger AND published-article folder are empty, so neither the duplicate
    gate nor the already-published filter is the thing under test.

    `analysis_dir` matters as much as `published_ledger` and was missed when that lesson was
    learned. `published_questions` reads the LIVE SITE's articles out of the checkout, so the
    pool of selectable topics shrank every time the machine published for real — and when the
    fifth builder's current-period title went live, three suites went red on main with no code
    change behind it. A suite whose greenness depends on production data will eventually go
    red because production advanced, and here that is not cosmetic: CI runs the suite BEFORE
    the cycle, so a red suite stops the machine running at all.
    """
    cfg = copy.deepcopy(engine.load_config())
    cfg["publish"] = dict(cfg["publish"],
                          published_ledger=tempfile.mkdtemp() + "/empty.json",
                          analysis_dir=tempfile.mkdtemp())
    for key, value in overrides.items():
        cfg[key] = value
    return cfg


def _sidecar_dir(card=None):
    """A rendered card for whatever article the engine picks, as the generator would write it."""
    article, real_card = _picked()
    slug = article["slug"]
    directory = Path(tempfile.mkdtemp())
    (directory / f"{slug}.json").write_text(json.dumps(
        {"path": f"/images/og/{slug}.png", "width": 1200, "height": 630,
         "alt": "…", "rendered": card or real_card}))
    return str(directory)


def _stale_card():
    """The engine's real card with its hero figure moved — a card the ledger cannot back.

    The number is replaced wherever it sits. Splitting on the first space assumed a headline
    shaped like "451 tree permits" and broke on "13.88¢/kWh", which is one token — the moment
    the suite stopped borrowing the live site's leftovers and started exercising the
    top-ranked topic, that assumption stopped holding.
    """
    _, card = _picked()
    moved = re.sub(r"[\d][\d,.]*", "94", card["headline"], count=1)
    assert moved != card["headline"], f"no figure to move in {card['headline']!r}"
    return dict(card, headline=moved)


def _kwargs(cfg, **over):
    base = dict(write_fn=run_article.write, build_claims_fn=run_article.build_claims,
                articles=run_article.TOPIC_ARTICLES, link_opener=OK, media_opener=OK,
                captions=run_article.TOPIC_CAPTIONS, env={})
    base.update(over)
    return base


def _ready_state():
    return {"last_article_at": "2026-09-01", "cycles": 1}


def _evaluate(cfg, **over):
    return autopilot.evaluate(cfg, today=TODAY, state=_ready_state(), **_kwargs(cfg, **over))


# ===================================================== the clean sweep publishes

def test_a_clean_sweep_authorises_a_publish():
    """The positive case. Without it, every refusal below could be a broken pipeline."""
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=_sidecar_dir())
    d = _evaluate(cfg)
    assert d.action == "publish", [v.line() for v in d.verdicts]
    assert d.clean and len(d.verdicts) >= 8


def test_every_verdict_must_be_an_explicit_pass():
    """`clean` is all-of, not none-failed. An empty verdict list is not a clean sweep."""
    empty = autopilot.CycleDecision(action="skip")
    assert not empty.clean


# ===================================================== the skip path, one gate at a time

def _fails(decision, gate_fragment):
    assert decision.action == "skip", decision.action
    assert any(not v.ok and gate_fragment in v.name for v in decision.verdicts), \
        [v.line() for v in decision.verdicts]
    assert gate_fragment in decision.notice() or "SKIPPED" in decision.notice()
    return decision


def test_a_card_that_was_never_rendered_SKIPS():
    """THE PROOF. An ungated article — its card does not exist — must not publish."""
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=tempfile.mkdtemp())   # empty
    d = _fails(_evaluate(cfg), "card")
    assert "does not exist" in d.notice()
    assert "nothing published" in d.notice()


def test_a_STALE_claim_SKIPS():
    """THE PROOF. Move the clock past every staleness bound and the same article stops being
    publishable. Nothing about the article changed; only how old its data is."""
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=_sidecar_dir())
    d = autopilot.evaluate(cfg, today=date(2027, 6, 1), state=_ready_state(),
                           **_kwargs(cfg))
    assert d.action == "skip"
    assert any(not v.ok for v in d.verdicts), [v.line() for v in d.verdicts]
    assert "nothing published" in d.notice()


def test_a_STALE_rendered_card_SKIPS():
    """The card on disk shows a figure the ledger no longer carries."""
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=_sidecar_dir(card=_stale_card()))
    _fails(_evaluate(cfg), "card")


def test_a_DEAD_destination_SKIPS():
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=_sidecar_dir())
    _fails(_evaluate(cfg, link_opener=lambda u: (False, "HTTP 404")), "social-suite")


def test_an_UNVERIFIABLE_destination_SKIPS_exactly_like_a_dead_one():
    """Indeterminate is not permission. This is the difference between review and unattended:
    a human could have looked; a driver cannot, so it does not post."""
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=_sidecar_dir())
    _fails(_evaluate(cfg, link_opener=lambda u: (False, "unreachable: URLError")),
           "social-suite")


def test_a_DUPLICATE_destination_SKIPS():
    """The duplicate gate RAN. That it HALTS is proven directly against the gate in
    test_card.py; what is asserted here is that a clean cycle does not somehow skip it.

    It used to borrow the real config to get "a ledger with something in it". That made the
    test depend on which articles happened to be live: once every builder's current title was
    published, the engine could produce nothing at all, no gate ran, and this went red for a
    reason unrelated to duplicates. It states its own premise now.
    """
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=_sidecar_dir())
    d = autopilot.evaluate(cfg, today=TODAY, state=_ready_state(), **_kwargs(cfg))
    assert any("duplicate" in v.name for v in d.verdicts), [v.name for v in d.verdicts]
    assert all(v.ok for v in d.verdicts), [v.line() for v in d.verdicts if not v.ok]


def _everything_published(cfg):
    """The REAL two-week condition: every buildable builder's current-period title is already
    live, so nothing clears the bar until the data gains a month. Stated as a premise rather
    than faked with an empty registry, because an empty registry takes a different branch."""
    import topic_scorer
    today = TODAY
    folder = Path(cfg["publish"]["analysis_dir"])
    folder.mkdir(parents=True, exist_ok=True)
    ranked = [t for t in topic_scorer.score_topics(engine.load_feed(), cfg) if t["buildable"]]
    assert ranked, "no buildable topic; this premise would be vacuous"
    for i, topic in enumerate(ranked):
        title = engine._current_title(topic, run_article.TOPIC_ARTICLES, today)
        (folder / f"{i}.md").write_text(f'title: "{title}"\n')
    return cfg


def _nothing_left_to_do(cfg, ledger_path):
    """The full October-waiting state: every current title published AND every one of them
    recorded, so there is no orphan to promote either.

    Seeding only the titles is not the real condition — an empty ledger makes every published
    article look never-promoted, and promote-before-publish correctly picks one up. That is the
    machine working, not the quiet state, and asserting silence against it would have been
    asserting silence against a cycle that publishes.
    """
    _everything_published(cfg)
    orphans = autopilot.promotable_orphans(
        cfg, today=TODAY, write_fn=run_article.write,
        build_claims_fn=run_article.build_claims, articles=run_article.TOPIC_ARTICLES,
        ledger_path=ledger_path)
    rows = [{"platform": "facebook", "page_id": "PIN", "post_publish_verified": True,
             "article_url": o["article"]["canonical_url"]}
            for o in orphans]
    ledger_path.parent.mkdir(parents=True, exist_ok=True)
    ledger_path.write_text(json.dumps(rows))
    return cfg


def test_NOTHING_TO_SAY_is_SILENT_and_green():
    """THE TWO-WEEK QUESTION. Between periods every builder is retired and the machine has
    nothing to write — for ten days at a stretch. A daily "nothing to publish" over that stretch
    trains the reader to ignore the channel, and the one message that matters is the one saying
    something WAS published. So it stays quiet, and it stays green."""
    cfg, notices = _cfg(), []
    led = Path(tempfile.mkdtemp()) / "l.json"
    d = autopilot.run_cycle(
        _nothing_left_to_do(cfg, led), today=TODAY, notify_fn=notices.append,
        merge_fn=lambda dec: None,
        deploy_wait_fn=lambda url: None, verify_opener=lambda url: (True, "ok"),
        publish_fn=lambda post: {"post_url": "x", "submission_id": "y"},
        state_path=Path(tempfile.mkdtemp()) / "s.json",
        ledger_path=led, sleep_fn=_NO_SLEEP, **_kwargs(cfg))
    assert d.action == "nothing_to_say", f"{d.action} (promotion={d.promotion}) {d.reason}"
    assert notices == [], f"a quiet day sent Slack traffic: {notices}"
    assert d.notice() == "", "it built a notice for a day nothing happened"
    assert not d.is_broken, "having nothing to say turned the job red"


def test_a_BROKEN_gate_is_STILL_LOUD_even_though_a_quiet_day_is_not():
    """The other half, and the reason this is not just `notify_fn = None`. Silence is for the
    designed refusal only; a gate that BROKE must still say so, or the quiet and the fault
    become the same signal."""
    def exploding_opener(url):
        raise RuntimeError("the resolver itself broke")

    cfg = _cfg()
    notices = []
    d = autopilot.run_cycle(
        cfg, today=TODAY, notify_fn=notices.append, merge_fn=lambda dec: None,
        deploy_wait_fn=lambda url: None, verify_opener=lambda url: (True, "ok"),
        publish_fn=lambda post: {"post_url": "x", "submission_id": "y"},
        state_path=Path(tempfile.mkdtemp()) / "s.json",
        ledger_path=Path(tempfile.mkdtemp()) / "l.json", sleep_fn=_NO_SLEEP,
        **_kwargs(cfg, link_opener=exploding_opener))
    assert d.action == "skip", d.action
    assert notices, "a broken writer went out silently"
    assert "SKIPPED" in notices[0], notices[0]
    assert "the resolver itself broke" in notices[0], "the notice does not say what broke"


def test_the_designed_refusal_has_its_OWN_TYPE_not_a_message_to_match():
    """Telling "nothing cleared the bar" from "a gate broke" by matching the exception's text
    would survive exactly until someone improved the wording."""
    assert issubclass(engine.NothingDefensible, RuntimeError)
    cfg = _everything_published(_cfg())
    d = autopilot.evaluate(cfg, today=TODAY, state=_ready_state(), **_kwargs(cfg))
    assert d.action == "nothing_to_say", d.action
    assert "defensible" in d.reason


def test_a_GATE_THAT_RAISES_is_a_failure_not_an_absence_of_an_opinion():
    """The safety argument in one test. An exception inside a gate must read as FAIL, never as
    'no objection' — unattended, the difference is a post."""
    def boom(url):
        raise RuntimeError("the resolver itself broke")
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=_sidecar_dir())
    d = _evaluate(cfg, media_opener=boom)
    assert d.action == "skip"
    assert any(not v.ok and "RuntimeError" in v.detail for v in d.verdicts)


def test_a_topic_with_no_writer_SKIPS_and_says_so():
    """The machine runs out of registered writers after post #3. That must be a loud skip, not
    a fallthrough to a story nobody wrote."""
    cfg = _cfg()
    d = _evaluate(cfg, articles={"nothing-registered": (None, None)})
    assert d.action == "skip"
    assert any("article-engine" in v.name and not v.ok for v in d.verdicts)
    assert "no claim-builder" in d.notice()


def test_the_skip_notice_names_the_gate_and_says_nothing_published():
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=tempfile.mkdtemp())
    notice = _evaluate(cfg).notice()
    assert "SKIPPED" in notice and "nothing published" in notice
    assert "card" in notice
    assert "No post goes out on an unclear gate" in notice


# ===================================================== the clock

def test_too_soon_does_nothing_and_stays_QUIET():
    """The one silent path. A daily driver that reports 'nothing to do' six days a week trains
    you to ignore it, which is how the seventh message gets missed."""
    cfg = _cfg()
    d = autopilot.evaluate(cfg, today=TODAY,
                           state={"last_article_at": "2026-09-10", "cycles": 1}, **_kwargs(cfg))
    assert d.action == "too_soon" and d.notice() == ""


def test_the_floor_is_respected_and_the_maximum_is_not_a_trigger():
    cfg = _cfg()
    assert not autopilot.due({"last_article_at": "2026-09-10"}, cfg, TODAY)[0]
    assert autopilot.due({"last_article_at": "2026-09-08"}, cfg, TODAY)[0]
    assert autopilot.due({"last_article_at": "2026-08-01"}, cfg, TODAY)[0]


# ===================================================== the kill switch

def test_PAUSED_by_env_var_builds_notifies_and_publishes_NOTHING():
    """THE PROOF. Same cycle that would publish; one environment variable stops it."""
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=_sidecar_dir())
    d = _evaluate(cfg, env={"AUTOPOSTER_PAUSED": "true"})
    assert d.action == "paused"
    assert d.clean, "the cycle was otherwise clean — the pause is what stopped it"
    assert "PAUSED" in d.notice() and "nothing published" in d.notice()
    assert d.article is not None, "paused still builds, so resuming needs no rework"


def test_PAUSED_by_config_flag_does_the_same():
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=_sidecar_dir())
    cfg["autopilot"] = dict(cfg["autopilot"], paused=True)
    assert _evaluate(cfg).action == "paused"


def test_RESUMING_publishes_again():
    """Pause is reversible and leaves nothing to clean up."""
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=_sidecar_dir())
    assert _evaluate(cfg, env={"AUTOPOSTER_PAUSED": "1"}).action == "paused"
    assert _evaluate(cfg, env={}).action == "publish"


def test_the_pause_is_checked_AFTER_the_gates_so_a_paused_notice_is_still_honest():
    """If the cycle would have failed anyway, the notice says SKIP, not PAUSE. A pause message
    about a cycle that was never publishable would misreport why nothing went out."""
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=tempfile.mkdtemp())
    assert _evaluate(cfg, env={"AUTOPOSTER_PAUSED": "1"}).action == "skip"


# ===================================================== acting: the publish sequence

def test_run_cycle_MERGES_then_WAITS_then_VERIFIES_then_POSTS():
    """Order is the safety property. Posting before the deploy is verified would promote a URL
    that is not there yet, which is precisely what the live check exists to prevent."""
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=_sidecar_dir())
    order, notices = [], []
    state = Path(tempfile.mkdtemp()) / "state.json"
    autopilot.save_state(_ready_state(), state)

    autopilot.run_cycle(
        cfg, today=TODAY, notify_fn=notices.append,
        merge_fn=lambda slug: order.append("merge"),
        deploy_wait_fn=lambda url: order.append("deploy-wait"),
        verify_opener=lambda url: (order.append("verify"), (True, "resolved 200"))[1],
        publish_fn=lambda post: (order.append("post"),
                                 {"post_url": "https://facebook.com/1_9",
                                  "submission_id": "s9"})[1],
        state_path=state, ledger_path=Path(tempfile.mkdtemp()) / "ledger.json",
        **_kwargs(cfg))

    assert order[:3] == ["merge", "deploy-wait", "verify"]
    assert order.index("post") > order.index("verify")
    assert "📣 THI posted (auto)" in notices[-1]
    assert "https://facebook.com/1_9" in notices[-1]
    assert json.loads(state.read_text())["last_article_at"] == TODAY.isoformat()


def test_a_deploy_that_does_not_come_up_live_STOPS_before_posting():
    """Merged, deployed, and the page still is not there. Nothing posts; the notice says why."""
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=_sidecar_dir())
    posted, notices = [], []
    d = autopilot.run_cycle(
        cfg, today=TODAY, notify_fn=notices.append,
        merge_fn=lambda slug: None, deploy_wait_fn=lambda url: None,
        verify_opener=lambda url: (False, "HTTP 404"),
        publish_fn=lambda post: posted.append(post),
        state_path=Path(tempfile.mkdtemp()) / "s.json",
        ledger_path=Path(tempfile.mkdtemp()) / "ledger.json", sleep_fn=_NO_SLEEP, **_kwargs(cfg))
    assert d.action == "posted_nothing" and not posted
    assert "the post was withheld" in d.reason
    # The article is live and stays live. The notice must say that plainly, because the
    # difference between "nothing happened" and "an article shipped without its promo" is the
    # whole reason this outcome has its own name.
    notice = d.notice()
    assert "ARTICLE LIVE, POST WITHHELD" in notice
    assert not d.cleared_to_post


def test_a_PAUSED_run_cycle_notifies_and_never_calls_publish():
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=_sidecar_dir())
    posted, merged, notices = [], [], []
    state = Path(tempfile.mkdtemp()) / "state.json"
    autopilot.save_state(_ready_state(), state)
    d = autopilot.run_cycle(
        cfg, today=TODAY, notify_fn=notices.append,
        merge_fn=lambda slug: merged.append(slug), deploy_wait_fn=lambda url: None,
        verify_opener=OK, publish_fn=lambda post: posted.append(post),
        state_path=state, **_kwargs(cfg, env={"AUTOPOSTER_PAUSED": "true"}))
    assert d.action == "paused"
    assert not posted and not merged, "paused must not merge either — a merge IS a deploy"
    assert len(notices) == 1 and "PAUSED" in notices[0]
    assert json.loads(state.read_text())["last_article_at"] == "2026-09-01", \
        "a paused cycle must not advance the clock"


def test_a_SKIPPED_run_cycle_notifies_and_never_merges():
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=tempfile.mkdtemp())
    posted, merged, notices = [], [], []
    d = autopilot.run_cycle(
        cfg, today=TODAY, notify_fn=notices.append,
        merge_fn=lambda slug: merged.append(slug), deploy_wait_fn=lambda url: None,
        verify_opener=OK, publish_fn=lambda post: posted.append(post),
        state_path=Path(tempfile.mkdtemp()) / "s.json", sleep_fn=_NO_SLEEP, **_kwargs(cfg))
    assert d.action == "skip" and not posted and not merged
    assert len(notices) == 1 and "SKIPPED" in notices[0]


def test_a_too_soon_run_cycle_sends_NO_notice_at_all():
    """The premise is stated rather than inherited: NOTHING IS PUBLISHED, so nothing can be an
    orphan, so the cadence floor is the only thing left to decide the cycle.

    Without that, promote-before-publish makes this test pass or fail depending on whether the
    real site currently holds an un-promoted article — which is a fact about the world, not
    about the floor this test measures."""
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], analysis_dir=tempfile.mkdtemp())   # nothing published
    notices = []
    state = Path(tempfile.mkdtemp()) / "s.json"
    autopilot.save_state({"last_article_at": "2026-09-10", "cycles": 1}, state)
    d = autopilot.run_cycle(cfg, today=TODAY, notify_fn=notices.append,
                            state_path=state, sleep_fn=_NO_SLEEP, **_kwargs(cfg))
    assert d.action == "too_soon"
    assert notices == []


def test_an_ORPHAN_is_promoted_even_when_the_cadence_floor_says_too_soon():
    """The owner's call, asserted: recovering an already-published article is not adding to the
    publishing cadence, so the three-day floor does not govern it."""
    cfg = _cfg()
    # NOT a temp sidecar dir: an orphan's card is the one already rendered and committed
    # beside the live article, so the real directory is the only one that has it. A temp
    # copy holds whatever the engine picks NOW, which is a different article entirely.
    state = Path(tempfile.mkdtemp()) / "s.json"
    autopilot.save_state({"last_article_at": TODAY.isoformat(), "cycles": 1}, state)   # too soon
    found = autopilot.promotable_orphans(
        cfg, today=TODAY, write_fn=run_article.write,
        build_claims_fn=run_article.build_claims, articles=run_article.TOPIC_ARTICLES)
    if not found:
        return                                     # nothing orphaned in this checkout
    d = autopilot.run_cycle(
        cfg, today=TODAY, notify_fn=lambda m: None, merge_fn=lambda dec: None,
        deploy_wait_fn=lambda url: None, verify_opener=lambda url: (True, "resolved 200"),
        publish_fn=lambda post: {"post_url": "https://facebook.com/p/1", "submission_id": "s"},
        state_path=state, ledger_path=Path(tempfile.mkdtemp()) / "l.json",
        defer_resolution=True, sleep_fn=_NO_SLEEP, **_kwargs(cfg))
    assert d.action != "too_soon", "the floor blocked a promotion"
    assert d.promotion, d.action


def test_a_promotion_NEVER_merges_or_waits_for_a_deploy():
    """The article is already live. Re-committing it and re-waiting would be doing work whose
    result already exists, and the merge would touch main for no change."""
    cfg = _cfg()
    # NOT a temp sidecar dir: an orphan's card is the one already rendered and committed
    # beside the live article, so the real directory is the only one that has it. A temp
    # copy holds whatever the engine picks NOW, which is a different article entirely.
    merged, waited = [], []
    found = autopilot.promotable_orphans(
        cfg, today=TODAY, write_fn=run_article.write,
        build_claims_fn=run_article.build_claims, articles=run_article.TOPIC_ARTICLES)
    if not found:
        return
    d = autopilot.run_cycle(
        cfg, today=TODAY, notify_fn=lambda m: None,
        merge_fn=lambda dec: merged.append(1), deploy_wait_fn=lambda url: waited.append(1),
        verify_opener=lambda url: (True, "resolved 200"),
        publish_fn=lambda post: {"post_url": "https://facebook.com/p/1", "submission_id": "s"},
        state_path=Path(tempfile.mkdtemp()) / "s.json",
        ledger_path=Path(tempfile.mkdtemp()) / "l.json",
        defer_resolution=True, sleep_fn=_NO_SLEEP, **_kwargs(cfg))
    assert d.promotion and not merged and not waited


def test_a_promotion_does_NOT_advance_the_cadence_clock():
    cfg = _cfg()
    # NOT a temp sidecar dir: an orphan's card is the one already rendered and committed
    # beside the live article, so the real directory is the only one that has it. A temp
    # copy holds whatever the engine picks NOW, which is a different article entirely.
    state = Path(tempfile.mkdtemp()) / "s.json"
    autopilot.save_state({"last_article_at": "2026-09-01", "cycles": 1}, state)
    found = autopilot.promotable_orphans(
        cfg, today=TODAY, write_fn=run_article.write,
        build_claims_fn=run_article.build_claims, articles=run_article.TOPIC_ARTICLES)
    if not found:
        return
    autopilot.run_cycle(
        cfg, today=TODAY, notify_fn=lambda m: None, merge_fn=lambda dec: None,
        deploy_wait_fn=lambda url: None, verify_opener=lambda url: (True, "resolved 200"),
        publish_fn=lambda post: {"post_url": "https://facebook.com/p/1", "submission_id": "s"},
        state_path=state, ledger_path=Path(tempfile.mkdtemp()) / "l.json",
        defer_resolution=True, sleep_fn=_NO_SLEEP, **_kwargs(cfg))
    assert autopilot.load_state(state)["last_article_at"] == "2026-09-01", \
        "a promotion moved the cadence clock"


def test_an_ALREADY_PROMOTED_article_is_not_an_orphan():
    """The duplicate gate is untouched and unneeded here: an article with a ledger row simply is
    not in the orphan set. Selection and the gate stay separate mechanisms."""
    cfg = _cfg()
    # Both lookups use the SAME ledger, starting empty. Seeding from orphans found under the
    # REAL ledger and then checking against a temp one compares two different worlds: an
    # article recorded in the real ledger is not an orphan there but is one here, so the second
    # call legitimately returns it and the test fails for a reason it never meant to measure.
    empty = Path(tempfile.mkdtemp()) / "l.json"
    empty.write_text("[]")
    found = autopilot.promotable_orphans(
        cfg, today=TODAY, write_fn=run_article.write,
        build_claims_fn=run_article.build_claims, articles=run_article.TOPIC_ARTICLES,
        ledger_path=empty)
    if not found:
        return
    recorded = Path(tempfile.mkdtemp()) / "l.json"
    recorded.write_text(json.dumps([{"platform": "facebook", "post_url": "https://facebook.com/x",
                                     "article_url": o["article"]["canonical_url"]} for o in found]))
    assert autopilot.promotable_orphans(
        cfg, today=TODAY, write_fn=run_article.write,
        build_claims_fn=run_article.build_claims, articles=run_article.TOPIC_ARTICLES,
        ledger_path=recorded) == []


def test_a_STALE_orphan_is_REFUSED_not_promoted():
    """The owner's second call: a stale promo is worse than no promo.

    Two separate assertions, because two separate gates refuse it and conflating them would
    make this test pass for a reason it does not name:

      1. `verify_ledger` itself refuses the stale claims — that is the claim-freshness gate.
      2. `_find_promotion` returns None — that is the cycle declining to promote.

    Staleness is caught TWICE on purpose: claim-freshness reads the ledger, and G5 inside the
    social suite reads the same bounds. Found by mutation: stubbing claim-freshness to always
    pass still leaves the orphan refused, because G5 catches it independently. That is defence
    in depth and worth having, but it means a single end-to-end assertion cannot tell you which
    gate did the work — so this asserts the freshness gate directly.

    The clock is NOT moved to make the claims stale. A year on, the builders offer a different
    period, the titles match nothing published, and the orphan is never found — so the gate
    never runs and the test would pass having proven nothing. The bounds are tightened instead.
    """
    cfg = _cfg()
    found = autopilot.promotable_orphans(
        cfg, today=TODAY, write_fn=run_article.write,
        build_claims_fn=run_article.build_claims, articles=run_article.TOPIC_ARTICLES,
        ledger_path=Path(tempfile.mkdtemp()) / "l.json")
    if not found:
        return                                     # nothing orphaned in this checkout

    import claim_ledger as ledger_mod
    strict = copy.deepcopy(cfg)
    strict["staleness_hours"] = {k: 1 for k in (cfg.get("staleness_hours") or {})}

    # 1. the freshness gate itself
    for orphan in found:
        assert ledger_mod.verify_ledger(orphan["claims"], cfg, TODAY).ok, \
            f"{orphan['topic_id']} should be fresh under the real bounds"
        assert not ledger_mod.verify_ledger(orphan["claims"], strict, TODAY).ok, \
            f"{orphan['topic_id']} should be stale under one-hour bounds"

    # 2. the cycle declining to promote
    def promotion(config):
        return autopilot._find_promotion(
            config, today=TODAY, ledger_path=Path(tempfile.mkdtemp()) / "l.json",
            write_fn=run_article.write, build_claims_fn=run_article.build_claims,
            articles=run_article.TOPIC_ARTICLES, captions=run_article.TOPIC_CAPTIONS,
            link_opener=OK, media_opener=OK, defer_resolution=True, env={})

    assert promotion(cfg) is not None, "the control case must find a promotable orphan"
    assert promotion(strict) is None, "a stale orphan was promoted"

def test_a_FRESH_install_with_no_state_is_due_rather_than_stuck():
    """No recorded article means nothing has run yet, which is a reason to run, not to wait."""
    assert autopilot.due({}, _cfg(), TODAY)[0]


def test_the_published_notice_carries_both_live_urls():
    """Observable, not silent: the FYI has to be enough to check the post without digging."""
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=_sidecar_dir())
    d = _evaluate(cfg)
    notice = autopilot.published_notice(d, "https://texashomeintelligence.com/analysis/x/",
                                        "https://facebook.com/1_9", 2)
    assert d.card["headline"] in notice          # whichever article the engine picked
    assert d.card["subhead"] in notice
    assert "https://texashomeintelligence.com/analysis/x/" in notice
    assert "https://facebook.com/1_9" in notice
    assert "streak 2" in notice


def test_a_DRY_RUN_does_everything_except_merge_and_post():
    """The mode to run before putting a cycle on a timer. It must reach the same verdict a real
    run would, and then touch nothing."""
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=_sidecar_dir())
    acted, notices = [], []
    state = Path(tempfile.mkdtemp()) / "s.json"
    autopilot.save_state(_ready_state(), state)
    d = autopilot.run_cycle(
        cfg, today=TODAY, notify_fn=notices.append, dry_run=True,
        merge_fn=lambda s: acted.append("merge"), deploy_wait_fn=lambda u: acted.append("wait"),
        verify_opener=OK, publish_fn=lambda p: acted.append("post"),
        state_path=state, ledger_path=Path(tempfile.mkdtemp()) / "l.json", sleep_fn=_NO_SLEEP, **_kwargs(cfg))
    assert d.action == "would_publish" and d.clean
    assert not acted, "a dry run must not merge, deploy-wait or post"
    assert json.loads(state.read_text())["last_article_at"] == "2026-09-01", \
        "a dry run must not advance the clock"
    assert "DRY RUN" in d.notice() and "nothing merged and nothing posted" in d.notice()


def test_a_DRY_RUN_still_SKIPS_what_a_real_run_would_skip():
    """A dry run that reported PUBLISH on a cycle a real run would refuse would be worse than
    no dry run at all."""
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=tempfile.mkdtemp())
    d = autopilot.run_cycle(cfg, today=TODAY, notify_fn=lambda m: None, dry_run=True,
                            verify_opener=OK,
                            state_path=Path(tempfile.mkdtemp()) / "s.json", sleep_fn=_NO_SLEEP, **_kwargs(cfg))
    assert d.action == "skip"



# ===================================================== the render must precede the card gate
#
# THE BUG THESE EXIST TO PREVENT. The cycle used to render the card inside the merge step,
# which runs AFTER the sweep — so the card gate always judged a file that did not exist yet and
# every first-time article skipped with C5. Fail-closed and completely inert: the machine ran
# daily and could never publish anything.
#
# The suite did not catch it because every test above hands `evaluate` a sidecar directory that
# is already populated (`_sidecar_dir()`), which is a rendered card by fiat. That made the gate
# testable and the ORDERING invisible. These four tests exercise the ordering itself.

def test_WITHOUT_a_render_the_card_gate_fails_which_is_the_bug_as_it_was():
    """The regression, pinned. No renderer and an empty directory is exactly main's old state."""
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=tempfile.mkdtemp())
    d = _fails(_evaluate(cfg, render_fn=None), "card")
    assert "npm run og-cards" in d.notice()


def test_a_render_that_runs_FIRST_lets_the_sweep_come_back_clean():
    """The fix. The same empty directory, plus a renderer that fills it before the gate looks."""
    cfg = _cfg()
    directory = Path(tempfile.mkdtemp())
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=str(directory))
    calls = []

    def render(article):
        calls.append(article["slug"])
        _, real_card = _picked()
        (directory / f"{article['slug']}.json").write_text(json.dumps(
            {"path": f"/images/og/{article['slug']}.png", "width": 1200, "height": 630,
             "alt": "…", "rendered": real_card}))

    d = _evaluate(cfg, render_fn=render)
    assert d.action == "publish", [v.line() for v in d.verdicts]
    assert len(calls) == 1, f"the renderer ran {len(calls)} times, not once"
    assert calls[0] == d.article["slug"]


def test_a_RENDERER_THAT_REFUSES_is_a_card_failure_not_a_crash():
    """Overflow, a font that will not decode: the generator raises. That is a skip, not a stack
    trace, and it must not be mistaken for a card that merely drifted."""
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=tempfile.mkdtemp())

    def refuses(article):
        raise RuntimeError("og-cards: headline overflows its box at the 84px floor")

    d = _fails(_evaluate(cfg, render_fn=refuses), "card")
    assert "overflows" in "".join(v.detail for v in d.verdicts)


def test_a_render_CANNOT_launder_a_card_the_ledger_does_not_back():
    """The render is not a licence. A renderer that writes the wrong card still fails C5 —
    otherwise 'render first' would have quietly turned the card gate into a rubber stamp."""
    cfg = _cfg()
    directory = Path(tempfile.mkdtemp())
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=str(directory))

    def render_a_lie(article):
        (directory / f"{article['slug']}.json").write_text(json.dumps(
            {"path": f"/images/og/{article['slug']}.png", "width": 1200, "height": 630,
             "alt": "…", "rendered": _stale_card()}))

    _fails(_evaluate(cfg, render_fn=render_a_lie), "card")



# ===================================================== deploy, THEN verify, THEN post
#
# The second ordering defect, and the mirror of L17. The destination and media gates HEAD-check
# URLs that the DEPLOY is what creates, so running them in the pre-deploy sweep guaranteed a 404
# and the cycle could never publish. They now run after the deploy.
#
# The safety property that replaces "everything passed before we touched anything": the CONTENT
# gates still all pass before any merge, and the post is gated on `cleared_to_post`, which is
# false while resolution is merely deferred. These tests hold that line.

def _deferred(cfg, **over):
    return autopilot.evaluate(cfg, today=TODAY, state=_ready_state(),
                              defer_resolution=True, **_kwargs(cfg, **over))


def test_deferring_resolution_does_NOT_clear_the_post():
    """The one that matters. A deferred check is not a passed check: the content sweep can be
    completely clean and the post still is not cleared, because the live checks have not run."""
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=_sidecar_dir())
    d = _deferred(cfg)
    assert d.clean, [v.line() for v in d.verdicts]      # every content gate passed
    assert d.resolution_pending
    assert not d.live_verdicts
    assert not d.cleared_to_post                        # ...and it still may not post


def test_an_EMPTY_live_verdict_list_is_not_a_pass():
    """`all([])` is True. If `cleared_to_post` were written the obvious way, a cycle whose live
    checks never ran would sail straight through. It must not — and the requirement holds
    whether or not resolution was deferred, because there is no case where posting without
    verifying the live destination is right."""
    for pending in (True, False):
        d = autopilot.CycleDecision(action="publish", resolution_pending=pending,
                                    verdicts=[autopilot.GateVerdict("x", True)])
        assert d.clean and not d.cleared_to_post, f"pending={pending} cleared with no live check"
        d.live_verdicts = [autopilot.GateVerdict("post-deploy-destination", True)]
        assert d.cleared_to_post


def test_the_CONTENT_gates_all_run_before_anything_is_merged():
    """Nothing about the article's correctness moved after the deploy. Proven by asserting the
    full content sweep is already complete and clean at the moment merge_fn is called."""
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=_sidecar_dir())
    seen = {}

    def merge(decision):
        seen["names"] = [v.name for v in decision.verdicts]
        seen["clean"] = decision.clean
        seen["live_ran"] = bool(decision.live_verdicts)

    autopilot.run_cycle(
        cfg, today=TODAY, notify_fn=lambda m: None, merge_fn=merge,
        deploy_wait_fn=lambda url: None, verify_opener=lambda url: (True, "resolved 200"),
        publish_fn=lambda post: {"post_url": "https://facebook.com/x"},
        state_path=Path(tempfile.mkdtemp()) / "s.json",
        ledger_path=Path(tempfile.mkdtemp()) / "l.json",
        defer_resolution=True, sleep_fn=_NO_SLEEP, **_kwargs(cfg))

    for gate in ("topic-selection", "claim-ledger", "prose-gates", "two-lock-publish",
                 "model-budget", "claim-freshness", "card", "channel-guard",
                 "social-suite+duplicate"):
        assert gate in seen["names"], f"{gate} did not run before the merge: {seen['names']}"
    assert seen["clean"], "the merge happened on an unclean content sweep"
    assert not seen["live_ran"], "a live check ran before the deploy, which cannot be real"


def test_post_deploy_verification_runs_against_BOTH_urls_and_then_posts():
    """The happy path end to end: content clean, deploy, both live checks pass, post goes."""
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=_sidecar_dir())
    checked, posted = [], []

    def opener(url):
        checked.append(url)
        return True, "resolved 200"

    d = autopilot.run_cycle(
        cfg, today=TODAY, notify_fn=lambda m: None, merge_fn=lambda dec: None,
        deploy_wait_fn=lambda url: None, verify_opener=opener,
        publish_fn=lambda post: (posted.append(post) or {"post_url": "https://facebook.com/x"}),
        state_path=Path(tempfile.mkdtemp()) / "s.json",
        ledger_path=Path(tempfile.mkdtemp()) / "l.json",
        defer_resolution=True, sleep_fn=_NO_SLEEP, **_kwargs(cfg))

    assert d.action == "publish" and len(posted) == 1
    assert [v.name for v in d.live_verdicts] == ["post-deploy-destination", "post-deploy-media"]
    assert d.cleared_to_post
    assert d.article["canonical_url"] in checked
    assert d.post["media_url"] in checked


def test_a_dead_MEDIA_url_after_deploy_withholds_the_post_and_leaves_the_article():
    """The negative case the owner asked for, on the media leg specifically: the article page is
    fine, the card PNG is not. No post, and the article stays exactly where it is."""
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=_sidecar_dir())
    merged, posted = [], []

    def opener(url):
        return (False, "HTTP 404") if url.endswith(".png") else (True, "resolved 200")

    d = autopilot.run_cycle(
        cfg, today=TODAY, notify_fn=lambda m: None,
        merge_fn=lambda dec: merged.append(dec.article["slug"]),
        deploy_wait_fn=lambda url: None, verify_opener=opener,
        publish_fn=lambda post: posted.append(post),
        state_path=Path(tempfile.mkdtemp()) / "s.json",
        ledger_path=Path(tempfile.mkdtemp()) / "l.json",
        defer_resolution=True, sleep_fn=_NO_SLEEP, **_kwargs(cfg))

    assert d.action == "posted_nothing"
    assert len(merged) == 1, "the article should have been merged — only the POST is withheld"
    assert not posted
    assert "ARTICLE LIVE, POST WITHHELD" in d.notice()
    assert "post-deploy-media" in d.notice()


def test_a_dry_run_LABELS_its_live_checks_as_simulated():
    """A dry run has no deploy, so it has no live URL to check. It must say so rather than
    reporting a pass it did not earn."""
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=_sidecar_dir())
    d = autopilot.run_cycle(
        cfg, today=TODAY, notify_fn=lambda m: None, dry_run=True,
        merge_fn=lambda dec: (_ for _ in ()).throw(AssertionError("dry run merged")),
        deploy_wait_fn=lambda url: None, verify_opener=lambda url: (True, "resolved 200"),
        publish_fn=lambda post: (_ for _ in ()).throw(AssertionError("dry run posted")),
        state_path=Path(tempfile.mkdtemp()) / "s.json",
        ledger_path=Path(tempfile.mkdtemp()) / "l.json",
        defer_resolution=True, sleep_fn=_NO_SLEEP, **_kwargs(cfg))
    assert d.action == "would_publish"
    assert all("SIMULATED" in v.detail for v in d.live_verdicts)
    assert "SIMULATED" in d.notice()


def test_the_dry_run_simulates_the_SAME_urls_the_real_run_verifies():
    """A simulation of a different check proves nothing. Both paths read `_live_targets`, and
    this asserts they therefore name the same URLs."""
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=_sidecar_dir())
    d = _deferred(cfg)
    targets = [u for _, u in autopilot._live_targets(d, cfg)]
    assert targets == [d.article["canonical_url"], d.post["media_url"]]



# ===================================================== a halt is loud, never silent
#
# `merge_fn` and `deploy_wait_fn` are the two side effects no gate can pre-check. An unhandled
# raise from either used to exit the process: red job, NO Slack message, and an article in a
# state nobody was told about. "Observable, not silent" is the property that makes full auto
# safe to leave alone, so these hold that line at the two places it was missing.

def _halting(stage, cfg, exc=RuntimeError("the remote hung up")):
    def boom(_arg):
        raise exc
    kwargs = dict(
        merge_fn=lambda dec: None, deploy_wait_fn=lambda url: None,
        verify_opener=lambda url: (True, "resolved 200"),
        publish_fn=lambda post: {"post_url": "https://facebook.com/x"})
    kwargs[{"merge": "merge_fn", "deploy": "deploy_wait_fn"}[stage]] = boom
    notices, posted = [], []
    inner = kwargs["publish_fn"]
    kwargs["publish_fn"] = lambda post: (posted.append(post) or inner(post))
    d = autopilot.run_cycle(
        cfg, today=TODAY, notify_fn=notices.append,
        state_path=Path(tempfile.mkdtemp()) / "s.json",
        ledger_path=Path(tempfile.mkdtemp()) / "l.json",
        defer_resolution=True, **kwargs, sleep_fn=_NO_SLEEP, **_kwargs(cfg))
    return d, notices, posted


def test_a_MERGE_that_raises_notifies_and_posts_nothing():
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=_sidecar_dir())
    d, notices, posted = _halting("merge", cfg)
    assert d.action == "halted" and d.failed_stage == "merge" and not posted
    assert len(notices) == 1, "a halt must notify exactly once, not zero times"
    assert "HALTED at the merge step" in notices[0]
    assert "was NOT published" in notices[0]


def test_a_DEPLOY_wait_that_raises_notifies_and_says_the_article_is_merged():
    """The state matters more than the error. A failed deploy-wait means the article IS on main
    and will appear; a human reading the notice must not go looking for a lost article."""
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=_sidecar_dir())
    d, notices, posted = _halting("deploy", cfg)
    assert d.action == "halted" and d.failed_stage == "deploy" and not posted
    assert "WAS merged" in notices[0]
    assert "Nothing went to Facebook" in notices[0]


def test_only_a_BROKEN_outcome_turns_the_job_red():
    """Skips, pauses and a withheld post are normal Tuesdays and exit 0. A broken pipeline must
    not look like a quiet week, and a quiet week must not look broken — the badge and the Slack
    message have to agree, in both directions.

    The rule now lives on `is_broken` so there is exactly one list, and run_autopilot must defer
    to it rather than keeping a second copy that can drift."""
    import run_autopilot
    cases = (("halted", "merge", 1), ("halted", "deploy", 1),
             ("posted_unconfirmed", "post-bookkeeping", 1),
             ("posted_nothing", "publish", 1),      # a crash in our own publisher is a defect
             ("posted_nothing", "", 0),             # a live URL that did not resolve is not
             ("skip", "", 0), ("paused", "", 0), ("publish", "", 0),
             ("too_soon", "", 0), ("would_publish", "", 0))
    for action, stage, expected in cases:
        d = autopilot.CycleDecision(action=action, failed_stage=stage)
        assert (1 if d.is_broken else 0) == expected, f"{action}/{stage}"
    assert "decision.is_broken" in Path(run_autopilot.__file__).read_text(), \
        "run_autopilot must map its exit code through is_broken, not a second copy of the list"



# ===================================================== EVERY stage notifies, none crashes
#
# The first real cycle merged, deployed and verified, then crashed inside the publisher with a
# traceback and NO Slack message. The halt wrapper covered merge and deploy only. An audit found
# three more unwrapped side effects, not one: the publish, the state write, and the final FYI.
#
# For a machine nobody watches, a stage that can fail without notifying is a stage that can fail
# invisibly. These tests hold the line at every remaining stage.

def _full_cycle(cfg, *, publish_fn=None, state_path=None, notify_fn=None, verify=None):
    notices = []
    return autopilot.run_cycle(
        cfg, today=TODAY, notify_fn=notify_fn or notices.append,
        merge_fn=lambda dec: None, deploy_wait_fn=lambda url: None,
        verify_opener=verify or (lambda url: (True, "resolved 200")),
        publish_fn=publish_fn or (lambda post: {"post_url": "https://facebook.com/p/1",
                                                "submission_id": "s1"}),
        state_path=state_path or (Path(tempfile.mkdtemp()) / "s.json"),
        ledger_path=Path(tempfile.mkdtemp()) / "l.json",
        defer_resolution=True, sleep_fn=_NO_SLEEP, **_kwargs(cfg)), notices


def test_a_PUBLISHER_that_raises_notifies_and_does_not_crash():
    """The exact production failure, as a test. It must produce a notice, not a traceback."""
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=_sidecar_dir())

    def boom(post):
        raise AttributeError("'str' object has no attribute 'get'")

    d, notices = _full_cycle(cfg, publish_fn=boom)
    assert d.action == "posted_nothing" and d.failed_stage == "publish"
    assert len(notices) == 1, "a publisher crash must notify exactly once"
    # "POST FAILED", not "POST WITHHELD": the links were fine, the publisher was not.
    assert "ARTICLE LIVE, POST FAILED" in notices[0]
    assert "no attribute" in d.reason, d.reason
    assert d.is_broken, "a crash in the publisher is a fault and must go red"


def test_a_publisher_crash_is_RED_but_a_withheld_post_is_GREEN():
    """The two must not be conflated. A live URL that did not resolve is the accepted safe
    outcome; a crash in our own code is a defect."""
    withheld = autopilot.CycleDecision(action="posted_nothing")
    crashed = autopilot.CycleDecision(action="posted_nothing", failed_stage="publish")
    assert not withheld.is_broken and crashed.is_broken


def test_a_failure_AFTER_the_post_went_out_is_never_called_withheld():
    """The dangerous case. The post is on a real page; saying 'withheld' would be a straight
    falsehood to whoever reads the notice at 2am."""
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=_sidecar_dir())
    unwritable = Path(tempfile.mkdtemp()) / "nope" / "deeper" / "s.json"
    real_save = autopilot.save_state

    def boom(state, path=None):
        raise OSError("read-only file system")

    autopilot.save_state = boom
    try:
        d, notices = _full_cycle(cfg, state_path=unwritable)
    finally:
        autopilot.save_state = real_save
    assert d.action == "posted_unconfirmed", d.action
    assert d.post_url == "https://facebook.com/p/1"
    assert "THE POST IS LIVE BUT UNRECORDED" in notices[0]
    assert "withheld" not in notices[0].lower()
    assert d.is_broken


def test_a_DEAD_notifier_cannot_stop_the_outcome_being_recorded():
    """If Slack is down we cannot announce anything — but the run must still resolve to a named
    outcome rather than raising over the failure it was trying to report."""
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=_sidecar_dir())

    def dead(message):
        raise RuntimeError("Slack returned HTTP 503")

    def boom(post):
        raise RuntimeError("publisher exploded")

    d, _ = _full_cycle(cfg, publish_fn=boom, notify_fn=dead)
    assert d.action == "posted_nothing" and d.is_broken


def test_the_happy_path_still_reaches_publish_and_notifies():
    """The positive case, so the refusals above mean something."""
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=_sidecar_dir())
    d, notices = _full_cycle(cfg)
    assert d.action == "publish", d.action
    assert d.post_url == "https://facebook.com/p/1"
    assert any("THI posted (auto)" in n for n in notices)
    assert not d.is_broken


def test_no_side_effect_in_the_publish_tail_is_left_unwrapped():
    """The audit, as a standing check. Every call after the deploy that can raise must be inside
    a try. Reads the source because that is the only way to assert the SHAPE of the code rather
    than one path through it."""
    source = Path(autopilot.__file__).read_text()
    tail = source.split("# ---- the post-deploy gates")[1].split("def _post_stage_failure")[0]
    for call in ("publish_gate.publish_with_verification", "save_state(", "notify_fn(published"):
        assert call in tail, f"{call} moved; this audit needs updating"
    # every one of them must appear after a `try:` and before the matching except
    guarded = tail.split("try:")
    assert len(guarded) >= 3, "expected the publish and the bookkeeping to be separately guarded"
    assert "publish_gate.publish_with_verification" in guarded[1]
    assert "save_state(" in guarded[2] and "notify_fn(published" in guarded[2]



# ===================================================== a dead notifier never eats the outcome
#
# Found by auditing the shape of the code rather than by a failure: three notifier calls were
# still outside any handler — the skip/paused notice, the notice inside the merge/deploy halt
# handler, and the posted_nothing notice. `slack_notifier` raises deliberately when Slack is
# unreachable, so each of those would turn its outcome into an unrelated traceback.
#
# The halt one is the worst: it loses a HALT behind an HTTP 503, which is precisely the
# regression #56 was written to close. The report of a failure must not fail and take the report
# with it.

def _dead_notifier(message):
    raise RuntimeError("Slack returned HTTP 503")


def test_a_dead_notifier_does_not_turn_a_SKIP_into_a_crash():
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=tempfile.mkdtemp())   # card missing
    d = autopilot.run_cycle(
        cfg, today=TODAY, notify_fn=_dead_notifier,
        merge_fn=lambda dec: None, deploy_wait_fn=lambda url: None,
        verify_opener=lambda url: (True, "resolved 200"),
        publish_fn=lambda post: {"post_url": "x"},
        state_path=Path(tempfile.mkdtemp()) / "s.json",
        ledger_path=Path(tempfile.mkdtemp()) / "l.json",
        defer_resolution=True, sleep_fn=_NO_SLEEP, **_kwargs(cfg))
    assert d.action == "skip", d.action
    assert not d.is_broken, "a quiet skip must not go red just because Slack is down"


def test_a_dead_notifier_does_not_lose_a_HALT():
    """The regression that matters. A halt reported through a dead notifier must still BE a
    halt — not an HTTP 503 traceback with the real cause thrown away."""
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=_sidecar_dir())

    def boom(_dec):
        raise RuntimeError("! [rejected] non-fast-forward")

    d = autopilot.run_cycle(
        cfg, today=TODAY, notify_fn=_dead_notifier, merge_fn=boom,
        deploy_wait_fn=lambda url: None, verify_opener=lambda url: (True, "resolved 200"),
        publish_fn=lambda post: {"post_url": "x"},
        state_path=Path(tempfile.mkdtemp()) / "s.json",
        ledger_path=Path(tempfile.mkdtemp()) / "l.json",
        defer_resolution=True, sleep_fn=_NO_SLEEP, **_kwargs(cfg))
    assert d.action == "halted" and d.failed_stage == "merge"
    assert "non-fast-forward" in d.reason, d.reason
    assert d.is_broken, "the job must still go red"


def test_a_dead_notifier_does_not_lose_a_WITHHELD_post():
    """The article is live. Losing this notice to a Slack outage would leave a published piece
    nobody was told about."""
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=_sidecar_dir())
    d = autopilot.run_cycle(
        cfg, today=TODAY, notify_fn=_dead_notifier, merge_fn=lambda dec: None,
        deploy_wait_fn=lambda url: None,
        verify_opener=lambda url: (False, "HTTP 404"),
        publish_fn=lambda post: {"post_url": "x"},
        state_path=Path(tempfile.mkdtemp()) / "s.json",
        ledger_path=Path(tempfile.mkdtemp()) / "l.json",
        defer_resolution=True, sleep_fn=_NO_SLEEP, **_kwargs(cfg))
    assert d.action == "posted_nothing"
    assert not d.cleared_to_post


def test_a_CORRUPT_state_file_does_not_crash_the_run():
    """A cycle must not die before it has done anything because a JSON file got truncated."""
    path = Path(tempfile.mkdtemp()) / "state.json"
    path.write_text("{not json at all")
    state = autopilot.load_state(path)
    assert state == {"last_article_at": None, "cycles": 0}


def test_NO_notifier_call_in_run_cycle_can_escape_as_an_exception():
    """The audit, pinned. A future edit that adds a bare `notify_fn(` reintroduces exactly the
    class this closes, and would otherwise pass every test above.

    Two acceptable shapes, and the difference is deliberate:

    * `_safe_notify` — for a notice that REPORTS an outcome which already happened. Losing the
      delivery must not lose the outcome, so it is swallowed and logged.
    * inside the bookkeeping try — for the final published FYI only. There, a delivery failure
      is genuinely `posted_unconfirmed`: the post is live and nobody has been told, which is a
      state a human has to reconcile. Swallowing that one would be the wrong call.
    """
    source = Path(autopilot.__file__).read_text()
    body = source.split("def run_cycle(")[1].split("\ndef _post_stage_failure")[0]
    guarded_tail = body.split("try:")[-1]
    offenders = []
    for line in body.split("\n"):
        st = line.strip()
        if "notify_fn(" not in st or st.startswith("#"):
            continue
        if "_safe_notify" in st or "notify_fn=" in st or "notify_fn," in st:
            continue
        if st in guarded_tail:                     # the final FYI, inside the bookkeeping try
            continue
        offenders.append(st)
    assert not offenders, f"these notifier calls can escape as exceptions: {offenders}"



# ===================================================== a CDN is eventually consistent
#
# On 2026-09-18 the post-deploy check returned 404 for a URL that resolved 90 seconds later, and
# the cycle correctly withheld a post for an article that was fine. An earlier run took the same
# path in 75 seconds and passed. Same code, same shape, opposite result: a race with deploy
# propagation, not a defect in any one step.
#
# These tests hold the line that retrying fixes the race WITHOUT blunting the gate.

def test_a_slow_deploy_SETTLES_instead_of_failing():
    """404, 404, then 200 — the exact shape observed live. It must pass, and say it waited."""
    answers = iter([(False, "HTTP 404"), (False, "HTTP 404"), (True, "resolved 200")])
    slept = []
    ok, reason = autopilot._verify_until_stable(
        lambda url: next(answers), "https://x/y", attempts=6, delay=15, sleep_fn=slept.append)
    assert ok
    assert "settled on attempt 3" in reason, reason
    assert slept == [15, 15], slept


def test_a_URL_that_NEVER_resolves_still_fails():
    """The gate keeps its teeth. Retrying must not turn 'never' into 'eventually'."""
    slept = []
    ok, reason = autopilot._verify_until_stable(
        lambda url: (False, "HTTP 404"), "https://x/y", attempts=6, delay=15,
        sleep_fn=slept.append)
    assert not ok
    assert "still failing after 6 attempts" in reason
    assert len(slept) == 5, "it should not sleep after the final attempt"


def test_a_first_time_success_does_not_wait_at_all():
    slept = []
    ok, reason = autopilot._verify_until_stable(
        lambda url: (True, "resolved 200"), "https://x/y", attempts=6, delay=15,
        sleep_fn=slept.append)
    assert ok and reason == "resolved 200" and not slept


def test_the_cycle_RETRIES_the_post_deploy_checks_and_then_posts():
    """End to end: a destination that is slow to appear no longer costs the post."""
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=_sidecar_dir())
    seen, posted = {}, []

    def opener(url):
        seen[url] = seen.get(url, 0) + 1
        return (seen[url] >= 3), ("resolved 200" if seen[url] >= 3 else "HTTP 404")

    d = autopilot.run_cycle(
        cfg, today=TODAY, notify_fn=lambda m: None, merge_fn=lambda dec: None,
        deploy_wait_fn=lambda url: None, verify_opener=opener,
        publish_fn=lambda post: (posted.append(post) or {"post_url": "https://facebook.com/p/9",
                                                         "submission_id": "s9"}),
        state_path=Path(tempfile.mkdtemp()) / "s.json",
        ledger_path=Path(tempfile.mkdtemp()) / "l.json",
        defer_resolution=True, sleep_fn=_NO_SLEEP, **_kwargs(cfg))
    assert d.action == "publish", [v.line() for v in d.live_verdicts]
    assert len(posted) == 1
    assert all(v.ok for v in d.live_verdicts)


def test_a_permanently_dead_destination_still_withholds_the_post():
    """The same retry, the other direction. Nothing about this may become permissive."""
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=_sidecar_dir())
    posted = []
    d = autopilot.run_cycle(
        cfg, today=TODAY, notify_fn=lambda m: None, merge_fn=lambda dec: None,
        deploy_wait_fn=lambda url: None, verify_opener=lambda url: (False, "HTTP 404"),
        publish_fn=lambda post: posted.append(post),
        state_path=Path(tempfile.mkdtemp()) / "s.json",
        ledger_path=Path(tempfile.mkdtemp()) / "l.json",
        defer_resolution=True, sleep_fn=_NO_SLEEP, **_kwargs(cfg))
    assert d.action == "posted_nothing" and not posted



def test_the_withheld_notice_names_the_RIGHT_cause():
    """Two different causes wear `posted_nothing`, and the notice must not describe one as the
    other. A real 401 from the publisher was reported as "the URL could not be verified" while
    both URLs had just returned 200 — which sends whoever reads it to the wrong system."""
    article = {"canonical_url": "https://x/y/"}
    card = {"question": "Q?"}

    publish_failed = autopilot.CycleDecision(
        action="posted_nothing", failed_stage="publish", article=article, card=card,
        reason="the article is live; the post failed: HTTPError: HTTP Error 401: Unauthorized")
    notice = publish_failed.notice()
    assert "POST FAILED" in notice and "401" in notice
    assert "could not verify" not in notice, "a publish failure reported as a link problem"

    link_failed = autopilot.CycleDecision(
        action="posted_nothing", article=article, card=card,
        live_verdicts=[autopilot.GateVerdict("post-deploy-media", False, "HTTP 404")])
    notice = link_failed.notice()
    assert "link/media unverified" in notice and "HTTP 404" in notice
    assert "POST FAILED" not in notice



# ===================================================== the ledger must outlive the runner
#
# Post #2 went out cleanly and its row died with the container. `publish_with_verification`
# appends to the RUNNER's checkout; nothing committed it back. The duplicate gate and the orphan
# finder both read that ledger, so the next cycle would have seen a never-promoted article and
# posted it a SECOND time. A lost row here is a duplicate post, not a lost statistic.

def _cycle_with_ledger(cfg, commit_fn, publish_fn=None, ledger_path=None):
    notices = []
    d = autopilot.run_cycle(
        cfg, today=TODAY, notify_fn=notices.append, merge_fn=lambda dec: None,
        deploy_wait_fn=lambda url: None, verify_opener=lambda url: (True, "resolved 200"),
        publish_fn=publish_fn or (lambda post: {"post_url": "https://facebook.com/p/2",
                                                "submission_id": "s2"}),
        state_path=Path(tempfile.mkdtemp()) / "s.json",
        ledger_path=ledger_path or (Path(tempfile.mkdtemp()) / "l.json"),
        ledger_commit_fn=commit_fn, defer_resolution=True, sleep_fn=_NO_SLEEP, **_kwargs(cfg))
    return d, notices


def test_a_successful_post_COMMITS_its_ledger_row():
    """The fix. Without it the record exists only in a container that is about to be deleted."""
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=_sidecar_dir())
    committed = []
    d, _ = _cycle_with_ledger(cfg, lambda record, state: committed.append((record, state)))
    assert d.action == "publish"
    assert len(committed) == 1, "the post was not recorded anywhere durable"
    row, landed_state = committed[0]
    # The CLOCK must be part of the same call. It was written only to the runner before this,
    # so the 3-day floor never engaged across runs.
    assert landed_state.get("last_article_at") == TODAY.isoformat(), landed_state
    assert row["page_id"], "the row carries no page_id — the two-lock proof would be lost"
    assert row["post_url"] and row["article_url"] and row["streak_after"]


def test_a_LEDGER_COMMIT_FAILURE_after_a_live_post_is_posted_unconfirmed():
    """The case the owner named. The post is LIVE and the record is not. It must go red and
    loud, and it must never read as 'nothing was posted'."""
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=_sidecar_dir())

    def refuse(_record, _state):
        raise RuntimeError("`git push` exited 1: ! [remote rejected] main (protected branch)")

    d, notices = _cycle_with_ledger(cfg, refuse)
    assert d.action == "posted_unconfirmed", d.action
    assert d.is_broken, "an unrecorded live post must turn the job red"
    assert d.post_url == "https://facebook.com/p/2"
    assert "THE POST IS LIVE BUT UNRECORDED" in notices[0]
    assert "remote rejected" in d.reason, d.reason
    # The notice must say WHY it matters, not merely that it happened.
    assert "posted AGAIN" in notices[0], "the duplicate risk is not spelled out"
    assert "withheld" not in notices[0].lower()


def _real_origin():
    """A genuine git repo with a bare `origin`, seeded with an EMPTY ledger and no state file.

    Real git, because the defect this discipline exists for is a real-git behaviour: `git
    checkout -B <branch> origin/main` carries an uncommitted file over into the new branch.
    FakeRepo cannot produce that, which is why every earlier test passed while the first live
    run failed. Returns the work tree and a merge function that really merges.
    """
    import subprocess
    root = Path(tempfile.mkdtemp())
    origin, work = root / "origin.git", root / "work"
    subprocess.run(["git", "init", "--bare", "-b", "main", str(origin)], check=True,
                   capture_output=True)
    subprocess.run(["git", "clone", str(origin), str(work)], check=True, capture_output=True)
    for k, v in (("user.email", "t@t"), ("user.name", "t"), ("commit.gpgsign", "false")):
        subprocess.run(["git", "-C", str(work), "config", k, v], check=True, capture_output=True)
    led = work / "autoposter" / "data" / "published-posts.json"
    led.parent.mkdir(parents=True, exist_ok=True)
    led.write_text("[]\n")
    for cmd in (["add", "-A"], ["commit", "-m", "seed"], ["push", "-u", "origin", "main"]):
        subprocess.run(["git", "-C", str(work), *cmd], check=True, capture_output=True)

    def merge(branch, *, title, body=None):
        subprocess.run(["git", "-C", str(work), "push", "origin", f"{branch}:main"],
                       check=True, capture_output=True)
        return "https://github.com/o/r/pull/1"

    def on_main(relative):
        out = subprocess.run(["git", "-C", str(work), "show", f"origin/main:{relative}"],
                             capture_output=True, text=True)
        return json.loads(out.stdout) if out.returncode == 0 else None

    return work, merge, on_main


def test_THE_FLOOR_ACTUALLY_HOLDS_a_second_cycle_right_after_a_publish_is_too_soon():
    """THE PROOF THE OWNER ASKED FOR, and the reason the clock has to live on main.

    `autopilot-state.json` has never existed on main, so every run loaded "no article recorded
    yet" and `due()` returned True every time — the 3-day floor never engaged once in
    production. It was observed live: a cycle offered a NEW article hours after one had been
    published.

    So: run a real cycle with the real committer against a real repo, then run `due()` against
    the state READ BACK FROM MAIN — not from the runner, whose copy is exactly what used to
    vanish. The second cycle must stop before selection.
    """
    import subprocess
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
    import run_autopilot as ra

    work, merge, on_main = _real_origin()
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=_sidecar_dir())
    real_repo, real_pr = ra.REPO, ra.open_and_merge_pr
    try:
        ra.REPO, ra.open_and_merge_pr = work, merge
        d, _ = _cycle_with_ledger(cfg, ra.bookkeeping_committer(lambda *_: None))
    finally:
        ra.REPO, ra.open_and_merge_pr = real_repo, real_pr
    assert d.action == "publish", d.action

    landed = on_main("autoposter/data/autopilot-state.json")
    assert landed is not None, "the clock is still not on main — the floor cannot hold"
    assert landed["last_article_at"] == TODAY.isoformat(), landed

    # THE SECOND CYCLE. Nothing from the first runner survives except what reached main.
    ok, why = autopilot.due(landed, cfg, TODAY)
    assert not ok, f"the floor did not hold: {why}"
    assert "floor is" in why, why

    # And it is a FLOOR, not a freeze: once the minimum has passed, it opens again.
    later = date.fromordinal(TODAY.toordinal() + (cfg.get("cadence", {}).get("article_days_min", 3)))
    assert autopilot.due(landed, cfg, later)[0], "the floor never reopens"


def test_the_STREAK_is_counted_from_the_ledger_not_a_number_nobody_increments():
    """Post #4 recorded `streak_after: 2` with four posts on the page, because the streak came
    from `clean_streak` in config.yaml — a hand-maintained number no code ever advanced. The
    ledger IS the list of posts, so the streak is a property of it rather than a second copy of
    the same fact kept somewhere else and allowed to drift."""
    led = Path(tempfile.mkdtemp()) / "l.json"
    rows = [{"platform": "facebook", "page_id": "PIN", "post_publish_verified": True}] * 3
    led.write_text(json.dumps(rows))
    assert publish_gate.clean_streak(led, page_id="PIN") == 3

    # A post on a DIFFERENT page is not this page's streak.
    led.write_text(json.dumps(rows + [{"platform": "facebook", "page_id": "OTHER",
                                       "post_publish_verified": True}]))
    assert publish_gate.clean_streak(led, page_id="PIN") == 3, "another page's post was counted"

    # An UNVERIFIED post breaks the run — that is what "in a row" means.
    led.write_text(json.dumps(rows + [{"platform": "facebook", "page_id": "PIN",
                                       "post_publish_verified": False},
                                      {"platform": "facebook", "page_id": "PIN",
                                       "post_publish_verified": True}]))
    assert publish_gate.clean_streak(led, page_id="PIN") == 1, "an unverified post did not break it"

    # And config.yaml's own `clean_streak` is a DIFFERENT thing wearing the same name — the
    # owner-advanced autonomy marker. Nothing here may read or write it.
    import inspect
    # The config read has a shape of its own: `.get("clean_streak"` off the channels dict.
    # Asserting on the bare word would also match the call to publish_gate's function.
    assert 'get("clean_streak"' not in inspect.getsource(autopilot.run_cycle), \
        "run_cycle is reading config's owner-advanced counter again"


def test_the_ledger_row_records_the_streak_the_LEDGER_implies():
    """End to end: the number written into the row is the one the ledger supports."""
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=_sidecar_dir())
    led = Path(tempfile.mkdtemp()) / "l.json"
    led.write_text(json.dumps([{"platform": "facebook", "page_id": "1335273942995805",
                                "post_publish_verified": True,
                                "article_url": f"https://x/{i}/"} for i in range(3)]))
    committed = []
    d, _ = _cycle_with_ledger(cfg, lambda r, s: committed.append(r), ledger_path=led)
    assert d.action == "publish", d.action
    assert committed[0]["streak_after"] == 4, \
        f"three posts on the page, so this is the fourth: got {committed[0]['streak_after']}"


def test_THE_REAL_COMMITTER_going_green_without_the_row_on_main_is_posted_unconfirmed():
    """THE FAILURE THAT ACTUALLY HAPPENED, end to end, with nothing stubbed between.

    Post #3 went out. The committer read the row it had itself just written into the working
    tree, said "already recorded; nothing to commit", returned normally, and the cycle reported
    a green publish while main carried no such row — leaving the article looking like a
    never-promoted orphan, primed to be posted a second time by the next cycle.

    Every other test on this path hands `run_cycle` a commit function that either works or
    raises. That is precisely the shape the bug did not have: it SUCCEEDED and recorded nothing.
    So this wires the real `ledger_committer` to a real git repo whose merge quietly does not
    move main, and asserts the cycle goes red. A persistence step that cannot confirm its own
    success must not report success, and the cycle must not report one for it.
    """
    import subprocess
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
    import run_autopilot as ra

    root = Path(tempfile.mkdtemp())
    origin, work = root / "origin.git", root / "work"
    subprocess.run(["git", "init", "--bare", "-b", "main", str(origin)], check=True,
                   capture_output=True)
    subprocess.run(["git", "clone", str(origin), str(work)], check=True, capture_output=True)
    for k, v in (("user.email", "t@t"), ("user.name", "t"), ("commit.gpgsign", "false")):
        subprocess.run(["git", "-C", str(work), "config", k, v], check=True, capture_output=True)
    led = work / "autoposter" / "data" / "published-posts.json"
    led.parent.mkdir(parents=True, exist_ok=True)
    led.write_text("[]\n")
    for cmd in (["add", "-A"], ["commit", "-m", "seed"], ["push", "-u", "origin", "main"]):
        subprocess.run(["git", "-C", str(work), *cmd], check=True, capture_output=True)

    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=_sidecar_dir())
    real_repo, real_pr = ra.REPO, ra.open_and_merge_pr
    try:
        ra.REPO = work
        # The PR "merges" and reports a URL. Main never moves. Exactly the silent loss.
        ra.open_and_merge_pr = lambda branch, *, title, body=None: "https://github.com/o/r/pull/1"
        d, notices = _cycle_with_ledger(cfg, ra.ledger_committer(lambda *_: None))
    finally:
        ra.REPO, ra.open_and_merge_pr = real_repo, real_pr

    assert d.action == "posted_unconfirmed", f"a silently unrecorded post read as {d.action}"
    assert d.is_broken, "the job stayed green with a live post and no row on main"
    assert "THE POST IS LIVE BUT UNRECORDED" in notices[0], notices[0]
    assert "posted AGAIN" in notices[0], "the duplicate risk is not spelled out"
    assert "did not reach main" in d.reason, d.reason
    on_main = subprocess.run(
        ["git", "-C", str(work), "show", "origin/main:autoposter/data/published-posts.json"],
        capture_output=True, text=True, check=True).stdout
    assert json.loads(on_main) == [], "main changed; this test proved nothing"


def test_THE_REAL_COMMITTER_lands_the_row_and_the_cycle_goes_green():
    """The same wiring with a merge that actually merges — so the red above is the committer
    detecting a real absence, not the harness being unable to succeed at all."""
    import subprocess
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
    import run_autopilot as ra

    root = Path(tempfile.mkdtemp())
    origin, work = root / "origin.git", root / "work"
    subprocess.run(["git", "init", "--bare", "-b", "main", str(origin)], check=True,
                   capture_output=True)
    subprocess.run(["git", "clone", str(origin), str(work)], check=True, capture_output=True)
    for k, v in (("user.email", "t@t"), ("user.name", "t"), ("commit.gpgsign", "false")):
        subprocess.run(["git", "-C", str(work), "config", k, v], check=True, capture_output=True)
    led = work / "autoposter" / "data" / "published-posts.json"
    led.parent.mkdir(parents=True, exist_ok=True)
    led.write_text("[]\n")
    for cmd in (["add", "-A"], ["commit", "-m", "seed"], ["push", "-u", "origin", "main"]):
        subprocess.run(["git", "-C", str(work), *cmd], check=True, capture_output=True)

    def merge(branch, *, title, body=None):
        subprocess.run(["git", "-C", str(work), "push", "origin", f"{branch}:main"],
                       check=True, capture_output=True)
        return "https://github.com/o/r/pull/2"

    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=_sidecar_dir())
    real_repo, real_pr = ra.REPO, ra.open_and_merge_pr
    try:
        ra.REPO, ra.open_and_merge_pr = work, merge
        d, notices = _cycle_with_ledger(cfg, ra.ledger_committer(lambda *_: None))
    finally:
        ra.REPO, ra.open_and_merge_pr = real_repo, real_pr

    assert d.action == "publish", d.action
    rows = json.loads(subprocess.run(
        ["git", "-C", str(work), "show", "origin/main:autoposter/data/published-posts.json"],
        capture_output=True, text=True, check=True).stdout)
    assert len(rows) == 1 and rows[0]["post_url"], f"the row did not land on main: {rows}"


def test_the_ledger_commit_happens_BEFORE_the_state_write():
    """Ordering. If the commit fails, the cadence clock must not already have moved — otherwise
    a reconciling human sees a cycle that looks complete."""
    cfg = _cfg()
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=_sidecar_dir())
    state = Path(tempfile.mkdtemp()) / "s.json"
    autopilot.save_state({"last_article_at": "2026-09-01", "cycles": 1}, state)

    def refuse(_record, _state):
        raise RuntimeError("push failed")

    autopilot.run_cycle(
        cfg, today=TODAY, notify_fn=lambda m: None, merge_fn=lambda dec: None,
        deploy_wait_fn=lambda url: None, verify_opener=lambda url: (True, "resolved 200"),
        publish_fn=lambda post: {"post_url": "https://facebook.com/p/2", "submission_id": "s"},
        state_path=state, ledger_path=Path(tempfile.mkdtemp()) / "l.json",
        ledger_commit_fn=refuse, defer_resolution=True, sleep_fn=_NO_SLEEP, **_kwargs(cfg))
    assert autopilot.load_state(state)["last_article_at"] == "2026-09-01", \
        "the clock moved even though the post was never recorded"


def test_THE_LOOP_IS_CLOSED_a_recorded_post_is_no_longer_an_orphan():
    """The whole point. Once the row is on main, the orphan finder must not offer that article
    again — which is what stops the machine posting the same link every day."""
    cfg = _cfg()
    found = autopilot.promotable_orphans(
        cfg, today=TODAY, write_fn=run_article.write,
        build_claims_fn=run_article.build_claims, articles=run_article.TOPIC_ARTICLES,
        ledger_path=Path(tempfile.mkdtemp()) / "l.json")
    if not found:
        return
    first = found[0]

    # Exactly the row the committer would write for it.
    ledger = Path(tempfile.mkdtemp()) / "l.json"
    ledger.write_text(json.dumps([{
        "platform": "facebook", "page_id": "1335273942995805",
        "post_url": "https://facebook.com/1335273942995805_1",
        "article_url": first["article"]["canonical_url"],
        "article_slug": first["article"]["slug"], "streak_after": 2}]))

    again = autopilot.promotable_orphans(
        cfg, today=TODAY, write_fn=run_article.write,
        build_claims_fn=run_article.build_claims, articles=run_article.TOPIC_ARTICLES,
        ledger_path=ledger)
    assert first["topic_id"] not in [o["topic_id"] for o in again], \
        "a recorded post is still being offered for promotion — the duplicate loop is open"


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
