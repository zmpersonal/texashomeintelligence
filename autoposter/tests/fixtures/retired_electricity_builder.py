"""The retired electricity builder, kept ONLY as a deterministic test fixture.

── WHY IT IS HERE AND NOT IN `run_article.py` ────────────────────────────────

It was the project's first article builder. Its article was WITHDRAWN in Round 50 (its solar
sibling in the same round, its own figures in Round 43), and `TOPIC_ARTICLES` overwrites its
registry entry at import time, so production never calls it: `article_engine.run` takes the
builder pair from `articles` whenever one is passed, and `run_autopilot.py` always passes one.

What it still does is produce a FIXED article and claim set — hardcoded `as_of="2026-08-01"`,
pinned to `date(2026, 9, 6)` — which three hardening tests and one posting-path test use to drive
`engine.run` end to end without depending on which topic the live feed happens to rank first. A
test whose base case is live data is pinned to the world; this is how those tests avoid that.

So it is worth keeping and it was NOT worth keeping in `run_article.py`, where it sat as a second
complete article template above the five real ones. The next person reading that file had to work
out which was real, and did.

── WHAT WAS DROPPED IN THE MOVE ──────────────────────────────────────────────

Its `if __name__ == "__main__":` block, which wrote the article into
`autoposter/articles/<slug>/`. That slug is now a 410 Gone, so the block's only effect was to
regenerate retracted copy on demand. Nothing referenced it.

NOT a template to copy. A new builder goes in `run_article.py` and into `TOPIC_ARTICLES`.
"""
from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

import claim_ledger as ledger_mod                 # noqa: E402
from claim_ledger import Claim                     # noqa: E402
from run_article import (                          # noqa: E402
    EIA_DATASET,
    EIA_SOURCE,
    JULY_NORMAL,
    NORMALS_SOURCE,
    NORMALS_URL,
    _pct,
)

SLUG = "are-texas-electricity-prices-still-going-up"


def build_claims(feed: dict, config: dict, today: date) -> list[Claim]:
    """CODE. Reads the feed; performs the arithmetic; records every derivation."""
    import thi_source

    series = {(s.area_id, s.metric): s for s in thi_source.load_history(today)}
    power = series[("texas", "energy_price_cents_kwh")]
    by_month = {p.period[:7]: p.value for p in power.points}

    # THIS BUILDER IS LOCKED TO ONE PERIOD, and says so rather than crashing on a KeyError.
    # Its prose names specific months and specific comparisons, so it is correct for August 2026
    # and for nothing else. It is already published, so the already-written exclusion keeps it
    # from being selected — but if that ever failed, a bare KeyError would look like a bug in
    # the engine rather than a builder refusing work it cannot do.
    if "2026-08" not in by_month or "2025-08" not in by_month:
        raise ledger_mod.LedgerHalt([
            "electricity-still-rising is locked to August 2026: its prose names fixed months and "
            "fixed comparisons, so it cannot be rebuilt for another period. It has already been "
            "published. If a new electricity article is wanted, it needs a period-driven builder "
            "like the recurring three, not this one re-run."])

    now, year_ago = by_month["2026-08"], by_month["2025-08"]
    peak_month = max(by_month, key=lambda m: by_month[m])
    peak = by_month[peak_month]
    may, june = by_month["2026-05"], by_month["2026-06"]

    claims = [
        Claim("C1", "Texas residential electricity averaged 13.88 cents per kilowatt-hour in "
                    "August 2026.",
              tier="data", figure=f"{now:.2f} cents per kilowatt-hour",
              source=EIA_SOURCE, as_of="2026-08-01", metric="energy_price_cents_kwh",
              notes=f"Dataset: {EIA_DATASET}."),
        Claim("C2", "That is lower than a year earlier, not higher.",
              tier="derived", figure=f"down {abs(_pct(now, year_ago)):.1f}% year over year",
              source=EIA_SOURCE, as_of="2026-08-01", metric="energy_price_cents_kwh",
              derivation=f"{now:.2f} (Aug 2026) vs {year_ago:.2f} (Aug 2025) = "
                         f"{_pct(now, year_ago):.1f}%"),
        Claim("C3", "It is also well below this cycle's peak.",
              tier="derived", figure=f"down {abs(_pct(now, peak)):.1f}% from the peak",
              source=EIA_SOURCE, as_of="2026-08-01", metric="energy_price_cents_kwh",
              derivation=f"{now:.2f} (Aug 2026) vs {peak:.2f} (Apr 2026 peak) = "
                         f"{_pct(now, peak):.1f}%"),
        Claim("C4", "Almost the whole decline happened in a single month.",
              tier="derived", figure=f"a {abs(_pct(june, may)):.1f}% fall in one month",
              source=EIA_SOURCE, as_of="2026-08-01", metric="energy_price_cents_kwh",
              derivation=f"{may:.2f} (May 2026) to {june:.2f} (June 2026) = "
                         f"{_pct(june, may):.1f}%"),
    ]

    # The obvious explanation a reader reaches for — "it must have been a mild summer" — is
    # checkable, so it gets checked rather than asserted or ignored.
    for area, label in (("austin_metro", "C5"), ("san_antonio_metro", "C8")):
        cdd = series[(area, "cooling_degree_days")]
        july = {p.period[:7]: p.value for p in cdd.points}["2026-07"]
        normal = JULY_NORMAL[area]
        name = "Austin" if area == "austin_metro" else "San Antonio"
        claims += [
            Claim(label, f"{name} recorded {july:.0f} cooling degree-days in July 2026.",
                  tier="data", figure=f"{july:.0f} cooling degree-days",
                  source=cdd.source, as_of="2026-07-01", metric="cooling_degree_days"),
            Claim(f"{label}n", f"{name}'s July normal is {normal} cooling degree-days.",
                  tier="official", figure=f"{normal} cooling degree-days",
                  source_url=NORMALS_URL,
                  source=NORMALS_SOURCE, as_of="1991-2020", metric="cooling_degree_days",
                  timeless=True,
                  notes="A 1991-2020 climate normal is a fixed reference period, not a current "
                        "reading, so the freshness bound does not apply to it."),
            Claim(f"{label}d", f"{name}'s July was close to its normal, not unusually mild.",
                  tier="derived", figure=f"{_pct(july, normal):+.1f}% against the normal",
                  source=NORMALS_SOURCE, as_of="2026-07-01", metric="cooling_degree_days",
                  derivation=f"{july:.0f} vs {normal} = {_pct(july, normal):+.1f}%"),
        ]

    claims.append(Claim(
        "C9",
        "We cannot say from the data we hold what caused the step down between May and June "
        "2026; the cause is not established here.",
        tier="external", hedged=True,
        notes="A causal explanation would be the single most repeatable wrong thing in this "
              "article. Nothing in THI's feeds measures fuel cost, contract mix, or rate "
              "changes, so the cause is named as unknown rather than guessed at."))
    return claims


def write(topic: dict, claims: list[Claim], feed: dict) -> dict:
    """THE ONE MODEL CALL. Language only; every figure below came from `build_claims`."""
    c = {claim.id: claim for claim in claims}
    body = f"""
## The short answer

**No.** Texas residential electricity is cheaper than it was a year ago, not dearer. The average
residential price in August 2026 was {c['C1'].figure} — {c['C2'].figure}, and
{c['C3'].figure} it hit this spring ({EIA_SOURCE}, as of August 2026).

That cuts against how it feels, which is exactly why it is worth checking rather than assuming.
Below is the series it comes from, and one popular explanation that does not survive contact
with the data.

## What the series shows

The fall was not a slow drift. Almost all of it landed in a single month: 16.44¢ in May 2026 to
13.58¢ in June 2026, {c['C4'].figure} ({EIA_SOURCE}, as of August 2026). Before that, the price
had been grinding upward for most of the year and peaked in April.

Two framings of the same number, and both belong on the page:

- **Against last summer:** 13.88¢ now against 15.46¢ in August 2025 — {c['C2'].figure}.
- **Against the April peak:** 13.88¢ now against 16.99¢ then — {c['C3'].figure}.

## "It must have been a mild summer"

This is the explanation most people reach for. It is checkable, so we checked it.

Cooling degree-days measure how much cooling the weather actually demanded — a hotter month
demands more. Austin recorded {c['C5'].figure} in July 2026
(NOAA NCEI Global Summary of the Month, as of July 2026), against a July normal of
{c['C5n'].figure} ({NORMALS_SOURCE}). That is {c['C5d'].figure}: an ordinary July, not a cool
one.

San Antonio ran a little under its own normal — {c['C8'].figure} against a normal of
{c['C8n'].figure}, or {c['C8d'].figure} — but not nearly enough to explain a fall of this size.

So demand does not account for it. In Austin the summer was normal and the price still dropped.

## What we are not going to tell you

{c['C9'].text} Nothing behind this page measures fuel costs, contract mixes, or regulated rate
changes. We are not going to hand you a reason we did not measure.

The movement is real and sourced. The cause is somebody else's reporting until it is somebody's
data. That distinction is the whole point of this page: a number with a source and a date is
worth something, and a confident story attached to it without one is worth less than nothing.

## What it means for your bill

Your bill is set by your retail plan, not by the state average, so a statewide fall does not
automatically show up on your statement. The calm move: if you are on a fixed plan you signed
when prices were near the April peak, this is a reasonable month to check your renewal rate
against what the market is doing now. Check your plan's end date before you do anything else.
""".strip()

    return {
        "slug": SLUG,
        "title": topic["question"],
        "description": ("Texas residential electricity is cheaper than a year ago, not dearer. "
                        "The sourced series, and why a mild summer is not the explanation."),
        "body": body,
        "canonical_url": f"https://texashomeintelligence.com/analysis/{SLUG}/",
        "embed": {
            "kind": "table",
            "series": "texas/energy_price_cents_kwh",
            "caption": "Texas residential electricity price, cents per kilowatt-hour, by month",
            "component": "DataStatus for provenance + a native <table class=\"data-table\"> "
                         "inside .table-scroll, mirroring layouts/DataSetPage.astro",
            "note": "Rendered from the committed series at build time — no serving-path fetch, "
                    "per THI's COST.md.",
        },
    }
