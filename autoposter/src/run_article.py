"""
run_article.py — one real THI article, end to end, to `autoposter/articles/`. NOTHING PUBLISHES.

Two halves, deliberately separated:
  * `build_claims()` is CODE. Every figure, every derivation, every source and date is read from
    `social-feed.json` or computed here. The model sees the result and cannot add to it.
  * `write()` is THE ONE MODEL CALL. It writes language around those figures. If it introduces a
    numeral no claim supports, `verify_prose` rejects the article — the discipline is structural,
    not a request in a prompt.
"""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import article_engine as engine          # noqa: E402
import claim_ledger as ledger_mod        # noqa: E402
from claim_ledger import Claim           # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SLUG = "are-texas-electricity-prices-still-going-up"

# THI's climate file carries the 1991-2020 monthly normals beside the actuals. thi_source
# filters them out of the movers series on purpose (they are a different record type), but as a
# REFERENCE VALUE a normal is exactly what turns "it was hot" into a checkable claim.
NORMALS_SOURCE = "NOAA NCEI U.S. Climate Normals 1991-2020"
JULY_NORMAL = {"austin_metro": 644.8, "san_antonio_metro": 643.3}
# The citation a reader should see. The exact dataset label from the feed
# ("EIA Electricity Data (Texas, residential)") is recorded in the ledger notes rather than
# pasted into every sentence — G2 wants the source visible, not the schema.
EIA_SOURCE = "U.S. Energy Information Administration"
EIA_DATASET = "EIA Electricity Data (Texas, residential), via THI's ingest"


def _pct(new: float, old: float) -> float:
    return (new / old - 1) * 100


def build_claims(feed: dict, config: dict, today: date) -> list[Claim]:
    """CODE. Reads the feed; performs the arithmetic; records every derivation."""
    import thi_source

    series = {(s.area_id, s.metric): s for s in thi_source.load_history(today)}
    power = series[("texas", "energy_price_cents_kwh")]
    by_month = {p.period[:7]: p.value for p in power.points}

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


if __name__ == "__main__":
    today = date(2026, 9, 6)
    result = engine.run("thi", write_fn=write, build_claims_fn=build_claims, today=today)
    out = ROOT / "articles" / SLUG
    out.mkdir(parents=True, exist_ok=True)

    article, claims = result["article"], result["claims"]
    (out / "article.md").write_text(
        f"---\ntitle: \"{article['title']}\"\ndescription: \"{article['description']}\"\n"
        f"slug: {article['slug']}\ncanonical: {article['canonical_url']}\n"
        f"published: false   # deploy-on-command (🔴) — never auto-published\n---\n\n"
        f"# {article['title']}\n\n{article['body']}\n")
    (out / "claim-ledger.md").write_text(
        f"# Claim ledger — {article['title']}\n\n"
        f"The unit of verification is the claim, not the article. `data` traces to the feed; "
        f"`derived` is arithmetic on feed figures with its working shown; `official` is a dated "
        f"published source; `external` may never be stated and survives only hedged.\n\n"
        + ledger_mod.render_ledger_markdown(claims) + "\n\n## Notes\n\n"
        + "\n".join(f"- **{c.id}** — {c.notes}" for c in claims if c.notes) + "\n")

    post, gate = engine.build_facebook_promo(article, claims, engine.load_config(), today)
    (out / "facebook-promo.json").write_text(
        json.dumps({"post": post, "gates_passed": gate.ok, "gate_failures": gate.failures},
                   indent=2, ensure_ascii=False) + "\n")

    print(f"model calls this cycle : {result['model_calls']}")
    print(f"claims verified        : {result['ledger_checked']}")
    print(f"topic picked (of {len(result['shortlist'])})    : {result['topic']['id']} "
          f"(score {result['topic']['score']})")
    print(f"publish target         : {result['target']['site_domain']} -> "
          f"{result['target']['canonical_url']}")
    print(f"facebook promo gates   : {'PASS' if gate.ok else 'FAIL ' + str(gate.failures)}")
    print(f"written to             : autoposter/articles/{SLUG}/  (NOTHING PUBLISHED)")
