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
