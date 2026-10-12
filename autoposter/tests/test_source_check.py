"""The source check: what a `data` claim is now re-asked, and what happens when it cannot be.

WHAT THIS CLOSES. Until Round 49 the `data` tier asserted a source string and an in-bounds date
and nothing else — nothing had ever compared a published figure to anything outside the article,
so a fabricated row in a dataset file satisfied it by construction. That is Round 43.

THE SHAPE OF THE GATE, and every branch of it is asserted below:

  found + equal      -> `source`
  found + different  -> RAISES. The check ran and disagreed.
  absent             -> RAISES. The source answered and has no such period, which is exactly
                        what a fabricated month looks like.
  unreachable        -> `unverified: ...`, and the cycle PROCEEDS. A check that could not run is
                        not a check that failed, and a federal API being down is not a reason to
                        withhold a correct article (owner, 2026-10-12).
  no checker         -> `file`. Every AGGREGATED figure is here and that is deliberate: the
                        upstream publishes rows and we compute the number, so there is no
                        upstream value to compare against.

Run: python3 tests/test_source_check.py
"""
import os
import re
import pathlib
import sys
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import article_engine as engine            # noqa: E402
import claim_ledger as cl                  # noqa: E402
import run_article                         # noqa: E402
import source_check                        # noqa: E402

CFG, FEED = engine.load_config(), engine.load_feed()
TODAY = date(2026, 10, 12)


def _power():
    return run_article.build_power_claims(FEED, CFG, TODAY)


def _price(claims):
    return next(c for c in claims if c.id == "C1")


def _runner(**verdict):
    return lambda argv: dict({"detail": "stub"}, **verdict)


def _agreeing_runner(claims):
    """A stub that answers each metric with the figure the claim already states.

    One flat value cannot stand in for a whole ledger: the first version returned 15.88 for
    everything and the cooling-degree-day claims then "disagreed" with a price. A stub that
    cannot represent the thing it stands for produces a failure about itself.
    """
    def run(argv):
        metric = argv[argv.index("--metric") + 1]
        period = argv[argv.index("--period") + 1]
        location = argv[argv.index("--location") + 1]
        for claim in claims:
            if claim.metric != metric or (claim.as_of or "")[:7] != period:
                continue
            if metric == "cooling_degree_days":
                place = "san antonio" if location == "san-antonio" else "austin"
                if place not in f"{claim.text}".lower():
                    continue
            return {"status": "found", "value": source_check._numeral(claim.figure),
                    "detail": "stub, answering with the claim's own figure"}
        return {"status": "absent", "value": None, "detail": "stub has no such claim"}
    return run


# ===================================================== the five branches

def test_a_claim_the_SOURCE_AGREES_WITH_is_marked_source():
    claim = _price(_power())
    assert source_check.check(claim, runner=_runner(status="found", value=15.88)) == "source"


def test_a_claim_the_SOURCE_CONTRADICTS_raises():
    claim = _price(_power())
    try:
        source_check.check(claim, runner=_runner(status="found", value=13.88))
    except source_check.SourceMismatch as exc:
        assert "13.88" in str(exc) and claim.figure in str(exc), str(exc)
        return
    raise AssertionError("a figure the source contradicts was accepted")


def test_a_PERIOD_THE_SOURCE_DOES_NOT_HAVE_raises___the_Round_43_case():
    """The seed row claimed August 2026 at a time when the EIA had never published it. `absent`
    is not `unreachable`: the source answered, and what it answered was 'no such month'."""
    claim = _price(_power())
    try:
        source_check.check(claim, runner=_runner(status="absent", value=None))
    except source_check.SourceMismatch as exc:
        assert "has no" in str(exc), str(exc)
        return
    raise AssertionError("a period the source does not hold was accepted")


def test_an_UNREACHABLE_source_FAILS_OPEN_and_says_so():
    claim = _price(_power())
    verdict = source_check.check(claim, runner=_runner(status="unreachable", value=None))
    assert verdict.startswith("unverified:"), verdict
    assert "unreachable" in verdict
    # It carries WHEN, because "unverified" with no timestamp is a state nobody can age out.
    assert "T" in verdict and ":" in verdict, verdict


def test_a_SUBPROCESS_THAT_EXPLODES_also_fails_open():
    """The verifier is a node process. If it cannot start at all, that is still 'could not run'
    and not 'the figure is wrong'."""
    def boom(argv):
        raise OSError("node: command not found")
    verdict = source_check.check(_price(_power()), runner=boom)
    assert verdict.startswith("unverified:") and "OSError" in verdict, verdict


def test_a_metric_with_NO_CHECKER_is_file_verified_and_that_is_deliberate():
    """Permit counts are AGGREGATED: the city publishes rows and we compute the number, so there
    is no upstream value to compare against. Round 49 declined to give them a provenance tier
    they cannot earn — `permitcountunit` guards the aggregation instead."""
    claims = run_article.build_acrush_claims(FEED, CFG, TODAY)
    permits = next(c for c in claims if c.id == "H1")
    assert permits.tier == "data" and permits.metric.startswith("permit_activity_")
    assert source_check.check(permits, runner=_runner(status="found", value=1)) == "file"


# ===================================================== the whole ledger

def test_check_all_STAMPS_EVERY_CLAIM_and_never_leaves_one_blank():
    """A blank `verified` would read as 'not checked' and sort as 'fine'. Every stateable claim
    carries one of the three values after a run."""
    claims = _power()
    summary = source_check.check_all(claims, runner=_agreeing_runner(claims))
    for claim in claims:
        if claim.tier == "external":
            continue
        assert claim.verified, f"{claim.id} came back with no verification state"
        assert (claim.verified in ("source", "file")
                or claim.verified.startswith("unverified:")), claim.verified
    assert sum(summary["counts"].values()) == len([c for c in claims if c.tier != "external"])


def test_an_UNVERIFIED_claim_is_NAMED_in_the_summary_not_just_counted():
    claims = _power()
    summary = source_check.check_all(claims, runner=_runner(status="unreachable", value=None))
    assert summary["counts"]["unverified"] >= 1
    assert summary["unverified"], "the count moved but nothing named which claims"
    assert any("C1" in line for line in summary["unverified"]), summary["unverified"]


def test_the_DRIVER_REFUSES_on_a_disagreement_rather_than_publishing():
    """End to end: a source that contradicts a figure stops the cycle.

    The check runs in `autopilot.evaluate` and not in `article_engine.run`, for the reason every
    other side effect in that module is injected: the engine is exercised by most of the suite,
    and a stage that opens a socket and spawns a node process per claim makes those tests depend
    on both. The engine stays provable without a network; the driver is where the network lives.
    """
    import autopilot, copy, tempfile
    def contradicting(claims):
        raise source_check.SourceMismatch("claim C1 states 15.88 and the source says 13.88")

    cfg = copy.deepcopy(CFG)
    cfg["publish"] = dict(cfg["publish"], published_ledger=tempfile.mkdtemp() + "/empty.json",
                          analysis_dir=tempfile.mkdtemp())
    d = autopilot.evaluate(
        cfg, today=TODAY, write_fn=run_article.write,
        build_claims_fn=run_article.build_claims, articles=run_article.TOPIC_ARTICLES,
        captions=run_article.TOPIC_CAPTIONS, link_opener=lambda u: (True, "ok"),
        media_opener=lambda u: (True, "ok"), verify_fn=contradicting,
        state={"history": []}, env={})
    assert d.action != "publish", d.action
    assert "disagrees" in d.reason, d.reason
    assert any(v.name == "source-check" and not v.ok for v in d.verdicts), [
        v.line() for v in d.verdicts]
    assert "13.88" in " ".join(v.detail for v in d.verdicts)


def test_the_ENGINE_does_NOT_open_a_socket___the_check_belongs_to_the_driver():
    """A structural assertion, because the first version of this round put the check inside the
    engine and the suite went from seconds to minutes: every test that runs the engine started
    spawning a node process per claim, with a 30-second timeout each. That is not a slow test, it
    is a unit suite measuring the network."""
    import inspect
    source = inspect.getsource(engine.run)
    assert "source_check" not in source, (
        "the source check is back in the engine; it belongs in the driver, injected")


# ===================================================== the tiers themselves

def test_OFFICIAL_now_asserts_what_DATA_does_not():
    """Before Round 49 the two tiers ran identical checks — two names for one thing, with the
    methodology page describing a distinction the code did not draw. `official` is a FIXED
    REFERENCE CONSTANT and must say so, and must carry the document a reader can open."""
    base = dict(text="A normal.", figure="644.8 cooling degree-days", source="NOAA",
                as_of="1991-2020", metric="cooling_degree_days",
                notes="a fixed reference period")
    ok = cl.Claim("X", tier="official", timeless=True,
                  source_url="https://www.ncei.noaa.gov/x", **base)
    assert cl.verify_ledger([ok], CFG, TODAY).ok

    no_url = cl.Claim("X", tier="official", timeless=True, **base)
    failures = cl.verify_ledger([no_url], CFG, TODAY).failures
    assert any("source_url" in f for f in failures), failures

    not_timeless = cl.Claim("X", tier="official", source_url="https://x", **dict(base, as_of="2026-09-01"))
    failures = cl.verify_ledger([not_timeless], CFG, TODAY).failures
    assert any("timeless" in f for f in failures), failures

    # ...and `data` is NOT held to either, because a reading is not a reference constant.
    reading = cl.Claim("Y", text="A reading.", figure="695 cooling degree-days", tier="data",
                       source="NOAA", as_of="2026-09-01", metric="cooling_degree_days")
    assert cl.verify_ledger([reading], CFG, TODAY).ok


def test_EVERY_LIVE_OFFICIAL_CLAIM_carries_its_document():
    for name, fn in (("power", run_article.build_power_claims),
                     ("summer", run_article.build_summer_claims)):
        for claim in fn(FEED, CFG, TODAY):
            if claim.tier == "official":
                assert claim.source_url.startswith("http"), (name, claim.id, claim.source_url)


def test_the_DEAD_FEED_GUARD_is_gone_not_merely_unused():
    """`article_engine._metric` raised "absent from the feed — the engine will not invent it"
    and had no caller, so it tied nothing. Round 46 F18's shape. It was deleted rather than
    wired, because what it gestured at is now real: the source check."""
    assert not hasattr(engine, "_metric"), (
        "the dead feed guard is back; wire it or delete it, do not leave it describing a "
        "guarantee it does not provide")


def test_the_WORKFLOW_THAT_RUNS_THE_CYCLE_supplies_every_env_var_the_verifier_reads():
    """The check fails open, so a missing credential is SILENT: every cycle would record
    `unverified` for the EIA claim and the ledger would look like a working gate was running.

    Measured, not hypothetical — Round 49 shipped the source check onto the publishing path
    while `autoposter-cadence.yml` had no `EIA_API_KEY`, and the suite was green. Fail-open
    turns a missing secret into a permanent non-result, which is why this is asserted here
    rather than left to be noticed in a ledger months later.

    Derived from the verifier's own source, so a new keyed source cannot be added without
    either wiring its secret through or failing this test.
    """
    verifier = (pathlib.Path(source_check.__file__).resolve().parents[2]
                / "site" / "scripts" / "verify-claim.ts")
    needed = set(re.findall(r"process\.env\.([A-Z][A-Z0-9_]+)", verifier.read_text()))
    assert needed, "no process.env reads found in verify-claim.ts; this check has gone blind"

    wf = (pathlib.Path(source_check.__file__).resolve().parents[2]
          / ".github" / "workflows" / "autoposter-cadence.yml").read_text()
    # The step that actually runs a cycle, not the whole file: a secret wired into the
    # preflight jobs is not wired into the cycle.
    step = wf.split("name: Run the cycle", 1)
    assert len(step) == 2, "the cycle step was renamed; this check no longer reads it"
    cycle_env = step[1].split("run:", 1)[0]

    missing = sorted(v for v in needed if v not in cycle_env)
    assert not missing, (
        f"the cycle step does not supply {missing}, which verify-claim.ts reads. The source "
        f"check fails open, so this does not fail a run — it silently records `unverified` "
        f"forever. Wire the secret or drop the source.")


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
