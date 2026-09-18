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
| 9 | `data/social-feed.json` — the observations feed | `tools/refresh-feed.py` → main, on ingestion completing | topic scoring, G1's legal numerals | **main**, confirmed read-back | ✅ fixed — refreshed only when the data MOVED, so `generated_at` means "the data changed", not "a job ran" |
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

## The refresh, and the three things it does not do

`tools/refresh-feed.py` rebuilds the feed and lands it on main through the same
`commit_to_main` discipline as the ledger row. It commits only when the **substance** moved —
`generated_at` changes on every run, and committing on that would put a daily commit on main
(which auto-deploys the live site) and make the timestamp mean "a job ran" instead of "the data
changed". A no-change day writes nothing, advances nothing, and cannot make any downstream
stage believe there is something new.

It is ordered by the ingestion workflow **completing**, not by a clock, because a scheduled
run's real fire time drifts by hours — the cadence's own 14:10 cron has fired between 17:00 and
19:00. Ordering by timestamp is a hope; ordering by completion is a guarantee.

What it does **not** do, recorded so nobody assumes otherwise:

1. **It cannot unstick a builder on its own.** A recurring builder's title names the period its
   data covers. Rebuilding from the same month yields the same title, so the builder stays
   retired and the cycle skips — correctly. What unsticks a permit builder is the calendar
   completing a month; what unsticks the climate builder is the upstream publishing one.
2. **It cannot make a quiet upstream current.** A reading older than its own staleness bound
   still appears in the feed and is refused by G5 at validation. That is the gate having
   something to do, not a defect.
3. **It does not touch the one builder whose title carries no period.** That builder is retired
   permanently once published, because "already written" is judged on the title. Whether it
   should carry a period is an editorial call — see "Open question".

## The same class, in the test harness

Three suites went red on `main` on 2026-09-18 with no code change behind them, because
`published_questions` reads the LIVE SITE's article folder out of the checkout and the tests
borrowed it. Every real publish shrank the pool of topics the suite could select, and the fifth
one emptied it.

This matters more than a flaky suite: **CI runs the test suite before the cycle**, so a red
suite stops the machine running at all. A test that depends on production data is a scheduled
outage with an unknown date.

It happened a third time in the same session, from the other direction: one suite pinned
`TODAY` to a hard-coded date that happened to be the moment the feed was generated, and stayed
correct only because nothing refreshed the feed. The first real refresh brought in readings
newer than that date, which the suite then called "in the future". Its clock now comes from the
feed. **A test pinned to a moment in production history is a test with an expiry date nobody
wrote down.**

Fixed by having each suite state its own premise — `engine.run` now accepts the caller's config
(it used to re-read from disk and ignore the one the driver already held, so an override never
reached it), and every suite passes a config whose ledger and article folder are empty temp
dirs. The one test that genuinely needs a published article now writes one.

## Open question for the owner

Row 5. With the streak now counted from the ledger, `channels.facebook.clean_streak` has no
reader. Its comment says only the owner advances it and that it gates autonomy graduation. Keep
it as the human graduation marker (and document that nothing reads it), or retire it? Left in
place, untouched, pending that call.

---

# Sustainable cadence — what the data can actually carry

Measured 2026-09-18, from the series themselves rather than from intent.

## The builders

| builder | recurring? | its series | new articles/month |
|---|---|---|---|
| `summer-hotter-than-normal` | **yes** | cooling degree-days — **monthly** | 1 |
| `austin-ac-rush-vs-heat` | **yes** | Austin HVAC permits + CDD — **monthly** | 1 |
| `san-antonio-improvement-boom` | **yes** | San Antonio permits — **monthly** | 1 |
| `electricity-still-rising` | no — timeless title | electricity price — monthly | 0 (one-shot, spent) |
| `austin-improvement-boom-cooling` | no — timeless title | Austin permits — monthly | 0 (one-shot, spent) |

**The honest ceiling is 3 new articles per month**, and it is *bursty*, not spread: all three
depend on monthly series, so all three become eligible within days of each other once the
previous month completes, then nothing until the next month closes.

Weekly is **not** supported by the data as it stands. A 7-day floor does not change that — what
it changes is the shape: at a 3-day floor the month's three articles go out over nine days and
then nothing for three weeks; at 7 they go out over fifteen. Same true articles, better spread.

## What is already weekly but unused

| series | cadence | history | currency |
|---|---|---|---|
| `drought_stage` | **weekly** | 57 points, both metros | current |
| `air_quality_index` | weekly | 4 points, both metros | quiet, past its bound |

`drought_stage` is the one genuinely weekly series with enough history to carry a recurring
builder, and **no builder reads it**. That, not the floor, is the gap between 3/month and
weekly.

## What a true weekly cadence would need

Roughly 4–5 articles a month, so ~2 more recurring builders on non-monthly data:

1. **A drought builder** — weekly, already ingested, deepest history of any weekly series.
   The single highest-value addition, and the only one needing no new data source.
2. **Give the two one-shot builders a period.** Both retire permanently because their titles
   name no month. Adding one converts each into a monthly subscription: +2/month for an
   editorial change, no new data. This is the cheapest yield in the list.
3. **A second weekly source** — the air-quality series, once its upstream is current again, or
   a new weekly ingestion.

Items 1 and 2 together would take the ceiling from 3/month to about 6 and make a 7-day floor
the binding constraint rather than the data. Neither is built; both are the owner's call.

## The property none of this may break

The floor is a **minimum gap**, never a quota. `article_days_min` is the only cadence key any
code reads, and `due()` uses it to *withhold*, never to trigger. Nothing anywhere says "it has
been N days, publish something." A week with nothing genuinely new is a correct, silent skip,
and `test_NO_MAXIMUM_is_wired_to_anything_that_publishes` fails if a maximum is ever wired to
publishing — because a maximum that publishes is a quota, and a quota publishes filler.
