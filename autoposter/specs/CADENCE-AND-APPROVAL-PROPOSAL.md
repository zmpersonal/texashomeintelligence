# 🔴 Cadence driver + Slack reply approval — PROPOSAL ONLY, NOTHING BUILT

**Target shape (owner, 2026-09-11):** the machine does everything up to the doorstep on a 3–7
day cadence — picks the next story, writes it, builds the card, verifies, stages the post AND
opens the site PR — then sends ONE Slack message. One ✅ merges the PR, deploys, and releases the
Facebook post. No response is HOLD, always.

**Two rules that do not change:**
- **The site merge stays human indefinitely, including after graduation.** Auto-merging AI
  content to a live brand domain is more exposure than the convenience is worth. It is a code
  deployment, not a tweet.
- **What graduates at 4 clean posts is the FACEBOOK SEND, not the site deploy.** After
  graduation the machine still asks before merging; it just no longer asks before posting.

---

## 1. What the ✅ actually does

One tap, and the machine does everything on both sides of it. The tap is the ONLY human action
in a cycle.

```
   ┌─ automatic ─────────────────────────────┐   ┌─ YOU ─┐   ┌─ automatic ──────────────┐
   pick story → write → card → gates → stage      ✅ / ✋      merge PR → wait for deploy
   post → open site PR → post Slack message                   → verify URL + card resolve
                                                              → release FB post → ledger
   └─────────────────────────────────────────┘   └───────┘   └──────────────────────────┘
```

The right-hand side is not "merge and hope". It is the sequence go-live already uses: merge,
wait for the Worker build, verify the canonical URL and the card both resolve from a surface
that can actually reach them, then post, then re-verify. Every existing gate still runs. A ✅ is
permission to proceed through gates, never permission to skip them.

**If any gate fails after the ✅**, nothing posts and the thread gets one reply saying which gate
and why. An approval is not a promise that the machine will publish; it is a removal of the one
block only a human can remove.

---

## 2. Slack by reply-polling — the design

No endpoint. Nothing on `texashomeintelligence.com`. The driver polls a channel it already owns.

### The message

```
THI · post #3 ready for review
Is Austin's home-improvement boom actually cooling off?
224 solar permits · up 138% month over month · City of Austin, Aug 2026
[card image]
PR #52 · preview: <link>  ·  gates 9/9 green  ·  streak 2/4
Reply ✅ to merge + post, ✋ to hold.  No reply by Sat 09:00 = HOLD.
```

Headline, hero number, card, preview link, and the deadline stated in the message rather than
implied. The `post_id` is carried in the message metadata, not typed by a human.

### How the reply is read

`conversations.replies` on the message's own thread, polled by the driver's next scheduled run
(and by a short follow-up run ~15 minutes after posting, so a fast ✅ is not left waiting hours).

An approval counts only if **all** of these hold:
- it is a reply **in that message's thread**, not a new channel message;
- `user` is in a code-held `approvers` allowlist of Slack user ids — not "anyone in the channel",
  because channel membership is not an authorisation model;
- the text, trimmed, is exactly `✅` or `go` (case-insensitive). Not "contains" — a message that
  merely mentions the emoji is not a decision;
- the timestamp is **after** the approval message and **before** the deadline;
- the `post_id` recorded in the thread's parent matches the post the driver is holding.

Anything else — a thumbs-up reaction, a "looks good", a reply from someone else, a reply after
the deadline — is **not** an approval. Reactions are deliberately excluded: they are the easiest
thing to add by accident on a phone.

`✋` or `hold` records an explicit hold, which is different from silence and worth distinguishing
in the ledger.

### Timeout

`approval_expiry_hours: 48`. On expiry the post is **dropped**, not queued: a stale post about
last month's reading is worse than no post. The site PR stays open — an unpublished article is
not a problem, and the next cycle's duplicate/topic-exclusion logic already knows it exists.

### Why not buttons

Buttons need an HTTPS endpoint that verifies Slack's signature, handles replay, and lives
somewhere. On the brand domain that is an approval endpoint on the property whose credibility
the whole project serves. As a separate Worker it is another deploy target and another secret.
A two-character reply is one tap on a phone — the same gesture, none of the surface. Revisit if
the reply genuinely feels slower in practice.

---

## 3. The driver

Fires daily; acts rarely. A run that does nothing is the normal case.

| Step | Behaviour |
|---|---|
| 1 | Read `data/state.json`: last article date, open approval, streak |
| 2 | An approval is outstanding → poll its thread, act on it, **stop**. Never two in flight. |
| 3 | Fewer than `article_days_min` (3) since the last article → exit 0 |
| 4 | Rank topics, exclude already-written, take the top buildable |
| 5 | No claim-builder for it → **halt and notify**; never fall through to the runner-up |
| 6 | Run the engine: ledger, prose gates, card, two-lock guard, duplicate check |
| 7 | Open the site PR; post the Slack message; record the pending approval |

`article_days_min: 3`, `article_days_max: 7`. The maximum is a prompt to look, **not** a licence
to publish filler — if nothing clears the bar on day 7 the driver says so and waits. The existing
quiet-week machinery already knows how to say "nothing this week" and should win.

**Cost:** one model call per article, unchanged. A firing that does nothing costs zero. The
driver logs token spend per run so the $20 ceiling is measured rather than assumed.

**🔴 SCOPE:** one new workflow file in `.github/workflows/` — the same crossing the
URL-verification workflow needed. Everything else is inside `autoposter/`.

**🔴 SECRET:** a Slack bot token with `chat:write`, `channels:history`, `files:write`, scoped to
the `autoposter` GitHub Environment. Per CLAUDE.md it never touches the repo.

---

## 4. What could go wrong, and what stops it

| Risk | Stop |
|---|---|
| Someone else replies ✅ | approver allowlist by user id |
| A ✅ approves the wrong post | `post_id` bound to the thread; single-use |
| Replay of an old ✅ | approval consumed on use and recorded in the ledger |
| Silence read as consent | absence is never approval; expiry drops the post |
| Deploy fails after merge | destination/card gates refuse to post; one reply says why |
| Driver posts twice | duplicate-destination gate, and state's one-in-flight rule |
| Slack text treated as instruction | a reply may only mean yes, no, or nothing. It never names a destination, a page id, or a channel — those come from config, never from a message |

That last row matters more than it looks: a Slack message is untrusted input. The approval path
reads exactly one bit from it.

---

## 5. Order of work

1. **This round merges** (PR #47) and post #2 goes out clean.
2. **Driver in dry-run:** fires daily, picks, builds, opens the PR, posts the Slack message with
   the approval line omitted. Proves the clock and the selection before anything can send.
3. **Approval recording:** poll, validate, record — still does not act on ✅.
4. **Act on ✅:** merge, deploy-wait, verify, post. For posts #3 and #4, watched.
5. **Graduation** at 4 clean across ≥2 cycles: the FB send stops asking. The merge does not.

Each step ends with something observable rather than promised.

---

## Decisions needed before building

1. **Approvers:** which Slack user ids may approve. Recommend exactly one — the owner.
2. **Deadline wording:** fixed 48h, or "by 09:00 the next working day"? Recommend 48h; it is
   easier to reason about at 11pm.
3. **The 🔴 workflow file** in `.github/workflows/`, and the Slack token as an Environment
   secret.
