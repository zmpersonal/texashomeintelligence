"""
publish_gate.py — publishing and its post-publish verification, as ONE operation.

WHY THIS EXISTS
On post #1 the article was re-verified after publishing because I chose to. Nothing required it.
"The link died between check and publish" is precisely the failure the whole chain exists to
prevent, and it was resting on a habit (RUNLOG §73).

So there is no exported way to publish without the post-check: `publish_with_verification` runs
the publish function and then the verification, records both to the ledger either way, and
RAISES if the destination stopped resolving. A caller cannot skip the check by forgetting it —
only by not using this module, which a test asserts against.

The ledger is append-only and is the record of what actually went public: prose in a run log is
not a ledger.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

LEDGER = Path(__file__).resolve().parents[1] / "data" / "published-posts.json"


class DuplicateDestinationHalt(Exception):
    """This link has already been posted. An unattended machine must never re-post one."""


class PostPublishHalt(Exception):
    """Published, but the destination no longer resolves. Loud, recorded, and not swallowed."""

    def __init__(self, reason: str, record: dict):
        self.reason, self.record = reason, record
        super().__init__(f"POST-PUBLISH: {reason}")


def _load(path: Path) -> list:
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text())
    except ValueError as exc:
        # A corrupt ledger is never silently reinitialised — that is how history disappears.
        raise RuntimeError(f"published-posts ledger is unreadable ({exc}); HALT, do not rewrite")


def append_ledger(record: dict, path: Path | None = None) -> Path:
    path = path or LEDGER
    entries = _load(path)
    entries.append(record)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(entries, indent=2, ensure_ascii=False) + "\n")
    return path


def assert_not_already_posted(destination_url: str, *, ledger_path: Path | None = None,
                              platform: str | None = None) -> None:
    """Refuse a destination this account has already posted. Raises; never warns.

    A human notices they are about to re-share yesterday's link. A cadence driver running every
    few days does not, and the failure is public and permanent: the same URL twice on the same
    page reads as a broken bot, which is the one impression this brand cannot afford.

    Checked against `published-posts.json` — the record of what actually went out — rather than
    against a run log or a memory of the last cycle, because only the ledger survives a restart.

    The check is per-platform when a platform is given: the same article promoted once on
    Facebook and once elsewhere is normal syndication, not a duplicate.
    """
    if not destination_url:
        raise DuplicateDestinationHalt(
            "cannot check for a duplicate: the post has no destination URL")
    target = _normalise(destination_url)
    for entry in _load(ledger_path or LEDGER):
        if platform and entry.get("platform") and entry["platform"] != platform:
            continue
        if _normalise(entry.get("article_url", "")) == target:
            raise DuplicateDestinationHalt(
                f"{destination_url} was already posted on {entry.get('published_at', '?')[:10]} "
                f"({entry.get('post_url')}). Re-posting the same link is not a cadence, it is a "
                f"loop. Write a new piece, or post this one somewhere it has not run.")


def _normalise(url: str) -> str:
    """Trailing slash and case are not a different page, and must not read as a different one."""
    return (url or "").strip().rstrip("/").lower()


# Public alias. The orphan finder has to ask the same question the duplicate gate asks — "has
# this destination been posted?" — and it must ask it the SAME way, or the two could disagree
# about what counts as the same URL and an orphan would be promoted into a duplicate.
normalise = _normalise


def posted_destinations(ledger_path: Path | None = None, platform: str | None = None) -> set[str]:
    """Every destination the ledger records a post for, normalised.

    This is the record of PROMOTION, distinct from the site, which is the record of publication.
    An article present on the site and absent here was published and never promoted.
    """
    return {_normalise(entry.get("article_url", ""))
            for entry in _load(ledger_path or LEDGER)
            if not platform or entry.get("platform") == platform}


def publish_with_verification(post: dict, *, publish_fn, verify_opener, streak_after: int,
                              article_slug: str = "", ledger_path: Path | None = None,
                              now=None) -> dict:
    """Publish, then verify the destination still resolves. Both, always, in that order.

    `publish_fn(post) -> {"post_url": str, "submission_id": str}`.
    `verify_opener(url) -> (ok, reason)` — the same opener shape the gates use, so the
    post-publish check is the same check, not a weaker cousin.
    """
    clock = now or (lambda: datetime.now(timezone.utc))
    destination = post.get("destination_url", "")
    # BEFORE the publish, not after: a duplicate caught afterwards is a duplicate.
    assert_not_already_posted(destination, ledger_path=ledger_path,
                              platform=post.get("platform"))
    published = publish_fn(post)

    ok, reason = verify_opener(destination)
    record = {
        "published_at": clock().isoformat(timespec="seconds"),
        "platform": post.get("platform"),
        "page_id": post.get("page_id"),
        "post_url": published.get("post_url"),
        "submission_id": published.get("submission_id"),
        "article_url": destination,
        "article_slug": article_slug,
        "post_publish_verified": bool(ok),
        "post_publish_detail": reason,
        "streak_after": streak_after,
    }
    append_ledger(record, ledger_path)

    if not ok:
        raise PostPublishHalt(
            f"destination stopped resolving after publish — {reason}. The post is LIVE and points "
            f"at a link that does not resolve; a human must decide whether to pull it.", record)
    return record
