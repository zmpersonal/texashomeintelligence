"""source_check.py — re-ask the SOURCE for the figures a claim cites (Round 49).

WHAT THIS CLOSES. The ledger's `data` tier asserted a source string and an in-bounds date and
nothing else; nothing had ever compared a published figure to anything outside the article. A
fabricated row in a dataset file satisfied it by construction, which is Round 43.

HOW IT ASKS. It shells out to `site/scripts/verify-claim.ts`, which calls THE PROJECT'S OWN
FETCHER for each request. That is the whole design and it is per-request, not per-file: Round
49's probe imported one request builder and then rebuilt another by hand in the same file,
omitted `units=standard`, and reported a correct 695 degF-days as a wrong 386.3 degC-days. A
gate that cries wolf about correct figures gets switched off.

WHAT A MATCH PROVES, exactly. That the file agrees with what the fetcher gets today. It catches
a fabricated row, a stale capture, an upstream revision, and a period the source does not have.
It does NOT catch a bug in the fetcher, because both sides share it — that is what property
assertions over the aggregation are for. Stated here because the ledger cites this.

FAILS OPEN. Unreachable is recorded and the cycle proceeds; a check that could not run is not a
check that failed. A check that RAN and disagreed raises.
"""
from __future__ import annotations

import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT.parent / "site"
VERIFIER = SITE / "scripts" / "verify-claim.ts"

# Seconds. Generous against the measured cost — Round 49 measured 234-306ms per request against
# EIA and NOAA — and short enough that a hanging source cannot stall a cycle.
TIMEOUT = 30

#: Which metric each source check knows how to ask about, and which dataset file holds the
#: station or series it asks for. A metric absent from here is `file`-verified by definition,
#: which is every AGGREGATED figure: the upstream publishes rows, we compute the number, and
#: there is no upstream value to compare against.
CHECKABLE = {
    "energy_price_cents_kwh": "texas",
    "cooling_degree_days": None,          # location comes from the claim's own source text
}

VERIFIED_SOURCE = "source"
VERIFIED_FILE = "file"


def _unverified(reason: str) -> str:
    return f"unverified: {reason} at {datetime.now(timezone.utc).isoformat(timespec='seconds')}"


class SourceMismatch(Exception):
    """The check RAN and disagreed. Not a fail-open case — this is the Round 43 shape."""


def _location_for(claim) -> str:
    """Which metro's file a cooling-degree-day claim is about.

    Read off the claim's own text rather than passed in, because the builders already name the
    place in the sentence and a second channel for the same fact is a second thing to get wrong.
    """
    text = f"{claim.text} {claim.notes}".lower()
    if "san antonio" in text:
        return "san-antonio"
    if "austin" in text:
        return "austin"
    return ""


def check(claim, *, runner=None) -> str:
    """Return the `verified` value for one claim. Raises `SourceMismatch` on a real disagreement.

    `runner` is injected so the whole path is testable without a network or a node process.
    """
    if claim.tier != "data" or not claim.metric or claim.metric not in CHECKABLE:
        return VERIFIED_FILE
    if not claim.as_of or len(claim.as_of) < 7:
        return VERIFIED_FILE
    period = claim.as_of[:7]
    location = CHECKABLE[claim.metric] or _location_for(claim)
    if not location:
        return _unverified(f"no location resolved for {claim.id}")

    argv = ["npx", "tsx", str(VERIFIER), "--metric", claim.metric,
            "--location", location, "--period", period]
    try:
        run = (runner or _run)(argv)
    except Exception as exc:                        # noqa: BLE001
        return _unverified(f"{type(exc).__name__}: {str(exc)[:400]}")
    if run is None:
        return _unverified("the verifier produced no verdict")

    status, value = run.get("status"), run.get("value")
    if status in ("unreachable", "unsupported"):
        # 400, not 120: see the note in verify-claim.ts. The reason has to survive to be read.
        return _unverified(f"{status}: {str(run.get('detail'))[:400]}")
    if status == "absent":
        # THE ROUND 43 CASE. The source answered and has no such period — which is exactly what
        # a fabricated month looks like. Not a fail-open.
        raise SourceMismatch(
            f"claim {claim.id}: the source answered and has no {period} value for "
            f"{claim.metric!r}. {run.get('detail')}")
    if status == "found":
        ours = _numeral(claim.figure)
        if ours is None:
            return _unverified(f"could not read a numeral out of {claim.figure!r}")
        if value is None or abs(float(value) - ours) > 0.005:
            raise SourceMismatch(
                f"claim {claim.id} states {claim.figure!r} and the source says {value!r} for "
                f"{period}. {run.get('detail')}")
        return VERIFIED_SOURCE
    return _unverified(f"unrecognised verdict {status!r}")


def _numeral(figure: str) -> float | None:
    import re
    match = re.search(r"-?[\d,]*\d(?:\.\d+)?", figure or "")
    return float(match.group(0).replace(",", "")) if match else None


def _run(argv: list[str]) -> dict | None:
    out = subprocess.run(argv, cwd=SITE, capture_output=True, text=True, timeout=TIMEOUT)
    line = (out.stdout or "").strip().splitlines()
    if not line:
        raise RuntimeError(f"verifier printed nothing (exit {out.returncode}): "
                           f"{(out.stderr or '')[:160]}")
    return json.loads(line[-1])


def check_all(claims, *, runner=None) -> dict:
    """Stamp `verified` on every claim and summarise. Raises on the first real disagreement."""
    counts = {VERIFIED_SOURCE: 0, VERIFIED_FILE: 0, "unverified": 0}
    unverified: list[str] = []
    for claim in claims:
        if claim.tier == "external":
            continue
        if claim.tier == "official":
            # A fixed reference constant is not re-asked: a 1991-2020 normal is the same number
            # forever, and the tier already requires the document a reader can open.
            claim.verified = VERIFIED_FILE
            counts[VERIFIED_FILE] += 1
            continue
        if claim.tier == "derived":
            claim.verified = VERIFIED_FILE
            counts[VERIFIED_FILE] += 1
            continue
        claim.verified = check(claim, runner=runner)
        if claim.verified.startswith("unverified"):
            counts["unverified"] += 1
            unverified.append(f"{claim.id} ({claim.metric}): {claim.verified}")
        else:
            counts[claim.verified] += 1
    return {"counts": counts, "unverified": unverified}
