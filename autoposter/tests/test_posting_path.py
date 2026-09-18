"""The POSTING path — the third place a stubbed function hid a break until production.

`publish_fn` is a stub lambda in every other test, and a dry run returns before publish is
reached. So `blotato_publisher`'s inner `publish` had never executed anywhere, and the first
real cycle crashed inside it:

    target = channel_guard.assert_post_target("facebook", config)
    AttributeError: 'str' object has no attribute 'get'

It was passing the platform NAME where the guard takes the POST. Beyond the crash, that call
could never have checked anything: the guard's whole job is to compare what the post says it is
addressed to against the pin, and a string says nothing.

These tests run the REAL publisher over the REAL post the real pipeline builds, with only the
HTTP socket replaced. Everything between the article and the wire is exercised.

Run: python3 tests/test_posting_path.py
"""
import copy
import io
import json
import os
import sys
import tempfile
from datetime import date
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import article_engine as engine       # noqa: E402
import channel_guard                  # noqa: E402
import run_article                    # noqa: E402
import run_autopilot as ra            # noqa: E402

def _isolated_cfg():
    """Config whose published-article folder and ledger are EMPTY temp dirs.

    The suite must state its own premise. Reading the live site's articles made the pool of
    selectable topics shrink every time the machine published for real, and going red the day
    the fifth builder's current-period title went live — with no code change behind it.
    """
    cfg = copy.deepcopy(engine.load_config())
    cfg["publish"] = dict(cfg["publish"],
                          published_ledger=tempfile.mkdtemp() + "/empty.json",
                          analysis_dir=tempfile.mkdtemp())
    return cfg


TODAY = date(2026, 9, 18)


def _real_post():
    """The actual post the pipeline produces — not a fixture approximating one. A hand-written
    post dict is exactly how this bug survived: it would have carried whatever keys the test
    author thought were needed."""
    cfg = _isolated_cfg()                        # the SAME premise the engine ran under: the
    #                                              duplicate gate must judge the article the
    #                                              engine was allowed to pick, not the live one.
    result = engine.run("thi", config=cfg, write_fn=run_article.write,
                        build_claims_fn=run_article.build_claims, today=TODAY,
                        articles=run_article.TOPIC_ARTICLES, exclude_published=True)
    article, claims, card = result["article"], result["claims"], result["card"]
    directory = Path(tempfile.mkdtemp())
    (directory / f"{article['slug']}.json").write_text(json.dumps(
        {"path": f"/images/og/{article['slug']}.png", "width": 1200, "height": 630,
         "alt": "…", "rendered": card}))
    cfg["publish"] = dict(cfg["publish"], og_sidecar_dir=str(directory))
    post, _gate = engine.build_facebook_promo(
        article, claims, cfg, TODAY, link_opener=lambda u: (True, "ok"),
        media_opener=lambda u: (True, "ok"),
        caption=run_article.TOPIC_CAPTIONS.get(result["topic"]["id"]), defer_resolution=True)
    return post, cfg


class FakeHTTP:
    """Stands in for the socket, and ONLY the socket."""

    def __init__(self, body=None, boom=None):
        self.body = body or {"postSubmissionId": "sub-1", "postUrl": "https://facebook.com/p/1"}
        self.boom, self.seen = boom, []

    def __call__(self, request, timeout=None):
        self.seen.append({"url": request.full_url,
                          "headers": {k.lower(): v for k, v in request.header_items()},
                          "payload": json.loads(request.data.decode())})
        if self.boom:
            raise self.boom
        outer = self

        class R:
            def read(self): return json.dumps(outer.body).encode()
            def __enter__(self): return self
            def __exit__(self, *a): return False
        return R()


def _patched(http):
    ra.urllib.request.urlopen = http


def _restore():
    import urllib.request
    ra.urllib.request.urlopen = urllib.request.urlopen


# ===================================================== the first lock: the post carries the pin

def test_the_real_post_carries_the_pinned_account_and_page():
    """Without this the guard has nothing to compare, and the ledger records page_id: null —
    which is what it did for the one post that ever went out."""
    post, cfg = _real_post()
    target = channel_guard.pinned_target("facebook", cfg)
    assert post["account_id"] == target["account_id"]
    assert post["page_id"] == target["page_id"]


def test_the_guard_ACCEPTS_the_real_post():
    post, cfg = _real_post()
    assert channel_guard.assert_post_target(post, cfg)["platform"] == "facebook"


# ===================================================== the second lock: the guard at send time

def test_the_publisher_passes_the_POST_to_the_guard_not_the_platform_name():
    """THE REGRESSION. The old call passed the string "facebook" and died on `.get`. Running the
    real publisher over the real post is the only thing that catches this shape of mistake."""
    post, cfg = _real_post()
    http = FakeHTTP()
    _patched(http)
    try:
        record = ra.blotato_publisher("test-key", cfg)(post)
        assert record["post_url"] == "https://facebook.com/p/1"
        assert record["submission_id"] == "sub-1"
    finally:
        _restore()


def test_a_post_addressed_to_the_WRONG_PAGE_never_reaches_the_wire():
    """The guard's reason to exist: keeping THI's posts off other pages in the same workspace."""
    post, cfg = _real_post()
    post = dict(post, page_id="99999999999")
    http = FakeHTTP()
    _patched(http)
    try:
        ra.blotato_publisher("test-key", cfg)(post)
        assert False, "a post aimed at an unpinned page was published"
    except channel_guard.ChannelGuardHalt as exc:
        assert "not the pinned page" in str(exc)
        assert not http.seen, "it called Blotato before failing the guard"
    finally:
        _restore()


def test_a_post_that_LOST_its_page_id_never_reaches_the_wire():
    post, cfg = _real_post()
    post = {k: v for k, v in post.items() if k != "page_id"}
    http = FakeHTTP()
    _patched(http)
    try:
        ra.blotato_publisher("test-key", cfg)(post)
        assert False, "a post with no page_id was published"
    except channel_guard.ChannelGuardHalt as exc:
        assert "no page_id" in str(exc)
        assert not http.seen
    finally:
        _restore()


# ===================================================== what actually goes on the wire

def test_the_payload_addresses_the_PINNED_page_and_carries_the_card():
    post, cfg = _real_post()
    target = channel_guard.pinned_target("facebook", cfg)
    http = FakeHTTP()
    _patched(http)
    try:
        ra.blotato_publisher("test-key", cfg)(post)
        sent = http.seen[0]
        assert sent["url"] == "https://backend.blotato.com/v2/posts"
        assert sent["headers"]["blotato-api-key"] == "test-key"
        body = sent["payload"]["post"]
        assert body["accountId"] == target["account_id"]
        assert body["target"]["pageId"] == target["page_id"]
        assert body["content"]["text"] == post["caption"]
        assert body["content"]["mediaUrls"] == [post["media_url"]]
        assert body["content"]["mediaUrls"][0].endswith(".png")
    finally:
        _restore()


def test_no_api_key_REFUSES_and_says_so_without_calling_blotato():
    post, cfg = _real_post()
    http = FakeHTTP()
    _patched(http)
    try:
        ra.blotato_publisher(None, cfg)(post)
        assert False, "it published with no credential"
    except RuntimeError as exc:
        assert "BLOTATO_API_KEY is not set" in str(exc)
        assert "Nothing was published" in str(exc)
        assert not http.seen
    finally:
        _restore()


def test_a_response_with_no_submission_id_is_a_FAILURE_not_a_success():
    """Blotato accepting the request is not Blotato posting it. Treating a shrug as a post is
    how a machine comes to believe it published something it did not."""
    post, cfg = _real_post()
    http = FakeHTTP(body={"status": "ok"})
    _patched(http)
    try:
        ra.blotato_publisher("test-key", cfg)(post)
        assert False
    except RuntimeError as exc:
        assert "no submission id" in str(exc)
    finally:
        _restore()


def test_a_transport_failure_propagates_rather_than_being_swallowed():
    post, cfg = _real_post()
    _patched(FakeHTTP(boom=OSError("connection reset")))
    try:
        ra.blotato_publisher("test-key", cfg)(post)
        assert False
    except OSError as exc:
        assert "connection reset" in str(exc)
    finally:
        _restore()


if __name__ == "__main__":
    fns = [f for n, f in sorted(globals().items()) if n.startswith("test_")]
    ok = 0
    for f in fns:
        try:
            f(); ok += 1; print("PASS", f.__name__)
        except AssertionError as e:
            print("FAIL", f.__name__, str(e)[:250])
        except Exception as e:                     # noqa: BLE001
            print("ERROR", f.__name__, f"{type(e).__name__}: {str(e)[:220]}")
    print(f"{ok}/{len(fns)} passed")
    sys.exit(0 if ok == len(fns) else 1)
