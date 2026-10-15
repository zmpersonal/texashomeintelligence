"""Round 52 — the autoposter honours the site's discontinuity record, and the span test is exact.

The autoposter is the half that computes month-over-month and N-month baselines on these series,
so it is the half where a break matters most. The first half of these assert the READER — the
record is read, the span boundaries are exact, the two readers agree. The second half assert the
POLICY the owner chose from the options measured in `docs/audits/round-52-discontinuities.md`:

  A. a month-over-month claim across a break is refused, and says why
  C. a baseline is computed on the near side of the newest break and nothing before it, and is
     withheld entirely when that side is under `MIN_SEGMENT_MONTHS`

Where a policy branch cannot be reached by live data — and under a six-period minimum policy A's
cannot be, because the only series that straddles a break at its near end has one period on the
near side and C drops it first — the series is built here by hand and the branch is driven
directly. A rule that has never run is a rule nobody has checked.
"""
import json
import pathlib
import sys
from datetime import date

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))

import build_feed                                   # noqa: E402
import thi_source                                   # noqa: E402

D, L, S, M = "permit-trade-activity", "austin", "energy_storage", "2026-07"


def test_the_RECORD_IS_READ_at_all():
    rows = thi_source._discontinuities()
    assert rows, "the discontinuity record read empty; this reader has gone blind"
    assert any(r["series"] == S and r["fromMonth"] == M for r in rows), rows


def test_EVERY_BREAK_CARRIES_EVIDENCE_WITH_A_PATH_THAT_EXISTS():
    """The TypeScript type makes `evidence: []` a compile error. This is the Python half of the
    same requirement: a break with no evidence is a rumour, and a rumour here would license
    withholding or relabelling a published figure on a hunch."""
    repo = pathlib.Path(thi_source.REPO_ROOT)
    for r in thi_source._discontinuities():
        ev = r.get("evidence") or []
        assert ev, f"{r.get('series')} carries no evidence"
        assert any(e.get("path") for e in ev), (
            f"{r.get('series')} cites only links; a live document can change under us, which is "
            f"exactly what happened to the thing this break records")
        for e in ev:
            assert e.get("url") or e.get("path"), f"{r.get('series')}: evidence with neither"
            if e.get("path"):
                assert (repo / e["path"]).exists(), f"missing evidence file: {e['path']}"


def test_THE_SPAN_TEST_AT_EVERY_BOUNDARY():
    """A break at M separates months before M from M onward. Mirrors `discontinuityunit.ts` §2 —
    the same boundaries, asserted on the side that computes the baselines."""
    n = lambda a, b: len(thi_source._breaks_spanned(D, L, S, a, b))   # noqa: E731
    assert n("2026-06", "2026-09") == 1, "a straddling span must cross it"
    assert n("2025-09", "2026-06") == 0, "a span ending the month before must not"
    assert n(M, "2026-09") == 0, "a span starting AT the break must not"
    assert n("2026-08", "2026-09") == 0, "a span entirely after must not"
    assert n("2026-06", M) == 1, "the tightest straddle must cross it"
    assert n(M, M) == 0, "a single month at the break must not"
    assert n("2026-09", "2026-06") == 1, "argument order must not matter"


def test_IT_IS_SCOPED_TO_WHAT_IT_AFFECTS():
    assert thi_source._breaks_spanned(D, L, "solar", "2026-06", "2026-09") == []
    assert thi_source._breaks_spanned(D, "san-antonio", S, "2026-06", "2026-09") == []
    assert thi_source._breaks_spanned("noaa-climate", L, "cooling_degree_days",
                                      "2025-09", "2026-09") == []


def test_THE_LIVE_SERIES_CARRY_THE_BREAK_THEY_SPAN():
    """Measured, not assumed: exactly one series the autoposter holds spans this break, and it is
    storage rather than solar. Round 51 measured solar at -0.3 sd across the date — no step — so a
    record that flagged solar too would be overreaching."""
    series = {(s.area_id, s.metric): s for s in thi_source.load_history(date.today())}
    assert series, "no series loaded"
    spanning = {k for k, s in series.items() if s.discontinuities}
    assert ("austin_metro", "permit_activity_energy_storage") in spanning, spanning
    assert ("austin_metro", "permit_activity_solar") not in spanning, (
        "solar was flagged; Round 51 measured no step across this date for it")


def test_THE_JSON_TWIN_IS_THE_ONLY_THING_PYTHON_PARSES():
    """`withdrawnArticles.ts` is read from here by regex and it took two attempts to get right for
    a second entry. A tolerant TypeScript parser is a second definition of one fact. This asserts
    the reader stays on the JSON, whose agreement with the module is a build-time check."""
    # Behavioural, not prose. The first cut grepped the module for the string
    # "discontinuities.ts" and failed because a DOCSTRING mentions it — a test that reads comments
    # fails for reasons that are not defects, which is its own small version of this round's
    # subject.
    twin = pathlib.Path(thi_source._DISCONTINUITIES_JSON)
    assert twin.suffix == ".json", f"the reader points at {twin.suffix}, not a JSON twin"
    assert twin.exists() and json.loads(twin.read_text()), twin
    # And the loader must survive the file being absent, which is a fresh checkout.
    missing = thi_source._DISCONTINUITIES_JSON
    try:
        thi_source._DISCONTINUITIES_JSON = missing.with_name("does-not-exist.json")
        assert thi_source._discontinuities() == [], "an absent record must read as empty, not raise"
    finally:
        thi_source._DISCONTINUITIES_JSON = missing


# ─────────────────────────────────────────────────────────────────────────────
# §6 THE POLICY. A for month-over-month, C for baselines (owner, Round 52).
# ─────────────────────────────────────────────────────────────────────────────

#: The site's own definition of the minimum. In `tradeSegments.ts` rather than
#: `tradeActivity.ts` because the pure half had to move out of reach of `import.meta.glob`
#: to be testable at all — see that module's header.
_TRADE_SEGMENTS_TS = (
    pathlib.Path(__file__).resolve().parents[2] / "site" / "src" / "lib" / "tradeSegments.ts")


def _series(months: list[tuple[str, float]], *, breaks: list[dict] | None = None,
            metric: str = "permit_activity_energy_storage", cadence: str = "monthly"):
    """A permit series built by hand, so a branch live data cannot reach can be driven."""
    return thi_source.Series(
        area_id="austin_metro", metric=metric,
        points=[thi_source.Point(f"{m}-01", v) for m, v in months],
        source="hand-built for a test", as_of=f"{months[-1][0]}-01",
        unit="permits/month", cadence=cadence, discontinuities=breaks or [])


_BREAK = {"datasetId": D, "location": L, "series": S, "fromMonth": M,
          "what": "a hand-built copy of the live record"}


def test_THE_MINIMUM_IS_ONE_NUMBER_NOT_TWO():
    """The site reader's constant and this one are the same policy. Two definitions of one
    policy in two languages is the defect this project keeps finding — the mapping version's
    reading half (Round 45), the ledger tier's (Round 49) — so the number is read out of the
    other reader rather than typed twice."""
    src = _TRADE_SEGMENTS_TS.read_text()
    found = [line for line in src.splitlines() if "MIN_SEGMENT_MONTHS =" in line]
    assert len(found) == 1, f"expected one definition in tradeSegments.ts, found {found}"
    ts_value = int(found[0].split("=")[1].strip().rstrip(";"))
    assert ts_value == thi_source.MIN_SEGMENT_MONTHS, (
        f"the site withholds under {ts_value} periods, the autoposter under "
        f"{thi_source.MIN_SEGMENT_MONTHS} — one policy, one number")


def test_C_THE_SEGMENT_IS_THE_NEAR_SIDE_AND_THE_MINIMUM_BITES_AT_THE_BOUNDARY():
    months = [(f"2026-{m:02d}", 10.0) for m in range(1, 10)]          # 2026-01 .. 2026-09
    spanning = _series(months, breaks=[_BREAK])
    assert [p.period[:7] for p in spanning.current_segment] == ["2026-07", "2026-08", "2026-09"]
    assert spanning.withheld, "three periods on the near side is under the minimum"
    assert "2026-07" in spanning.withheld and str(thi_source.MIN_SEGMENT_MONTHS) in spanning.withheld

    # Exactly at the minimum it publishes; one short of it, it does not. The boundary is the
    # policy, so it is asserted at the boundary rather than near it.
    at = _series([(f"2026-{m:02d}", 10.0) for m in range(7, 13)], breaks=[_BREAK])
    assert len(at.current_segment) == thi_source.MIN_SEGMENT_MONTHS
    assert at.withheld is None
    under = _series([(f"2026-{m:02d}", 10.0) for m in range(7, 12)], breaks=[_BREAK])
    assert len(under.current_segment) == thi_source.MIN_SEGMENT_MONTHS - 1
    assert under.withheld

    # And it applies to a series that spans a break and to no other: a short UNBROKEN series
    # is governed by the existing history_min_weeks gate, which this round did not touch.
    assert _series(months[:3]).withheld is None


def test_A_THE_MOM_SPAN_IS_EXACT_AND_THE_FIGURE_REFUSES_TO_STATE_ONE():
    """Policy A, driven directly. No live series can reach this branch — see the module
    docstring — so the straddling series is built here and the figure string read back."""
    straddles = _series([("2026-05", 4.0), ("2026-06", 6.0), ("2026-07", 92.0)],
                        breaks=[_BREAK])
    assert [d["fromMonth"] for d in straddles.mom_breaks] == [M]
    figure = build_feed._figure(straddles, 86.0, None)
    assert "92 battery-storage permits in 2026-07" in figure
    assert "month over month withheld" in figure
    assert "%" not in figure, f"a refused comparison must state no percentage: {figure}"

    # One month later the two periods are both on the near side and the claim is comparable
    # again — the refusal is about the span, not about the series.
    inside = _series([("2026-06", 6.0), ("2026-07", 92.0), ("2026-08", 146.0)], breaks=[_BREAK])
    assert inside.mom_breaks == []
    assert "% month over month" in build_feed._figure(inside, 54.0, None)


def test_C_THE_FEED_PUBLISHES_THE_READING_AND_WITHHOLDS_THE_COMPARISON():
    spanning = _series([(f"2026-{m:02d}", 10.0 * m) for m in range(1, 10)], breaks=[_BREAK])
    metric = build_feed._area_metric(spanning)
    assert metric["value"] == 90.0, "the current reading is a fact and is still published"
    assert "vs_baseline" not in metric, "a baseline across a break is not emitted"
    assert any(w.startswith("vs_baseline:") for w in metric["withheld"])
    assert "mom" in metric, "the last two periods are both on the near side — mom stands"

    # The near side only, and arithmetically so. 2026-01..2026-12 at 10×month, break at
    # 2026-07: the segment is 70..120, so the baseline is the mean of 70,80,90,100,110 = 90
    # and the newest reading is 30 above it. Across the whole series it would be 55 above.
    publishable = _series([(f"2026-{m:02d}", 10.0 * m) for m in range(1, 13)], breaks=[_BREAK])
    assert build_feed._area_metric(publishable)["vs_baseline"] == 30.0

    # An unbroken series is untouched: the baseline is still every earlier period —
    # 90 against the mean of 10..80, which is 45.
    plain = _series([(f"2026-{m:02d}", 10.0 * m) for m in range(1, 10)])
    assert build_feed._area_metric(plain)["vs_baseline"] == 45.0
    assert "withheld" not in build_feed._area_metric(plain)


def test_AN_OMITTED_FIELD_ALWAYS_SAYS_WHY():
    """The guard that makes 'nothing is dropped silently' a property of the code rather than
    of my having remembered. Run with a silent omission, since no input to `_area_metric`
    produces one."""
    raised = False
    try:
        build_feed.assert_states_its_omissions({"value": 1.0}, set(), ["mom"], "austin/x")
    except AssertionError as e:
        raised, message = True, str(e)
    assert raised, "a field absent with no stated reason must not pass"
    assert "does not say why" in message
    # And it passes on both honest shapes — computed, or absent with a reason.
    build_feed.assert_states_its_omissions({"mom": 1.0}, set(), ["mom"], "austin/x")
    build_feed.assert_states_its_omissions({}, {"mom"}, ["mom"], "austin/x")


def test_C_A_WITHHELD_SERIES_IS_NOT_RANKED():
    """Ranking is a comparison too. `self_deviation` measures the newest period against its
    own history, and across a source change that history is a different instrument — which is
    how 4 permits in May against 188 in September would have become the week's top story."""
    cfg = build_feed.load_config()
    withheld = _series([(f"2026-{m:02d}", v) for m, v in
                        [(1, 4.0), (2, 4.0), (3, 6.0), (4, 4.0), (5, 4.0), (6, 8.0),
                         (7, 92.0), (8, 146.0), (9, 188.0)]], breaks=[_BREAK])
    plain = _series([(f"2026-{m:02d}", 100.0 + m) for m in range(1, 10)],
                    metric="permit_activity_roofing")
    rows = build_feed.build_rows([withheld, plain], cfg, {"austin_metro": 0.9}, date(2026, 10, 15))
    assert [r["metric"] for r in rows] == ["permit_activity_roofing"], (
        "a series whose near side cannot be compared within must not be ranked")
    # Non-vacuity: the same series without the record IS ranked, so the drop is the policy
    # and not the shape of the numbers.
    ranked = build_feed.build_rows([_series([(p.period[:7], p.value) for p in withheld.points])],
                                   cfg, {"austin_metro": 0.9}, date(2026, 10, 15))
    assert len(ranked) == 1


def test_A_AND_C_HALT_THE_ARTICLE_BUILDERS():
    """A builder that would compare across a break stops instead of quietly writing the piece
    about the trades that are left — its verdicts are chosen by sorting the trades, so a
    silently shorter sort changes what it asserts without anyone deciding to."""
    import run_article

    good = {t: _series([(f"2026-{m:02d}", 100.0 + m) for m in range(1, 10)],
                       metric=f"permit_activity_{t}") for t in ("solar", "hvac", "roofing")}
    original = thi_source.load_history
    try:
        thi_source.load_history = lambda *a, **k: list(good.values())
        facts = run_article._permit_facts(date(2026, 10, 15))
        assert facts["solar"]["months"] == 8, "an unbroken series is unchanged"

        hurt = dict(good)
        hurt["solar"] = _series([(f"2026-{m:02d}", 100.0 + m) for m in range(1, 10)],
                                metric="permit_activity_solar",
                                breaks=[{**_BREAK, "series": "solar"}])
        thi_source.load_history = lambda *a, **k: list(hurt.values())
        halted = False
        try:
            run_article._permit_facts(date(2026, 10, 15))
        except RuntimeError as e:
            halted, message = True, str(e)
        assert halted, "a withheld trade must halt the builder, not be dropped from it"
        assert "withheld" in message and "solar" in message
    finally:
        thi_source.load_history = original


def test_A_RECORDED_BREAK_NO_LOADER_READS_HALTS_THE_RUN():
    """The coverage assertion. `_breaks_spanned` is wired into the permit loader and no other,
    so a break recorded for drought tomorrow would be read by nobody and every drought figure
    would be computed straight across it in silence. A check that fails open needs a separate
    assertion that it can run."""
    original = thi_source._discontinuities
    try:
        thi_source._discontinuities = lambda: [{**_BREAK, "datasetId": "usdm-drought"}]
        raised = False
        try:
            thi_source._assert_every_break_is_read()
        except RuntimeError as e:
            raised, message = True, str(e)
        assert raised, "a break for a dataset no loader honours must not load quietly"
        assert "usdm-drought" in message
    finally:
        thi_source._discontinuities = original
    # The live record passes, which is what makes the test above a measurement of coverage
    # rather than of the string.
    thi_source._assert_every_break_is_read()


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
    print(f"{ok}/{len(fns)} passed")
    sys.exit(0 if ok == len(fns) else 1)
