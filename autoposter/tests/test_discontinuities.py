"""Round 52 — the autoposter honours the site's discontinuity record, and the span test is exact.

The autoposter is the half that computes month-over-month and N-month baselines on these series,
so it is the half where a break matters most. These assert the READER, not a policy: what a
builder should do with a spanned break is an owner decision (see
`docs/audits/round-52-discontinuities.md`). What must be true now is that the record is read, the
span boundaries are right, and the two readers agree.
"""
import json
import pathlib
import sys
from datetime import date

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))

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
