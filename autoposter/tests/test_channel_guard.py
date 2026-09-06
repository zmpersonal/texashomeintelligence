"""Tests for the pinned-target guard.

The cases below are the real hazards measured in the live Blotato workspace on 2026-09-06,
not invented ones: nine Facebook Pages behind one account, a YouTube channel belonging to an
unrelated property, and a listing that reports a *default* pageId the guard must never take.

Run: python3 tests/test_channel_guard.py   (or python3 -m pytest tests/)
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import channel_guard as g  # noqa: E402

# The real ids, as measured. 1335273942995805 is THI; 472026422664772 is InHouse Wellness —
# a sibling page under the SAME account, which is what makes this guard load-bearing.
THI_ACCOUNT = "49743"
THI_PAGE = "1335273942995805"
SIBLING_PAGE = "472026422664772"

CFG = {
    "channels": {
        "facebook": {
            "status": "live",
            "enabled": True,
            "pinned": {
                "account_id": THI_ACCOUNT,
                "page_id": THI_PAGE,
                "name": "Texas Home Intelligence",
                "requires_page_id": True,
            },
        },
        # Connected on Blotato, but to an unrelated property. Deliberately unpinned.
        "youtube": {"status": "not_configured", "enabled": False, "pinned": None},
        "instagram": {"status": "not_configured", "enabled": False, "pinned": None},
    }
}

LIVE = [
    {
        "id": "49743",
        "platform": "facebook",
        "subaccounts": [
            {"id": "1335273942995805", "name": "Texas Home Intelligence"},
            {"id": "472026422664772", "name": "InHouse Wellness"},
            {"id": "1283217111543170", "name": "Austin Beefs"},
        ],
        "requiredFields": {"pageId": "1335273942995805"},
    },
    {"id": "48654", "platform": "youtube", "subaccounts": []},
]


def _good():
    return {"platform": "facebook", "account_id": THI_ACCOUNT, "page_id": THI_PAGE}


def _halts(post, cfg=CFG):
    try:
        g.assert_post_target(post, cfg)
    except g.ChannelGuardHalt as e:
        return e
    raise AssertionError(f"expected HALT, post was allowed: {post}")


def test_pinned_target_passes():
    assert g.assert_post_target(_good(), CFG)["page_id"] == THI_PAGE


def test_sibling_page_under_same_account_halts():
    """The core hazard: right account, wrong brand."""
    p = _good(); p["page_id"] = SIBLING_PAGE
    assert "not the pinned page" in str(_halts(p))


def test_missing_page_id_halts_and_does_not_fall_back():
    """Blotato reports a default pageId. Absence must HALT, never take the default."""
    p = _good(); del p["page_id"]
    assert "no page_id" in str(_halts(p))


def test_wrong_account_halts():
    p = _good(); p["account_id"] = "48654"
    assert "not the pinned facebook account" in str(_halts(p))


def test_missing_account_halts():
    p = _good(); del p["account_id"]
    assert "no account_id" in str(_halts(p))


def test_unpinned_channel_halts_even_though_connected():
    """YouTube IS connected on Blotato — to someone else's channel. It is both disabled and
    unpinned, and it halts on the first of those; `test_enabled_but_unpinned_halts` covers the
    pin check on its own."""
    e = _halts({"platform": "youtube", "account_id": "48654"})
    assert "youtube" in str(e) and ("not enabled" in str(e) or "DO NOT POST" in str(e))


def test_unknown_platform_halts():
    assert "not a configured channel" in str(_halts({"platform": "tiktok", "account_id": "x"}))


def test_empty_platform_halts():
    assert "refusing to infer" in str(_halts({"platform": "", "account_id": THI_ACCOUNT}))


def test_yaml_int_ids_normalize():
    """YAML parses an unquoted page id as an int; Blotato returns a string. A guard that
    rejects a correct target gets disabled, so int/str must compare equal."""
    cfg = {"channels": {"facebook": {"enabled": True, "pinned": {
        "account_id": 49743, "page_id": 1335273942995805,
        "name": "Texas Home Intelligence", "requires_page_id": True}}}}
    assert g.assert_post_target(_good(), cfg)["page_id"] == THI_PAGE


def test_all_reasons_reported_not_just_first():
    p = {"platform": "facebook"}
    assert len(_halts(p).reasons) == 2


def test_live_listing_matches():
    assert len(g.assert_live_accounts_match(LIVE, CFG)) == 1


def test_live_listing_renamed_page_halts():
    """An id reassigned on Blotato's side: same slot, different brand."""
    live = [dict(LIVE[0], subaccounts=[{"id": THI_PAGE, "name": "Sauna News Hub"}]), LIVE[1]]
    try:
        g.assert_live_accounts_match(live, CFG)
    except g.ChannelGuardHalt as e:
        assert "id reassigned" in str(e); return
    raise AssertionError("expected HALT on a renamed pinned page")


def test_live_listing_disconnected_page_halts():
    live = [dict(LIVE[0], subaccounts=[{"id": SIBLING_PAGE, "name": "InHouse Wellness"}])]
    try:
        g.assert_live_accounts_match(live, CFG)
    except g.ChannelGuardHalt as e:
        assert "no longer connected" in str(e); return
    raise AssertionError("expected HALT on a disconnected pinned page")


def test_live_listing_absent_account_halts():
    try:
        g.assert_live_accounts_match([LIVE[1]], CFG)
    except g.ChannelGuardHalt as e:
        assert "not in the live workspace listing" in str(e); return
    raise AssertionError("expected HALT when the pinned account is gone")


def test_pinned_but_disabled_halts():
    """Either switch alone stops a post; neither alone authorises one."""
    cfg = {"channels": {"facebook": dict(CFG["channels"]["facebook"], enabled=False)}}
    assert "not enabled" in str(_halts(_good(), cfg))


def test_enabled_but_unpinned_halts():
    cfg = {"channels": {"facebook": {"enabled": True, "pinned": None}}}
    assert "DO NOT POST" in str(_halts(_good(), cfg))


def test_postable_platforms_is_only_pinned():
    assert g.postable_platforms(CFG) == ["facebook"]


if __name__ == "__main__":
    fns = [f for n, f in sorted(globals().items()) if n.startswith("test_")]
    ok = 0
    for f in fns:
        try:
            f(); ok += 1; print("PASS", f.__name__)
        except AssertionError as e:
            print("FAIL", f.__name__, e)
    print(f"{ok}/{len(fns)} passed")
    sys.exit(0 if ok == len(fns) else 1)
