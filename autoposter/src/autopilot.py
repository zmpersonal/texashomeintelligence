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
import re
import time
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
    # TRUE when the destination/media resolution checks were deferred to after the deploy.
    # While this is true the post is NOT cleared to go out, no matter how clean `verdicts` is.
    resolution_pending: bool = False
    # Which side-effect stage raised, when `action` is "halted". Names the state the article is
    # in, which is the thing a human needs at 2am and cannot infer from a stack trace.
    failed_stage: str = ""
    # The audit-record PR the cycle opened and merged for itself. Carried so the FYI can show
    # the trail — the PR is never something a human has to act on, only something they can read.
    pr_url: str = ""
    # TRUE when this cycle is recovering an already-published article rather than publishing a
    # new one. It changes three things and nothing else: no merge, no deploy, no cadence floor.
    promotion: bool = False
    # Set the moment a post actually goes out. Present means something is live on a real page.
    post_url: str = ""
    # The post-deploy verdicts. Empty until the deploy has happened and they have actually run.
    live_verdicts: list[GateVerdict] = field(default_factory=list)

    @property
    def clean(self) -> bool:
        """The CONTENT sweep. Everything that judges the article itself.

        Deliberately NOT the whole story: a clean content sweep authorises a DEPLOY, not a post.
        `cleared_to_post` is the one that authorises a post.
        """
        return bool(self.verdicts) and all(v.ok for v in self.verdicts)

    @property
    def is_broken(self) -> bool:
        """Is this outcome a BROKEN PIPELINE rather than a normal quiet one?

        A skip, a pause, a too-soon and a post withheld because a live URL did not resolve are
        all normal and stay green — a quiet week must not look like a fault or the red stops
        meaning anything. A crash in the publisher, or a post that went out without being
        recorded, are faults and must be red.
        """
        if self.action in ("halted", "posted_unconfirmed"):
            return True
        return self.action == "posted_nothing" and self.failed_stage == "publish"

    @property
    def cleared_to_post(self) -> bool:
        """The only property the publish path may consult. Content clean AND, if resolution was
        deferred, the post-deploy checks have RUN and passed.

        An empty `live_verdicts` is NOT a pass — `all([])` is True, and relying on that would
        mean a cycle whose live checks never ran sails straight through. So this asks for the
        verdicts to EXIST as well as to pass.

        The requirement is unconditional, not "only when resolution was deferred". There is no
        case where posting without verifying the live destination is correct, and an earlier
        draft that made it conditional left the non-deferred path with nothing stopping a
        publish if the verification block were ever removed. Found by deleting that block and
        watching a post go out.
        """
        if not self.clean:
            return False
        if not self.live_verdicts:
            return False
        return all(v.ok for v in self.live_verdicts)

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
            live = (f"\nLive checks : SIMULATED ({len(self.live_verdicts)}) — no deploy "
                    f"happened, so no URL was actually verified." if self.live_verdicts else "")
            return (f"🧪 DRY RUN — every content gate clean, nothing merged and nothing posted.\n"
                    f"WOULD publish: {card.get('question', '')}\n"
                    f"WOULD card   : {card.get('headline', '')} · {card.get('subhead', '')} · "
                    f"{card.get('source', '')}, {card.get('asOf', '')}{live}")
        if self.action == "halted":
            where = {
                "merge": ("The article was NOT published. It may have left a branch or an open "
                          "PR behind — check the repo before the next cycle."),
                "deploy": ("The article WAS merged and will appear once the build lands. "
                           "Nothing went to Facebook."),
            }.get(self.failed_stage, "State unknown; check the run log.")
            return (f"🛑 THI autoposter HALTED at the {self.failed_stage} step — nothing posted.\n"
                    f"{self.reason}\n"
                    f"{where}\n"
                    f"This is a broken pipeline, not a quiet week. The run is red on purpose.")
        if self.action == "posted_unconfirmed":
            return (f"🚨 THI autoposter: THE POST IS LIVE BUT UNRECORDED — a human must "
                    f"reconcile.\n"
                    f"{self.reason}\n"
                    f"Facebook: {self.post_url or '(url unknown — check the page)'}\n"
                    f"Article: {(self.article or {}).get('canonical_url', '')}\n"
                    f"The post went out. The cycle could not finish recording or announcing it, "
                    f"so the ledger and the cadence clock may not reflect it. Check the page "
                    f"before the next cycle runs.")
        if self.action == "posted_nothing":
            failed = [v for v in self.live_verdicts if not v.ok]
            body = "\n".join(f"  • {v.name} — {v.detail}" for v in failed)
            card = self.card or {}
            return (f"⚠️ THI autoposter: ARTICLE LIVE, POST WITHHELD — link/media unverified.\n"
                    f"{card.get('question', '')}\n"
                    f"Article: {(self.article or {}).get('canonical_url', '')}\n"
                    f"{body}\n"
                    f"The article passed every content gate and is published. Nothing went to "
                    f"Facebook, because the post would have pointed at a URL this run could not "
                    f"verify. No post goes out on an unclear gate.")
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
            + (f"PR: {decision.pr_url}\n" if decision.pr_url else "") +
            f"Gates: {len(decision.verdicts)}/{len(decision.verdicts)} content · "
            f"{len(decision.live_verdicts)}/{len(decision.live_verdicts)} live · "
            f"streak {streak}")


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
    try:
        return json.loads(path.read_text())
    except Exception as exc:                       # noqa: BLE001
        # A corrupt state file must not crash the run before anything has happened. Treating it
        # as "no history" is the SAFE direction only because `due()` then returns True and the
        # gates still decide — and a cycle that publishes is far less bad than a daily crash
        # nobody can diagnose. Loud in the log, because a lost clock is worth knowing about.
        print(f"[warn] state file at {path} is unreadable ({type(exc).__name__}: {exc}); "
              f"treating this as no recorded history")
        return {"last_article_at": None, "cycles": 0}


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

def _safe_notify(notify_fn, message: str, decision: "CycleDecision") -> None:
    """Deliver a notice, and never let the DELIVERY failure replace the OUTCOME.

    Every notice in this module reports something that already happened. If Slack is down, the
    thing still happened — and raising here would turn a clean skip into a red traceback, or
    swallow a halt behind an unrelated HTTP 503. That is the exact regression shape this project
    has hit three times: the report of a failure failing, and taking the report with it.

    So the outcome is preserved and the delivery failure is written where it will still be read.
    The run's exit code already comes from `is_broken`, so a broken cycle stays red regardless
    of whether anyone could be told about it.
    """
    try:
        notify_fn(message)
    except Exception as exc:                       # noqa: BLE001 — deliberate: see docstring
        print(f"[CRITICAL] could not deliver the notice for {decision.action!r}: "
              f"{type(exc).__name__}: {exc}")
        print(f"[CRITICAL] the outcome stands regardless:\n{message}")


def promotable_orphans(config: dict, *, today: date, write_fn, build_claims_fn,
                       articles: dict, ledger_path: Path | None = None) -> list[dict]:
    """Articles that are LIVE on the site but carry no ledger row — published, never promoted.

    THE FLAW THIS CLOSES. The cycle merges the article before it posts, so any failure after the
    merge left a correct, deployed article with no promotion — and article selection, which
    excludes anything already on the site, then wrote it off forever. Two articles were lost
    that way in one day: one to a publisher crash, one to a CDN deploy race.

    "Published" and "promoted" are now separate states. The LEDGER is the record of promotion;
    the site is the record of publication. An article in the second and not the first is
    recoverable rather than spent.

    NO HOLE IS PUT IN THE DUPLICATE GATE, and none is needed. That gate keys the ledger, and an
    orphan has no ledger row — it was never blocked by the gate, only by selection. These are
    two different mechanisms and only selection changes. Once a promo lands, the row exists and
    the gate refuses a second one forever, exactly as before.

    One honest limit: a builder's ledger is rebuilt for the period its DATA currently holds, so
    an orphan is recoverable only while that period is still current. Once the data gains a
    month the builder offers a different article and the old one can no longer be rebuilt — it
    stays published and un-promoted. Refusing is the right answer there: promoting a piece whose
    figures cannot be re-derived would be promoting something unverified.
    """
    published = engine.published_questions(config)
    posted = publish_gate.posted_destinations(ledger_path=ledger_path)
    feed = engine.load_feed()
    found = []
    for topic_id, builder in sorted(articles.items()):
        try:
            claims_fn, article_fn = builder
            claims = claims_fn(feed, config, today)
            topic = {"id": topic_id, "question": topic_id}
            article = article_fn(topic, claims, feed)
            url = (f"https://{(config.get('publish') or {}).get('site_domain')}"
                   f"/analysis/{article['slug']}/")
            article = dict(article, canonical_url=url)
        except Exception:                          # noqa: BLE001
            # A builder that cannot rebuild its current period has nothing to offer here. It is
            # not an error: `electricity-still-rising` is period-locked by design and raises.
            continue
        if article["title"] not in published:
            continue                               # not published — the normal path handles it
        if publish_gate.normalise(url) in posted:
            continue                               # already promoted
        found.append({"topic_id": topic_id, "article": article, "claims": claims,
                      "published_at": _published_at(article["slug"], config)})
    # Oldest first: the article that has waited longest for its promo gets it first. Ties break
    # on topic id so the order is deterministic rather than filesystem-dependent.
    found.sort(key=lambda o: (o["published_at"], o["topic_id"]))
    return found


def _published_at(slug: str, config: dict) -> str:
    """The `publishedAt` the site file carries, or '' when it cannot be read.

    Read-only across the Rule 0 boundary, like `published_questions`. An unreadable date sorts
    first, which is harmless — it only affects WHICH orphan is recovered first, never whether
    one is recovered at all, and every one of them still has to pass every gate.
    """
    directory = (config.get("publish") or {}).get("analysis_dir", "../site/src/data/analysis")
    path = (ROOT / directory).resolve() / f"{slug}.md"
    if not path.is_file():
        return ""
    match = re.search(r'^publishedAt:\s*"([^"]+)"', path.read_text(), re.M)
    return match.group(1) if match else ""


# The post-deploy checks probe a CDN moments after a deploy, which is eventually consistent by
# design. A single immediate HEAD is the wrong instrument for that: on 2026-09-18 it returned 404
# for a URL that resolved 90 seconds later, and the cycle correctly withheld a post for an
# article that was, in fact, fine.
#
# Retrying does NOT soften the gate. It still refuses when the URL never resolves — it just
# stops confusing "not yet" with "never".
POST_DEPLOY_ATTEMPTS = 6
POST_DEPLOY_DELAY = 15


def _verify_until_stable(verify_opener, url: str, *, attempts: int, delay: int,
                         sleep_fn) -> tuple[bool, str]:
    """(ok, reason). Succeeds on the first clean answer; fails only after every attempt has."""
    reason = "never attempted"
    for attempt in range(1, attempts + 1):
        ok, reason = verify_opener(url)
        if ok:
            return True, (reason if attempt == 1 else f"{reason} (settled on attempt {attempt})")
        if attempt < attempts:
            sleep_fn(delay)
    return False, f"{reason} — still failing after {attempts} attempts over {attempts * delay}s"


def _find_promotion(config: dict, *, today: date, write_fn, build_claims_fn, articles: dict,
                    captions: dict, link_opener, media_opener, render_fn=None,
                    defer_resolution: bool = False, ledger_path: Path | None = None,
                    state: dict | None = None, env: dict | None = None) -> "CycleDecision | None":
    """The oldest orphan that still passes every gate, or None.

    Returns None — not a skip — when there is nothing to promote, so the cycle falls through to
    publishing a new article. An orphan that fails a gate is skipped over and the next one tried,
    because one stale article must not block the recovery of a fresh one.

    `render_fn` is accepted and ignored on purpose: the card was rendered when the article was
    published and is already committed and served. Re-rendering would be writing over a file the
    live page is using to prove a point it already proved.
    """
    orphans = promotable_orphans(config, today=today, write_fn=write_fn,
                                 build_claims_fn=build_claims_fn, articles=articles,
                                 ledger_path=ledger_path)
    for orphan in orphans:
        article, claims = orphan["article"], orphan["claims"]
        decision = CycleDecision(action="publish", promotion=True, article=article,
                                 claims=claims, reason=f"promoting: {orphan['topic_id']}")
        verdicts = [GateVerdict("orphan-selection", True,
                                f"{orphan['topic_id']} — published {orphan['published_at']}, "
                                f"never promoted")]
        verdicts.append(_verdict("claim-freshness", lambda c=claims: (
            ledger_mod.verify_ledger(c, config, today).ok,
            "all claims inside their staleness bounds")))

        def _card_gate(a=article, c=claims):
            card = card_mod.build_card(a, c)
            path = card_mod.sidecar_path(a["slug"], config)
            sidecar = json.loads(path.read_text()) if path.exists() else None
            r = card_mod.verify_card(card, c, slug=a["slug"], article=a, sidecar=sidecar,
                                     require_sidecar=True)
            decision.card = card
            return r.ok, "; ".join(r.failures) if r.failures else "the live card matches the ledger"
        verdicts.append(_verdict("card", _card_gate))

        verdicts.append(_verdict("channel-guard", lambda: (
            channel_guard.postable_platforms(config) == ["facebook"],
            "facebook pinned and enabled")))

        def _post_gate(a=article, c=claims, t=orphan["topic_id"]):
            post, gate = engine.build_facebook_promo(
                a, c, config, today, link_opener=link_opener, media_opener=media_opener,
                caption=captions.get(t), defer_resolution=defer_resolution)
            decision.post = post
            return gate.ok, "; ".join(gate.failures) if gate.failures else "9/9 social gates"
        verdicts.append(_verdict("social-suite+duplicate", _post_gate))

        decision.verdicts = verdicts
        decision.resolution_pending = defer_resolution
        if not decision.clean:
            # This orphan cannot be promoted right now — a stale ledger, a card that no longer
            # matches, a duplicate. Try the next one rather than stalling the whole cycle on it.
            print(f"[promote] {orphan['topic_id']} not promotable: "
                  + "; ".join(v.line() for v in verdicts if not v.ok))
            continue

        paused, why = is_paused(config, env)
        if paused:
            return CycleDecision(action="paused", reason=why, verdicts=verdicts, promotion=True,
                                 article=article, card=decision.card, post=decision.post,
                                 resolution_pending=defer_resolution)
        return decision                            # ONE per cycle: the first that clears.
    return None


def _live_targets(decision: "CycleDecision", config: dict) -> list[tuple[str, str]]:
    """The URLs that only exist after the deploy: the article, and the card the post points at.

    Named in ONE place so the dry run's simulation and the real run's verification cannot drift
    into checking different things — a simulation of a different check proves nothing.
    """
    article_url = (decision.article or {}).get("canonical_url", "")
    media_url = (decision.post or {}).get("media_url", "")
    targets = [("destination", article_url)]
    if media_url:
        targets.append(("media", media_url))
    return targets


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
             link_opener, media_opener, captions: dict, render_fn=None,
             defer_resolution: bool = False,
             state: dict | None = None, env: dict | None = None) -> CycleDecision:
    """Build the whole cycle and collect every gate's verdict. PUBLISHES NOTHING.

    `render_fn(article)` writes the article into `site/` and runs the site's own card
    generator, producing the PNG and sidecar in the WORKING TREE — no commit, no push, nothing
    the world can see. It must run here, before the card gate, because C5 and the media gate
    both read the rendered sidecar: a card that has not been rendered cannot be verified, and a
    cycle that renders only at merge time can never get a first-time article past its own gates
    (it skips daily with "no rendered card", fail-closed but inert). Rendering first also makes
    C5 mean what it says — it now compares the ledger against a file that exists rather than
    against an assumption.

    It is injected and defaults to None so `evaluate` stays a pure decision for every caller
    that has no site checkout, which is every test.

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
        if render_fn is not None:
            # A renderer that refuses — overflow, a font that will not decode — RAISES, and
            # `_verdict` turns that into a card failure. Refusing to draw the card and drawing
            # a wrong card land in the same place, which is the only safe arrangement.
            render_fn(article)
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
            media_opener=media_opener, caption=captions.get(result["topic"]["id"]),
            defer_resolution=defer_resolution)
        decision.post = post
        return gate.ok, "; ".join(gate.failures) if gate.failures else "9/9 social gates"
    gate_name = ("social-suite+duplicate" if defer_resolution
                 else "social-suite+destination+media+duplicate")
    verdicts.append(_verdict(gate_name, _post_gate))
    decision.resolution_pending = defer_resolution

    decision.verdicts = verdicts
    if not decision.clean:
        decision.reason = "a gate did not return a clean pass"
        return decision

    paused, why = is_paused(config, env)
    if paused:
        return CycleDecision(action="paused", reason=why, verdicts=verdicts,
                             article=article, card=card, post=decision.post,
                             resolution_pending=defer_resolution)

    decision.action = "publish"
    return decision


# --------------------------------------------------------------------------- acting on it

def run_cycle(config: dict, *, today: date, notify_fn, merge_fn=None, deploy_wait_fn=None,
              publish_fn=None, verify_opener=None, state_path: Path | None = None,
              ledger_path: Path | None = None, dry_run: bool = False, sleep_fn=None,
              **evaluate_kwargs) -> CycleDecision:
    """Evaluate, then act. The ONLY path that publishes.

    `merge_fn` merges the already-green site PR, `deploy_wait_fn` blocks until the deploy is
    live, `publish_fn` posts. Injected so the whole sequence is testable without touching
    GitHub, Cloudflare or Facebook.

    `dry_run=True` does EVERYTHING except the two irreversible acts: it picks, writes, renders
    the card, runs every gate, and reports what it would have done — then stops before the merge
    and the post, touches no state and writes no ledger row. It is the mode to run before putting
    a cycle on a timer, and the mode to run when you want to see what the machine currently
    thinks without letting it act on the answer. A dry run that reports PUBLISH is the strongest
    statement available short of publishing.

    One thing a dry run does leave behind: the rendered article and card in the `site/` WORKING
    TREE, because the card gate cannot judge a card that was never drawn. Nothing is committed,
    pushed or served. The caller restores the tree afterwards — `run_autopilot.main` does, and
    it restores only the three card directories, never the whole checkout.
    """
    state = load_state(state_path)

    # ---- PROMOTE BEFORE PUBLISH.
    #
    # An orphan is an article already live on the site with no ledger row. Promoting one has no
    # merge and no deploy — the page has been served for hours — so it exercises only the post
    # and the post-publish check, with the least possible in front of them. It is also the
    # cheaper thing to do: recovering a piece the site already carries beats adding another.
    #
    # Guards, all deliberate:
    #   * ONE per cycle. A backlog clears over days, never as a burst.
    #   * Claim-freshness must pass. An article whose data went stale while it waited is refused,
    #     not promoted — a stale promo is worse than no promo.
    #   * It does NOT touch the cadence floor, here or in the state write below. Recovering an
    #     already-published article is not adding to the publishing cadence.
    decision = _find_promotion(config, today=today, ledger_path=ledger_path, **evaluate_kwargs)

    if decision is None:
        decision = evaluate(config, today=today, state=state, **evaluate_kwargs)

    if decision.action == "too_soon":
        return decision
    if decision.action in ("skip", "paused"):
        _safe_notify(notify_fn, decision.notice(), decision)
        return decision

    if dry_run:
        # The post-deploy stage is SIMULATED and labelled as such. There is no deploy in a dry
        # run, so there is no live URL to check; claiming otherwise would be the exact kind of
        # unearned pass the rest of this module exists to prevent.
        decision.action = "would_publish"
        decision.live_verdicts = [
            GateVerdict(f"post-deploy-{name}", True,
                        f"SIMULATED (dry run) — would verify {url}")
            for name, url in _live_targets(decision, config)]
        return decision

    # ---- publish. Merge, deploy, VERIFY LIVE, then post. The order is the safety argument.
    #
    # The article is deployed before the destination and media checks run, because those two
    # check URLs that the deploy is what creates. Everything that judges the ARTICLE — its
    # numerals, sources, computed conclusions, rendered card — already passed above, before
    # anything was merged. Nothing about the article's correctness moved.
    #
    # The cost, stated plainly: a cycle can deploy an article and then withhold its post. That
    # leaves a correct, fully-gated article live with no Facebook promotion and a notice saying
    # so. The alternative — checking a URL before it exists — cannot pass, and the failure it
    # would prevent (a post pointing at a dead link) is exactly what the post-deploy check
    # prevents anyway.
    #
    # The merge and the deploy are the two side effects that can fail in ways no gate can
    # anticipate: a push race, a PR API error, a build that never lands inside the wait. An
    # unhandled raise here would exit the process — red job, NO Slack message — and a full-auto
    # machine that dies silently breaks the one promise that makes it safe to leave alone.
    # So both are caught, both notify, and both name which stage failed and what state that
    # leaves the article in. The job still goes red; it just stops going red in silence.
    #
    # The decision, not just a slug, goes to the merger: it needs the article body, its
    # frontmatter and its card, and passing the whole thing means the signature does not change
    # again the first time it needs one more field.
    # A PROMOTION skips both: the article was merged and deployed on an earlier cycle. Running
    # them again would re-commit a file that has not changed and wait for a deploy that already
    # happened.
    stages = () if decision.promotion else (
        ("merge", merge_fn, decision),
        ("deploy", deploy_wait_fn,
         decision.article["canonical_url"] if decision.article else ""))
    for stage, fn, arg in stages:
        if not fn:
            continue
        try:
            fn(arg)
        except Exception as exc:                   # noqa: BLE001 — deliberate: see above
            decision.action = "halted"
            decision.failed_stage = stage
            decision.reason = f"the {stage} step failed: {type(exc).__name__}: {exc}"
            _safe_notify(notify_fn, decision.notice(), decision)
            return decision

    # ---- the post-deploy gates. These could not run before the deploy; they run now, against
    # the real live URLs, and nothing posts unless both come back clean.
    decision.live_verdicts = [
        _verdict(f"post-deploy-{name}",
                 (lambda u=url: _verify_until_stable(
                     verify_opener, u, attempts=POST_DEPLOY_ATTEMPTS,
                     delay=POST_DEPLOY_DELAY, sleep_fn=sleep_fn or time.sleep)))
        for name, url in _live_targets(decision, config)]

    if not decision.cleared_to_post:
        decision.action = "posted_nothing"
        decision.reason = "the article is live; the post was withheld"
        _safe_notify(notify_fn, decision.notice(), decision)
        return decision

    # The structural guard. `cleared_to_post` is checked immediately above, but a future
    # refactor could reorder these blocks; this makes that a crash rather than a post.
    if not decision.cleared_to_post:                                  # pragma: no cover
        raise RuntimeError("reached the publish step without being cleared to post — refusing")

    streak = ((config.get("channels") or {}).get("facebook") or {}).get("clean_streak", 0) + 1

    # Everything below is a SIDE EFFECT that can fail, and every one of them was outside a
    # handler until the first real cycle crashed in the publisher with a traceback and no Slack
    # message. An audit then found three more unwrapped calls, not one: the publish, the state
    # write, and the final FYI. For a machine nobody watches, a stage that can fail without
    # notifying is a stage that can fail invisibly.
    #
    # The distinction this code exists to protect: "nothing was posted" and "something WAS
    # posted and a later step failed" must never be reported as each other. `posted` is set only
    # when `publish_fn` RETURNS, so it is evidence a post actually went out rather than an
    # assumption about how far execution got.
    posted: dict = {}

    def _recording_publish(post):
        result = publish_fn(post)
        posted.update(result or {"post_url": ""})
        return result

    try:
        record = publish_gate.publish_with_verification(
            decision.post, publish_fn=_recording_publish, verify_opener=verify_opener,
            streak_after=streak, article_slug=decision.article["slug"],
            ledger_path=ledger_path)
    except Exception as exc:                       # noqa: BLE001 — deliberate: see above
        return _post_stage_failure(decision, exc, posted, notify_fn)

    decision.post_url = record["post_url"]

    try:
        # A promotion does not move `last_article_at`. The cadence floor governs how often a NEW
        # article goes out; recovering one that is already published is not that.
        advanced = ({} if decision.promotion else {"last_article_at": today.isoformat()})
        save_state({**state, **advanced, "cycles": state.get("cycles", 0) + 1}, state_path)
        notify_fn(published_notice(decision, decision.article["canonical_url"],
                                   record["post_url"], streak))
    except Exception as exc:                       # noqa: BLE001
        # The post is already live. A failure here is bookkeeping, not publishing, and calling
        # it "withheld" would be a straight falsehood to whoever reads the notice.
        return _post_stage_failure(decision, exc, posted, notify_fn)
    return decision


def _post_stage_failure(decision: CycleDecision, exc: Exception, posted: dict,
                        notify_fn) -> CycleDecision:
    """Turn a failure in the posting tail into a NAMED outcome that notifies.

    Two outcomes, chosen by evidence rather than by where the traceback came from:

    * nothing went out  -> `posted_nothing`. The article is live and un-promoted, which is the
      accepted safe worst case.
    * something went out -> `posted_unconfirmed`. LOUD. The post exists on a real page and the
      cycle could not finish recording or announcing it, so a human has to reconcile.
    """
    detail = f"{type(exc).__name__}: {exc}"
    if posted:
        decision.action = "posted_unconfirmed"
        decision.failed_stage = "post-bookkeeping"
        decision.post_url = posted.get("post_url") or decision.post_url
        decision.reason = f"the post went out, but the cycle could not finish: {detail}"
    else:
        decision.action = "posted_nothing"
        decision.failed_stage = "publish"
        decision.reason = f"the article is live; the post failed: {detail}"
    _safe_notify(notify_fn, decision.notice(), decision)
    return decision
