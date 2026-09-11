"""
autopilot.py — the unattended cycle: pick, write, card, verify, merge, deploy, post.

THE ONE RULE THIS MODULE EXISTS TO ENFORCE
**Publish only on a clean sweep. On any doubt, skip and say so.**

Every gate must return an explicit clean pass. Not "did not raise" — *passed*. A gate that
errors, times out, or comes back UNVERIFIED is NOT a pass, and the difference matters more here
than anywhere else in the project: under review, an ambiguous gate produced a question to a
human. Unattended, it would produce a post. So ambiguity is routed to the same place as failure.

A skipped cycle is a normal Tuesday. A confident wrong post is the thing this brand cannot
survive, and it is permanent in a way a quiet week never is.

WHAT AUTO-MERGE MEANS HERE
It means merging something that has ALREADY passed every check — never skipping a check to
proceed. The merge happens after the article, its ledger, its card and the staged post are all
green; the post happens after the deploy is verified live. The order is load-bearing.

OBSERVABLE, NOT SILENT
Every outcome notifies: published (an FYI after the fact, with the live URLs), skipped (which
gate and why), paused. A run that does nothing because it is too soon is the one silent case,
because a daily driver that reports "nothing to do" six days a week trains you to ignore it.

THE KILL SWITCH
`is_paused()` is checked before anything is published, on every run. Two sources, either of
which pauses: the `AUTOPOSTER_PAUSED` environment variable (a GitHub Actions repository
variable — flip it in the UI in seconds, no commit), and `autopilot.paused` in config.yaml
(durable, survives a lost UI). Paused still builds and still notifies; it just never publishes.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import article_engine as engine
import card as card_mod
import channel_guard
import claim_ledger as ledger_mod
import publish_gate
import publish_target

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / "data" / "autopilot-state.json"

TRUTHY = {"1", "true", "yes", "on", "paused"}


@dataclass
class GateVerdict:
    """One gate's answer. `ok` is TRUE only on an explicit clean pass."""
    name: str
    ok: bool
    detail: str = ""

    def line(self) -> str:
        return f"{'PASS' if self.ok else 'FAIL'}  {self.name}" + (f" — {self.detail}"
                                                                  if self.detail else "")


@dataclass
class CycleDecision:
    action: str                       # publish | skip | paused | too_soon
    reason: str = ""
    verdicts: list[GateVerdict] = field(default_factory=list)
    article: dict | None = None
    card: dict | None = None
    post: dict | None = None
    claims: list = field(default_factory=list)

    @property
    def clean(self) -> bool:
        return bool(self.verdicts) and all(v.ok for v in self.verdicts)

    def notice(self) -> str:
        """The Slack message for this outcome. Every path produces one except `too_soon`."""
        if self.action == "too_soon":
            return ""
        if self.action == "paused":
            return (f"⏸ THI autoposter is PAUSED — nothing published.\n"
                    f"{self.reason}\n"
                    f"A cycle was prepared and held: {(self.article or {}).get('title', '—')}\n"
                    f"Resume by clearing AUTOPOSTER_PAUSED (or autopilot.paused in config).")
        if self.action == "would_publish":
            card = self.card or {}
            return (f"🧪 DRY RUN — every gate clean, nothing merged and nothing posted.\n"
                    f"WOULD publish: {card.get('question', '')}\n"
                    f"WOULD card   : {card.get('headline', '')} · {card.get('subhead', '')} · "
                    f"{card.get('source', '')}, {card.get('asOf', '')}")
        if self.action == "skip":
            failed = [v for v in self.verdicts if not v.ok]
            body = "\n".join(f"  • {v.name} — {v.detail}" for v in failed)
            return (f"⚠️ THI autoposter SKIPPED this cycle — nothing published.\n"
                    f"{self.reason}\n{body}\n"
                    f"No post goes out on an unclear gate. Nothing is broken; this cycle waits.")
        return "✅ published"                     # the real FYI is built by `published_notice`


def published_notice(decision: CycleDecision, article_url: str, post_url: str,
                     streak: int) -> str:
    """The after-the-fact FYI. Telling, not asking — so a bad post is caught in minutes."""
    card = decision.card or {}
    return (f"📣 THI posted (auto)\n"
            f"{card.get('question', '')}\n"
            f"{card.get('headline', '')} · {card.get('subhead', '')} · "
            f"{card.get('source', '')}, {card.get('asOf', '')}\n"
            f"Article: {article_url}\n"
            f"Facebook: {post_url}\n"
            f"Gates: {len(decision.verdicts)}/{len(decision.verdicts)} clean · streak {streak}")


# --------------------------------------------------------------------------- kill switch

def is_paused(config: dict, env: dict | None = None) -> tuple[bool, str]:
    """(paused, why). Checked before ANY publish, on every run.

    Two independent sources so a pause never depends on one of them being reachable. Either
    being set pauses; both being clear is the only way to publish. That asymmetry is the point:
    the failure mode of a confusing switch must be "stopped", never "running".
    """
    env = {} if env is None else env
    flag = str(env.get("AUTOPOSTER_PAUSED", "")).strip().lower()
    if flag in TRUTHY:
        return True, f"AUTOPOSTER_PAUSED={flag!r} in the environment"
    if (config.get("autopilot") or {}).get("paused") is True:
        return True, "autopilot.paused: true in config.yaml"
    return False, ""


# --------------------------------------------------------------------------- state

def load_state(path: Path | None = None) -> dict:
    path = path or STATE
    if not path.exists():
        return {"last_article_at": None, "cycles": 0}
    return json.loads(path.read_text())


def save_state(state: dict, path: Path | None = None) -> None:
    path = path or STATE
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, indent=2) + "\n")


def due(state: dict, config: dict, today: date) -> tuple[bool, str]:
    """Has enough time passed? The minimum is a floor, the maximum is only a prompt to look."""
    cadence = config.get("cadence") or {}
    minimum = cadence.get("article_days_min", 3)
    last = state.get("last_article_at")
    if not last:
        return True, "no article recorded yet"
    elapsed = (today - date.fromisoformat(last)).days
    if elapsed < minimum:
        return False, f"{elapsed}d since the last article; the floor is {minimum}d"
    return True, f"{elapsed}d since the last article"


# --------------------------------------------------------------------------- the sweep

def _verdict(name: str, fn) -> GateVerdict:
    """Run one gate. An EXCEPTION IS A FAILURE, never an absence of an opinion.

    This wrapper is the whole safety argument in four lines. Under review a raising gate
    produced a traceback a human read. Unattended, an unhandled raise would either crash the run
    (fine) or, worse, be caught somewhere generic and treated as "no objection". Here every gate
    lands in the same place: ok, or not ok with a reason.
    """
    try:
        ok, detail = fn()
        return GateVerdict(name, bool(ok), detail)
    except Exception as exc:                       # noqa: BLE001 — deliberate: see docstring
        return GateVerdict(name, False, f"{type(exc).__name__}: {exc}")


def evaluate(config: dict, *, today: date, write_fn, build_claims_fn, articles: dict,
             link_opener, media_opener, captions: dict,
             state: dict | None = None, env: dict | None = None) -> CycleDecision:
    """Build the whole cycle and collect every gate's verdict. PUBLISHES NOTHING.

    Ordered so the cheap, local checks fail before the network ones, and so a failure names the
    earliest thing that was actually wrong rather than a downstream symptom.
    """
    state = state if state is not None else load_state()
    decision = CycleDecision(action="skip")

    ready, why = due(state, config, today)
    if not ready:
        return CycleDecision(action="too_soon", reason=why)

    # ---- the engine's own run carries topic choice, ledger, prose gates, card and two-lock.
    # It RAISES on any of them, which is exactly right here: a halt is a skip with a reason.
    try:
        result = engine.run("thi", write_fn=write_fn, build_claims_fn=build_claims_fn,
                            today=today, articles=articles, exclude_published=True)
    except Exception as exc:                       # noqa: BLE001
        decision.reason = "the article could not be produced cleanly"
        decision.verdicts = [GateVerdict("article-engine", False,
                                         f"{type(exc).__name__}: {exc}")]
        return decision

    article, claims, card = result["article"], result["claims"], result["card"]
    article = dict(article, frontmatter=engine.frontmatter(
        article, claims, result["card_frontmatter"], today))
    decision.article, decision.card, decision.claims = article, card, claims
    decision.reason = f"topic: {result['topic']['id']}"

    verdicts = [
        GateVerdict("topic-selection", True, result["topic"]["id"]),
        GateVerdict("claim-ledger", True, f"{result['ledger_checked']} claims verified"),
        GateVerdict("prose-gates", True, "every numeral traces to a claim"),
        GateVerdict("two-lock-publish", True, result["target"]["site_domain"]),
        GateVerdict("model-budget", result["model_calls"] == 1,
                    f"{result['model_calls']} model call(s)"),
    ]

    # ---- freshness of every claim the piece rests on, re-checked at publish time rather than
    # trusted from when the feed was built.
    verdicts.append(_verdict("claim-freshness", lambda: (
        ledger_mod.verify_ledger(claims, config, today).ok,
        "all claims inside their staleness bounds")))

    # ---- the card the reader will actually see must exist and match the ledger.
    def _card_gate():
        path = card_mod.sidecar_path(article["slug"], config)
        sidecar = json.loads(path.read_text()) if path.exists() else None
        r = card_mod.verify_card(card, claims, slug=article["slug"], article=article,
                                 sidecar=sidecar, require_sidecar=True)
        return r.ok, "; ".join(r.failures) if r.failures else "rendered card matches the ledger"
    verdicts.append(_verdict("card", _card_gate))

    # ---- the channel: enabled AND pinned, or it is not postable.
    verdicts.append(_verdict("channel-guard", lambda: (
        channel_guard.postable_platforms(config) == ["facebook"],
        "facebook pinned and enabled")))

    # ---- the post itself: full social suite, destination + media resolution, duplicate check.
    def _post_gate():
        post, gate = engine.build_facebook_promo(
            article, claims, config, today, link_opener=link_opener,
            media_opener=media_opener, caption=captions.get(result["topic"]["id"]))
        decision.post = post
        return gate.ok, "; ".join(gate.failures) if gate.failures else "9/9 social gates"
    verdicts.append(_verdict("social-suite+destination+media+duplicate", _post_gate))

    decision.verdicts = verdicts
    if not decision.clean:
        decision.reason = "a gate did not return a clean pass"
        return decision

    paused, why = is_paused(config, env)
    if paused:
        return CycleDecision(action="paused", reason=why, verdicts=verdicts,
                             article=article, card=card, post=decision.post)

    decision.action = "publish"
    return decision


# --------------------------------------------------------------------------- acting on it

def run_cycle(config: dict, *, today: date, notify_fn, merge_fn=None, deploy_wait_fn=None,
              publish_fn=None, verify_opener=None, state_path: Path | None = None,
              ledger_path: Path | None = None, dry_run: bool = False,
              **evaluate_kwargs) -> CycleDecision:
    """Evaluate, then act. The ONLY path that publishes.

    `merge_fn` merges the already-green site PR, `deploy_wait_fn` blocks until the deploy is
    live, `publish_fn` posts. Injected so the whole sequence is testable without touching
    GitHub, Cloudflare or Facebook.

    `dry_run=True` does EVERYTHING except the two irreversible acts: it picks, writes, builds the
    card, runs every gate, and reports what it would have done — then stops before the merge and
    the post, touches no state and writes no ledger row. It is the mode to run before putting a
    cycle on a timer, and the mode to run when you want to see what the machine currently thinks
    without letting it act on the answer. A dry run that reports PUBLISH is the strongest
    statement available short of publishing.
    """
    state = load_state(state_path)
    decision = evaluate(config, today=today, state=state, **evaluate_kwargs)

    if decision.action == "too_soon":
        return decision
    if decision.action in ("skip", "paused"):
        notify_fn(decision.notice())
        return decision

    if dry_run:
        decision.action = "would_publish"
        return decision

    # ---- publish. Merge the reviewed-and-green PR, wait for the deploy, THEN post.
    if merge_fn:
        # The decision, not just a slug: the merger needs the article body, its
        # frontmatter and its card, and passing the whole thing means the signature
        # does not change again the first time it needs one more field.
        merge_fn(decision)
    if deploy_wait_fn:
        deploy_wait_fn(decision.article["canonical_url"])

    # The destination is re-verified AFTER the deploy, because everything checked above was
    # checked against a site that did not yet carry this article.
    live_ok, live_detail = verify_opener(decision.article["canonical_url"])
    if not live_ok:
        decision.action = "skip"
        decision.verdicts.append(GateVerdict("post-deploy-destination", False, live_detail))
        decision.reason = "the article did not come up live after the deploy"
        notify_fn(decision.notice())
        return decision

    streak = ((config.get("channels") or {}).get("facebook") or {}).get("clean_streak", 0) + 1
    record = publish_gate.publish_with_verification(
        decision.post, publish_fn=publish_fn, verify_opener=verify_opener,
        streak_after=streak, article_slug=decision.article["slug"],
        ledger_path=ledger_path)

    save_state({**state,
                "last_article_at": today.isoformat(),
                "cycles": state.get("cycles", 0) + 1}, state_path)
    notify_fn(published_notice(decision, decision.article["canonical_url"],
                               record["post_url"], streak))
    return decision
