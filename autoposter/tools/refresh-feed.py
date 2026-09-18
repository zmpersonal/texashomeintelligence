#!/usr/bin/env python3
"""refresh-feed.py — rebuild `social-feed.json` from THI's datasets and land it on main.

WHY THIS EXISTS. The feed carried `generated_at: 2026-09-06` for twelve days. `build_feed.py`
writes it and NO WORKFLOW RAN IT, so every article the machine wrote was built from a frozen
snapshot. It was not a persistence defect — the file persisted fine. It persisted and never
moved, which is worse, because a recurring builder is retired for the PERIOD its data names.
With the data frozen, every builder's period was frozen too: all five had published their
current title and the machine skipped every cycle, permanently and quietly.

SUBSTANCE, NOT TIMESTAMP. `generated_at` changes on every run whether or not anything else
did, so committing on "the file differs" would put a commit on main every day for nothing —
and `main` auto-deploys the live site. Worse, it would make `generated_at` mean "a job ran"
rather than "the data changed", and the second is the fact anyone actually wants.

So the comparison ignores `generated_at` and the commit happens only when the SUBSTANCE moved.
A no-change day writes nothing, advances nothing, and cannot make any downstream stage believe
there is something new — the answer to "what if ingestion failed or the data didn't change?"
is that the feed is untouched and the cycle skips exactly as it would have anyway.

ORDERING. This reads `site/src/data/generated/`, which `data-ingestion.yml` produces. It is
triggered by that workflow COMPLETING rather than by a clock, because a scheduled run's real
fire time drifts by hours on busy runners — the autoposter's own 14:10 cron has been observed
firing between 17:00 and 19:00. Ordering by timestamp would be a hope; ordering by completion
is a guarantee.

Run: python3 tools/refresh-feed.py [--dry-run]
"""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import build_feed                                  # noqa: E402
import run_autopilot as ra                         # noqa: E402

FEED_RELATIVE = "autoposter/data/social-feed.json"


def substance(feed: dict | None) -> str:
    """The feed MINUS the fact that a job ran. Two runs over the same data compare equal."""
    if not feed:
        return ""
    return json.dumps({k: v for k, v in feed.items() if k != "generated_at"},
                      sort_keys=True, ensure_ascii=False)


def main() -> int:
    dry_run = "--dry-run" in sys.argv
    cfg = build_feed.load_config()
    feed, _stories = build_feed.build_feed(cfg)
    build_feed.write_feed(feed, cfg)               # validates against the schema, THEN writes

    fresh = substance(feed)
    on_main = ra._json_on_main(FEED_RELATIVE, {})
    if substance(on_main) == fresh:
        print(f"[feed] the data has not moved since {(on_main or {}).get('generated_at', '?')}"
              f" — nothing to commit, and nothing downstream will think otherwise")
        return 0

    print(f"[feed] the data MOVED: {(on_main or {}).get('generated_at', '(no feed on main)')}"
          f" -> {feed['generated_at']}  "
          f"(week_mode={feed['week_mode']}, stories={len(feed['stories'])})")
    if dry_run:
        print("[feed] --dry-run: not committing")
        return 0

    # Same discipline as the ledger row and the cadence clock: written from MAIN's own content,
    # merged, and then READ BACK from main. A refresh that cannot confirm it landed is not a
    # refresh — it is the machine believing it has fresh data when it has yesterday's.
    url = ra.commit_to_main(
        [ra.MainFile(relative=FEED_RELATIVE, default={},
                     build=lambda _current: feed,
                     present=lambda current: substance(current) == fresh)],
        slug=f"feed-{feed['generated_at'][:10]}", kind="feed")
    print(f"[feed] on main{': ' + url if url else ''}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
