"""
validator.py — the content-quality floor as CODE GATES (VALIDATOR.md, social-autoposter step 11b).

Build/verify this BEFORE any generation logic. Proving posting works says nothing about whether
content is fit to publish. This module is THI's moat in code: poppy wrapper, sober receipts.

Governing rule: every content-quality problem is a gate here, never a model instruction.
On failure: reject -> caller retries once at most -> halt. NEVER publish a degraded version.

This file is intentionally repo-independent and unit-testable now. The only external inputs are:
  - a `post` dict (the generated piece)
  - the `story` dict it was generated from (from social-feed stories[])
  - `config` (from config.yaml)
Wire the platform limits / media-resolve checks to real values on integration (marked TODO).
"""

from __future__ import annotations
import re
from dataclasses import dataclass, field

# ---- platform character limits (confirm exact values on integration) ----
PLATFORM_LIMITS = {
    "youtube": 5000, "facebook": 63206, "instagram": 2200,
    "pinterest": 500, "x": 280,
}
PINTEREST_REQUIRED = ("title", "description", "alt_text", "destination_url")

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
    r"(who|what kind of people) live)",
    re.IGNORECASE,
)
GENERIC_BAIT = re.compile(r"(do you agree\??\s*(👇)?$|like and follow|comment below\s*👇?$)", re.IGNORECASE)


@dataclass
class GateResult:
    ok: bool
    failures: list[str] = field(default_factory=list)

    def fail(self, gate: str, detail: str) -> None:
        self.ok = False
        self.failures.append(f"{gate}: {detail}")


_DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}(?:T[\d:]+Z?)?")

def _extract_numerals(text: str, drop_dates: bool = True) -> set[str]:
    # numbers incl. %, decimals, ranges; normalize by stripping commas.
    # Dates (ISO) are provenance, not claims — strip them before extracting.
    if drop_dates:
        text = _DATE_RE.sub(" ", text or "")
    return {n.replace(",", "") for n in re.findall(r"\d[\d,]*\.?\d*%?", text or "")}


def validate_post(post: dict, story: dict | None, config: dict) -> GateResult:
    """Run every gate. `post` keys expected:
       platform, caption, on_screen_text (list[str] for video frames), media_url,
       destination_url, angle, has_source_card (bool per piece), as_of, source,
       (pinterest also: title, description, alt_text)
    """
    r = GateResult(ok=True)
    platform = post.get("platform", "")
    caption = post.get("caption", "") or ""

    # ---- Baseline gates ----
    if not caption.strip():
        r.fail("BASE", "empty/whitespace caption")
    if ERROR_PATTERNS.search(caption):
        r.fail("BASE", "error pattern / unfilled slot reached output")
    limit = PLATFORM_LIMITS.get(platform)
    if limit and len(caption) > limit:
        r.fail("BASE", f"exceeds {platform} limit ({len(caption)}>{limit})")
    if platform == "pinterest":
        for fld in PINTEREST_REQUIRED:
            if not post.get(fld):
                r.fail("BASE", f"pinterest missing required field: {fld}")
    if post.get("destination_url") in (None, "",) and post.get("requires_link", True):
        r.fail("BASE", "linked piece missing destination_url")
    # media presence (resolution check is integration-time TODO)
    if post.get("has_media", True) and not post.get("media_url"):
        r.fail("BASE", "media absent / url missing")

    # ---- G7 Alarm / tone ----
    if ALARM_PATTERNS.search(caption) or any(ALARM_PATTERNS.search(t or "") for t in post.get("on_screen_text", [])):
        r.fail("G7", "alarm/fear framing (poppy villain-framing ok, panic not)")

    # ---- G8 Fair-Housing / steering (applies to caption, on-screen text, AND title) ----
    steer_surfaces = [caption, post.get("title", "")] + list(post.get("on_screen_text", []))
    if any(STEERING_PATTERNS.search(s or "") for s in steer_surfaces):
        r.fail("G8", "desirability/steering framing; anchor to a named measured metric instead")

    # ---- G9 Ask present (real local ask, not generic bait) ----
    if GENERIC_BAIT.search(caption.strip()):
        r.fail("G9", "generic engagement bait; use a real local ask")
    # (Presence of *some* ask is content-shaped; enforce via template + spot-check.)

    # ---- Story-dependent gates (skip only for evergreen pieces with no story) ----
    if story is not None:
        _numeral_gates(post, story, r)
    elif post.get("angle") in ("reveal", "verdict", "wager", "warning"):
        r.fail("G6b", "live angle generated without a backing story (quiet-week guard)")

    return r


def _numeral_gates(post: dict, story: dict, r: GateResult) -> None:
    caption = post.get("caption", "") or ""
    surfaces = [caption] + list(post.get("on_screen_text", []))

    # ---- G1 No numeral without provenance ----
    allowed = _extract_numerals(story.get("figure", "")) | _extract_numerals(str(story.get("as_of", "")))
    # allow the story's own metric value too
    allowed |= _extract_numerals(str(story.get("value", "")))
    used = set()
    for s in surfaces:
        used |= _extract_numerals(s)
    unbacked = {n for n in used if n not in allowed and not _is_benign(n)}
    if unbacked:
        r.fail("G1", f"numerals not present in story figure/data: {sorted(unbacked)}")

    # ---- G2 Source + timestamp present ON THE PIECE ----
    text_all = " ".join(surfaces)
    if story.get("source", "") and story["source"].lower() not in text_all.lower():
        r.fail("G2", "source not visible on the piece")
    if not post.get("has_source_card") and post.get("has_media", True):
        r.fail("G3", "media piece lacks on-screen source card (must survive atomization)")

    # ---- G4 Claim <-> destination agreement ----
    metric = story.get("metric", "")
    dest = (post.get("destination_url") or "").lower()
    hint = post.get("destination_theme", "")
    if hint and metric and hint != metric and metric not in dest:
        r.fail("G4", f"destination theme '{hint}' mismatches story metric '{metric}'")

    # ---- G5 Freshness (config staleness bound) ----
    # integration-time: parse as_of, compare to now against config['staleness_hours'][metric].
    # Left as TODO to avoid a clock dependency in the unit-testable core.


def _is_benign(numeral: str) -> bool:
    # ages/counts that are template-fixed, not data claims (e.g. "15+ years old roof")
    return numeral in {"15", "15+", "10", "7"}  # tune with real templates


# ---- G6 Gated-angle guard (feed-level; call before generation) ----
def angle_data_available(angle_metric: str, config: dict) -> bool:
    gated = config.get("gated_metrics", {})
    entry = gated.get(angle_metric)
    return True if entry is None else bool(entry.get("available", False))


if __name__ == "__main__":
    import json, sys
    # tiny smoke test with the example story
    story = {
        "metric": "drought_stage", "figure": "+2 stages (now Stage 3)",
        "source": "US Drought Monitor", "as_of": "2026-05-13", "value": 3,
    }
    good = {
        "platform": "facebook", "angle": "warning",
        "caption": "Travis County: drought jumped +2 stages (now Stage 3) — source: US Drought Monitor, as of 2026-05-13. Roofs 15+ years, get looked at. Send to a neighbor. https://x",
        "on_screen_text": ["+2 stages (now Stage 3)", "US Drought Monitor · 2026-05-13"],
        "media_url": "x", "has_source_card": True, "destination_url": "https://x", "destination_theme": "drought_stage",
    }
    bad = {
        "platform": "facebook", "angle": "warning",
        "caption": "SHOCKING!! Best zips to live in Travis — appraisals up 47%!! do you agree? 👇",
        "on_screen_text": [], "media_url": "", "has_source_card": False, "requires_link": True,
    }
    print("GOOD:", validate_post(good, story, {}))
    print("BAD :", validate_post(bad, story, {"gated_metrics": {}}))
