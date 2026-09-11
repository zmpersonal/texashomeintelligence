# 🔴 Cadence driver + one-tap Slack approval — PROPOSAL ONLY, NOTHING BUILT

The goal: an article every 3–7 days and a Facebook post that sends itself, with one tap from a
phone standing between the machine and the page — until the existing autonomy gate removes even
that. **Earned over ~4 posts, not flipped now.** Nothing in this document is built.

---

## 1. What already exists, and what is genuinely missing

Most of the machine is here. Naming that honestly matters, because the temptation in a
"go hands-off" round is to rebuild things that already work.

| Capability | State |
|---|---|
| Story selection by surprise score | built (`movers_engine`) |
| Topic ranking, gating, already-written exclusion | built (`topic_scorer`, `published_questions`) |
| Claim ledger + prose gates | built |
| Card built from the ledger + card gate | built |
| Full social gate suite, pinned-channel guard, two-lock publish | built |
| Destination + media resolution, freshness-bounded | built |
| Post-publish verification + published-posts ledger | built |
| Duplicate-destination refusal | built (this round) |
| **A clock** | **missing** |
| **A way to say yes from a phone** | **missing** |
| **A site crossing that does not need a human to open a PR** | **missing — and the real blocker** |

That last row is the one that decides whether this is possible at all, so it goes first.

---

## 2. The blocker nobody can automate away: every article is a site write

An article is not a post. It is a file under `site/src/data/analysis/`, a card PNG under
`site/public/images/og/`, and a sidecar under `site/src/data/og-cards/` — all outside
`autoposter/`, and `main` auto-deploys to the live domain. Rule 0 and SECURITY.md both put that
step in the owner's hands.

So "hands-off" has a hard floor: **the article half cannot be fully unattended without a
deliberate decision to let a machine write to `site/` and merge to `main`.** Three options,
and this is a 🔴 for the owner, not a choice the build makes:

- **(a) Keep the crossing manual.** The driver opens a PR with the article, card and sidecar;
  the owner merges. The post half is automatic once the article is live. Honest, and it means
  "hands-off" is really "one merge per article".
- **(b) Auto-merge a NARROW path.** A driver may merge a PR only when it touches nothing but
  `site/src/data/analysis/<slug>.md`, `site/public/images/og/<slug>.png` and
  `site/src/data/og-cards/<slug>.json`, the article is `published: false`, and every gate is
  green. Publishing stays a second, separate one-field flip. Narrower than it sounds, and
  auditable — but it is still a machine merging to a branch that deploys.
- **(c) Decouple.** Articles move out of the repo into a store the site reads at build time.
  Correct long-term, a large change, and not this round.

**Recommendation: (a) now, revisit (b) after the channel graduates.** The approval tap is worth
building either way; the merge question is separable and should not be bundled with it.

---

## 3. The cadence driver

**Where it runs.** GitHub Actions on a schedule, in `autoposter/`. The URL-verification workflow
already proved Actions can reach the live domain when this session cannot, and the runner is
where the gates are actually performable (L13).

**🔴 SCOPE:** one new workflow file in `.github/workflows/`. That is outside `autoposter/` and
needs the same explicit approval the verification workflow got. Everything else is in-boundary.

**What it does on each fire:**

1. Read `state.json` (in `autoposter/data/`): last article date, last post date, streak.
2. If fewer than `cadence.article_days_min` (3) since the last article, **exit 0 and say so.**
   A driver that runs and does nothing is the normal case, not a failure.
3. Build the feed, rank topics, exclude already-written, pick the top buildable topic.
4. If no topic has a claim-builder, **halt and notify** — never fall through to the runner-up.
5. Run the article engine: ledger, prose gates, card, two-lock guard.
6. Open a PR with the article + card + sidecar (option (a) above).
7. Post the approval card to Slack (§4) with the PR link.
8. On the next fire, if the article is live and its card resolves, stage the promo and send it
   **only** if an approval is recorded.

**Cadence, and why a range rather than a number:** `article_days_min: 3`, `article_days_max: 7`.
The driver fires daily and acts only when both the interval and a buildable topic allow it.
Forcing a post on day 7 with nothing to say is how a data brand starts publishing filler; the
existing quiet-week machinery already exists to say "nothing this week", and it should win.

**Cost.** One model call per article (the prose), unchanged. A firing that does nothing costs
zero model calls. At ~6 articles/month this stays inside the $20 ceiling with room; the driver
should log token spend per run so the ceiling is measured, not assumed.

---

## 4. One-tap Slack approval

**The card** (Block Kit, posted to `#thi-autoposter`):

```
THI · post #3 ready
Is Austin's home-improvement boom actually cooling off?
224 solar permits · up 138% month over month · City of Austin, Aug 2026
[card thumbnail]
Article: <preview link>   Gates: 9/9 green   Streak: 2/4
[ ✅ Send ]  [ ✋ Hold ]
```

Headline, hero number, preview link, and the two buttons. Nothing else — the point of one tap is
that the decision is legible in three seconds on a phone.

**The rule that matters: no response is HOLD.** The approval record must be a positive artifact.
Absence of a click is absence of consent, and a timeout that sends is not an approval system, it
is a delay. An unanswered card expires after `approval_expiry_hours` (48) and the post is
dropped, not queued.

**🔴 SCOPE — this is the part that needs a decision.** A Slack *button* posts to a URL. That
means an HTTPS endpoint that verifies Slack's signature and records the click. Three shapes:

| Option | Where it lives | Scope |
|---|---|---|
| **Astro server route** on the existing Worker | `site/src/pages/api/…` | 🔴 outside `autoposter/`, and puts an approval endpoint on the public brand domain |
| **Separate tiny Worker** | its own wrangler project inside `autoposter/` | in-boundary, one more deploy target and secret |
| **No endpoint: poll instead** | Actions job reads channel replies via the Slack API | in-boundary, no endpoint, no signature verification; approval is a REPLY (`go` / `hold`) rather than a button |

**Recommendation: start with the third.** It reaches one-tap-equivalent (a two-character reply)
with no new public surface, no signature-verification code to get wrong, and no secret beyond the
Slack token already planned. If the tap genuinely matters more than the simplicity, the second
option is the right one — never the first, because an approval endpoint on the domain whose
credibility the whole project serves is the wrong place to learn about replay attacks.

**Security notes for whichever is chosen:** the approver must be an allowlisted Slack user id
(not "anyone in the channel"); each approval is bound to one `post_id` and single-use; the record
goes in the ledger beside the post. A Slack message is an untrusted input — it may name a post,
never a destination or a page id.

---

## 5. Graduation, unchanged

The existing gate already describes the end state: `clean_posts_required: 4`, zero human edits,
`min_review_cycles: 2`. When Facebook's streak reaches 4 across at least two distinct cycles, the
approval step drops and the driver sends on its own. **The gate is not touched by any of this** —
it is the thing all of this is earning. `reset_on` stays as written: a malformed post, a factual
error or a platform warning sends the streak to zero and the approval step comes back.

Two things worth adding when the flip happens, not before:
- a **kill switch** the owner can hit from Slack that sets `autonomy: review` immediately;
- a **daily digest** instead of a per-post card, so unattended does not mean unobserved.

---

## 6. Recommended order

1. **This round's work merges.** Nothing below starts until post #2 is out and clean.
2. **The driver, dry-run only** — fires daily, picks, builds, opens the PR, posts a Slack card
   with the buttons disabled. Prove the clock and the selection before anything can send.
3. **Approval recording** (the reply-poll option), still not sending.
4. **Enable sending** on approval, for posts #3 and #4.
5. **Graduation** at 4 clean posts across ≥2 cycles — owner's call, never the run's.

Steps 2–4 are each one round and each end with something observable rather than something
promised.

---

## Decisions needed before any of it is built

1. **The site crossing:** (a) manual merge, (b) narrow auto-merge, or (c) decouple. Recommend (a).
2. **Slack approval shape:** endpoint on the site, separate Worker, or reply-polling.
   Recommend reply-polling.
3. **One new workflow file** in `.github/workflows/` for the driver — the same 🔴 the
   verification workflow needed.
