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


def publish_with_verification(post: dict, *, publish_fn, verify_opener, streak_after: int,
                              article_slug: str = "", ledger_path: Path | None = None,
                              now=None) -> dict:
    """Publish, then verify the destination still resolves. Both, always, in that order.

    `publish_fn(post) -> {"post_url": str, "submission_id": str}`.
    `verify_opener(url) -> (ok, reason)` — the same opener shape the gates use, so the
    post-publish check is the same check, not a weaker cousin.
    """
    clock = now or (lambda: datetime.now(timezone.utc))
    published = publish_fn(post)
    destination = post.get("destination_url", "")

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
