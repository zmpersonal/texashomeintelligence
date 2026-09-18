# State inventory — every fact the cycle reads or writes, and where it survives

**Why this file exists.** "Runner-local state dies with the container" has bitten three times:
the ledger row (L21), the cadence clock, and — by a different mechanism wearing the same
symptom — the streak. Each was found live, one at a time, after the previous one was called
fixed. L20 says fix the class, so this enumerates *every* piece of state the cycle touches and
names where each one persists. Anything that persists **nowhere** is a latent next instance.

Maintained as part of the change that adds durable state. **If you add a file the cycle writes,
add a row here** — and if the row says "nowhere", justify it or make it persist.

## The rule

> A fact the cycle LEARNS must reach `main` before the cycle reports success.
> A fact the cycle DERIVES may be ephemeral, because the next run derives it again.

The distinction is whether the information exists anywhere else. A ledger row is learned — the
post happened, once, and nothing else records it. A rendered card is derived — the same inputs
rebuild it byte for byte.

## Inventory

| # | State | Written by | Read by | Persists | Verdict |
|---|---|---|---|---|---|
| 1 | `data/published-posts.json` — the ledger | `publish_gate.publish_with_verification` → runner; `run_autopilot.commit_to_main` → main | duplicate gate, orphan finder, `clean_streak` | **main**, confirmed read-back | ✅ learned, durable |
| 2 | `data/autopilot-state.json` — `last_article_at` (the cadence floor) | `autopilot.save_state` → runner; `commit_to_main` → main | `autopilot.due` | **main**, confirmed read-back, same commit as #1 | ✅ learned, durable |
| 3 | `data/autopilot-state.json` — `cycles` | same | **nothing** | main (carried along) | ✅ safe: nothing reads it. A counter with no consumer; it rides along because it shares a file, not because it is needed. If anything ever reads it, it needs its own `present` check — today it can silently fail to advance when the clock is already ahead. |
| 4 | streak | not written — **computed** from #1 | the FYI notice, `streak_after` in the row | n/a (derived) | ✅ derived. Was a hand-maintained `clean_streak` in `config.yaml` that no code advanced, which is how post #4 recorded 2 with four posts on the page. |
| 5 | `config.yaml` → `channels.facebook.clean_streak` | **a human, deliberately** | nothing, as of this change | main | ⚠️ owner-owned. The autonomy-graduation marker; same name as #4, different meaning. Code must not read or write it. Now unused — see "Open question". |
| 6 | `site/src/data/analysis/<slug>.md` — the article | `site_renderer` → runner; `site_merger` → main | the live site | **main** | ✅ learned, durable |
| 7 | `site/src/data/og-cards/<slug>.json` + `site/public/images/og/<slug>.png` | `site_renderer` / `npm run og-cards`; `site_merger` → main | the card gate, the post's media | **main** | ✅ learned, durable |
| 8 | `autoposter/articles/<slug>/` — draft, claim ledger, promo JSON | `run_article.write` → runner | nothing, after the cycle that wrote it | **nowhere** | ✅ safe ephemeral, deliberately. These are authoring artifacts; the published copies are #6/#7. Per `CLAUDE.md` → *Drafts*, they must NOT reach `main`. **Hazard:** the path is tracked, so writing it makes the tree dirty — which is the exact condition that broke the ledger commit. Neutralized by reading every committed file from the ref, never the tree. |
| 9 | `data/social-feed.json` — the observations feed | `build_feed.py` — **which no workflow runs** | every builder, every claim | main, but **frozen** | ⚠️ see below |
| 10 | `config.yaml`, `article_topics.yaml`, `specs/`, `schema/` | humans | everything | main | ✅ read-only inputs |
| 11 | Blotato submission → post URL | Blotato | recorded into #1 | Blotato + main | ✅ the row carries `submission_id`, so a post can be re-verified from its status endpoint afterwards |
| 12 | The kill switch — `AUTOPOSTER_PAUSED` var + `autopilot.paused` | a human | `run_cycle` | GitHub / main | ✅ either pauses; both must be clear to publish |

## The one that is not a state bug but is the bigger risk

**Row 9.** `data/social-feed.json` carries `generated_at: 2026-09-06T19:21:13+00:00` and has not
changed since the commit that added this project to `main`. `build_feed.py` writes it; **no
workflow runs `build_feed.py`.** `data-ingestion.yml` refreshes the *site's* generated datasets
via `site/scripts/ingest.ts` — a different pipeline, a different output.

So every article the machine writes is built from a frozen snapshot of the world.

It is not a persistence defect — the file persists fine. It is the opposite: it persists and
never refreshes. The failure direction is the safe one, because `claim-freshness` is fail-closed:
as the snapshot ages past each claim's staleness bound the gate refuses and the cycle publishes
nothing, rather than publishing stale numbers as current. But "safe" here means *the machine
goes quiet*, which on an unattended machine looks identical to "nothing interesting happened".

**Not fixed in this change** — it needs a scheduled ingestion workflow and a decision about
frequency and cost, which is the owner's call (Rule 1). Recorded here so it is not discovered
live as instance four.

## What the frozen feed already costs, today

Row 9 is not a future risk. As of 2026-09-18 **all five buildable builders have published their
current-period title**:

| builder | title it would emit today | published |
|---|---|---|
| `electricity-still-rising` | Are Texas electricity prices still going up? | ✅ |
| `austin-ac-rush-vs-heat` | Did Austin's AC rush follow the heat in August 2026? | ✅ |
| `austin-improvement-boom-cooling` | Is Austin's home-improvement boom actually cooling off? | ✅ |
| `san-antonio-improvement-boom` | Is San Antonio's remodel boom cooling off? (Aug 2026) | ✅ |
| `summer-hotter-than-normal` | Was August 2026 hotter than normal in Texas? | ✅ |

The other six topics are `buildable=False` from this feed.

That is the recurrence design working: a builder is retired for the PERIOD, not forever, and
becomes eligible again when the data gains a month. But the data gains a month only when the
feed refreshes, and nothing refreshes it. So the two findings compound: **every cycle from now
until the feed moves will select nothing and skip.**

The cycle handles this correctly — `evaluate` catches the engine's refusal and returns `skip`,
which notifies and stays green. Nothing crashes and nothing false is published. The machine
simply has nothing to say, and will keep having nothing to say until row 9 is addressed.

## The same class, in the test harness

Three suites went red on `main` on 2026-09-18 with no code change behind them, because
`published_questions` reads the LIVE SITE's article folder out of the checkout and the tests
borrowed it. Every real publish shrank the pool of topics the suite could select, and the fifth
one emptied it.

This matters more than a flaky suite: **CI runs the test suite before the cycle**, so a red
suite stops the machine running at all. A test that depends on production data is a scheduled
outage with an unknown date.

Fixed by having each suite state its own premise — `engine.run` now accepts the caller's config
(it used to re-read from disk and ignore the one the driver already held, so an override never
reached it), and every suite passes a config whose ledger and article folder are empty temp
dirs. The one test that genuinely needs a published article now writes one.

## Open question for the owner

Row 5. With the streak now counted from the ledger, `channels.facebook.clean_streak` has no
reader. Its comment says only the owner advances it and that it gates autonomy graduation. Keep
it as the human graduation marker (and document that nothing reads it), or retire it? Left in
place, untouched, pending that call.
