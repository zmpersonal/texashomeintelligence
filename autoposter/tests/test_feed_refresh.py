"""The feed refresh — and the question it exists to answer: what does a NO-CHANGE day do?

The feed carried `generated_at: 2026-09-06` for twelve days because nothing ran `build_feed`.
Fixing that introduces a new way to be wrong: a refresh that "succeeds" every day, advances the
timestamp, commits to main (which auto-deploys the live site) and leaves every downstream stage
unable to tell "the data moved" from "a job ran".

So the refresher compares SUBSTANCE, not bytes, and these tests hold it to that.

Run: python3 tests/test_feed_refresh.py
"""
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import build_feed                                  # noqa: E402
import run_autopilot as ra                         # noqa: E402

_spec = importlib.util.spec_from_file_location(
    "refresh_feed", os.path.join(os.path.dirname(__file__), "..", "tools", "refresh-feed.py"))
rf = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rf)

_REAL_RUN = subprocess.run                         # captured BEFORE anything patches it (L21)
FEED = {"generated_at": "2026-09-18T00:00:00+00:00", "week_mode": "live",
        "coverage": ["texas"], "areas": [], "stories": [{"rank": 1, "figure": "13.88¢/kWh"}]}


def _restore():
    ra.subprocess.run = _REAL_RUN


# ===================================================== substance, not bytes

def test_the_timestamp_ALONE_is_not_a_change():
    """`generated_at` moves on every run whether or not anything else did. Treating that as a
    change would put a commit on main every day for nothing — and main auto-deploys the site."""
    later = dict(FEED, generated_at="2026-09-19T00:00:00+00:00")
    assert rf.substance(FEED) == rf.substance(later)
    assert json.dumps(FEED) != json.dumps(later), "the fixtures are not actually different"


def test_a_REAL_change_is_a_change():
    for field, value in (("stories", [{"rank": 1, "figure": "14.02¢/kWh"}]),
                         ("week_mode", "stale"),
                         ("coverage", ["texas", "austin_metro"])):
        moved = dict(FEED, **{field: value})
        assert rf.substance(FEED) != rf.substance(moved), f"a change in {field} read as no change"


def test_an_ABSENT_feed_on_main_is_not_equal_to_a_built_one():
    """First run ever: there is no feed on main. That must read as "commit it", not "unchanged"."""
    assert rf.substance(None) != rf.substance(FEED)
    assert rf.substance({}) != rf.substance(FEED)


def test_the_comparison_is_ORDER_INDEPENDENT():
    """Two dicts built in a different key order are the same feed."""
    shuffled = {k: FEED[k] for k in reversed(list(FEED))}
    assert rf.substance(FEED) == rf.substance(shuffled)


def test_build_feed_is_DETERMINISTIC_over_the_same_data():
    """If any part of the document were nondeterministic, the no-change check would fail OPEN —
    it would see a change every day and commit every day, which is the thing being prevented."""
    cfg = build_feed.load_config()
    first, _ = build_feed.build_feed(cfg)
    second, _ = build_feed.build_feed(cfg)
    assert rf.substance(first) == rf.substance(second)


# ===================================================== what a no-change day actually DOES

class _Spy:
    def __init__(self, on_main):
        self.on_main, self.commits = on_main, []

    def install(self):
        self._real = (ra._json_on_main, ra.commit_to_main, build_feed.write_feed)
        ra._json_on_main = lambda relative, default: self.on_main
        ra.commit_to_main = lambda files, **kw: self.commits.append((files, kw)) or "url"
        build_feed.write_feed = lambda feed, cfg: Path(tempfile.mkdtemp()) / "feed.json"
        return self

    def restore(self):
        ra._json_on_main, ra.commit_to_main, build_feed.write_feed = self._real


def _run_refresh(on_main, argv=("refresh-feed.py",)):
    spy = _Spy(on_main).install()
    real_argv, sys.argv = sys.argv, list(argv)
    try:
        code = rf.main()
    finally:
        sys.argv = real_argv
        spy.restore()
    return code, spy.commits


def test_a_NO_CHANGE_day_commits_NOTHING():
    """THE OWNER'S QUESTION. Ingestion failed, or ran and changed nothing. The refresh must not
    advance anything — so no downstream stage can mistake a job having run for new data."""
    built, _ = build_feed.build_feed(build_feed.load_config())
    # Main already holds this exact feed, from an earlier run with an older timestamp.
    already = dict(built, generated_at="2001-01-01T00:00:00+00:00")
    code, commits = _run_refresh(already)
    assert code == 0, "a quiet day must not be an error"
    assert commits == [], "it committed a feed whose data had not moved"


def test_a_CHANGED_day_commits_and_asks_to_be_confirmed_on_main():
    """And when the data HAS moved, it uses the same discipline as the ledger row: written from
    main's content, merged, then read back. A refresh that cannot confirm it landed is the
    machine believing it has fresh data when it has yesterday's."""
    code, commits = _run_refresh({"generated_at": "2000-01-01T00:00:00+00:00",
                                  "week_mode": "live", "coverage": [], "areas": [],
                                  "stories": [{"rank": 1, "figure": "nothing like the real one"}]})
    assert code == 0
    assert len(commits) == 1, "the data moved and nothing was committed"
    files, kw = commits[0]
    assert len(files) == 1 and files[0].relative == "autoposter/data/social-feed.json"
    assert kw["kind"] == "feed"

    # The confirmation must accept the feed it just built and REFUSE a stale one — otherwise
    # "confirmed on main" would pass against whatever happened to be there.
    built, _ = build_feed.build_feed(build_feed.load_config())
    assert files[0].present(built), "it would not recognise its own feed on main"
    assert not files[0].present(dict(built, stories=[])), "it would accept a feed it did not write"
    assert not files[0].present({}), "it would accept an absent feed as confirmation"


def test_DRY_RUN_reports_the_change_without_committing():
    code, commits = _run_refresh({"generated_at": "2000-01-01T00:00:00+00:00", "stories": []},
                                 argv=("refresh-feed.py", "--dry-run"))
    assert code == 0 and commits == [], "--dry-run committed"


# ===================================================== the period comes from the DATA

def test_a_TITLE_may_only_name_a_MONTH_THE_DATA_HAS():
    """The invariant that actually matters, and it is not "the title never moves".

    A recurring builder's title DOES move with the clock, correctly: `load_history` drops the
    incomplete current month, so on 18 Sep the newest complete permit month is August and on 15
    Oct it is September. The title follows the set of COMPLETE months, which changes as the
    calendar turns. That is the subscription working.

    The dangerous version is a title that names a month from the CLOCK while the figures under
    it come from an older one — "September 2026" over August's numbers. So the assertion is on
    the honest property: every month a title names must be a period the data actually holds.
    """
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
    import article_engine as engine, run_article, thi_source
    from datetime import date

    checked = 0
    for today in (date(2026, 9, 18), date(2026, 10, 15), date(2026, 12, 1)):
        have = {p.period[:7] for s_ in thi_source.load_history(today) for p in s_.points}
        for topic_id, builder in run_article.TOPIC_ARTICLES.items():
            title_for = getattr(builder, "title_for", None)
            if not title_for:
                continue                            # a timeless builder names no month
            title = title_for(today)
            for index, name in enumerate(run_article.MONTHS_LONG):
                for token in (name, name[:3]):
                    if f"{token} " not in title:
                        continue
                    year = title.split(f"{token} ", 1)[1][:4]
                    if not year.isdigit():
                        continue
                    named = f"{year}-{index + 1:02d}"
                    assert named in have, (
                        f"{topic_id} would title an article {named} on {today}, but the data "
                        f"holds no such period — that is a month name taken from the clock")
                    checked += 1
    assert checked, "no recurring builder named a month; this test proved nothing"


def test_a_REFRESH_ALONE_does_not_unstick_the_builders_that_are_stuck_TODAY():
    """The honest limit of this change, recorded so nobody later assumes otherwise.

    Rebuilding the feed from the same month yields the same titles, so every builder stays
    retired and the cycle keeps skipping — correctly. What unsticks a permit builder is the
    calendar completing a month the datasets already hold; what unsticks the climate builder is
    NOAA publishing one. Neither is something this workflow can cause.
    """
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
    import article_engine as engine, run_article, topic_scorer
    from datetime import date

    today = date(2026, 9, 18)
    cfg, feed = engine.load_config(), engine.load_feed()
    ranked = [t for t in topic_scorer.score_topics(feed, cfg) if t["buildable"]]
    already = engine.published_questions(cfg)
    eligible = [t["id"] for t in ranked
                if engine._current_title(t, run_article.TOPIC_ARTICLES, today) not in already]
    assert eligible == [], (
        f"{eligible} is eligible today — if that is now true, this test is stale and the "
        f"machine is no longer waiting on new periods")


if __name__ == "__main__":
    fns = [f for n, f in sorted(globals().items()) if n.startswith("test_")]
    ok = 0
    for f in fns:
        try:
            f(); ok += 1; print("PASS", f.__name__)
        except AssertionError as e:
            print("FAIL", f.__name__, str(e)[:300])
        except Exception as e:                      # noqa: BLE001
            print("ERROR", f.__name__, f"{type(e).__name__}: {e}"[:300])
        finally:
            _restore()
    print(f"{ok}/{len(fns)} passed")
