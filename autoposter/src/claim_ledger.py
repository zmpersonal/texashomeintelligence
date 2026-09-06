"""
claim_ledger.py — the unit of verification is the CLAIM, not the article
(ARTICLE-ENGINE.md Stage 3).

The dangerous failure is a wrong article published with authority that a journalist or an AI
answer engine then repeats. Prose review does not catch that; a claim-by-claim ledger does.

EVIDENCE TIERS, and what each is allowed to do:
  `data`     — traces to a figure in social-feed.json. May be STATED plainly.
  `official` — an official published source with a date, outside our feed. May be STATED,
               attributed to that source.
  `derived`  — arithmetic this code performed on `data` figures (a YoY change from two
               readings). May be STATED, and the derivation is recorded so a reader can redo it.
  `external` — research leads (Manus / Perplexity / general reading) with no underlying data.
               **May never be stated as fact.** Cut, or downgraded to explicitly-hedged
               language that attributes the uncertainty. Enforced, not advised.

`external` is where most published wrongness comes from: a plausible causal explanation that
nobody measured. The ledger's job is to make stating one impossible without it being visible.

Article-scale G1/G2/G5 reuse the same rules as the social gates — a claim's numeral must exist
in its figure, its source and as_of must render inline, and its as_of must be inside the
metric's staleness bound.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime, timezone

import validator as social_validator

STATEABLE = ("data", "official", "derived")
TIERS = STATEABLE + ("external",)
HEDGE_MARKERS = ("we cannot", "not established", "unverified", "we do not know",
                 "no data we hold", "cannot say", "does not explain", "unexplained")


class LedgerHalt(Exception):
    gate = "LEDGER"

    def __init__(self, reasons: list[str]):
        self.reasons = reasons
        super().__init__("LEDGER: " + " | ".join(reasons))


@dataclass
class Claim:
    id: str
    text: str                 # the sentence as it will appear, or the assertion it supports
    tier: str
    figure: str = ""          # the exact verbatim string the prose may reproduce
    source: str = ""
    as_of: str = ""
    metric: str = ""
    derivation: str = ""      # for tier `derived`: the arithmetic, so a reader can redo it
    timeless: bool = False    # a reference constant (e.g. a 30-year climate normal), not a
                              # time-series reading — G5 does not apply and the reason is stated
    hedged: bool = False      # set on `external` claims that survived as explicitly-uncertain
    notes: str = ""

    def to_row(self) -> dict:
        return {"id": self.id, "tier": self.tier, "claim": self.text, "figure": self.figure,
                "source": self.source, "as_of": self.as_of, "derivation": self.derivation,
                "hedged": self.hedged, "notes": self.notes}


@dataclass
class LedgerResult:
    ok: bool
    failures: list[str] = field(default_factory=list)
    checked: int = 0


def verify_ledger(claims: list[Claim], config: dict, now: date | None = None) -> LedgerResult:
    """Structural verification of the ledger itself, before a word of prose is written."""
    now = now or datetime.now(timezone.utc).date()
    result = LedgerResult(ok=True, checked=len(claims))
    seen = set()

    for claim in claims:
        where = f"claim {claim.id}"
        if claim.id in seen:
            result.ok = False
            result.failures.append(f"{where}: duplicate claim id")
        seen.add(claim.id)

        if claim.tier not in TIERS:
            result.ok = False
            result.failures.append(f"{where}: unknown tier {claim.tier!r}")
            continue

        if claim.tier == "external":
            # The whole point of the tier. An unhedged external claim never reaches prose.
            if not claim.hedged:
                result.ok = False
                result.failures.append(
                    f"{where}: tier `external` with no underlying data must be CUT or HEDGED, "
                    f"never stated — set hedged=True and write the uncertainty into the text")
            elif not any(m in claim.text.lower() for m in HEDGE_MARKERS):
                result.ok = False
                result.failures.append(
                    f"{where}: marked hedged but the text asserts without an uncertainty marker "
                    f"({', '.join(HEDGE_MARKERS[:3])}, ...)")
            continue

        # Stateable tiers must carry provenance.
        if not claim.source:
            result.ok = False
            result.failures.append(f"{where}: tier {claim.tier!r} with no source")
        if not claim.as_of:
            result.ok = False
            result.failures.append(f"{where}: tier {claim.tier!r} with no as_of")
        if claim.tier == "derived" and not claim.derivation:
            result.ok = False
            result.failures.append(
                f"{where}: tier `derived` must record its arithmetic so a reader can redo it")

        # G5 at article scale.
        if claim.as_of and not claim.timeless:
            bound = social_validator.staleness_bound_hours(claim.metric, config)
            if bound is None:
                result.ok = False
                result.failures.append(
                    f"{where}: no staleness bound for metric {claim.metric!r} — add one rather "
                    f"than publishing on an unbounded age")
            else:
                try:
                    as_of = datetime.fromisoformat(claim.as_of).date()
                except ValueError:
                    result.ok = False
                    result.failures.append(f"{where}: as_of {claim.as_of!r} is not a date")
                else:
                    if as_of > now:
                        result.ok = False
                        result.failures.append(f"{where}: as_of {as_of} is in the future")
                    elif (now - as_of).days * 24 > bound:
                        result.ok = False
                        result.failures.append(
                            f"{where}: {(now - as_of).days * 24}h old, bound {bound:.0f}h")
        elif claim.timeless and not claim.notes:
            result.ok = False
            result.failures.append(
                f"{where}: timeless=True skips the freshness gate, so it must say in `notes` "
                f"why this value cannot go stale")

    return result


def verify_prose(body: str, claims: list[Claim], config: dict) -> LedgerResult:
    """G1/G2 at article scale, against the finished prose.

    G1: every numeral in the body must appear in some stateable claim's figure. This is what
        makes "the model wrote a number" structurally impossible rather than discouraged.
    G2: every stateable claim's source and as_of must render inline in the body.
    """
    result = LedgerResult(ok=True, checked=len(claims))

    allowed: set[str] = set()
    for claim in claims:
        if claim.tier in STATEABLE:
            allowed |= social_validator._extract_numerals(claim.figure)
            # as_of keeps its digits: an ISO date is stripped as provenance when scanning
            # PROSE, but the year legitimately appears there ("August 2026"), so the allowlist
            # has to carry it or every dated sentence trips G1.
            allowed |= social_validator._extract_numerals(claim.as_of, drop_dates=False)
            # A `derived` claim's derivation IS its audit trail, and a year-ago comparison point
            # legitimately appears in the prose. Its numerals are allowed precisely because the
            # derivation is published beside them and a reader can redo the arithmetic — which
            # is the difference between a sourced comparison and a model-invented one.
            allowed |= social_validator._extract_numerals(claim.derivation)

    # Compare against the RENDERED text, not the raw markdown. A source name legitimately
    # wrapped across two lines ("NOAA NCEI Global Summary of the\nMonth") renders as one
    # string but fails a raw substring check — a false positive of exactly the kind that gets
    # a gate switched off (LEARNINGS L7). Collapsing whitespace is not a loosening: it is
    # checking the thing the reader actually sees.
    rendered = " ".join(body.split())

    used = social_validator._extract_numerals(body)
    unbacked = sorted(n for n in used
                      if n not in allowed and not social_validator._is_benign(n))
    if unbacked:
        result.ok = False
        result.failures.append(
            f"G1: numerals in the prose that no claim's figure supports: {unbacked}")

    for claim in claims:
        if claim.tier not in STATEABLE:
            continue
        if claim.source and claim.source.lower() not in rendered.lower():
            result.ok = False
            result.failures.append(f"G2: claim {claim.id} source not cited inline in the body")
        if claim.as_of and claim.as_of not in rendered and _human_date(claim.as_of) not in rendered:
            result.ok = False
            result.failures.append(f"G2: claim {claim.id} as_of not rendered inline in the body")

    return result


def _human_date(iso: str) -> str:
    try:
        return datetime.fromisoformat(iso).strftime("%B %Y")
    except ValueError:
        return iso


def render_ledger_markdown(claims: list[Claim]) -> str:
    lines = ["| # | tier | claim | figure | source | as of | derivation |",
             "|---|---|---|---|---|---|---|"]
    for c in claims:
        text = c.text if len(c.text) <= 90 else c.text[:87] + "…"
        lines.append(f"| {c.id} | `{c.tier}`{' *(hedged)*' if c.hedged else ''} | {text} | "
                     f"{c.figure or '—'} | {c.source or '—'} | {c.as_of or '—'} | "
                     f"{c.derivation or '—'} |")
    return "\n".join(lines)
