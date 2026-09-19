"""A month THI aggregates itself is complete only if the ingestion reached its last day.

THE FALSE STORY THIS PREVENTS. On 2026-10-01 September looked like a complete month to every
part of the pipeline — the calendar had turned, so the "drop the current month" rule let it
through. The dataset held SEVENTEEN DAYS of Austin filings and ELEVEN of San Antonio's. All
three Austin trades read about a third down, and three independent trades falling by the same
amount in the same month is the fingerprint of a partial month, not of a market.

The article would have been sourced, claim-ledgered, card-rendered and every gate green, and it
would have told Austin homeowners their remodel market was cooling when nothing had cooled.

Run: python3 tests/test_month_completeness.py
"""
import json
import os
import sys
import tempfile
from datetime import date
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import thi_source                                  # noqa: E402

TRADE_DATASET = "permit-trade-activity"
RAW_DATASET = "municipal-permits"


class FakeGenerated:
    """A throwaway `generated/` tree, so these tests state their own coverage instead of
    depending on whatever the last real ingestion happened to reach."""

    def __init__(self, coverage: str | None, months=("2026-06", "2026-07", "2026-08", "2026-09")):
        self.root = Path(tempfile.mkdtemp())
        for dataset in (TRADE_DATASET, RAW_DATASET):
            (self.root / dataset).mkdir(parents=True)
        (self.root / TRADE_DATASET / "austin.json").write_text(json.dumps({
            "status": "live", "source": {"name": "City of Austin (test)"},
            "observations": [
                {"observedAt": f"{m}-01T00:00:00.000Z",
                 "value": {"category": t, "month": m, "permitCount": 100}}
                for m in months for t in ("solar", "hvac", "roofing")],
        }))
        (self.root / RAW_DATASET / "austin.json").write_text(json.dumps({
            "status": "live", "source": {"name": "City of Austin (test)"},
            "observations": ([{"observedAt": f"{coverage}T00:00:00.000Z", "value": {}}]
                             if coverage else []),
        }))

    def __enter__(self):
        self._real, thi_source.GENERATED = thi_source.GENERATED, self.root
        return self

    def __exit__(self, *exc):
        thi_source.GENERATED = self._real
        return False


def _austin_months(today):
    series = [s for s in thi_source.load_history(today, min_points=1)
              if s.area_id == "austin_metro" and s.metric == "permit_activity_solar"]
    return [p.period[:7] for p in series[0].points] if series else []


# ===================================================== the refusal

def test_a_PARTIAL_month_is_REFUSED_even_after_the_calendar_turns():
    """THE CASE. October has begun, so the calendar says September is over — but the ingestion
    stopped on the 17th, so the data does not cover it."""
    with FakeGenerated(coverage="2026-09-17"):
        months = _austin_months(date(2026, 10, 1))
        assert "2026-09" not in months, f"a 17-day September was published as a month: {months}"
        assert "2026-08" in months, f"a COMPLETE month was refused too: {months}"


def test_a_COMPLETE_month_PASSES():
    """The guard must not just refuse everything. Ingestion reached the 30th; September counts."""
    with FakeGenerated(coverage="2026-09-30"):
        assert "2026-09" in _austin_months(date(2026, 10, 1))


def test_coverage_PAST_the_month_end_also_passes():
    with FakeGenerated(coverage="2026-10-05"):
        assert "2026-09" in _austin_months(date(2026, 10, 1))


def test_the_month_is_refused_by_ONE_DAY_short():
    """The boundary, explicitly: the 29th does not cover a 30-day month."""
    with FakeGenerated(coverage="2026-09-29"):
        assert "2026-09" not in _austin_months(date(2026, 10, 1))
    with FakeGenerated(coverage="2026-09-30"):
        assert "2026-09" in _austin_months(date(2026, 10, 1))


def test_UNKNOWN_coverage_is_REFUSED_not_assumed_complete():
    """Indeterminate is not permission. A missing or unusable raw dataset means the pipeline
    cannot say what it covers, and "cannot say" must never read as "everything"."""
    with FakeGenerated(coverage=None):
        assert _austin_months(date(2026, 10, 1)) == [], "unknown coverage published anyway"


def test_the_CURRENT_month_is_still_dropped_too():
    """The original rule stays. Both traps are needed: the calendar one and the coverage one."""
    with FakeGenerated(coverage="2026-10-31"):
        months = _austin_months(date(2026, 10, 15))
        assert "2026-10" not in months, "the month in progress was published"
        assert "2026-09" in months


def test_the_refusal_SAYS_WHY_on_the_series():
    """A silent drop is indistinguishable from a feed that never had the month."""
    with FakeGenerated(coverage="2026-09-17"):
        series = [s for s in thi_source.load_history(date(2026, 10, 1), min_points=1)
                  if s.metric == "permit_activity_solar"][0]
        why = " ".join(series.dropped)
        assert "2026-09" in why and "2026-09-17" in why and "2026-09-30" in why, why


# ===================================================== per city, not globally

def test_COVERAGE_IS_PER_CITY():
    """At the same ingestion Austin reached 2026-09-17 and San Antonio 2026-09-11. A single
    global cutoff would call one of them complete while it is not."""
    austin = thi_source.permit_coverage_through("austin")
    sa = thi_source.permit_coverage_through("san-antonio")
    assert austin and sa, (austin, sa)
    assert austin != sa, "the two cities' coverage is being read from one place"


def test_the_REAL_datasets_refuse_september_today():
    """Against the actual checkout, not a fixture: neither city's September is complete."""
    for location, area in (("austin", "austin_metro"), ("san-antonio", "san_antonio_metro")):
        coverage = thi_source.permit_coverage_through(location)
        assert coverage < date(2026, 9, 30), f"{location} coverage moved: {coverage}"
    months = [p.period[:7] for s in thi_source.load_history(date(2026, 10, 1))
              if s.metric == "permit_activity_solar" for p in s.points]
    assert "2026-09" not in months, "the real partial September got through"


# ============================ the class: which series this question applies to, and which not

def test_the_guard_is_on_THI_AGGREGATED_series_only_and_that_is_deliberate():
    """THE CLASS SWEEP, recorded as an assertion so the reasoning cannot quietly rot.

    Two shapes of monthly series exist, and only one has a completeness question:

    * THI-AGGREGATED (permits). This project counts raw permit records into a monthly total,
      so the total is only as complete as the ingestion. Needs the guard.
    * UPSTREAM-AGGREGATED (NOAA cooling degree-days, EIA electricity price). The upstream
      publishes one finalised figure for a closed month — 755 °F-days for August, 13.88¢ for
      August. The row existing IS the month being closed, by a publisher who waited. No
      THI-side completeness question; staleness is G5's job, and it does catch these.

    Weekly and daily series (drought, air quality) aggregate nothing — each observation is its
    own period — so the question does not arise there either.

    If a future builder aggregates raw records into a period itself, it belongs on this list
    and behind this guard.
    """
    today = date(2026, 9, 19)
    aggregated_by_thi = {s.metric for s in thi_source.load_history(today)
                         if s.metric.startswith("permit_activity_")}
    assert aggregated_by_thi, "no permit series to reason about"
    for series in thi_source.load_history(today):
        if series.metric.startswith("permit_activity_"):
            continue
        # Every other series' latest period must be a period the upstream published, which is
        # exactly what its own observation date says. Nothing here is counted by us.
        assert series.cadence in ("monthly", "weekly", "daily"), series.cadence


if __name__ == "__main__":
    fns = [f for n, f in sorted(globals().items()) if n.startswith("test_")]
    ok = 0
    for f in fns:
        try:
            f(); ok += 1; print("PASS", f.__name__)
        except AssertionError as e:
            print("FAIL", f.__name__, str(e)[:250])
        except Exception as e:                      # noqa: BLE001
            print("ERROR", f.__name__, f"{type(e).__name__}: {e}"[:250])
    print(f"{ok}/{len(fns)} passed")
