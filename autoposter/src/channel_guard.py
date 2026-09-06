"""
channel_guard.py — the pinned-target allowlist for every outbound post.

WHY THIS EXISTS (measured, not hypothetical — RUNLOG 2026-09-06 Phase 0)
The Blotato workspace this project posts through is SHARED across several unrelated
businesses. One `accountId` (49743) fans out to nine Facebook Pages, exactly one of which
is THI; the Instagram, Pinterest and TikTok accounts on the same workspace belong to a
different brand entirely; and the connected YouTube channel is a third, unrelated property.

Blotato's own account listing reports a *default* `pageId` under `requiredFields`. Taking
that default is precisely how THI content ends up on a sauna page. So the default is never
consulted here.

WHAT THIS IS
The posting-side twin of the article engine's domain self-identification guard
(`PUBLISH-TARGET.thi.md`): a publish target is legitimate only when it matches an id a human
pinned in `config.yaml`. No default, no fallback, no nearest match, no inference. Anything
else raises `ChannelGuardHalt` — a 🔴 stop, never a post.

THE FAILURE MODE IT MUST NEVER HAVE
A *missing* pin silently meaning "unrestricted". Absence of a pin means DO NOT POST to that
channel. That is the owner's explicit instruction and it is asserted in the tests.

This module is deliberately dependency-free and repo-independent so it can be unit-tested
without a network, a key, or a Blotato session.
"""

from __future__ import annotations


class ChannelGuardHalt(Exception):
    """Raised instead of posting. Carries every reason found, not just the first."""

    gate = "PIN"

    def __init__(self, reasons: list[str]):
        self.reasons = reasons
        super().__init__("PIN: " + " | ".join(reasons))


def _norm(value) -> str | None:
    """Normalize an id to a comparable string.

    YAML parses an unquoted `1335273942995805` as an int while Blotato returns it as a
    string, so an un-normalized `==` would reject a correct target — a guard that cries wolf
    gets disabled, which is worse than no guard. Ids are compared as exact strings after
    this; nothing is coerced beyond int/str, and empty or whitespace-only reads as absent.
    """
    if value is None:
        return None
    if isinstance(value, bool):  # `True` is an int in Python; never a valid id
        return None
    if isinstance(value, (int, str)):
        text = str(value).strip()
        return text or None
    return None


def pinned_target(platform: str, config: dict) -> dict:
    """Return the pinned target for `platform`, or HALT.

    Every path out of here is either a fully-specified pinned target or an exception. There
    is no third return value, so no caller can accidentally treat "unpinned" as "allowed".
    """
    reasons: list[str] = []
    name = _norm(platform)
    if name is None:
        raise ChannelGuardHalt(["post/platform is empty; refusing to infer a destination"])

    channel = (config.get("channels") or {}).get(name)
    if channel is None:
        raise ChannelGuardHalt([f"'{name}' is not a configured channel"])

    pin = channel.get("pinned")
    if not pin:
        raise ChannelGuardHalt([
            f"'{name}' has no pinned target — absence of a pin means DO NOT POST, "
            f"never 'use the workspace default'"
        ])

    account_id = _norm(pin.get("account_id"))
    if account_id is None:
        reasons.append(f"'{name}' pin is missing account_id")

    page_id = _norm(pin.get("page_id"))
    if pin.get("requires_page_id") and page_id is None:
        reasons.append(
            f"'{name}' requires a page_id (the workspace holds several pages under one "
            f"account) and none is pinned"
        )

    if reasons:
        raise ChannelGuardHalt(reasons)

    return {
        "platform": name,
        "account_id": account_id,
        "page_id": page_id,
        "name": pin.get("name"),
        "requires_page_id": bool(pin.get("requires_page_id")),
    }


def assert_post_target(post: dict, config: dict) -> dict:
    """Assert one outbound post is addressed to a pinned THI target. HALT otherwise.

    Call this immediately before handing a piece to any producer. It is independent of
    `validator.validate_post` on purpose: the validator asks "is this content fit to
    publish", this asks "is this the right mouth to say it out of". Both must pass.
    """
    target = pinned_target(post.get("platform"), config)
    reasons: list[str] = []

    got_account = _norm(post.get("account_id"))
    if got_account is None:
        reasons.append("post carries no account_id; refusing to infer one")
    elif got_account != target["account_id"]:
        reasons.append(
            f"account_id {got_account!r} is not the pinned "
            f"{target['platform']} account {target['account_id']!r}"
        )

    if target["requires_page_id"]:
        got_page = _norm(post.get("page_id"))
        if got_page is None:
            reasons.append(
                "post carries no page_id; the workspace default would select a non-THI page"
            )
        elif got_page != target["page_id"]:
            reasons.append(
                f"page_id {got_page!r} is not the pinned page {target['page_id']!r} "
                f"({target['name']!r})"
            )

    if reasons:
        raise ChannelGuardHalt(reasons)
    return target


def assert_live_accounts_match(live_accounts: list[dict], config: dict) -> list[dict]:
    """Preflight: confirm each pinned id still resolves to the entity it was pinned as.

    Pinning an id protects against choosing the wrong destination. It does NOT protect
    against the id itself being reassigned on Blotato's side — a page disconnected and a
    different one connected can reuse a slot. So the pinned NAME is asserted against the
    live listing too: an id that now answers to a different name is a HALT, not a warning.

    `live_accounts` is the raw `blotato_list_accounts` payload. Only pinned platforms are
    checked; unpinned channels are ignored here because they are already un-postable.
    """
    reasons: list[str] = []
    checked: list[dict] = []

    for platform, channel in (config.get("channels") or {}).items():
        if not channel.get("pinned"):
            continue
        target = pinned_target(platform, config)

        account = next(
            (a for a in live_accounts if _norm(a.get("id")) == target["account_id"]), None
        )
        if account is None:
            reasons.append(
                f"pinned {platform} account {target['account_id']} is not in the live "
                f"workspace listing"
            )
            continue
        if _norm(account.get("platform")) != target["platform"]:
            reasons.append(
                f"account {target['account_id']} is now platform "
                f"{account.get('platform')!r}, pinned as {target['platform']!r}"
            )
            continue

        if target["requires_page_id"]:
            sub = next(
                (s for s in (account.get("subaccounts") or [])
                 if _norm(s.get("id")) == target["page_id"]),
                None,
            )
            if sub is None:
                reasons.append(
                    f"pinned {platform} page {target['page_id']} "
                    f"({target['name']!r}) is no longer connected"
                )
                continue
            if target["name"] and sub.get("name") != target["name"]:
                reasons.append(
                    f"pinned {platform} page {target['page_id']} now answers to "
                    f"{sub.get('name')!r}, pinned as {target['name']!r} — id reassigned"
                )
                continue

        checked.append(target)

    if reasons:
        raise ChannelGuardHalt(reasons)
    return checked


def postable_platforms(config: dict) -> list[str]:
    """The channels a post may be addressed to at all. Everything else is un-postable."""
    out = []
    for platform, channel in (config.get("channels") or {}).items():
        if channel.get("pinned"):
            out.append(platform)
    return sorted(out)
