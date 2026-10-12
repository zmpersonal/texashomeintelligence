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
import re
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path

import yaml

import card as card_mod
import channel_guard
import claim_ledger as ledger_mod
import gates
import publish_gate
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


# `_metric(feed, area, metric)` lived here until Round 49. It raised "absent from the feed — the
# engine will not invent it", which read as the mechanism tying a claim to the feed — and it had
# NO CALLER, so it tied nothing. Round 46 F18's shape exactly: a comment describing a guarantee
# with nothing behind it. Deleted rather than wired, because what it gestured at is now real and
# stronger: `source_check` re-asks the SOURCE for the figures a claim cites.


def frontmatter(article: dict, claims: list[Claim], card_block: str, published_at: date,
                published: bool = True) -> str:
    """The article's site frontmatter, derived from the claims that verified it.

    `metrics` and `sources` are not decoration: the collection schema requires them, and they
    are what lets the page render provenance the way the data pages do. Deriving them from the
    ledger rather than typing them means they cannot drift from the claims — the same argument
    that moved the card block out of a human's hands.
    """
    # `sources` is one row per DATASET, not one per claim. A derived claim carries the reading's
    # date while citing the dataset it was derived from, so keying on (source, as_of) listed the
    # same NOAA normals three times with three different dates — which reads to a crawler as
    # three sources and to a person as sloppiness. The date shown is the one the underlying
    # record actually carries: a `data` or `official` claim's as_of, which for a reference
    # period is the period itself.
    metrics: list[str] = []
    primary: dict[str, str] = {}
    fallback: dict[str, str] = {}
    for claim in claims:
        if claim.metric and claim.metric not in metrics:
            metrics.append(claim.metric)
        if not claim.source:
            continue
        if claim.tier in ("data", "official"):
            primary.setdefault(claim.source, claim.as_of)
        else:
            fallback.setdefault(claim.source, claim.as_of)
    sources = [(name, primary.get(name, fallback.get(name, "")))
               for name in dict.fromkeys(list(primary) + list(fallback))]
    lines = ["---",
             f'title: "{article["title"]}"',
             f'description: "{article["description"]}"',
             f'publishedAt: "{published_at.isoformat()}"',
             f"published: {'true' if published else 'false'}",
             "metrics:"]
    lines += [f"  - {m}" for m in metrics]
    lines.append("sources:")
    for name, as_of in sources:
        lines += [f'  - name: "{name}"', f'    asOf: "{as_of}"']
    lines.append(card_block)
    lines.append("---")
    return "\n".join(lines)


def _frontmatter(text: str) -> str:
    """Just the YAML block between the opening and closing `---`.

    The whole file is not safe to pattern-match: an article's BODY can contain a line starting
    `published:` — a quoted spec, a code fence — and the site reads only the frontmatter, so
    this must too.
    """
    if not text.startswith("---"):
        return ""
    end = text.find("\n---", 3)
    return text[3:end] if end != -1 else ""


def published_questions(config: dict) -> set[str]:
    """The H1 of every article that is actually LIVE on the site.

    The topic scorer ranks what is WORTH writing; it has no idea what has been written. Without
    this the engine picks the same top-ranked topic every cycle, forever — the article equivalent
    of re-posting the same link, and the reason a cadence driver needs it before it runs
    unattended. Titles, because an article's H1 is its topic's question verbatim (gate C4).

    LIVE, not merely present. `published: false` is the site's own deploy-on-command gate:
    `site/src/content.config.ts` builds a route only for `published: true`, and the field
    DEFAULTS TO FALSE there, so an article that omits it has no URL either. This read agrees
    with the site on both counts.

    Until Round 48 it took every `title:` in the folder regardless of `published:`, so a
    WITHDRAWN article still retired its topic and the sentence at the top of this docstring was
    false — a stated-guarantee failure of exactly the class Round 46 inventoried. It happened to
    point the safe way, which is why it survived: over-excluding never publishes anything wrong.
    The cost is that withdrawal did not mean withdrawn, so the one lever for taking an article
    down also silently removed the machine's ability to replace it.

    Read-only, across the Rule 0 boundary. An absent collection means nothing is published yet,
    which is the correct answer for a fresh checkout rather than a reason to halt.

    NOT a dedup guarantee on its own: exclusion is keyed on a FILE being present and live, so
    deleting a published article rather than flipping its flag makes its topic eligible again.
    That is the right behaviour for a deliberate removal and the wrong one for a mistake, and
    nothing here can tell those apart.
    """
    directory = (config.get("publish") or {}).get(
        "analysis_dir", "../site/src/data/analysis")
    folder = (ROOT / directory).resolve()
    if not folder.is_dir():
        return set()
    titles = set()
    for path in folder.glob("*.md"):
        head = _frontmatter(path.read_text())
        title = re.search(r'^title:\s*"([^"]+)"', head, re.M)
        live = re.search(r"^published:\s*true\s*$", head, re.M)
        if title and live:
            titles.add(title.group(1))
    return titles


def _current_title(topic: dict, articles: dict | None, today: date) -> str:
    """The title this topic would produce today: period-specific if it recurs, else its name."""
    entry = (articles or {}).get(topic["id"])
    title_for = getattr(entry, "title_for", None)
    if title_for:
        try:
            return title_for(today)
        except Exception as exc:                    # noqa: BLE001
            # A builder that cannot name its own current period is not eligible this cycle.
            # Returning the topic name keeps it excludable rather than silently always-eligible.
            # Logged because a topic quietly dropping out of rotation looks identical to a topic
            # that simply did not rank — and the two need completely different fixes.
            print(f"[warn] {topic.get('id', '?')} could not name its current period "
                  f"({type(exc).__name__}: {exc}); excluded from this cycle")
            return topic["question"]
    return topic["question"]


class AllTopicsHalted(gates.GateHalt):
    """Every eligible topic's gates refused. Carries one line per topic, with its reason.

    A `GateHalt`, deliberately: nothing is broken. Each topic was offered to its own builder and
    its own ledger, and each was refused for a stated reason. The driver reports it as a
    WITHHOLD and stays green — but it reports it, with every reason, which is the whole
    difference from the eighteen days this replaced.
    """

    def __init__(self, skipped: list[str]):
        self.skipped = skipped
        super().__init__("every eligible topic halted — " + " | ".join(skipped))


class NothingDefensible(RuntimeError):
    """The engine has nothing worth writing RIGHT NOW. A refusal, not a fault.

    It has its own type because the caller has to tell it apart from a broken gate, and the
    only other way to do that is to match on the message text — which is the kind of coupling
    that survives until someone improves the wording.

    This is the NORMAL state between periods. A recurring builder is retired for the period its
    data names, so once every builder has published its current period the machine has nothing
    to say until the data gains a month. That is the withhold-over-filler discipline working at
    the calendar's timescale, and it must not page anybody.
    """


def run(site_key: str, *, write_fn, build_claims_fn, today: date | None = None,
        specs_dir: Path | None = None, destination: dict | None = None,
        articles: dict | None = None, exclude_published: bool = False,
        config: dict | None = None) -> dict:
    """One article, end to end. Returns everything the human reviews; writes nothing to site/.

    `config` is accepted rather than always re-read from disk. The driver already holds one and
    used to pass it to everything EXCEPT this, so an override set by the caller silently did not
    reach the engine — and a test could not state "nothing is published yet" as a premise. It
    had to borrow the live site's article folder instead, which meant the suite's greenness
    depended on production data: when the fifth builder's current-period title went live, three
    suites went red on main with no code change behind them.
    """
    today = today or datetime.now(timezone.utc).date()
    config, feed = config or load_config(), load_feed()
    budget = Budget(limit=config["cost"]["model_calls_per_cycle_expected"])

    # ---- Stage 5's guard, run FIRST. Nothing is worth building for a target that will halt.
    target = publish_target.resolve(site_key, specs_dir)

    # ---- Stage 1: score, surface tension, pick from the ranked shortlist.
    ranked = topic_scorer.score_topics(feed, config)
    tension = topic_scorer.surface_tension(ranked)
    buildable = [t for t in ranked if t["buildable"]]
    if exclude_published:
        already = published_questions(config)
        # A RECURRING builder is excluded on the title it would emit RIGHT NOW, not on the
        # topic's name. "Was August 2026 hotter than normal?" being published does not retire
        # the topic — it retires August. Next month the same builder offers a different title
        # and becomes eligible again, which is what turns a builder into a subscription.
        buildable = [t for t in buildable
                     if _current_title(t, articles, today) not in already]
    if not buildable:
        raise NothingDefensible(
            "no topic is defensible from the current feed — rescope, don't reach")

    # ---- Stages 2-3: build the ledger IN CODE from the feed, then verify it before any prose.
    #
    # ── FALL-THROUGH, AND EXACTLY HOW FAR IT GOES (Round 48) ──────────────────
    # This used to be `chosen = buildable[0]` with no fall-through at all, and the comment
    # defending that said "silently publishing the runner-up is how a machine drifts off its own
    # ranking". That argument is sound and it is about a DIFFERENT CASE: a topic that ranks
    # highest and has NO CLAIM-BUILDER. That is a gap in the registry — a code defect — and
    # stepping over it would mean the engine quietly publishes something other than what its own
    # ranking chose. It still halts, below, unchanged.
    #
    # A GATE REFUSING is not that. The top-ranked topic's data can be too old, or short of a
    # year-ago month, or missing a month both its series need; the ranking was right and the
    # data is not there yet. Measured on 2026-10-12: `electricity-still-rising` ranked 0 of five
    # eligible topics and its claims were 2472h old against a 2160h bound, so one dead topic
    # blocked FOUR publishable articles for eighteen days.
    #
    # FALL-THROUGH IS NEVER SILENT. Every skip is recorded with its reason, returned on the
    # result as `skipped`, printed to the run log, and reported in the cycle's notice. A skip
    # nobody can see is how a halt stops meaning anything, which is the thing being fixed here,
    # not a cost to accept in exchange for it.
    #
    # AND IT STOPS AT THE MODEL CALL. Only the pre-model stages fall through, because the budget
    # is one call per cycle and a second candidate would need a second one. A refusal AFTER the
    # prose exists — a prose gate, the card, the two-lock — halts the cycle, as it always did.
    skipped: list[str] = []
    chosen: dict | None = None
    claims: list[Claim] = []
    ledger_result = None
    for candidate in buildable:
        candidate_build, candidate_write = build_claims_fn, write_fn
        # An article's claim-builder and writer belong to its TOPIC. Adding an article is adding
        # a pair to that registry; the engine never grows a branch per story.
        if articles:
            if candidate["id"] not in articles:
                raise RuntimeError(
                    f"topic {candidate['id']!r} is buildable but has no claim-builder. Write one "
                    f"rather than letting the engine step past it — a MISSING BUILDER is a gap "
                    f"in the registry, not a statement about the data, and publishing the "
                    f"runner-up instead is how a machine drifts off its own ranking. (A gate "
                    f"REFUSING is the other case, and that one does fall through, loudly.)")
            candidate_build, candidate_write = articles[candidate["id"]]
        try:
            candidate_claims = candidate_build(feed, config, today)
            result = ledger_mod.verify_ledger(candidate_claims, config, today)
            if not result.ok:
                raise ledger_mod.LedgerHalt(result.failures)
        except gates.GateHalt as exc:
            skipped.append(f"{candidate['id']}: {exc}")
            print(f"[halt] {candidate['id']} refused, moving on: {exc}")
            continue
        chosen, claims, ledger_result = candidate, candidate_claims, result
        build_claims_fn, write_fn = candidate_build, candidate_write
        break
    if chosen is None or ledger_result is None:
        raise AllTopicsHalted(skipped)

    # ---- Stage 4: THE ONE MODEL CALL.
    budget.spend()
    article = write_fn(chosen, claims, feed)

    # ---- G1/G2 at article scale, against the finished prose.
    prose_result = ledger_mod.verify_prose(article["body"], claims, config)
    if not prose_result.ok:
        raise ledger_mod.LedgerHalt(prose_result.failures)

    # ---- The social card, BUILT from the same claims the prose was verified against. It used
    # to be frontmatter typed by hand from the ledger: correct once, and nothing would have
    # caught the second article's card drifting from its claims (L14). The sidecar is not
    # required here — the PNG is generated on the site side and does not exist for a draft —
    # but every numeral on the face is held to G1's standard right now.
    card = card_mod.build_card(article, claims)
    card_result = card_mod.verify_card(card, claims, slug=article["slug"], article=article)
    if not card_result.ok:
        raise card_mod.CardHalt(card_result.failures)

    # ---- Stage 5: assert the resolved destination against the self-identified domain.
    destination = destination or {
        "repo": "zmpersonal/texashomeintelligence",
        "content_path": f"site/src/content/analysis/{article['slug']}.md",
        "canonical_url": f"https://{target['site_domain']}/analysis/{article['slug']}/",
    }
    resolved = publish_target.assert_destination(target, **destination)

    return {
        "target": resolved, "topic": chosen, "shortlist": ranked, "tension": tension,
        # Every topic this cycle stepped over, and why. On the result rather than only in the
        # log, so the driver's notice can name them — a fall-through nobody sees is the defect,
        # not the fix.
        "skipped": skipped,
        "claims": claims, "article": article, "model_calls": budget.calls,
        "ledger_checked": ledger_result.checked,
        "card": card, "card_frontmatter": card_mod.frontmatter_block(card),
    }


def build_facebook_promo(article: dict, claims: list[Claim], config: dict, today: date,
                         link_opener=None, media_opener=None,
                         caption=None, defer_resolution: bool = False) -> tuple[dict, object]:
    """Stage 6 — the promotion, as a HELD draft. Facebook is the only enabled channel and video
    is parked, so this is text-with-link per the owner's scope note.

    Built from the article's own lead claim, so its numerals are the article's numerals. Runs
    the full social gate suite; a draft that fails is not a draft, it is a defect.
    """
    # The same two claims the card speaks for — selected by rule, not by claim id. Hardcoding
    # "C1"/"C2" worked for exactly one article and would have picked nothing on the second.
    headline_claim, lead = card_mod.select_claims(article, claims)
    url = article["canonical_url"]

    # A link post's media is the DESTINATION's own OG image — that is what Facebook renders in
    # the preview. Derived here from the destination, never hand-set at post time. Post #1
    # needed exactly that hand-edit, and a hand-step that works once is a hand-step that rots
    # (RUNLOG §73).
    #
    # Since the card system shipped, "the destination's OG image" is the ARTICLE'S OWN CARD,
    # not the sitewide logo: the page declares it, so the reader sees it, so that is what the
    # media gate has to resolve. The sidecar the renderer wrote is the source of that path —
    # reading it rather than reconstructing the filename means a card that was never rendered
    # cannot be silently promoted.
    publish_cfg = config.get("publish") or {}
    _target = channel_guard.pinned_target("facebook", config)
    origin = "/".join(url.split("/")[:3])
    slug = article["slug"]
    sidecar = None
    sidecar_file = card_mod.sidecar_path(slug, config)
    if sidecar_file.exists():
        sidecar = json.loads(sidecar_file.read_text())

    card = card_mod.build_card(article, claims)
    card_gate = card_mod.verify_card(card, claims, slug=slug, article=article,
                                     sidecar=sidecar, require_sidecar=True)
    if not card_gate.ok:
        # Falling back to the sitewide card here would be the worst available option: the post
        # would go out looking fine while promoting a page whose card is missing or stale. The
        # gate exists to stop the post, not to quietly pick a different picture.
        raise card_mod.CardHalt(card_gate.failures)

    media_url = origin + sidecar["path"]

    # Refuse at STAGING, not just at send. A duplicate that only fails on the way out has
    # already consumed a cycle and an approval; one that fails here is caught while the answer
    # is still "write something else".
    # The ledger path is config so a test can state its premise ("this article has not been
    # posted") instead of the suite silently depending on the real ledger's contents.
    ledger = (publish_cfg.get("published_ledger") and
              (ROOT / publish_cfg["published_ledger"]).resolve()) or None
    publish_gate.assert_not_already_posted(url, platform="facebook", ledger_path=ledger)

    # A recurring builder's caption names the period, so it is a function of the article and
    # its claims rather than a frozen string.
    if callable(caption):
        caption = caption(article, claims)
    caption = caption or (
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
        # What the rendered card actually says, read off the sidecar rather than asserted:
        # G2 checks provenance is visible on the artifact, and this is the artifact.
        "on_screen_text": [card["headline"], card["subhead"], f"{card['source']} · {card['asOf']}"],
        "media_url": media_url,
        "has_media": True,
        # A link post is not an atomized short, so G3 (the clip must carry its own source card)
        # does not apply: there is no cut that could sever a claim from its source. The kind is
        # stated rather than assumed. `has_source_card` is now TRUE and earned — the rendered
        # card carries the source and date on its face, verified against the sidecar above,
        # not asserted in a JSON field.
        "piece_kind": "text_with_link",
        "has_source_card": True,
        "destination_url": url,
        "destination_theme": card_mod.primary_metric(article),
        "card_kind": "reveal",
        "card_rows": [card["headline"], card["subhead"]],
        "card_numeric_cells": 2,
        "card_sidecar": sidecar["path"],
        # THE FIRST LOCK. The pinned target is stamped in here, at BUILD time, from
        # `channel_guard.pinned_target` — never from a default and never from anything in the
        # post. The publisher then ASSERTS the post still addresses this pin at send time, which
        # is the second lock. Both must agree or the post does not go out.
        #
        # Without this the post reached the publisher carrying no account_id and no page_id, so
        # the guard could not check it at all — and the ledger recorded page_id: null for the one
        # post that ever went out. A guard with nothing to check is not a guard.
        "account_id": _target["account_id"],
        "page_id": _target["page_id"],
        "requires_link": True,
        # Held, and held in the artifact rather than in a person's memory.
        "status": "HELD — not scheduled, not posted; awaits owner approval and a live article URL",
    }
    # G1 checks the caption's numerals against THIS story's figure, so the story must carry
    # every figure the caption uses — not just the headline one. The first run failed here
    # because the caption quoted the year-over-year change while the story carried only the
    # price. The fix is to widen what the story supplies, never to loosen G1.
    story = {"metric": card_mod.primary_metric(article),
             "figure": f"{headline_claim.figure} — {lead.figure}",
             "source": headline_claim.source, "as_of": headline_claim.as_of,
             # The forms the CARD is allowed to use, supplied by code from the approved map
             # rather than inferred by the gate. The caption still carries the full name.
             "source_short": card["source"], "as_of_display": card["asOf"],
             # Every figure and derivation this article verified. The caption may quote any of
             # them; it may not quote anything else.
             "supporting_figures": [c.figure for c in claims if c.figure]
                                   + [c.derivation for c in claims if c.derivation],
             # PROVENANCE, not claims. A source's NAME can contain digits — "NOAA NCEI U.S.
             # Climate Normals 1991-2020" is one string, an identifier, and the 1991 in it is
             # not an assertion about anything. Same for the as_of of every claim the article
             # rests on: this piece cites a 1991-2020 reference period alongside a 2026-08
             # reading, and only the headline claim's date was being supplied.
             #
             # This widens what the STORY SUPPLIES, which is the move this file already makes
             # for `supporting_figures`, `source_short` and `as_of_display`. It does not widen
             # what the gate accepts: a numeral in neither the ledger, nor a source name, nor a
             # claim's date still fails, which is the whole point of G1.
             "source_names": sorted({c.source for c in claims if c.source}),
             "claim_as_ofs": sorted({c.as_of for c in claims if c.as_of})}
    result = social_validator.validate_post(post, story, config, feed=load_feed(), now=today,
                                            link_opener=link_opener, media_opener=media_opener,
                                            defer_resolution=defer_resolution)
    return post, result
