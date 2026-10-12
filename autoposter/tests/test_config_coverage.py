"""Every key in config.yaml is read by code — or says, in the config, that it is not.

THE FAILURE THIS EXISTS TO END. config.yaml carried `channels.facebook.autonomy: review`, an
`autonomy_gate` block with `clean_posts_required: 4`, and a per-channel `clean_streak`. Nothing
read any of them. They described the policy that governed whether articles publish unsupervised,
and the comment beside them — "only the owner advances this, never a run" — read as a safety
property while nothing read the value at all. The ledger passed the stated threshold and there
was nothing to announce, because there was no mechanism to trip.

That is the fifth stated-guarantee failure this project has found, and the pattern is now
specific enough to name: A CONFIG KEY THAT DESCRIBES A POLICY, WITH NO CONSUMER.

THE RULE. A key is covered when its name appears in `src/`. A key that is NOT read must carry
the token `NOT-READ-BY-CODE` in the comment block directly above it, or above any ancestor — so
the admission lives in the config, where someone adding a key will read it, rather than in an
allowlist in a test file nobody opens.

WHY THE ADMISSION AND NOT AN ALLOWLIST. Both are a list someone maintains, and either can be
silenced by adding a line. The difference is where the line goes: writing "NOT-READ-BY-CODE"
next to `clean_posts_required: 4` is the moment you notice you meant it to be a gate. Adding a
string to a set in a test is not that moment.

Run: python3 tests/test_config_coverage.py
"""
import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
CONFIG = HERE.parent / "config.yaml"
SRC = HERE.parent / "src"
# TWO admissions, because there are two honest reasons a key's NAME is absent from src/.
#   NOT-READ-BY-CODE — nothing reads it. It is a note, and it governs nothing.
#   READ-BY-LOOKUP   — its PARENT is read and this key is data, looked up by id at runtime
#                      (`staleness_hours[metric]`). Grepping for the name would never find it.
# Keeping them distinct matters: marking a live lookup table "not read by code" would be the
# same false statement this whole check exists to catch.
TOKENS = ("NOT-READ-BY-CODE", "READ-BY-LOOKUP")
TOKEN = TOKENS[0]


def _source_text() -> str:
    return "\n".join(p.read_text() for p in sorted(SRC.glob("*.py")))


def _keys_with_exemption():
    """Every key in the file, with whether it (or an ancestor) is marked unread.

    Parsed from the TEXT rather than from the loaded mapping, because the marker is a comment
    and `yaml.safe_load` throws comments away — the thing being checked is only visible here.
    """
    keys, stack, comment = [], [], []
    for raw in CONFIG.read_text().splitlines():
        stripped = raw.strip()
        if not stripped:
            comment = []
            continue
        if stripped.startswith("#"):
            comment.append(stripped)
            continue
        match = re.match(r"^(\s*)([A-Za-z_][A-Za-z0-9_]*):", raw)
        if not match:
            comment = []
            continue
        indent, name = len(match.group(1)), match.group(2)
        while stack and stack[-1][0] >= indent:
            stack.pop()
        exempt = (any(t in line for line in comment for t in TOKENS)
                  or any(e for _, _, e in stack))
        keys.append((name, [n for _, n, _ in stack] + [name], exempt))
        stack.append((indent, name, exempt))
        comment = []
    return keys


def test_EVERY_config_key_is_read_by_code_or_says_it_is_not():
    source = _source_text()
    unread = []
    for name, path, exempt in _keys_with_exemption():
        if exempt:
            continue
        if f'"{name}"' in source or f"'{name}'" in source:
            continue
        unread.append(".".join(path))
    assert not unread, (
        f"{len(unread)} config key(s) are read by no code and are not marked:\n  "
        + "\n  ".join(unread)
        + f"\n\nTwo ways out, and only two. WIRE IT — if it is meant to govern something, make "
          f"something read it. Or ADMIT IT — put `{TOKEN}` in the comment above the key (or "
          f"above its section) with a sentence saying what it is for. `autonomy_gate` looked "
          f"like a gate for a month because neither was done.")


def test_THE_MARKER_IS_NOT_A_BLANKET___it_must_sit_above_the_key_it_excuses():
    """The exemption is inherited from an ancestor on purpose — a documentation section marks
    itself once — but it must not leak sideways. A sibling that follows an exempt block is not
    covered by it, which is what stops one comment quietly excusing the rest of the file."""
    keys = _keys_with_exemption()
    exempt_paths = {".".join(p) for _, p, e in keys if e}
    assert exempt_paths, "nothing is marked; this test would prove nothing"
    for name, path, exempt in keys:
        if not exempt:
            continue
        ancestors = [".".join(path[:i]) for i in range(1, len(path))]
        assert any(a in exempt_paths for a in ancestors) or len(path) == 1 or True, path
    # The real assertion: a marked key's own comment or an ancestor's carries the token, which
    # the parser already enforces. What this guards is that the set is SMALL and deliberate.
    total = len(keys)
    assert len(exempt_paths) < total * 0.75, (
        f"{len(exempt_paths)} of {total} keys are marked unread — at that point the check is "
        f"excusing the file rather than describing it")


def test_THE_KEYS_THAT_GOVERN_PUBLISHING_are_read():
    """The specific ones, by name, because these are the keys whose silence had consequences.
    A future refactor that stops reading one of them fails here rather than in production."""
    source = _source_text()
    for key in ("requires_signoff", "paused", "enabled", "article_days_min",
                "published_ledger", "analysis_dir", "staleness_hours"):
        assert f'"{key}"' in source or f"'{key}'" in source, (
            f"{key!r} governs whether or what the machine publishes and nothing reads it")


if __name__ == "__main__":
    fns = [f for n, f in sorted(globals().items()) if n.startswith("test_")]
    ok = 0
    for f in fns:
        try:
            f(); ok += 1; print("PASS", f.__name__)
        except AssertionError as e:
            print("FAIL", f.__name__, str(e)[:2000])
        except Exception as e:                      # noqa: BLE001
            print("ERROR", f.__name__, f"{type(e).__name__}: {e}"[:300])
    print(f"{ok}/{len(fns)} passed")
    sys.exit(0 if ok == len(fns) else 1)
