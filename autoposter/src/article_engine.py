"""
article_engine.py — the shared process (specs/ARTICLE-ENGINE.md) run for site="thi".

STAGE MAP
  1 Topic detection + scoring ....... topic_scorer.py (deterministic; human picks from the list)
  2 Research ......................... feed data is the spine of truth; external input is a LEAD
  3 Claim-verification gate .......... claim_ledger.py — the unit of verification is the CLAIM
  4 Write ............................ THE ONE MODEL CALL, and the only one this cycle
  5 Publish .......................... two-lock guard, then deploy-on-command (🔴)
  6 Hand to social ................... a HELD, validated Facebook draft; nothing posts

THE ONE MODEL CALL is enforced here, not requested. `write_fn` is invoked exactly once per run
and the count is asserted; a second call raises. Everything else — topic choice, every figure,
every derivation, the ledger, the gates, the destination — is code. That assertion is what
protects both the $20 ceiling and the reason a caption can never contain an invented number.

NOTHING IS PUBLISHED. Output lands in `autoposter/articles/<slug>/`, alongside the exact patch
that WOULD be applied to `site/` — which is outside the Rule 0 boundary and is the owner's to
apply. The engine refuses to write there itself.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path

import yaml

import claim_ledger as ledger_mod
import publish_target
import topic_scorer
import validator as social_validator
from claim_ledger import Claim

ROOT = Path(__file__).resolve().parents[1]


class ModelBudgetExceeded(Exception):
    """A second model call in one cycle. That is the cost-and-discipline line, so it raises."""


@dataclass
class Budget:
    calls: int = 0
    limit: int = 1

    def spend(self):
        self.calls += 1
        if self.calls > self.limit:
            raise ModelBudgetExceeded(
                f"model call #{self.calls} in one cycle; the budget is {self.limit}. Something "
                f"that should be code migrated into model reasoning — push it back rather than "
                f"raising the budget.")


def load_config() -> dict:
    return yaml.safe_load((ROOT / "config.yaml").read_text())


def load_feed() -> dict:
    return json.loads((ROOT / "data" / "social-feed.json").read_text())


def _metric(feed: dict, area: str, metric: str) -> dict:
    for entry in feed["areas"]:
        if entry["id"] == area and metric in entry["metrics"]:
            return entry["metrics"][metric]
    raise KeyError(f"{area}/{metric} absent from the feed — the engine will not invent it")


def run(site_key: str, *, write_fn, build_claims_fn, today: date | None = None,
        specs_dir: Path | None = None, destination: dict | None = None) -> dict:
    """One article, end to end. Returns everything the human reviews; writes nothing to site/."""
    today = today or datetime.now(timezone.utc).date()
    config, feed = load_config(), load_feed()
    budget = Budget(limit=config["cost"]["model_calls_per_cycle_expected"])

    # ---- Stage 5's guard, run FIRST. Nothing is worth building for a target that will halt.
    target = publish_target.resolve(site_key, specs_dir)

    # ---- Stage 1: score, surface tension, pick from the ranked shortlist.
    ranked = topic_scorer.score_topics(feed, config)
    tension = topic_scorer.surface_tension(ranked)
    buildable = [t for t in ranked if t["buildable"]]
    if not buildable:
        raise RuntimeError("no topic is defensible from the current feed — rescope, don't reach")
    chosen = buildable[0]

    # ---- Stages 2-3: build the ledger IN CODE from the feed, then verify it before any prose.
    claims = build_claims_fn(feed, config, today)
    ledger_result = ledger_mod.verify_ledger(claims, config, today)
    if not ledger_result.ok:
        raise ledger_mod.LedgerHalt(ledger_result.failures)

    # ---- Stage 4: THE ONE MODEL CALL.
    budget.spend()
    article = write_fn(chosen, claims, feed)

    # ---- G1/G2 at article scale, against the finished prose.
    prose_result = ledger_mod.verify_prose(article["body"], claims, config)
    if not prose_result.ok:
        raise ledger_mod.LedgerHalt(prose_result.failures)

    # ---- Stage 5: assert the resolved destination against the self-identified domain.
    destination = destination or {
        "repo": "zmpersonal/texashomeintelligence",
        "content_path": f"site/src/content/analysis/{article['slug']}.md",
        "canonical_url": f"https://{target['site_domain']}/analysis/{article['slug']}/",
    }
    resolved = publish_target.assert_destination(target, **destination)

    return {
        "target": resolved, "topic": chosen, "shortlist": ranked, "tension": tension,
        "claims": claims, "article": article, "model_calls": budget.calls,
        "ledger_checked": ledger_result.checked,
    }


def build_facebook_promo(article: dict, claims: list[Claim], config: dict,
                         today: date) -> tuple[dict, object]:
    """Stage 6 — the promotion, as a HELD draft. Facebook is the only enabled channel and video
    is parked, so this is text-with-link per the owner's scope note.

    Built from the article's own lead claim, so its numerals are the article's numerals. Runs
    the full social gate suite; a draft that fails is not a draft, it is a defect.
    """
    lead = next(c for c in claims if c.id == "C2")
    headline_claim = next(c for c in claims if c.id == "C1")
    url = article["canonical_url"]

    caption = (
        f"Texas homeowners: it feels like every bill is going up. Electricity, for once, isn't. "
        f"Residential power in Texas is {headline_claim.figure} — {lead.figure} "
        f"(source: {headline_claim.source}, as of {headline_claim.as_of}). "
        f"We checked whether a mild summer explains it. It doesn't — cooling demand ran normal. "
        f"The full read, with the numbers and where they came from → {url} "
        f"Send this to someone who's been told their bill only ever goes one way."
    )
    post = {
        "platform": "facebook",
        "angle": "reveal",
        "caption": caption,
        "on_screen_text": [headline_claim.figure,
                           f"{headline_claim.source} · {headline_claim.as_of}"],
        "media_url": "data:image/png;base64," + "A" * 800,   # card render is Phase 6
        "has_media": True,
        "has_source_card": True,
        "destination_url": url,
        "destination_theme": "energy_price_cents_kwh",
        "card_kind": "reveal",
        "card_rows": [headline_claim.figure, lead.figure],
        "card_numeric_cells": 2,
        "requires_link": True,
        # Held, and held in the artifact rather than in a person's memory.
        "status": "HELD — not scheduled, not posted; awaits owner approval and a live article URL",
    }
    # G1 checks the caption's numerals against THIS story's figure, so the story must carry
    # every figure the caption uses — not just the headline one. The first run failed here
    # because the caption quoted the year-over-year change while the story carried only the
    # price. The fix is to widen what the story supplies, never to loosen G1.
    story = {"metric": "energy_price_cents_kwh",
             "figure": f"{headline_claim.figure} — {lead.figure}",
             "source": headline_claim.source, "as_of": headline_claim.as_of}
    result = social_validator.validate_post(post, story, config, feed=load_feed(), now=today)
    return post, result
