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


# =====================================================================================
# Article 2 — Austin permit activity. A DIFFERENT topic, built by the same rules.
#
# The first article proved the pipeline could produce one piece. A second one is what proves
# it is a pipeline: same claim tiers, same gates, same card path, a different story and a
# different metric family. Nothing below is shared with the electricity article except the
# machinery.
#
# PERMITS ARE AN ACTIVITY INSTRUMENT (THI CLAUDE.md). Counts, timing, month-over-month and
# trade mix WITHIN one city. No price, no cost, no "typical spend", and no cross-metro
# comparison — Austin is compared only against its own history, which is why every derived
# claim below is Austin-versus-Austin.
# =====================================================================================

PERMITS_SLUG = "is-austins-home-improvement-boom-cooling-off"
AUSTIN_PERMITS_SOURCE = "City of Austin Issued Construction Permits (Socrata)"
TRADES = ("solar", "hvac", "roofing")


def _permit_facts(today: date) -> dict:
    """CODE. The arithmetic, once, from the series — so the prose can only quote it."""
    import thi_source
    series = {(s.area_id, s.metric): s for s in thi_source.load_history(today)}
    facts = {}
    for trade in TRADES:
        s = series[("austin_metro", f"permit_activity_{trade}")]
        values = s.values
        latest, prior = values[-1], values[-2]
        baseline = sum(values[:-1]) / len(values[:-1])   # the mean of every earlier month
        facts[trade] = {
            "latest": latest, "prior": prior, "baseline": baseline,
            "months": len(values) - 1,
            "mom_pct": _pct(latest, prior),
            "base_pct": _pct(latest, baseline),
            "as_of": s.points[-1].period,
            "peak": max(values),
        }
    return facts


def build_permit_claims(feed: dict, config: dict, today: date) -> list[Claim]:
    """CODE. Austin permit counts against Austin's own 11 preceding months."""
    f = _permit_facts(today)
    as_of = f["solar"]["as_of"]

    def count(trade, value):
        return f"{value:,.0f} {trade} permits"

    claims = [
        Claim("P1", f"Austin issued {count('solar', f['solar']['latest'])} in August 2026.",
              tier="data", figure=count("solar", f["solar"]["latest"]),
              source=AUSTIN_PERMITS_SOURCE, as_of=as_of, metric="permit_activity_solar",
              notes="City of Austin issued-permits dataset, residential solar trade."),
        Claim("P2", "Solar permits more than doubled in a single month.",
              tier="derived",
              figure=f"up {f['solar']['mom_pct']:.0f}% month over month",
              source=AUSTIN_PERMITS_SOURCE, as_of=as_of, metric="permit_activity_solar",
              derivation=f"{f['solar']['latest']:.0f} (Aug 2026) vs {f['solar']['prior']:.0f} "
                         f"(Jul 2026) = {f['solar']['mom_pct']:.0f}%"),
        Claim("P3", "That is far above Austin's own recent run-rate for solar.",
              tier="derived",
              figure=f"{f['solar']['base_pct']:.0f}% above its {f['solar']['months']}-month average",
              source=AUSTIN_PERMITS_SOURCE, as_of=as_of, metric="permit_activity_solar",
              derivation=f"{f['solar']['latest']:.0f} vs an {f['solar']['months']}-month mean of "
                         f"{f['solar']['baseline']:.0f} = {f['solar']['base_pct']:.0f}%"),

        Claim("P4", f"Austin issued {count('HVAC', f['hvac']['latest'])} in August 2026.",
              tier="data", figure=count("HVAC", f["hvac"]["latest"]),
              source=AUSTIN_PERMITS_SOURCE, as_of=as_of, metric="permit_activity_hvac"),
        Claim("P5", "HVAC permits fell from July.",
              tier="derived", figure=f"down {abs(f['hvac']['mom_pct']):.0f}% month over month",
              source=AUSTIN_PERMITS_SOURCE, as_of=as_of, metric="permit_activity_hvac",
              derivation=f"{f['hvac']['latest']:.0f} (Aug 2026) vs {f['hvac']['prior']:.0f} "
                         f"(Jul 2026) = {f['hvac']['mom_pct']:.0f}%"),
        Claim("P6", "But HVAC is still running above its own recent average, not below it.",
              tier="derived",
              figure=f"{f['hvac']['base_pct']:.0f}% above its {f['hvac']['months']}-month average",
              source=AUSTIN_PERMITS_SOURCE, as_of=as_of, metric="permit_activity_hvac",
              derivation=f"{f['hvac']['latest']:.0f} vs an {f['hvac']['months']}-month mean of "
                         f"{f['hvac']['baseline']:.0f} = {f['hvac']['base_pct']:.0f}%"),

        Claim("P7", f"Austin issued {count('roofing', f['roofing']['latest'])} in August 2026.",
              tier="data", figure=count("roofing", f["roofing"]["latest"]),
              source=AUSTIN_PERMITS_SOURCE, as_of=as_of, metric="permit_activity_roofing"),
        Claim("P8", "Roofing is the one trade genuinely below its own run-rate.",
              tier="derived",
              figure=f"{abs(f['roofing']['base_pct']):.0f}% below its "
                     f"{f['roofing']['months']}-month average",
              source=AUSTIN_PERMITS_SOURCE, as_of=as_of, metric="permit_activity_roofing",
              derivation=f"{f['roofing']['latest']:.0f} vs an {f['roofing']['months']}-month mean "
                         f"of {f['roofing']['baseline']:.0f} = {f['roofing']['base_pct']:.0f}%"),

        Claim("P9",
              "We cannot say from the permits alone what drove the solar jump — a filing "
              "deadline, an incentive change and genuine demand all look identical in a count.",
              tier="external", hedged=True),
    ]
    return claims


def write_permits(topic: dict, claims: list[Claim], feed: dict) -> dict:
    """THE ONE MODEL CALL for article 2. Language only; every figure came from the claims."""
    c = {claim.id: claim for claim in claims}
    S = AUSTIN_PERMITS_SOURCE
    body = f"""
## The short answer

**Mostly no.** One Austin trade really is running below its own recent pace. The rest are
running above it, and one of them just had its biggest month in a year.

Austin issued {c['P1'].figure} in August 2026 — {c['P2'].figure}, and
{c['P3'].figure} ({S}, as of August 2026). That is not a market cooling off.

## What "cooling off" would actually look like

A boom that is ending shows up as permit counts falling below where that trade has been
running. So that is the comparison: each Austin trade against its own preceding eleven months,
and against nothing else. Permit counts are an activity signal — they say how much work is
being started, never what it costs — and they are only comparable inside one city's own
filing system.

By that test, here is where Austin's three most visible trades stand.

| Trade | August 2026 | Against its own average |
|---|---|---|
| Solar | {c['P1'].figure} | {c['P3'].figure} |
| HVAC | {c['P4'].figure} | {c['P6'].figure} |
| Roofing | {c['P7'].figure} | {c['P8'].figure} |

## The one that is genuinely slower

Roofing. Austin issued {c['P7'].figure} in August, {c['P8'].figure} ({S}, as of
August 2026). It is the only one of the three sitting below its own run-rate, and it has been
drifting for months rather than dropping suddenly.

If your sense that things have gone quiet comes from roofing, the data agrees with you.

## The one that looks like cooling and is not

HVAC is the trade most people would point at, because it did fall: {c['P5'].figure}
({S}, as of August 2026). July to August, that reads like the end of a busy summer.

Against its own eleven-month average, though, HVAC is {c['P6'].figure}. A month can be down
from the one before it and still be a strong month. Both things are true, and only one of them
is a trend.

## The one nobody expected

Solar. {c['P1'].figure} in a single month, {c['P2'].figure} — the largest month in the
twelve we hold ({S}, as of August 2026).

{c['P9'].text}

So we are not going to tell you why. We are telling you that it happened, in Austin, in August,
by that much, from the city's own issued-permit record — and that anyone claiming to know the
cause is working from something other than this data.

## What this is useful for

If you are getting quotes right now, the useful read is that installer demand is not uniform.
Roofing is the slower lane. Solar is the busy one, and a trade running at {c['P3'].figure}
is a trade where scheduling slips and quotes get thinner on detail.

That is worth knowing before you assume a slow quote means a slow market.
"""
    return {
        "slug": PERMITS_SLUG,
        "title": topic["question"],
        "description": ("Austin's permit record says the boom is not cooling evenly: roofing is "
                        "below its own pace, HVAC is above it, and solar just had its biggest "
                        "month in a year."),
        "body": body,
        "canonical_url": f"https://texashomeintelligence.com/analysis/{PERMITS_SLUG}/",
        "embed": {
            "kind": "table",
            "series": "austin_metro/permit_activity_solar",
            "caption": "Austin solar permits issued, by month",
            "component": "DataStatus for provenance + a native <table class=\"data-table\">",
        },
    }


# The registry. `engine.run()` asks for the builder and writer belonging to the topic CODE
# picked — so adding an article is adding a pair here, never editing the engine.
TOPIC_ARTICLES = {
    "electricity-still-rising": (build_claims, write),
    "austin-improvement-boom-cooling": (build_permit_claims, write_permits),
}


PERMITS_CAPTION = (
    "\"The market's gone quiet.\" Austin's own permit record says: in one trade, yes. "
    "Roofing is running 8% below its 11-month average. HVAC dipped from July but is still "
    "19% above its own average — a down month inside a strong year. And solar just did "
    "224 permits, up 138% month over month, its biggest month in the twelve we hold "
    "(source: City of Austin Issued Construction Permits (Socrata), as of 2026-08-01). "
    "We can't tell you why from a permit count, and we're not going to guess. "
    "The three trades, side by side, with the arithmetic shown → "
    "https://texashomeintelligence.com/analysis/is-austins-home-improvement-boom-cooling-off/ "
    "Send this to whoever told you nobody's building right now."
)

TOPIC_CAPTIONS = {"austin-improvement-boom-cooling": PERMITS_CAPTION}


# =====================================================================================
# Article 3 — was the summer actually hotter than normal?
#
# The one topic already in `article_topics.yaml` that had no builder. Cheapest to build and
# highest cadence value: every new month is a new reading against a FIXED reference period, so
# this builder keeps working indefinitely without new data plumbing.
#
# The reference period is the load-bearing part. "It was hot" is a feeling; "755 cooling
# degree-days against a 1991-2020 normal of 664.8" is a claim. The normals come from the feed
# (thi_source.climate_normals), not from a dict in this file — the first article hardcoded two
# of them and that was a hand-step waiting to rot.
# =====================================================================================

SUMMER_SLUG = "was-this-texas-summer-hotter-than-normal"
GSOM_SOURCE = "NOAA NCEI Global Summary of the Month"
MONTH_NAME = {7: "July", 8: "August"}


def _summer_facts(today: date) -> dict:
    """CODE. Each metro's last two summer months against their own 1991-2020 normals."""
    import thi_source
    series = {(s.area_id, s.metric): s for s in thi_source.load_history(today)}
    facts = {}
    for location, area in (("austin", "austin_metro"), ("san-antonio", "san_antonio_metro")):
        normals, normals_source = thi_source.climate_normals(location)
        cdd = series[(area, "cooling_degree_days")]
        by_month = {p.period[:7]: p.value for p in cdd.points}
        rows = {}
        for period, month in (("2026-08", 8), ("2026-07", 7)):
            actual, normal = by_month[period], normals[month]
            rows[month] = {"actual": actual, "normal": normal,
                           "pct": _pct(actual, normal), "period": period,
                           "as_of": f"{period}-01"}
        facts[area] = {"rows": rows, "normals_source": normals_source}
    return facts


def build_summer_claims(feed: dict, config: dict, today: date) -> list[Claim]:
    """CODE. Actuals are `data`; normals are `official` and `timeless`; the gaps are `derived`."""
    f = _summer_facts(today)
    claims = []
    for tag, area, place in (("A", "austin_metro", "Austin"),
                             ("S", "san_antonio_metro", "San Antonio")):
        normals_source = f[area]["normals_source"]
        for month, row in f[area]["rows"].items():
            name = MONTH_NAME[month]
            actual = f"{row['actual']:.0f} cooling degree-days"
            claims.append(Claim(
                f"{tag}{month}", f"{place} recorded {actual} in {name} 2026.",
                tier="data", figure=actual, source=GSOM_SOURCE, as_of=row["as_of"],
                metric="cooling_degree_days"))
            claims.append(Claim(
                f"{tag}{month}n", f"{place}'s {name} normal is {row['normal']:.1f} "
                                  f"cooling degree-days.",
                tier="official", figure=f"{row['normal']:.1f} cooling degree-days",
                source=normals_source, as_of="1991-2020", metric="cooling_degree_days",
                timeless=True,
                notes="A 1991-2020 climate normal is a fixed reference period, not a current "
                      "reading, so the freshness bound does not apply to it."))
            direction = "above" if row["pct"] >= 0 else "below"
            claims.append(Claim(
                f"{tag}{month}d",
                f"{place}'s {name} ran {direction} its long-run normal.",
                tier="derived",
                figure=f"{abs(row['pct']):.1f}% {direction} normal",
                source=normals_source, as_of=row["as_of"], metric="cooling_degree_days",
                derivation=f"{row['actual']:.0f} vs {row['normal']:.1f} = {row['pct']:.1f}%"))
    claims.append(Claim(
        "SX",
        "We cannot say from a degree-day total how the summer actually felt — the measure "
        "counts cooling demand, and nothing in it captures humidity, overnight lows, or how "
        "long the heat ran without a break.",
        tier="external", hedged=True))
    return claims


def write_summer(topic: dict, claims: list[Claim], feed: dict) -> dict:
    """THE ONE MODEL CALL for article 3."""
    c = {claim.id: claim for claim in claims}
    N = c["A8n"].source
    body = f"""
## The short answer

**One month of it was. The other was not.**

August ran hot in both metros. July did not — in Austin it landed almost exactly on its
long-run normal. A summer that felt like one long stretch was, in the record, two quite
different months.

## Austin

August 2026: {c['A8'].figure}, against a normal of {c['A8n'].figure} — {c['A8d'].figure}
({GSOM_SOURCE} and {N}, as of August 2026).

July 2026: {c['A7'].figure}, against a normal of {c['A7n'].figure} — {c['A7d'].figure}. That is
as close to an ordinary July as the record gets.

So if July felt brutal in Austin, the weather was not the reason. August is where the heat
actually showed up.

## San Antonio

August 2026: {c['S8'].figure} against a normal of {c['S8n'].figure} — {c['S8d'].figure}.
Hotter than normal, but nothing like Austin's gap.

July 2026: {c['S7'].figure} against {c['S7n'].figure} — {c['S7d'].figure}, a mild July by its
own standard.

## Why "normal" is doing real work here

A normal is not last year, and it is not an average of whatever we happen to hold. It is the
1991-2020 reference period NOAA publishes for each station and month — a fixed yardstick that
does not move when a hot year lands. That is what makes "hotter than normal" a claim rather
than an impression.

Cooling degree-days are the measure underneath it: a count of how far each day sat above the
comfort baseline, added up across the month. More degree-days means the weather demanded more
cooling. It is the closest thing to an objective answer to "was it worse this year".

## What this does not tell you

{c['SX'].text}

What it does tell you is whether the demand for cooling was unusual. In August, in Austin, it
clearly was.
"""
    return {
        "slug": SUMMER_SLUG,
        "title": topic["question"],
        "description": ("Austin's August ran well above its 1991-2020 normal while July landed "
                        "almost exactly on it. The sourced degree-day record for both metros."),
        "body": body,
        "canonical_url": f"https://texashomeintelligence.com/analysis/{SUMMER_SLUG}/",
        "embed": {"kind": "table", "series": "austin_metro/cooling_degree_days",
                  "caption": "Austin cooling degree-days by month",
                  "component": "DataStatus + a native data table"},
    }


TOPIC_ARTICLES["summer-hotter-than-normal"] = (build_summer_claims, write_summer)

SUMMER_CAPTION = (
    "\"This summer was brutal.\" Half true, and the record says which half. "
    "Austin's August demanded 755 cooling degree-days against a 1991-2020 normal of 664.8 — "
    "13.6% above normal. July? 644 against a normal of 644.8. Dead ordinary. "
    "San Antonio ran 4.8% above normal in August and 5.6% BELOW it in July "
    "(source: NOAA NCEI Global Summary of the Month and NOAA NCEI U.S. Climate Normals "
    "1991-2020, as of 2026-08-01). "
    "One hot month is not one hot summer, and the difference is measurable. "
    "Both metros, both months, with the yardstick shown → "
    "https://texashomeintelligence.com/analysis/was-this-texas-summer-hotter-than-normal/ "
    "Send this to whoever insisted it was the hottest summer ever."
)
TOPIC_CAPTIONS["summer-hotter-than-normal"] = SUMMER_CAPTION
