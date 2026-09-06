"""
validator.py — the content-quality floor as CODE GATES (specs/VALIDATOR.md; SOP step 11b).

Built BEFORE generation logic. Proving posting *works* says nothing about whether content is
*fit to publish*; without this gate a machine publishes its own failure states.

GOVERNING RULE (specs/VALIDATOR.md): every content-quality problem is a gate here, never a model
instruction. "Be accurate" in a prompt decays; "any numeral not in social-feed.json does not
publish" does not. When the model wants a value a rule forbids, **supply the figure in code —
never relax the rule.** On failure: halt, retry once at most, then halt. Never publish a degraded
version, never skip to keep a run alive.

PHASE 3 wired the two integration TODOs — G5 freshness and real media resolution — and closed
four gaps between the code and the spec (see RUNLOG §29).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime, timezone

import media as media_mod

# ---- platform character limits (confirm exact values against each API on integration) ----
PLATFORM_LIMITS = {
    "youtube": 5000, "facebook": 63206, "instagram": 2200,
    "pinterest": 500, "x": 280,
}
PINTEREST_REQUIRED = ("title", "description", "alt_text", "destination_url")
MIN_CAPTION_CHARS = 40

ERROR_PATTERNS = re.compile(
    r"(Error:|Failed to load|undefined|null|No response|NaN|\{\{.*?\}\})", re.IGNORECASE
)
ALARM_PATTERNS = re.compile(
    r"(terrifying|disaster|you won'?t believe|shocking|panic|catastroph|\bDEADLY\b|!!+)",
    re.IGNORECASE,
)
# Fair-Housing / steering (G8): desirability or who-lives-where framing.
STEERING_PATTERNS = re.compile(
    r"(best (zip|zips|area|areas|neighborhood|place)s? to live|good neighborhood|bad neighborhood|"
    r"safe(st)? (area|neighborhood|zip)|unsafe (area|neighborhood)|nice(r)? area|"
    r"worst place to live|(who|what kind of people) live)",
    re.IGNORECASE,
)
GENERIC_BAIT = re.compile(r"(do you agree\??\s*(👇)?$|like and follow|comment below\s*👇?$)",
                          re.IGNORECASE)
# G9: the real local asks the voice guide names — guess / defend / tag / save / "which street".
REAL_ASK = re.compile(
    r"(send (this|it|these)?\s*to\b|share (this |it )?with|comment your|drop your|guess\b|"
    r"name the\b|tag (a|someone|him|her|them)\b|save this|which (street|zip|county|one)\b|"
    r"check yours|who else|reply with|defend it)", re.IGNORECASE
)
# G7: a risk claim has to arrive with something calm to DO about it.
RISK_WORDS = re.compile(
    r"(hail|storm|drought|outage|brownout|blackout|grid stress|premium|non-renewal|wildfire|"
    r"freeze|flood|heat advisory)", re.IGNORECASE)
# Deliberately generous. A gate that rejects the brand's own reference copy gets switched off,
# and a switched-off gate protects nothing — `tests/test_voice_guide_exemplars.py` holds this
# honest by running VOICE-GUIDE.md's own exemplars through the suite.
CALM_ACTION = re.compile(
    r"((get|have|getting)\s+(it|them|that|yours|this)?\s*(looked at|checked|inspected|seen)|"
    r"check your|checking your|inspect|schedule|book |plan |review your|before the\b|"
    r"this is the week to|worth (a look|checking)|set a reminder|worth checking)",
    re.IGNORECASE)

_DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}(?:T[\d:]+Z?)?")
LIVE_ANGLES = ("reveal", "verdict", "wager", "warning")


@dataclass
class GateResult:
    ok: bool
    failures: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def fail(self, gate: str, detail: str) -> None:
        self.ok = False
        self.failures.append(f"{gate}: {detail}")

    def __repr__(self) -> str:
        return ("GateResult(ok=True)" if self.ok
                else f"GateResult(ok=False, failures={self.failures})")


def _extract_numerals(text: str, drop_dates: bool = True) -> set[str]:
    """Numbers a reader would take as a claim. ISO dates are provenance, not claims."""
    if drop_dates:
        text = _DATE_RE.sub(" ", text or "")
    return {n.replace(",", "") for n in re.findall(r"\d[\d,]*\.?\d*%?", text or "")}


def _is_benign(numeral: str) -> bool:
    """Template-fixed counts, not data claims (e.g. "roofs 15+ years old"). Tune with the real
    templates; anything not listed here must trace to the story's own figure."""
    return numeral in {"15", "15+", "10", "7"}


# ---------------------------------------------------------------- G5

def staleness_bound_hours(metric: str, config: dict) -> float | None:
    """Exact match, then longest matching prefix key (so `permit_activity_` covers every trade).

    Returns None when nobody has decided how stale is too stale for this metric — which G5
    treats as a rejection, not a pass. An unbounded metric is an unanswered question, and
    withhold beats guess (harness Meta-Rule 6).
    """
    bounds = config.get("staleness_hours") or {}
    if metric in bounds:
        return float(bounds[metric])
    prefixes = [k for k in bounds if k.endswith("_") and metric.startswith(k)]
    if prefixes:
        return float(bounds[max(prefixes, key=len)])
    return None


def _check_freshness(post: dict, story: dict, config: dict, result: GateResult,
                     now: date | None = None) -> None:
    now = now or datetime.now(timezone.utc).date()
    as_of_raw = str(story.get("as_of") or post.get("as_of") or "")
    if not as_of_raw:
        result.fail("G5", "no as_of on the story or the piece")
        return
    try:
        as_of = datetime.fromisoformat(as_of_raw.replace("Z", "+00:00")).date()
    except ValueError:
        result.fail("G5", f"as_of {as_of_raw!r} is not a parseable date")
        return
    if as_of > now:
        result.fail("G5", f"as_of {as_of} is in the future (clock or feed error)")
        return

    metric = story.get("metric", "")
    bound = staleness_bound_hours(metric, config)
    if bound is None:
        result.fail("G5", f"no staleness bound configured for metric {metric!r} — add one to "
                          f"config.staleness_hours rather than publishing on an unbounded age")
        return
    age_hours = (now - as_of).days * 24
    if age_hours > bound:
        result.fail("G5", f"{metric} is {age_hours}h old, bound is {bound:.0f}h "
                          f"(as_of {as_of}) — stale data read as current is the scam-tell")


# ---------------------------------------------------------------- the suite

def validate_post(post: dict, story: dict | None, config: dict, feed: dict | None = None,
                  now: date | None = None, media_opener=None) -> GateResult:
    """Run every gate. `post` keys: platform, caption, on_screen_text (list[str]), media_url,
    destination_url, angle, has_source_card, has_media, requires_link, title,
    destination_theme, card_rows, card_numeric_cells; pinterest also title/description/alt_text.
    `feed` is the social-feed document, used by G6b for week_mode.
    """
    result = GateResult(ok=True)
    platform = post.get("platform", "")
    caption = post.get("caption", "") or ""
    on_screen = [t or "" for t in post.get("on_screen_text", [])]

    # ---- Baseline ----
    if not caption.strip():
        result.fail("BASE", "empty/whitespace caption")
    elif len(caption.strip()) < MIN_CAPTION_CHARS:
        result.fail("BASE", f"caption under {MIN_CAPTION_CHARS} chars ({len(caption.strip())})")
    if ERROR_PATTERNS.search(caption) or any(ERROR_PATTERNS.search(t) for t in on_screen):
        result.fail("BASE", "error pattern / unfilled {{slot}} reached output")
    limit = PLATFORM_LIMITS.get(platform)
    if limit and len(caption) > limit:
        result.fail("BASE", f"exceeds {platform} limit ({len(caption)}>{limit})")
    if platform and limit is None:
        result.fail("BASE", f"unknown platform {platform!r} — no character limit to check against")
    if platform == "pinterest":
        for field_name in PINTEREST_REQUIRED:
            if not post.get(field_name):
                result.fail("BASE", f"pinterest missing required field: {field_name}")
    if post.get("requires_link", True) and not post.get("destination_url"):
        result.fail("BASE", "linked piece missing destination_url")

    # media presence AND resolution (VALIDATOR.md baseline; Phase 3 wired the resolution)
    if post.get("has_media", True):
        ok, reason = media_mod.resolve(post.get("media_url"), opener=media_opener)
        if not ok:
            result.fail("BASE", f"media does not resolve — {reason}")
        else:
            result.notes.append(f"media: {reason}")

    # a rendered card with no body / a ranking card with no numbers is a published failure state
    if post.get("has_media", True) and "card_rows" in post:
        if not post.get("card_rows"):
            result.fail("BASE", "rendered card has zero body rows")
        elif post.get("card_kind") in ("ranking", "comparison") \
                and not post.get("card_numeric_cells"):
            result.fail("BASE", f"{post['card_kind']} card carries no numeric cells")

    # ---- G7 alarmism + a risk claim needs a calm action ----
    if ALARM_PATTERNS.search(caption) or any(ALARM_PATTERNS.search(t) for t in on_screen):
        result.fail("G7", "alarm/fear framing (poppy villain-framing ok, panic not)")
    if RISK_WORDS.search(caption) and not CALM_ACTION.search(caption):
        result.fail("G7", "risk claim with no paired calm action")

    # ---- G8 Fair-Housing / steering: caption, on-screen text AND title ----
    for surface in [caption, post.get("title", ""), post.get("description", "")] + on_screen:
        if STEERING_PATTERNS.search(surface or ""):
            result.fail("G8", "desirability/steering framing; anchor to a named measured metric")
            break

    # ---- G9 a real local ask, not generic bait ----
    if GENERIC_BAIT.search(caption.strip()):
        result.fail("G9", "generic engagement bait; use a real local ask")
    elif not REAL_ASK.search(caption):
        result.fail("G9", "no participation ask (guess / defend / tag / save / which street)")

    # ---- G6b quiet-week guard ----
    week_mode = (feed or {}).get("week_mode")
    if week_mode == "evergreen" and post.get("angle") in LIVE_ANGLES:
        result.fail("G6b", f"week_mode=evergreen but a live {post['angle']} format generated — "
                           f"manufactured urgency on a no-story week")
    if story is None:
        if post.get("angle") in LIVE_ANGLES:
            result.fail("G6b", "live angle generated without a backing story")
        return result

    # ---- G6 gated angle ----
    if not angle_data_available(story.get("metric", ""), config):
        result.fail("G6", f"angle needs {story.get('metric')!r}, whose ingest has not landed")

    _numeral_gates(post, story, result)
    _check_freshness(post, story, config, result, now)
    return result


def _numeral_gates(post: dict, story: dict, result: GateResult) -> None:
    caption = post.get("caption", "") or ""
    on_screen = [t or "" for t in post.get("on_screen_text", [])]
    surfaces = [caption] + on_screen

    # ---- G1 no numeral without provenance ----
    allowed = (_extract_numerals(story.get("figure", ""))
               | _extract_numerals(str(story.get("as_of", "")))
               | _extract_numerals(str(story.get("value", ""))))
    used: set[str] = set()
    for surface in surfaces:
        used |= _extract_numerals(surface)
    unbacked = sorted(n for n in used if n not in allowed and not _is_benign(n))
    if unbacked:
        result.fail("G1", f"numerals not present in the story's figure/data: {unbacked}")

    # ---- G2 source + timestamp on the piece: the CAPTION and the CARD, not one of them ----
    source = story.get("source", "")
    as_of = str(story.get("as_of", ""))
    if source:
        if source.lower() not in caption.lower():
            result.fail("G2", "source not visible in the caption")
        if post.get("has_media", True) and on_screen \
                and not any(source.lower() in t.lower() for t in on_screen):
            result.fail("G2", "source not visible on the card")
    if as_of:
        if as_of not in caption:
            result.fail("G2", "as_of not visible in the caption")
        if post.get("has_media", True) and on_screen \
                and not any(as_of in t for t in on_screen):
            result.fail("G2", "as_of not visible on the card")

    # ---- G3 sourcing survives atomization ----
    if post.get("has_media", True) and not post.get("has_source_card"):
        result.fail("G3", "media piece lacks its own on-screen source card (must survive the cut)")

    # ---- G4 claim <-> destination agreement ----
    metric = story.get("metric", "")
    theme = post.get("destination_theme", "")
    destination = (post.get("destination_url") or "").lower()
    if theme and metric and theme != metric and metric not in destination:
        result.fail("G4", f"destination theme {theme!r} mismatches story metric {metric!r}")


# ---- G6 gated-angle guard (feed-level; also callable before generation) ----
def angle_data_available(metric: str, config: dict) -> bool:
    entry = (config.get("gated_metrics") or {}).get(metric)
    return True if entry is None else bool(entry.get("available", False))
