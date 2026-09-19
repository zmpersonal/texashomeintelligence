#!/usr/bin/env python3
"""
sweep-builder-gates.py — run EVERY builder through the whole gate suite, ahead of its rotation.

WHY THIS EXISTS
Two production blocks in one day had the same shape: a builder carried a latent gate failure
that only surfaced when rotation reached it.

  * San Antonio's title was 65 characters. The card generator refuses to crop, so the cycle
    could not render a card — discovered the day that topic came up.
  * The summer builder's caption quotes 1991, 2020 and 30, which its story does not supply, so
    G1 refuses the promo — discovered the moment the San Antonio article merged and rotation
    advanced one place.

Only one builder is exercised per cycle: the one that ranks highest and is not already
published. Every other builder's current-period output is unexamined until its turn, and its
turn is in production. That is a crack in hands-off — the machine is fine, but it stops for a
day each time it meets a builder nobody checked.

This sweep runs all of them NOW: claims, ledger, prose, card, and the full social suite on the
promo each would emit for its own current period. It bypasses rotation deliberately — a topic
already published is exactly the one whose NEXT period nobody has looked at.

It publishes nothing, writes nothing outside a temp directory, and makes no network call: the
destination and media openers are stubbed, because this asks whether a builder's OUTPUT passes
its gates, not whether a URL that does not exist yet resolves.

Exit 0 when every builder is clean. Run from `autoposter/`.
"""
from __future__ import annotations

import copy
import json
import sys
import tempfile
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import article_engine as engine          # noqa: E402
import card as card_mod                  # noqa: E402
import topic_scorer                      # noqa: E402
import claim_ledger as ledger_mod        # noqa: E402
import run_article                       # noqa: E402

OK = lambda url: (True, "stubbed — this sweep judges output, not URLs")   # noqa: E731


def sweep_one(topic_id: str, builder, config: dict, today: date) -> list[tuple[str, bool, str]]:
    """Every gate, in the order the cycle runs them. Each returns (gate, ok, detail)."""
    results: list[tuple[str, bool, str]] = []

    def record(gate, fn):
        try:
            ok, detail = fn()
            results.append((gate, bool(ok), detail))
            return bool(ok)
        except Exception as exc:                   # noqa: BLE001
            results.append((gate, False, f"{type(exc).__name__}: {exc}"))
            return False

    feed = engine.load_feed()
    build_claims_fn, write_fn = builder
    topic = next(t for t in topic_scorer.score_topics(feed, config) if t["id"] == topic_id)

    state: dict = {}

    def claims_gate():
        state["claims"] = build_claims_fn(feed, config, today)
        r = ledger_mod.verify_ledger(state["claims"], config, today)
        return r.ok, (f"{len(state['claims'])} claims verified" if r.ok
                      else "; ".join(r.failures))
    if not record("claim-ledger", claims_gate):
        return results

    def prose_gate():
        state["article"] = write_fn(topic, state["claims"], feed)
        r = ledger_mod.verify_prose(state["article"]["body"], state["claims"], config)
        return r.ok, ("every numeral traces to a claim" if r.ok else "; ".join(r.failures))
    if not record("prose-gates", prose_gate):
        return results

    article = state["article"]
    article["canonical_url"] = (f"https://{(config.get('publish') or {}).get('site_domain')}"
                                f"/analysis/{article['slug']}/")

    def title_gate():
        title = article["title"]
        # The card generator refuses to crop, so an over-long title is an unrenderable card.
        return len(title) <= 55, f"{len(title)} chars — {title}"
    record("card-title-length", title_gate)

    def card_gate():
        state["card"] = card_mod.build_card(article, state["claims"])
        r = card_mod.verify_card(state["card"], state["claims"], slug=article["slug"],
                                 article=article)
        return r.ok, ("card matches the ledger" if r.ok else "; ".join(r.failures))
    if not record("card", card_gate):
        return results

    def promo_gate():
        directory = Path(tempfile.mkdtemp())
        (directory / f"{article['slug']}.json").write_text(json.dumps(
            {"path": f"/images/og/{article['slug']}.png", "width": 1200, "height": 630,
             "alt": "…", "rendered": state["card"]}))
        cfg = copy.deepcopy(config)
        cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=str(directory),
                              published_ledger=str(directory / "empty.json"))
        caption = run_article.TOPIC_CAPTIONS.get(topic_id)
        _post, gate = engine.build_facebook_promo(
            article, state["claims"], cfg, today, link_opener=OK, media_opener=OK,
            caption=caption, defer_resolution=True)
        return gate.ok, ("9/9 social gates" if gate.ok else "; ".join(gate.failures))
    record("social-suite", promo_gate)
    return results


def main() -> int:
    config = engine.load_config()
    # An explicit date sweeps a period the calendar has not reached yet. The point of the sweep
    # is to catch a builder's gate bug AHEAD of its rotation, and a builder whose next period is
    # already in the data can be swept now rather than on the morning it goes out.
    today = date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else date.today()
    print(f"[sweep] every builder's CURRENT-PERIOD output against every gate, {today}\n")
    failing: list[str] = []
    for topic_id, builder in sorted(run_article.TOPIC_ARTICLES.items()):
        results = sweep_one(topic_id, builder, config, today)
        clean = all(ok for _g, ok, _d in results)
        print(f"{'PASS' if clean else 'FAIL'}  {topic_id}")
        for gate, ok, detail in results:
            if not ok:
                print(f"        {gate}: {detail[:200]}")
        if not clean:
            failing.append(topic_id)
    total = len(run_article.TOPIC_ARTICLES)
    print(f"\n[sweep] {total - len(failing)}/{total} builders clean")
    if failing:
        print(f"[sweep] latent failures, ahead of rotation: {', '.join(failing)}")
    return 1 if failing else 0


if __name__ == "__main__":
    sys.exit(main())
