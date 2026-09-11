"""
media.py — media-URL resolution for VALIDATOR.md's baseline gate
("media absent or its URL does not resolve").

FAIL CLOSED. An unresolvable URL is a reject, never a warning, and never an assumption that
it will probably be there by post time. A post whose image 404s is a broken post, and the
account that inherited this SOP published 81 of those.

Resolution is injectable (`opener`) so the gate is unit-testable without a network, and so the
weekly session can pass a resolver that speaks to whatever host Blotato returns.

⚠️ PROVE THIS ON THE RUNNER'S OWN SURFACE (social-autoposter step 9). This container's egress
allowlist is narrower than the GitHub Actions runner's — THI's own probe workflow records hosts
that answer `connect_rejected` here while the runner fetches them daily. A live HEAD that fails
HERE is not evidence the media is missing. Until that is proven in Phase 6, `require_network`
defaults to False: a well-formed https URL that cannot be reached from this surface is reported
as UNVERIFIED, and the caller decides. Nothing about that is silent — it is in the reason string
and surfaces on the gate result.
"""

from __future__ import annotations

import base64
import re
import urllib.error
import urllib.request
from pathlib import Path

TIMEOUT_SECONDS = 8
# A real 1080x1080 card is tens of kilobytes. Anything this small is a placeholder pixel or a
# truncated write, which SOP step 12 says the render helper must fail loud on.
MIN_MEDIA_BYTES = 512
UNREACHABLE = "unreachable:"      # indeterminate — distinguished from a definite HTTP error


def _head(url: str) -> tuple[bool, str]:
    request = urllib.request.Request(url, method="HEAD")
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            code = response.status
            if 200 <= code < 400:
                length = response.headers.get("Content-Length")
                if length is not None and int(length) == 0:
                    return False, f"resolved but zero-length ({url})"
                return True, f"resolved {code}"
            return False, f"HTTP {code}"
    except urllib.error.HTTPError as exc:
        return False, f"HTTP {exc.code}"
    except Exception as exc:                      # noqa: BLE001 - any failure is a reject
        return False, f"{UNREACHABLE} {type(exc).__name__}: {exc}"


def resolve_link(url: str | None, opener=None, require_network: bool = False,
                 expect_host: str | None = None) -> tuple[bool, str]:
    """Resolve a DESTINATION link. (ok, reason). `ok=False` means the piece must not publish.

    PUBLISH-TARGET.thi.md: "Until the URL is live, social scheduling for that article is HELD
    (don't promote a dead link — reuses VALIDATOR: linked pieces require a resolvable
    destination)." VALIDATOR.md's baseline says the same. **This function is that rule.**

    It did not exist until 2026-09-11, and its absence was described to the owner across several
    rounds as though it did — see RUNLOG §62. Nothing shipped on the false assurance because the
    human gate held independently, which is the whole argument for that gate.

    Different semantics from `resolve()` on purpose. A destination is a web page, so:
      * only http(s) is acceptable — a `data:` URI or a local path is not somewhere a reader
        can go, and silently accepting one would promote a link that goes nowhere;
      * there is no byte floor — a small page is still a page;
      * redirects are followed, and `expect_host` asserts where they landed, so a destination
        that ends up on a different domain rejects rather than quietly promoting it.
    """
    if not url or not str(url).strip():
        return False, "destination url absent"
    url = str(url).strip()
    if not (url.startswith("http://") or url.startswith("https://")):
        return False, (f"destination {url[:40]!r} is not an http(s) URL — a reader cannot follow "
                       f"a data: URI or a local path")

    ok, reason = (opener or _head)(url)
    if not ok:
        if require_network or not reason.startswith(UNREACHABLE):
            return False, reason
        return False, (f"UNVERIFIED from this surface ({reason}) — the destination may well be "
                       f"live; this surface cannot see it. Do not publish on that ambiguity")

    if expect_host:
        final = reason.split("->", 1)[1].strip() if "->" in reason else url
        host = re.sub(r"^https?://", "", final).split("/")[0].lower().split(":")[0]
        if host != expect_host.lower() and not host.endswith("." + expect_host.lower()):
            return False, f"destination resolved to host {host!r}, expected {expect_host!r}"
    return True, reason


def resolve(url: str | None, opener=None, require_network: bool = False) -> tuple[bool, str]:
    """(ok, reason). `ok=False` means the piece must not publish."""
    if not url or not str(url).strip():
        return False, "media url absent"
    url = str(url).strip()

    if url.startswith("data:"):
        _, _, payload = url.partition(",")
        try:
            raw = base64.b64decode(payload, validate=False) if ";base64" in url else payload.encode()
        except Exception:                          # noqa: BLE001
            return False, "data: URI is not decodable"
        if len(raw) < MIN_MEDIA_BYTES:
            return False, f"data: URI is only {len(raw)} bytes — a placeholder, not a card"
        return True, f"data: URI, {len(raw)} bytes"

    if url.startswith("file://") or url.startswith("/") or url.startswith("./"):
        path = Path(url.removeprefix("file://"))
        if not path.exists():
            return False, f"local media does not exist: {path}"
        size = path.stat().st_size
        if size < MIN_MEDIA_BYTES:
            return False, (f"local media is {size} bytes — below the {MIN_MEDIA_BYTES}-byte "
                           f"floor; a truncated or placeholder render, not a card")
        return True, f"local file, {size} bytes"

    if url.startswith("http://") or url.startswith("https://"):
        ok, reason = (opener or _head)(url)
        if ok:
            return True, reason
        # A definite answer from the server (404, 403, zero-length) is a definite reject. Only a
        # failure to REACH the host is indeterminate, and only that one is reported as
        # UNVERIFIED — otherwise a real 404 would hide behind the container's egress caveat.
        if require_network or not reason.startswith(UNREACHABLE):
            return False, reason
        return False, (f"UNVERIFIED from this surface ({reason}) — prove media resolution on "
                       f"the runner's own path before trusting it (social-autoposter step 9)")

    return False, f"unsupported media url scheme: {url[:32]!r}"


# ---------------------------------------------------------------------------
# The GitHub Actions resolver.
#
# This session cannot reach arbitrary hosts; Actions runners can. So a "does this URL resolve"
# check is dispatched to `.github/workflows/autoposter-verify-url.yml` and the session reads the
# conclusion of the run IT dispatched, by id.
#
# Until 2026-09-11 this was a throwaway script with a hardcoded url->run-id map, and the
# freshness rule was my own discipline at post time. A hand-step that works once and rots is
# exactly what this module now replaces: freshness is a RULE here, and a stale verification is a
# rejection, not a judgement call.
#
# Results are read from JOB LOGS, not artifacts. Artifact downloads redirect to
# productionresultssa9.blob.core.windows.net, which this session's egress denies (measured:
# CONNECT 403). The run conclusion and the job logs both come through api.github.com.
# ---------------------------------------------------------------------------

import json as _json
from datetime import datetime, timezone


class VerificationUnavailable(Exception):
    """The check could not be completed. Never silently treated as a pass."""


def _parse_result(log_text: str) -> dict | None:
    """Pull the workflow's JSON payload out of the job log.

    The log is timestamp-prefixed per line, so the JSON is reassembled rather than parsed
    whole. Returns None when no payload is present — which the caller treats as a rejection,
    never as a pass.
    """
    lines = []
    collecting = False
    for raw in log_text.splitlines():
        body = raw.split(" ", 1)[1] if " " in raw and raw[:4].isdigit() else raw
        stripped = body.strip()
        if stripped == "{":
            collecting, lines = True, ["{"]
            continue
        if collecting:
            lines.append(stripped)
            if stripped == "}":
                try:
                    return _json.loads("".join(lines))
                except ValueError:
                    collecting, lines = False, []
    return None


def actions_resolver(*, dispatch, get_run, get_logs, max_age_seconds: int,
                     expect_host: str | None = None, poll_limit: int = 20, now=None):
    """Build a link/media opener backed by a real GitHub Actions run.

    `dispatch(url, expect_host) -> run_id`, `get_run(run_id) -> {status, conclusion}`,
    `get_logs(run_id) -> str`. Injected so this is testable without a network, and so the
    session supplies MCP-backed implementations.

    Three assertions, all rejections rather than warnings:
      * the run must CONCLUDE success;
      * `requested_url` in the payload must equal the URL asked about — otherwise a check of one
        URL could vouch for another, and it would look green;
      * `checked_at` must be within `max_age_seconds` — the rule that replaces remembering to
        re-verify at post time.
    """
    clock = now or (lambda: datetime.now(timezone.utc))

    def opener(url: str):
        try:
            run_id = dispatch(url, expect_host)
        except Exception as exc:                      # noqa: BLE001
            return False, f"{UNREACHABLE} could not dispatch verification: {exc}"
        if not run_id:
            return False, f"{UNREACHABLE} verification dispatch returned no run id"

        for _ in range(poll_limit):
            run = get_run(run_id) or {}
            if run.get("status") == "completed":
                break
        else:
            return False, f"{UNREACHABLE} verification run {run_id} did not complete in time"

        if run.get("conclusion") != "success":
            return False, f"verification run {run_id} concluded {run.get('conclusion')!r}"

        payload = _parse_result(get_logs(run_id) or "")
        if not payload:
            return False, f"verification run {run_id} produced no readable result"

        if payload.get("requested_url") != url:
            return False, (f"verification run {run_id} checked "
                           f"{payload.get('requested_url')!r}, not {url!r} — a check of one URL "
                           f"cannot vouch for another")

        checked_at = payload.get("checked_at", "")
        try:
            checked = datetime.fromisoformat(checked_at.replace("Z", "+00:00"))
        except ValueError:
            return False, f"verification run {run_id} has an unparseable checked_at {checked_at!r}"
        age = (clock() - checked).total_seconds()
        if age > max_age_seconds:
            return False, (f"verification run {run_id} is {age:.0f}s old, limit "
                           f"{max_age_seconds}s — re-verify at post time rather than trusting "
                           f"an earlier run")
        if age < -60:
            return False, f"verification run {run_id} is dated in the future ({checked_at})"

        return True, f"resolved {payload.get('http_code')} (GitHub Actions run {run_id})"

    return opener
