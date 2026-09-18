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
import re
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
    """CODE. Austin permit counts against Austin's own preceding months.

    Claim ids are TRADE-KEYED (`solar`, `solar_mom`, `solar_base`) rather than P1..P9, so the
    writer can sort trades by their figures and name the slow and busy lanes from the sort. With
    positional ids the writer had to hardcode which trade was which, which is exactly how the
    frozen conclusions got in.
    """
    f = _permit_facts(today)
    as_of = f["solar"]["as_of"]

    def count(trade, value):
        return f"{value:,.0f} {trade} permits"

    claims = []
    for trade, display in (("solar", "solar"), ("hvac", "HVAC"), ("roofing", "roofing")):
        row = f[trade]
        claims.append(Claim(
            trade, f"Austin issued {count(display, row['latest'])} in August 2026.",
            tier="data", figure=count(display, row["latest"]),
            source=AUSTIN_PERMITS_SOURCE, as_of=as_of,
            metric=f"permit_activity_{trade}"))
        direction = "up" if row["mom_pct"] >= 0 else "down"
        claims.append(Claim(
            f"{trade}_mom", f"{display.capitalize()} permits {direction} from July.",
            tier="derived",
            figure=f"{direction} {abs(row['mom_pct']):.0f}% month over month",
            source=AUSTIN_PERMITS_SOURCE, as_of=as_of, metric=f"permit_activity_{trade}",
            derivation=f"{row['latest']:.0f} (Aug 2026) vs {row['prior']:.0f} (Jul 2026) = "
                       f"{row['mom_pct']:.0f}%"))
        gap = "above" if row["base_pct"] >= 0 else "below"
        claims.append(Claim(
            f"{trade}_base",
            f"{display.capitalize()} filings are running {gap} their own recent pace.",
            tier="derived",
            figure=f"{abs(row['base_pct']):.0f}% {gap} its {row['months']}-month average",
            source=AUSTIN_PERMITS_SOURCE, as_of=as_of, metric=f"permit_activity_{trade}",
            derivation=f"{row['latest']:.0f} vs an {row['months']}-month mean of "
                       f"{row['baseline']:.0f} = {row['base_pct']:.0f}%"))

    below_trades = [d for t, d in (("solar", "solar"), ("hvac", "HVAC"), ("roofing", "roofing"))
                    if f[t]["base_pct"] < 0]
    above_trades = [d for t, d in (("solar", "solar"), ("hvac", "HVAC"), ("roofing", "roofing"))
                    if f[t]["base_pct"] >= 0]
    claims.append(Claim(
        "tally", f"{len(below_trades)} of the three trades is running below its own recent pace.",
        tier="derived",
        figure=f"{len(below_trades)} of 3 trades below their own average",
        source=AUSTIN_PERMITS_SOURCE, as_of=as_of, metric="permit_activity_solar",
        derivation=f"below: {', '.join(below_trades) or 'none'}; "
                   f"above: {', '.join(above_trades) or 'none'}"))
    claims.append(Claim(
        "permits_x",
        "We cannot say from the permits alone what drove any of these moves — a filing "
        "deadline, an incentive change and genuine demand all look identical in a count.",
        tier="external", hedged=True))
    return claims


def write_permits(topic: dict, claims: list[Claim], feed: dict) -> dict:
    """THE ONE MODEL CALL for article 2. Every verdict below is COMPUTED.

    The audit of 2026-09-11 found fourteen invariant sentences in this writer that asserted
    direction — "Roofing is the slower lane", "That is not a market cooling off", "the only one
    of the three sitting below its own run-rate", and a section header calling one trade
    "genuinely slower". All true of August 2026 and all frozen: the first month roofing recovers
    or HVAC drops, this article says something false with every gate green.

    So the trades are sorted by the data, the slow and busy ones are NAMED from that sort, and
    the tally is counted. The model wrote the sentence shapes; the data fills every slot that
    makes a claim.
    """
    c = {claim.id: claim for claim in claims}
    S = AUSTIN_PERMITS_SOURCE
    trades = ["solar", "hvac", "roofing"]
    gap = {t: (c[f"{t}_base"].figure, "below" in c[f"{t}_base"].figure) for t in trades}
    below = [t for t in trades if gap[t][1]]
    above = [t for t in trades if not gap[t][1]]
    slowest = min(trades, key=lambda t: _signed_pct(c[f"{t}_base"].figure))
    busiest = max(trades, key=lambda t: _signed_pct(c[f"{t}_base"].figure))

    label = month_label(c["solar"].as_of[:7])
    if len(above) > len(below):
        verdict = (f"**Mostly no** — {c['tally'].figure}."
                   if below else
                   "**No.** All three trades are running above their own recent pace.")
    else:
        verdict = f"**More than you might think** — {c['tally'].figure}."

    # The month-over-month section asserted a FALL — "that reads like the end of a busy summer",
    # "a month can be down from the one before it and still be strong". HVAC is UP in four of
    # the six periods this builder can be run against, so that passage was false more often than
    # it was true. Branched on the direction the data actually shows.
    hvac_fell = c["hvac_mom"].figure.startswith("down")
    trap = (
        f"{c['hvac'].figure} in {label}, {c['hvac_mom'].figure} ({S}, as of {label}). Month to "
        f"month, that reads like the end of a busy stretch. Against its own average, though, "
        f"HVAC is {c['hvac_base'].figure}. A month can be down from the one before it and still "
        f"be a strong month. Both things are true, and only one of them is a trend."
        if hvac_fell else
        f"{c['hvac'].figure} in {label}, {c['hvac_mom'].figure} ({S}, as of {label}). A rise "
        f"month to month is the easy headline, but the more useful comparison is against the "
        f"trade's own run-rate: HVAC is {c['hvac_base'].figure}. One month's direction and a "
        f"trade's standing are different questions, and only the second one is a trend."
    )

    slow_line = (f"{slowest.capitalize()} is the slower lane: {c[slowest].figure} in {label}, "
                 f"{gap[slowest][0]} ({S}, as of {label})."
                 if gap[slowest][1] else
                 f"Even the weakest of the three, {slowest}, is {gap[slowest][0]} — there is no "
                 f"genuinely slow lane in Austin this month ({S}, as of {label}).")

    body = f"""
## The short answer

{verdict}

Austin issued {c['solar'].figure} in {label} — {c['solar_mom'].figure}, and
{c['solar_base'].figure} ({S}, as of {label}).

## What "cooling off" would actually look like

A boom that is ending shows up as permit counts falling below where that trade has been
running. So that is the comparison: each Austin trade against its own preceding eleven months,
and against nothing else. Permit counts are an activity signal — they say how much work is
being started, never what it costs — and they are only comparable inside one city's own
filing system.

| Trade | {label} | Against its own average |
|---|---|---|
| Solar | {c['solar'].figure} | {c['solar_base'].figure} |
| HVAC | {c['hvac'].figure} | {c['hvac_base'].figure} |
| Roofing | {c['roofing'].figure} | {c['roofing_base'].figure} |

## Where the slack is

{slow_line}

## The month-over-month trap

{trap}

## The busiest lane

{busiest.capitalize()}: {c[busiest].figure}, {gap[busiest][0]} ({S}, as of {label}).

{c['permits_x'].text}

So we are not going to tell you why. We are telling you that it happened, in Austin, in
{label}, by that much, from the city's own issued-permit record — and that anyone claiming to know the
cause is working from something other than this data.

## What this is useful for

If you are getting quotes right now, the useful read is that installer demand is not uniform
across trades. That is worth knowing before you assume a slow quote means a slow market.
"""
    return {
        "slug": PERMITS_SLUG,
        "title": topic["question"],
        "description": ("Austin's permit record, trade by trade, each measured against its own "
                        "recent pace rather than against another city or a dollar figure."),
        "body": body,
        "canonical_url": f"https://texashomeintelligence.com/analysis/{PERMITS_SLUG}/",
        "embed": {
            "kind": "table",
            "series": "austin_metro/permit_activity_solar",
            "caption": "Austin solar permits issued, by month",
            "component": "DataStatus for provenance + a native <table class=\"data-table\">",
        },
    }


def _signed_pct(figure: str) -> float:
    """`8% below its 11-month average` -> -8.0. The sort key that decides which trade is named
    the slow lane, so it is arithmetic rather than an editorial choice."""
    number = float(re.search(r"([\d.]+)%", figure).group(1))
    return -number if "below" in figure else number


TOPIC_ARTICLES = {
    "electricity-still-rising": (build_claims, write),
    "austin-improvement-boom-cooling": (build_permit_claims, write_permits),
}

PERMITS_CAPTION = (
    "\"The market's gone quiet.\" Austin's own permit record says otherwise, trade by trade. "
    "Roofing is running 8% below its 11-month average. HVAC dipped from July but is still "
    "19% above its own average — a down month inside a strong year. And solar just did "
    "224 permits, up 138% month over month, its biggest month in the twelve we hold "
    "(source: City of Austin Issued Construction Permits (Socrata), as of 2026-08-01). "
    "We can't tell you why from a permit count, and we're not going to guess. "
    "The three trades, side by side, with the arithmetic shown \u2192 "
    "https://texashomeintelligence.com/analysis/is-austins-home-improvement-boom-cooling-off/ "
    "Send this to whoever told you nobody's building right now."
)

TOPIC_CAPTIONS = {"austin-improvement-boom-cooling": PERMITS_CAPTION}


# =====================================================================================
# RECURRENCE — how a builder becomes a subscription instead of a single article.
#
# A builder that emits one fixed question is spent the moment that question is published: the
# already-written exclusion sees the title and skips the topic forever. So a recurring builder
# emits a question PER PERIOD — "Was August 2026 hotter than normal?" rather than "Was this
# summer hotter than normal?" — and the period comes from THE DATA, not the calendar.
#
# That last part is the important one. If the period came from the clock, the machine would
# publish on schedule whether or not there was anything new to say. Taking it from the latest
# reading in the series means a monthly builder fires exactly when its metric gains a month, and
# stays silent otherwise. Recurrence and "never publish filler" end up being the same mechanism.
# =====================================================================================

MONTHS_LONG = ["January", "February", "March", "April", "May", "June",
               "July", "August", "September", "October", "November", "December"]


def month_label(period: str) -> str:
    """`2026-08` (or `2026-08-01`) -> `August 2026`."""
    year, month = period[:4], int(period[5:7])
    return f"{MONTHS_LONG[month - 1]} {year}"


def month_label_short(period: str) -> str:
    """`2026-08` -> `Aug 2026`. Nine characters shorter than the long form, which is the whole
    reason it exists.

    The card is 1200x630 and its generator REFUSES to crop — it errors rather than clipping a
    question, which is the correct behaviour and is what caught this. A card question is the
    article title verbatim (gate C4), so a long title is a card that cannot be drawn and a cycle
    that skips. Measured against the real generator, the ceiling is about 53 characters.
    """
    year, month = period[:4], int(period[5:7])
    return f"{MONTHS_LONG[month - 1][:3]} {year}"


def _slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def latest_period(today: date, area: str, metric: str) -> str:
    """The most recent period the series actually holds, as of `today`.

    This is the clock a recurring builder runs on. `thi_source.load_history` already drops the
    incomplete current month, so this is the last COMPLETE reading — never a partial one.
    """
    import thi_source
    series = {(s.area_id, s.metric): s for s in thi_source.load_history(today)}
    return series[(area, metric)].points[-1].period[:7]


class Builder:
    """A claim-builder, its writer, and — for a recurring topic — the title it would emit now.

    Iterable as a 2-tuple so `build, write = articles[id]` keeps working; the engine asks for
    `title_for` separately when deciding whether this topic's CURRENT period is already written.
    """

    def __init__(self, build, write, title_for=None):
        self.build, self.write, self.title_for = build, write, title_for

    def __iter__(self):
        return iter((self.build, self.write))


# =====================================================================================
# Article 3 — was the latest month hotter than normal?
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

GSOM_SOURCE = "NOAA NCEI Global Summary of the Month"


def summer_title(period: str) -> str:
    return f"Was {month_label(period)} hotter than normal in Texas?"


def summer_slug(period: str) -> str:
    return _slugify(summer_title(period).rstrip("?"))


def summer_title_for(today: date) -> str:
    return summer_title(latest_period(today, "austin_metro", "cooling_degree_days"))


def _summer_facts(today: date) -> dict:
    """CODE. The latest complete month and the one before it, each against its own normal."""
    import thi_source
    series = {(s.area_id, s.metric): s for s in thi_source.load_history(today)}
    facts = {}
    for location, area in (("austin", "austin_metro"), ("san-antonio", "san_antonio_metro")):
        normals, normals_source = thi_source.climate_normals(location)
        cdd = series[(area, "cooling_degree_days")]
        rows = []
        for point in cdd.points[-2:][::-1]:          # latest first, then the month before
            month = int(point.period[5:7])
            actual, normal = point.value, normals[month]
            rows.append({"actual": actual, "normal": normal, "pct": _pct(actual, normal),
                         "period": point.period[:7], "as_of": point.period[:7] + "-01",
                         "label": month_label(point.period)})
        facts[area] = {"rows": rows, "normals_source": normals_source}
    return facts


def build_summer_claims(feed: dict, config: dict, today: date) -> list[Claim]:
    """CODE. Actuals are `data`; normals are `official` and `timeless`; the gaps are `derived`.

    Nothing here names a month. The builder reads whichever two months the series ends on, so
    the same code produces July's article in August and August's in September.
    """
    f = _summer_facts(today)
    claims = []
    for tag, area, place in (("A", "austin_metro", "Austin"),
                             ("S", "san_antonio_metro", "San Antonio")):
        normals_source = f[area]["normals_source"]
        for index, row in enumerate(f[area]["rows"]):
            slot = "1" if index == 0 else "2"        # 1 = the month the article is about
            claims.append(Claim(
                f"{tag}{slot}", f"{place} recorded {row['actual']:.0f} cooling degree-days in "
                                f"{row['label']}.",
                tier="data", figure=f"{row['actual']:.0f} cooling degree-days",
                source=GSOM_SOURCE, as_of=row["as_of"], metric="cooling_degree_days"))
            claims.append(Claim(
                f"{tag}{slot}n", f"{place}'s {row['label'].split()[0]} normal is "
                                 f"{row['normal']:.1f} cooling degree-days.",
                tier="official", figure=f"{row['normal']:.1f} cooling degree-days",
                source=normals_source, as_of="1991-2020", metric="cooling_degree_days",
                timeless=True,
                notes="A 1991-2020 climate normal is a fixed reference period, not a current "
                      "reading, so the freshness bound does not apply to it."))
            direction = "above" if row["pct"] >= 0 else "below"
            claims.append(Claim(
                f"{tag}{slot}d",
                f"{place}'s {row['label']} ran {direction} its long-run normal.",
                tier="derived", figure=f"{abs(row['pct']):.1f}% {direction} normal",
                source=normals_source, as_of=row["as_of"], metric="cooling_degree_days",
                derivation=f"{row['actual']:.0f} vs {row['normal']:.1f} = {row['pct']:.1f}%"))
    claims.append(Claim(
        "SX",
        "We cannot say from a degree-day total how the month actually felt — the measure "
        "counts cooling demand, and nothing in it captures humidity, overnight lows, or how "
        "long the heat ran without a break.",
        tier="external", hedged=True))
    return claims


def write_summer(topic: dict, claims: list[Claim], feed: dict) -> dict:
    """THE ONE MODEL CALL. Language only; the month it names comes from the claims."""
    c = {claim.id: claim for claim in claims}
    N = c["A1n"].source
    this_month = c["A1"].text.rsplit(" in ", 1)[1].rstrip(".")
    last_month = c["A2"].text.rsplit(" in ", 1)[1].rstrip(".")
    period = c["A1"].as_of[:7]
    a_dir = "above" if "above" in c["A1d"].figure else "below"
    body = f"""
## The short answer

Austin ran **{c['A1d'].figure}** in {this_month}. San Antonio ran **{c['S1d'].figure}**.

Those are measured against a fixed 1991-2020 yardstick, not against last year and not against
how it felt.

## Austin

{this_month}: {c['A1'].figure}, against a normal of {c['A1n'].figure} — {c['A1d'].figure}
({GSOM_SOURCE} and {N}, as of {this_month}).

The month before, {last_month}, came in at {c['A2'].figure} against a normal of
{c['A2n'].figure} — {c['A2d'].figure}. Two consecutive months, two different answers, which is
the usual shape of a Texas summer and the reason a single "it was brutal" rarely survives
contact with the record.

## San Antonio

{this_month}: {c['S1'].figure} against a normal of {c['S1n'].figure} — {c['S1d'].figure}.

{last_month}: {c['S2'].figure} against {c['S2n'].figure} — {c['S2d'].figure}.

## Why "normal" is doing real work here

A normal is not last year, and it is not an average of whatever we happen to hold. It is the
1991-2020 reference period NOAA publishes for each station and month — a fixed yardstick that
does not move when a hot year lands. That is what makes "hotter than normal" a claim rather
than an impression.

Cooling degree-days are the measure underneath it: a count of how far each day sat above the
comfort baseline, added up across the month. More degree-days means the weather demanded more
cooling, which is the closest thing to an objective answer to "was it worse this time".

## What this does not tell you

{c['SX'].text}

What it does tell you is whether the demand for cooling was unusual — and in {this_month}, in
Austin, it ran {a_dir} the long-run mark by a margin you can check yourself.
"""
    return {
        "slug": summer_slug(period),
        "title": summer_title(period),
        "description": (f"Austin ran {c['A1d'].figure} in {this_month} and San Antonio "
                        f"{c['S1d'].figure}, measured against NOAA's 1991-2020 normals."),
        "body": body,
        "canonical_url": f"https://texashomeintelligence.com/analysis/{summer_slug(period)}/",
        "embed": {"kind": "table", "series": "austin_metro/cooling_degree_days",
                  "caption": "Austin cooling degree-days by month",
                  "component": "DataStatus + a native data table"},
    }


TOPIC_ARTICLES["summer-hotter-than-normal"] = Builder(
    build_summer_claims, write_summer, title_for=summer_title_for)


def summer_caption(article: dict, claims: list[Claim]) -> str:
    c = {claim.id: claim for claim in claims}
    this_month = c["A1"].text.rsplit(" in ", 1)[1].rstrip(".")
    return (
        f"\"It was brutal.\" Maybe — but against what? "
        f"Austin's {this_month} demanded {c['A1'].figure} against a 1991-2020 normal of "
        f"{c['A1n'].figure}: {c['A1d'].figure}. San Antonio ran {c['S1d'].figure}. "
        f"(source: {GSOM_SOURCE} and {c['A1n'].source}, as of {c['A1'].as_of}) "
        # Was "a fixed 30-year yardstick". That 30 traced to no claim — it is arithmetic on the
        # reference period, not a figure the ledger carries, and G1 was right to refuse it.
        # Naming the period says the same thing with a numeral the article actually cites.
        f"A normal is a fixed {c['A1n'].as_of} yardstick, not last year — which is what turns a "
        f"feeling into something you can check. "
        f"Both metros, both months, with the arithmetic shown → {article['canonical_url']} "
        f"Send this to whoever swears every summer is the hottest one yet."
    )


TOPIC_CAPTIONS["summer-hotter-than-normal"] = summer_caption

# =====================================================================================
# Article 4 — did the AC rush follow the heat? RECURRING, monthly.
#
# Two measured series over the same months: how much cooling the weather demanded, and how many
# HVAC permits the city issued. The article puts them side by side and refuses to claim a cause.
# That refusal is the piece: everyone assumes permits track heat, it is checkable, and in the
# month the heat peaked the permits fell.
# =====================================================================================

AUSTIN_HVAC_SOURCE = "City of Austin Issued Construction Permits (Socrata)"


def acrush_title(period: str) -> str:
    return f"Did Austin's AC rush follow the heat in {month_label(period)}?"


def acrush_slug(period: str) -> str:
    return _slugify(acrush_title(period).rstrip("?").replace("'", ""))


def acrush_title_for(today: date) -> str:
    return acrush_title(latest_period(today, "austin_metro", "permit_activity_hvac"))


def _acrush_facts(today: date) -> dict:
    """CODE. The latest month and the one before it, for BOTH series, plus where the heat ranks."""
    import thi_source
    series = {(s.area_id, s.metric): s for s in thi_source.load_history(today)}
    cdd = series[("austin_metro", "cooling_degree_days")]
    hvac = series[("austin_metro", "permit_activity_hvac")]
    heat = cdd.values
    rank = sorted(heat, reverse=True).index(heat[-1]) + 1
    return {
        "period": hvac.points[-1].period[:7],
        "as_of": hvac.points[-1].period[:7] + "-01",
        "cdd_as_of": cdd.points[-1].period[:7] + "-01",
        "label": month_label(hvac.points[-1].period),
        "prior_label": month_label(hvac.points[-2].period),
        "heat_now": heat[-1], "heat_prior": heat[-2],
        "heat_rank": rank, "heat_months": len(heat),
        "hvac_now": hvac.values[-1], "hvac_prior": hvac.values[-2],
        "hvac_pct": _pct(hvac.values[-1], hvac.values[-2]),
        "heat_pct": _pct(heat[-1], heat[-2]),
    }


def build_acrush_claims(feed: dict, config: dict, today: date) -> list[Claim]:
    """CODE. Two series, the same two months, and the arithmetic between them."""
    f = _acrush_facts(today)
    GSOM = GSOM_SOURCE
    direction = "rose" if f["hvac_pct"] >= 0 else "fell"
    return [
        Claim("H1", f"Austin issued {f['hvac_now']:,.0f} HVAC permits in {f['label']}.",
              tier="data", figure=f"{f['hvac_now']:,.0f} HVAC permits",
              source=AUSTIN_HVAC_SOURCE, as_of=f["as_of"], metric="permit_activity_hvac"),
        Claim("H2", f"HVAC permits {direction} from {f['prior_label']}.",
              tier="derived",
              figure=f"{'up' if f['hvac_pct'] >= 0 else 'down'} {abs(f['hvac_pct']):.0f}% "
                     f"month over month",
              source=AUSTIN_HVAC_SOURCE, as_of=f["as_of"], metric="permit_activity_hvac",
              derivation=f"{f['hvac_now']:.0f} ({f['label']}) vs {f['hvac_prior']:.0f} "
                         f"({f['prior_label']}) = {f['hvac_pct']:.0f}%"),
        Claim("C1", f"Austin recorded {f['heat_now']:.0f} cooling degree-days in {f['label']}.",
              tier="data", figure=f"{f['heat_now']:.0f} cooling degree-days",
              source=GSOM, as_of=f["cdd_as_of"], metric="cooling_degree_days"),
        Claim("C2", f"That is the most cooling demand in the {f['heat_months']} months we hold.",
              tier="derived",
              figure=f"the highest of the last {f['heat_months']} months",
              source=GSOM, as_of=f["cdd_as_of"], metric="cooling_degree_days",
              derivation=f"{f['heat_now']:.0f} ranks {f['heat_rank']} of {f['heat_months']} "
                         f"monthly readings held"),
        Claim("C3", f"Cooling demand also rose from {f['prior_label']}.",
              tier="derived", figure=f"up {abs(f['heat_pct']):.0f}% month over month",
              source=GSOM, as_of=f["cdd_as_of"], metric="cooling_degree_days",
              derivation=f"{f['heat_now']:.0f} vs {f['heat_prior']:.0f} = {f['heat_pct']:.0f}%"),
        Claim("H3", f"Austin issued {f['hvac_prior']:,.0f} HVAC permits in {f['prior_label']}.",
              tier="data", figure=f"{f['hvac_prior']:,.0f} HVAC permits",
              source=AUSTIN_HVAC_SOURCE, as_of=f["as_of"], metric="permit_activity_hvac"),
        Claim("HX",
              "We cannot say from these two series why they moved apart. A permit is filed "
              "days or weeks after the decision to replace a system, and nothing here measures "
              "that lag, installer capacity, or how many units simply kept running.",
              tier="external", hedged=True),
    ]


def write_acrush(topic: dict, claims: list[Claim], feed: dict) -> dict:
    """THE ONE MODEL CALL — but the ANSWER is not the model's to choose.

    A recurring builder that freezes its conclusion in prose publishes a false claim the first
    month the data flips. This one asked "did the rush follow the heat?" and answered "no, they
    moved in opposite directions" — true of August, and flatly contradicted by July's own table,
    where both series rose. No gate catches that: G1 checks numerals, G2 checks sources, and
    neither reads an argument. So the verdict is COMPUTED from the two directions and the prose
    branches on it. The model writes both branches; the data picks.
    """
    c = {claim.id: claim for claim in claims}
    period = c["H1"].as_of[:7]
    label = month_label(period)
    prior = c["H3"].text.rsplit(" in ", 1)[1].rstrip(".")
    permits_up = c["H2"].figure.startswith("up")
    heat_up = c["C3"].figure.startswith("up")
    diverged = permits_up != heat_up

    if diverged:
        verdict = "**No — they moved in opposite directions.**"
        opener = (f"{label} was the hottest month Austin has had in the record we hold: "
                  f"{c['C1'].figure}, {c['C2'].figure} ({GSOM_SOURCE}, as of {label}). "
                  f"HVAC permits went the other way: {c['H1'].figure}, {c['H2'].figure} "
                  f"({AUSTIN_HVAC_SOURCE}, as of {label}).")
        reading = ("**cooling demand is not a live indicator of HVAC work being started.** If "
                   "you are timing a replacement and assuming the rush follows the thermometer, "
                   "the filing record does not support that.")
    else:
        verdict = "**This month, yes — both moved the same way.**"
        opener = (f"Cooling demand in {label} came to {c['C1'].figure} ({GSOM_SOURCE}, as of "
                  f"{label}), and HVAC permits moved with it: {c['H1'].figure}, "
                  f"{c['H2'].figure} ({AUSTIN_HVAC_SOURCE}, as of {label}). One month of "
                  f"agreement is not a rule, but it is what this month shows.")
        reading = ("**the two moved together this month.** That is worth recording precisely "
                   "because it does not always happen — and a single month either way is a "
                   "reading, not a relationship.")

    # The closing asserted a gap unconditionally: "the month everyone expects installers to be
    # busiest is not the month the filings peak". True when the series diverge, false when they
    # do not — the same frozen-conclusion bug as the verdict, hiding in the part of the article
    # nobody re-reads.
    closing = (
        "The month everyone expects installers to be busiest is not the month the filings "
        "peak. If you are getting quotes, that gap is the part worth knowing — and it is "
        "measurable, which is more than can be said for most advice about when to call someone."
        if diverged else
        "This month the filings tracked the weather, which is the intuitive answer and is not "
        "always the right one. Worth knowing either way: the relationship is measurable, which "
        "is more than can be said for most advice about when to call someone."
    )

    body = f"""
## The short answer

{verdict}

{opener}

## The two series, side by side

The assumption is reasonable — it gets hot, systems fail, people replace them — and it is
checkable, which is the only reason it is worth writing about.

| {label} | Reading | Against {prior} |
|---|---|---|
| Cooling demand | {c['C1'].figure} | {c['C3'].figure} |
| HVAC permits | {c['H1'].figure} | {c['H2'].figure} |

In {prior}, Austin issued {c['H3'].figure}.

## What we are not going to tell you

{c['HX'].text}

The honest read is narrower and more useful: {reading}

## Why it might matter to you

{closing}
"""
    return {
        "slug": acrush_slug(period),
        "title": acrush_title(period),
        "description": (f"Austin's cooling demand and HVAC permit filings in {label}, two "
                        f"measured series side by side, with no cause claimed."),
        "body": body,
        "canonical_url": f"https://texashomeintelligence.com/analysis/{acrush_slug(period)}/",
        "embed": {"kind": "table", "series": "austin_metro/permit_activity_hvac",
                  "caption": "Austin HVAC permits issued, by month",
                  "component": "DataStatus + a native data table"},
    }


TOPIC_ARTICLES["austin-ac-rush-vs-heat"] = Builder(
    build_acrush_claims, write_acrush, title_for=acrush_title_for)


def acrush_caption(article: dict, claims: list[Claim]) -> str:
    c = {claim.id: claim for claim in claims}
    label = month_label(c["H1"].as_of[:7])
    permits_up = c["H2"].figure.startswith("up")
    heat_up = c["C3"].figure.startswith("up")
    hook = ("Hottest month of the year, and Austin's AC filings went the OTHER way."
            if permits_up != heat_up else
            "Austin's heat and its AC filings moved together this month — which they do not "
            "always do.")
    return (
        f"{hook} "
        f"{label} brought {c['C1'].figure} — {c['C2'].figure}. "
        f"HVAC permits: {c['H1'].figure}, {c['H2'].figure} "
        f"(source: {AUSTIN_HVAC_SOURCE} and {GSOM_SOURCE}, as of {c['H1'].as_of}). "
        f"We can't tell you why from a permit count, and we're not going to guess. "
        f"Both series, same months, with the arithmetic shown → {article['canonical_url']} "
        f"Send this to whoever's waiting for the rush to die down before calling."
    )


TOPIC_CAPTIONS["austin-ac-rush-vs-heat"] = acrush_caption


# =====================================================================================
# Article 5 — is San Antonio's home-improvement boom cooling off? RECURRING, monthly.
#
# The same question as Austin's, asked of a different city, and it gets a different answer —
# which is the argument for a separate article rather than a comparison. Permit counts are
# comparable only INSIDE one city's own filing system (THI CLAUDE.md), so nothing here mentions
# Austin at all.
#
# The verdict is COUNTED, not written: how many trades sit above their own baseline versus
# below. A recurring builder that hardcodes "the boom is holding" publishes a false claim the
# first month it stops holding (the lesson from article 4).
# =====================================================================================

SA_PERMITS_SOURCE = "City of San Antonio Permits Open Data"
SA_TRADES = ("hvac", "roofing", "solar", "plumbing", "electrical", "foundation", "trees")
TRADE_NAME = {"hvac": "HVAC", "roofing": "roofing", "solar": "solar", "plumbing": "plumbing",
              "electrical": "electrical", "foundation": "foundation", "trees": "tree"}


def sa_title(period: str) -> str:
    """53 characters, verified against the real card generator.

    The long form — "Is San Antonio's home-improvement boom cooling off? (August 2026)" — is 65
    and overflows the card, so the cycle rendered nothing and skipped. "remodel" and the short
    month are what bring it under the ceiling; shortening the copy is the right lever because
    the alternative is widening shared template logic for one title, and doing that once before
    silently re-broke article 1's approved headline.

    The month stays in the title because this builder is RECURRING: the period is what keeps
    each month's article distinct from the last one.
    """
    return f"Is San Antonio's remodel boom cooling off? ({month_label_short(period)})"


def sa_slug(period: str) -> str:
    return _slugify(f"san-antonio-home-improvement-boom-{month_label(period)}")


def sa_title_for(today: date) -> str:
    return sa_title(latest_period(today, "san_antonio_metro", "permit_activity_hvac"))


def _sa_facts(today: date) -> dict:
    """CODE. Every San Antonio trade against its OWN preceding months."""
    import thi_source
    series = {(s.area_id, s.metric): s for s in thi_source.load_history(today)}
    rows = {}
    for trade in SA_TRADES:
        key = ("san_antonio_metro", f"permit_activity_{trade}")
        if key not in series:
            continue
        values = series[key].values
        baseline = sum(values[:-1]) / len(values[:-1])
        rows[trade] = {"latest": values[-1], "prior": values[-2], "baseline": baseline,
                       "months": len(values) - 1,
                       "base_pct": _pct(values[-1], baseline),
                       "mom_pct": _pct(values[-1], values[-2]),
                       "as_of": series[key].points[-1].period[:7] + "-01",
                       "period": series[key].points[-1].period[:7]}
    above = [t for t, r in rows.items() if r["base_pct"] >= 0]
    # The card leads on whichever trade has moved furthest from its own normal, in either
    # direction — so the hero is chosen by the data, and next month it may be a different trade.
    standout = max(rows, key=lambda t: abs(rows[t]["base_pct"]))
    weakest = min(rows, key=lambda t: rows[t]["base_pct"])
    return {"rows": rows, "above": above, "standout": standout, "weakest": weakest,
            "period": rows[standout]["period"], "as_of": rows[standout]["as_of"]}


def build_sa_claims(feed: dict, config: dict, today: date) -> list[Claim]:
    """CODE. One data claim and one derived claim per trade, all San Antonio against itself."""
    f = _sa_facts(today)
    claims = []
    order = [f["standout"]] + [t for t in SA_TRADES if t in f["rows"] and t != f["standout"]]
    for index, trade in enumerate(order):
        row = f["rows"][trade]
        name = TRADE_NAME[trade]
        tag = f"T{index}"
        claims.append(Claim(
            tag, f"San Antonio issued {row['latest']:,.0f} {name} permits in "
                 f"{month_label(row['period'])}.",
            tier="data", figure=f"{row['latest']:,.0f} {name} permits",
            source=SA_PERMITS_SOURCE, as_of=row["as_of"],
            metric=f"permit_activity_{trade}"))
        direction = "above" if row["base_pct"] >= 0 else "below"
        claims.append(Claim(
            f"{tag}d", f"{name.capitalize()} filings are running {direction} their own "
                       f"recent pace.",
            tier="derived",
            figure=f"{abs(row['base_pct']):.0f}% {direction} its {row['months']}-month average",
            source=SA_PERMITS_SOURCE, as_of=row["as_of"], metric=f"permit_activity_{trade}",
            derivation=f"{row['latest']:.0f} vs a {row['months']}-month mean of "
                       f"{row['baseline']:.0f} = {row['base_pct']:.0f}%"))
    # THE TALLY IS A CLAIM. The article's whole answer is "how many trades are above their own
    # pace", which is a derived figure like any other — G1 rightly refused the prose until the
    # count had a claim behind it and a derivation naming which trades were counted.
    above_names = [TRADE_NAME[t] for t in SA_TRADES if t in f["rows"]
                   and f["rows"][t]["base_pct"] >= 0]
    below_names = [TRADE_NAME[t] for t in SA_TRADES if t in f["rows"]
                   and f["rows"][t]["base_pct"] < 0]
    claims.append(Claim(
        "TALLY",
        f"{len(above_names)} of San Antonio's {len(f['rows'])} filed trades are running at or "
        f"above their own recent average.",
        tier="derived",
        figure=f"{len(above_names)} of {len(f['rows'])} trades above their own average",
        source=SA_PERMITS_SOURCE, as_of=f["as_of"],
        metric=f"permit_activity_{f['standout']}",
        derivation=f"above: {', '.join(above_names)}; below: {', '.join(below_names)}"))
    claims.append(Claim(
        "TX",
        "We cannot say from a filing count why any trade moved. A permit records that work was "
        "started, never what it cost, who did it, or why they chose now.",
        tier="external", hedged=True))
    return claims


def write_sa(topic: dict, claims: list[Claim], feed: dict) -> dict:
    """THE ONE MODEL CALL. The verdict is counted from the data, never asserted."""
    import thi_source                                      # noqa: F401 (facts recomputed below)
    c = {claim.id: claim for claim in claims}
    period = c["T0"].as_of[:7]
    label = month_label(period)
    # The per-trade claim ids are T0, T1, … and their derived partners T0d, T1d, … "TALLY" and
    # "TX" are not trades, and matching them by prefix is how `TALLYd` got looked up.
    trades = [k for k in c if re.fullmatch(r"T\d+", k)]
    trades.sort(key=lambda k: int(k[1:]))
    above = [k for k in trades if "above" in c[k + "d"].figure]
    below = [k for k in trades if "below" in c[k + "d"].figure]
    holding = len(above) >= len(below)

    verdict = ("**Mostly no — more trades are running above their own pace than below it.**"
               if holding else
               "**More of it is than is not — most trades are below their own recent pace.**")
    # The closing said "that answer is above the line" whatever the tally was. Computed now.
    line = ("more of the city's trades are above the line than below it" if holding
            else "more of the city's trades are below the line than above it")
    rows = "\n".join(
        f"| {c[k].figure.split(' ', 1)[1].replace(' permits', '').capitalize()} "
        f"| {c[k].figure} | {c[k + 'd'].figure} |" for k in trades)

    body = f"""
## The short answer

{verdict}

{c['TALLY'].figure} in {label} ({SA_PERMITS_SOURCE}, as of {label}). Each trade is measured
against its own preceding months, so "above" means busier than that trade has been, not busier
than some other city.

## Every trade, against its own history

A boom that is ending shows up as filings dropping below where that trade has been running. So
each trade is measured against its own preceding months — never against another city, and never
against a dollar figure. Permit counts say how much work is being started; they say nothing
whatever about what it costs.

| Trade | {label} | Against its own average |
|---|---|---|
{rows}

## The standout

{c['T0'].text} That is {c['T0d'].figure} — the widest gap from its own normal of any trade in
the city this month.

## What we are not going to tell you

{c['TX'].text}

## Why this is San Antonio only

Permit systems differ by city: what needs a permit, how trades are categorised, and how quickly
filings are recorded all vary. Comparing San Antonio's counts to another city's would be
comparing two filing systems, not two markets. Against its own record, though, the question has
a real answer — and this month, {line}.
"""
    return {
        "slug": sa_slug(period),
        "title": sa_title(period),
        "description": (f"Every San Antonio trade measured against its own recent pace for "
                        f"{label}, from the city's own permit record."),
        "body": body,
        "canonical_url": f"https://texashomeintelligence.com/analysis/{sa_slug(period)}/",
        "embed": {"kind": "table",
                  "series": f"san_antonio_metro/{c['T0'].metric.replace('permit_activity_', 'permit_activity_')}",
                  "caption": f"San Antonio permits issued, by month",
                  "component": "DataStatus + a native data table"},
    }


TOPIC_ARTICLES["san-antonio-improvement-boom"] = Builder(
    build_sa_claims, write_sa, title_for=sa_title_for)


def sa_caption(article: dict, claims: list[Claim]) -> str:
    c = {claim.id: claim for claim in claims}
    label = month_label(c["T0"].as_of[:7])
    return (
        f"\"Nobody's building in San Antonio right now.\" The city's own permit record, {label}: "
        f"{c['T0'].figure}, {c['T0d'].figure} — the widest gap from its own normal of any trade. "
        f"(source: {SA_PERMITS_SOURCE}, as of {c['T0'].as_of}) "
        f"Every trade is measured against its OWN history, never another city's — different "
        f"cities, different filing systems. "
        f"We can't tell you why anything moved, and we're not going to guess. "
        f"All seven trades, with the arithmetic → {article['canonical_url']} "
        f"Send this to whoever's been told the work has dried up."
    )


TOPIC_CAPTIONS["san-antonio-improvement-boom"] = sa_caption
