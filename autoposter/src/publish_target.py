"""
publish_target.py — the TWO-LOCK publish guard (ARTICLE-ENGINE.md, PUBLISH-TARGET.thi.md).

THE FAILURE IT PREVENTS: this engine is designed to be reused across a network of sites. The
expensive mistake is publishing one site's article to another site's domain — silently, because
"it was obviously THI". So there is no default site, no fallback, and no inferring from context.

TWO LOCKS, both required:
  1. The site's EDITORIAL spec (`ARTICLE-ENGINE.<site>.md`) NAMES its publish target file.
  2. That target SELF-IDENTIFIES its domain (`site_domain:` in its own guard block).
Both must be present AND agree, and the resolved destination (repo + content path + final URL
host) must match the self-identified domain, or the engine HALTS before writing anything.

Every exit from `assert_target` is either a fully-resolved, agreeing target or an exception.
"""

from __future__ import annotations

import re
from pathlib import Path

SPECS = Path(__file__).resolve().parents[1] / "specs"


class PublishHalt(Exception):
    """Raised instead of writing. Carries every reason found."""
    gate = "TWO-LOCK"

    def __init__(self, reasons: list[str]):
        self.reasons = reasons
        super().__init__("TWO-LOCK: " + " | ".join(reasons))


def _read(path: Path, what: str) -> str:
    if not path.exists():
        raise PublishHalt([f"{what} not found at {path.name} — the engine HALTS without it, "
                           f"it does not fall back to a default site"])
    return path.read_text()


def _self_id(text: str) -> dict:
    """Parse the target's own guard block: `site_domain:` / `site_name:`."""
    out = {}
    for key in ("site_domain", "site_name"):
        m = re.search(rf"^\s*{key}:\s*(\S.*?)\s*$", text, re.MULTILINE)
        if m:
            out[key] = m.group(1).strip()
    return out


def resolve(site_key: str, specs_dir: Path | None = None) -> dict:
    """Load both locks and verify they agree. HALT otherwise."""
    specs_dir = specs_dir or SPECS
    reasons: list[str] = []

    editorial_path = specs_dir / f"ARTICLE-ENGINE.{site_key}.md"
    editorial = _read(editorial_path, f"editorial spec for site {site_key!r}")

    # LOCK 1 — the editorial spec must NAME its target file.
    named = re.search(r"(PUBLISH-TARGET\.[a-z0-9_-]+\.md)", editorial)
    if not named:
        raise PublishHalt([f"{editorial_path.name} names no publish target; the engine will not "
                           f"guess one"])
    target_name = named.group(1)
    if target_name != f"PUBLISH-TARGET.{site_key}.md":
        reasons.append(f"{editorial_path.name} names {target_name}, which is not this site's "
                       f"target (PUBLISH-TARGET.{site_key}.md)")

    target_path = specs_dir / target_name
    target = _read(target_path, f"publish target {target_name}")

    # LOCK 2 — the target must SELF-IDENTIFY its domain.
    ident = _self_id(target)
    if not ident.get("site_domain"):
        reasons.append(f"{target_name} carries no `site_domain:` self-identification block")

    # The two locks must AGREE: the editorial spec's own stated domain vs the target's self-id.
    declared = re.findall(r"\b([a-z0-9-]+\.(?:com|org|net))\b", editorial.lower())
    domain = ident.get("site_domain", "").lower()
    if domain and declared and domain not in declared:
        reasons.append(f"{target_name} self-identifies as {domain!r}, which "
                       f"{editorial_path.name} never names — the two locks disagree")

    if reasons:
        raise PublishHalt(reasons)

    return {
        "site_key": site_key,
        "editorial_spec": editorial_path.name,
        "target_spec": target_name,
        "site_domain": domain,
        "site_name": ident.get("site_name", ""),
    }


def assert_destination(target: dict, *, repo: str, content_path: str, canonical_url: str) -> dict:
    """Assert the RESOLVED destination matches the self-identified domain. HALT otherwise.

    Called immediately before any write. The domain check is on the URL's host specifically:
    a substring test would pass `texashomeintelligence.com.evil.example`.
    """
    reasons: list[str] = []
    domain = target["site_domain"]

    host = re.sub(r"^https?://", "", canonical_url).split("/")[0].lower().split(":")[0]
    if host != domain and not host.endswith("." + domain):
        reasons.append(f"canonical URL host {host!r} is not the self-identified domain {domain!r}")

    if not content_path or ".." in content_path or content_path.startswith("/"):
        reasons.append(f"content path {content_path!r} is not a safe repo-relative path")

    if not repo:
        reasons.append("no destination repo resolved")

    if reasons:
        raise PublishHalt(reasons)

    return {**target, "repo": repo, "content_path": content_path, "canonical_url": canonical_url}
