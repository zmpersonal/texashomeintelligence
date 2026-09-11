"""
card.py — the article's social card: built from the ledger, and gated like a caption.

WHY THIS EXISTS
The first card's `card:` frontmatter was written by hand from the claim ledger. It was correct,
and it was a hand-step (L14): correct once, and nothing would have caught it drifting from the
claims on the next article. So the block is now BUILT from the same claims the article's prose
is verified against, and checked by a gate in the same family as G1.

THE RULE THE GATE ENFORCES
A card that shows a number the ledger cannot back is the same failure as a caption that does —
worse, in fact, because a card is the part most people see and the part nobody reads critically.
So: every numeral on the card face must trace to a claim, the source label must abbreviate a
source some claim actually declares, and the date must be a claim's date.

WHAT THE MODEL DOES HERE
Nothing. Selection of the lead claim, compaction of its figure, the source label and the date
are all deterministic transforms of the ledger. The one thing that comes from the article is its
title, copied verbatim.

NOTHING HERE COMPUTES A FIGURE. `_compact` is a UNIT rewrite and asserts that it changed no
digits; if it ever did, that would be this module quietly deriving, which is the line.
"""

from __future__ import annotations

import re
from pathlib import Path

import claim_ledger
import validator as social_validator

ROOT = Path(__file__).resolve().parents[1]

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

# Long unit -> the compact form a 1200x630 card can carry legibly. Code-held, never inferred:
# an abbreviation the machine invents is an abbreviation nobody checked.
CARD_UNIT = {
    "cents per kilowatt-hour": "¢/kWh",
    "cooling degree-days": " CDD",
}

# Full source name -> the short label the card face carries. The FULL name goes in the alt
# text, which is where crawlers and screen readers read it and where there is room to be exact.
# site/scripts/generate-og-cards.mjs holds the inverse map; a test asserts the two agree.
SOURCE_SHORT = {
    "U.S. Energy Information Administration": "EIA",
    "NOAA NCEI Global Summary of the Month": "NOAA",
    "NOAA NCEI U.S. Climate Normals 1991-2020": "NOAA",
    # The city IS the publisher of its own permit record, so the label names the city rather
    # than the dataset. "Socrata" is the platform it is served on, not an authority, and putting
    # a vendor's name in the source slot would credit the wrong party.
    "City of Austin Issued Construction Permits (Socrata)": "City of Austin",
    "City of San Antonio Permits Open Data": "City of San Antonio",
}

CARD_FIELDS = ("question", "headline", "subhead", "source", "asOf")


class CardHalt(Exception):
    """The card cannot be built or cannot be backed. Never downgraded to a warning."""


class CardResult:
    def __init__(self):
        self.ok = True
        self.failures: list[str] = []

    def fail(self, gate: str, why: str):
        self.ok = False
        self.failures.append(f"{gate}: {why}")


def _compact(figure: str) -> str:
    """Swap a long unit for its card form. Digits are untouched, and that is asserted.

    A compaction that altered a numeral would be this module deriving a figure of its own —
    the exact thing the architecture forbids — so it raises rather than returning.
    """
    out = figure
    for long, short in CARD_UNIT.items():
        if out.endswith(" " + long):
            out = out[: -len(" " + long)] + short
            break
    before = social_validator._extract_numerals(figure, drop_dates=False)
    after = social_validator._extract_numerals(out, drop_dates=False)
    if before != after:
        raise CardHalt(
            f"compacting {figure!r} to {out!r} changed its numerals ({sorted(before)} -> "
            f"{sorted(after)}). A unit rewrite may never touch a digit.")
    return out


def _month_year(as_of: str) -> str:
    """`2026-08-01` -> `Aug 2026`. A date the card shows is a claim's date, reformatted.

    Not every `as_of` in a ledger is a date. A 1991-2020 climate normal is a REFERENCE PERIOD,
    and it matches the shape of one — `1991-20` parses as month 20 if nothing checks. Caught by
    running this against the real ledger rather than by reading it. Returns None for anything
    that is not a real month so callers can skip it, instead of inventing a thirteenth month.
    """
    month = _as_month(as_of)
    if month is None:
        raise CardHalt(f"card date {as_of!r} is not a year-month — refusing to guess a month")
    return month


def _as_month(as_of: str) -> str | None:
    """`2026-08-01` -> `Aug 2026`; anything that is not a real year-month -> None."""
    match = re.match(r"^(\d{4})-(\d{2})(?:-|$)", as_of or "")
    if not match:
        return None
    year, month = match.group(1), int(match.group(2))
    if not 1 <= month <= 12:
        return None
    return f"{MONTHS[month - 1]} {year}"


def primary_metric(article: dict) -> str:
    """The metric the card speaks about, from the article's own embed.

    `embed.series` here is the ENGINE's `area/metric` namespace, not the site's
    `datasetId/location`. Those two namings look alike and are not (LEARNINGS L10, the empty
    embed); this reads the engine's because these are engine claims.
    """
    series = (article.get("embed") or {}).get("series", "")
    if "/" not in series:
        raise CardHalt(f"article embed.series {series!r} is not 'area/metric' — cannot tell "
                       f"which metric the card is about")
    return series.split("/", 1)[1]


def select_claims(article: dict, claims: list[claim_ledger.Claim]):
    """The two claims the card speaks for. ONE rule, used by the builder and by the gate.

    Lead = the first `data` claim on the article's primary metric: the reading itself.
    Subhead = the first `derived` claim on the same metric: what the reading did.
    That ordering is the ledger's, which is code's, which is the point — and because the gate
    re-runs this same selection, it can check the card against the exact claims it should be
    quoting rather than against the article's whole numeral pool.
    """
    metric = primary_metric(article)
    on_metric = [c for c in claims if c.metric == metric and c.figure]

    lead = next((c for c in on_metric if c.tier == "data"), None)
    if lead is None:
        raise CardHalt(f"no `data` claim on {metric!r} to carry the card — a card whose hero "
                       f"figure is derived rather than measured would lead on arithmetic")

    move = next((c for c in on_metric if c.tier == "derived"), None)
    if move is None:
        raise CardHalt(f"no `derived` claim on {metric!r} — the card has a reading but nothing "
                       f"to say about it, which is a card with no story")
    return lead, move


def build_card(article: dict, claims: list[claim_ledger.Claim]) -> dict:
    """The `card:` frontmatter block, derived from the ledger. Deterministic; no model call."""
    lead, move = select_claims(article, claims)

    if lead.source not in SOURCE_SHORT:
        raise CardHalt(f"no card label for source {lead.source!r}; add it to SOURCE_SHORT "
                       f"rather than letting the card abbreviate a source nobody approved")

    return {
        "question": article["title"],
        "headline": _compact(lead.figure),
        "subhead": move.figure,
        "source": SOURCE_SHORT[lead.source],
        "asOf": _month_year(lead.as_of),
    }


def sidecar_path(slug: str, config: dict) -> Path:
    directory = (config.get("publish") or {}).get(
        "og_sidecar_dir", "../site/src/data/og-cards")
    # An absolute path is used as given, so a test can point at a temp copy instead of editing
    # the real sidecar under site/ to prove a point.
    base = Path(directory)
    return (base if base.is_absolute() else ROOT / directory).resolve() / f"{slug}.json"


def verify_card(card: dict, claims: list[claim_ledger.Claim], *, slug: str = "",
                article: dict | None = None, sidecar: dict | None = None,
                require_sidecar: bool = False) -> CardResult:
    """The card gate. G1's rule applied to the artifact most people actually look at.

    `require_sidecar` is False while the article is still a draft — the card PNG is generated
    on the site side and does not exist yet — and True at publish time, when a post is about to
    point its media at that exact file. Missing then is a hard failure: promoting a card that
    has not been rendered is promoting a 404.
    """
    result = CardResult()

    missing = [f for f in CARD_FIELDS if not str(card.get(f, "")).strip()]
    if missing:
        result.fail("C0", f"card is missing {', '.join(missing)}")
        return result

    # ---- C1: every numeral on the face traces to a claim. Same allowlist as verify_prose, so
    # the card is held to the article's standard rather than to a laxer cousin.
    allowed: set[str] = set()
    declared_sources: set[str] = set()
    declared_dates: set[str] = set()
    for claim in claims:
        if claim.tier not in claim_ledger.STATEABLE:
            continue
        allowed |= social_validator._extract_numerals(claim.figure)
        allowed |= social_validator._extract_numerals(claim.derivation)
        declared_sources.add(claim.source)
        declared_dates.add(claim.as_of)

    # C1a/C1b: the card's two slots must quote the two claims the card is FOR — exactly.
    #
    # A numerals-anywhere-in-the-ledger check is not enough, and the proof is a mutation that
    # walked straight past one: freeze the card at last month's hero figure, move the reading,
    # and the stale number is still "backed" because it survives inside another claim's
    # derivation string ("13.88 vs 15.46 = -10.2%"). The card has exactly two claim slots, so
    # it can be checked exactly rather than statistically.
    if article is not None:
        lead, move = select_claims(article, claims)
        expected_headline = _compact(lead.figure)
        if card["headline"] != expected_headline:
            result.fail("C1a", f"card headline {card['headline']!r} is not the lead claim's "
                               f"figure ({expected_headline!r}) — a card frozen at an older "
                               f"reading looks identical to a current one")
        if card["subhead"] != move.figure:
            result.fail("C1b", f"card subhead {card['subhead']!r} is not the movement claim's "
                               f"figure ({move.figure!r})")

    # C1c, the backstop: anything else on the face still has to trace somewhere.
    face = f"{card['headline']} {card['subhead']}"
    used = social_validator._extract_numerals(face)
    unbacked = sorted(n for n in used if n not in allowed and not social_validator._is_benign(n))
    if unbacked:
        result.fail("C1", f"numerals on the card that no claim's figure supports: {unbacked}. "
                          f"A card showing an unbacked number is a caption showing one, with a "
                          f"wider audience and less scrutiny")

    # ---- C2: the short label must abbreviate a source a claim actually declares.
    expanded = [full for full, short in SOURCE_SHORT.items() if short == card["source"]]
    if not expanded:
        result.fail("C2", f"card source {card['source']!r} is not a known label")
    elif not any(full in declared_sources for full in expanded):
        result.fail("C2", f"card source {card['source']!r} expands to {expanded}, none of which "
                          f"this article's claims declare — an abbreviation may not introduce "
                          f"an authority the article never cited")

    # ---- C3: the date must be a claim's date, reformatted, not a fresher-looking one.
    stateable_months = {m for m in (_as_month(d) for d in declared_dates) if m}
    if card["asOf"] not in stateable_months:
        result.fail("C3", f"card date {card['asOf']!r} matches no claim's as_of — a card must "
                          f"not read fresher than the reading behind it")

    # ---- C4: the question is the article's H1, verbatim. A card that asks a different question
    # than the page answers is a bait card, however true both are.
    if article is not None and card["question"] != article.get("title"):
        result.fail("C4", f"card question does not match the article title verbatim")

    # ---- C5: the rendered card exists and shows exactly this.
    if require_sidecar:
        if not sidecar:
            result.fail("C5", f"no rendered card for {slug!r} — run `npm run og-cards` on the "
                              f"site side. Publishing now would promote a card that does not "
                              f"exist")
        else:
            rendered = sidecar.get("rendered") or {}
            drifted = {f: (card[f], rendered.get(f)) for f in CARD_FIELDS
                       if rendered.get(f) != card[f]}
            if drifted:
                result.fail("C5", f"the rendered card differs from the ledger-built one: "
                                  f"{drifted}. The PNG is stale — regenerate it rather than "
                                  f"posting the older card")
    return result


def frontmatter_block(card: dict) -> str:
    """The exact YAML the site's article file carries. Emitted, never typed."""
    lines = ["card:"]
    for field in CARD_FIELDS:
        lines.append(f'  {field}: "{card[field]}"')
    return "\n".join(lines)
