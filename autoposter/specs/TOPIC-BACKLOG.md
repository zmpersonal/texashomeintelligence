# What feeds the machine — the claim-builder backlog

**The gap, exactly:** the autoposter can write **zero** more articles once PR #47 merges.

| Topic | Buildable from data | Has a claim-builder | State |
|---|---|---|---|
| `electricity-still-rising` | yes | yes | published (post #1) |
| `austin-improvement-boom-cooling` | yes | yes | pending PR #47 (post #2) |
| `summer-hotter-than-normal` | yes | **no** | blocked |

Every other topic in `article_topics.yaml` scores `data_strength: 0.00` — its metrics are not in
the feed. So the first auto cycle after #47 merges hits the no-builder halt and skips, and every
cycle after that skips identically until a builder exists. **The scheduler is a clock; the
builders are the fuel.** Turning the clock on without fuel produces a Slack notice every three
days and nothing else.

A topic with no builder stays a skip. It is never a runner-up fallback — publishing second place
because first place was unwritten is how a machine drifts off its own ranking.

---

## What one builder costs

A builder is a pair in `run_article.TOPIC_ARTICLES`: a `build_*_claims()` that reads the series
and does the arithmetic (code — every figure, every derivation, every source and date), and a
`write_*()` that is the one model call and may only quote those figures. Article 2's pair is
~90 lines of claims and ~60 of prose. The gates, the card, the promo and the publish path are
already general: nothing below needs new machinery, only new builders.

---

## The next eight, each checked against the real series

Ranked by how much a Texas homeowner would care, filtered to what the data can actually answer.
Figures below are from `social-feed.json` as of 2026-09-11 and are what the article would argue.

### 1. `summer-hotter-than-normal` — already in the topic file, just needs a builder
**"Was this Texas summer actually hotter than normal?"** Answer: **August yes, July no.**
Austin August ran **755 CDD against a 664.8 normal (+13.6%)**; July was **644 against 644.8
(−0.1%)**, dead on. San Antonio August **700 vs 667.9 (+4.8%)**. A summer that felt relentless
was two different months, and the electricity article already leans on the July figure — this
one completes it. **Cheapest to build: the normals loader and the CDD series are already wired.**

### 2. `austin-ac-rush-vs-the-heat` — NEW topic
**"Does Austin's AC rush actually follow the heat?"** Answer: **not in August.** Cooling demand
climbed every month — 324 → 560 → 644 → **755** CDD from May to August — while HVAC permits rose
with it and then **fell in the hottest month**: 950 → 1,116 → 1,226 → **1,037**. Two measured
series, side by side, no causal claim. This is the strongest myth-check in the list.

### 3. `san-antonio-improvement-boom` — NEW topic
**"Is San Antonio's home-improvement boom cooling off?"** A separate article, not a comparison —
permit counts are comparable only inside one city. San Antonio's answer differs from Austin's:
solar sits at **33 permits against a 59 baseline and a 32–111 range**, near its own floor, while
Austin's is at its ceiling. Same builder shape as article 2, different city and different answer.

### 4. `texas-power-most-expensive-month` — NEW topic
**"When is Texas electricity actually most expensive?"** Answer: **not August.** The 13-month
peak was **16.99¢ in April 2026**; August is **13.88¢**. Everyone braces for the summer bill;
the record says the spring one was worse. Reuses the EIA series the first article already proved.

### 5. `austin-roofing-season` — NEW topic
**"When does Austin actually replace its roofs?"** Twelve months of counts with a clear shape:
**201 in September**, down to **114 in May**, back to **190 in June**. Directly useful to someone
timing a quote, and squarely inside what permit data supports — counts, timing, seasonality,
within one city.

### 6. `texas-drought-direction` — NEW topic
**"Is the drought getting better or worse where I live?"** **56 weekly observations**, the
longest series held. San Antonio has gone from **stage 4 a year ago to stage 1 now**; Austin from
**1 to 2**. Two metros moving in opposite directions. Not permit data, so the two may be compared
directly. This is also the series that unblocks the parked reels idea after 2026-09-22.

### 7. `san-antonio-tree-permits` — NEW topic
**"Are San Antonians taking down more trees?"** **451 permits, the highest in the twelve months
held, against a 222 baseline and a 116–451 range.** A genuine local signal nobody else is
reporting. Needs care in framing: it is a filing count, not a tree count, and the article has to
say so.

### 8. `austin-busiest-trade` — NEW topic
**"Which Austin trade is busiest right now?"** Ranks Austin's seven trades by how far each sits
from its own baseline — explicitly the "trade mix within a single city" the repo's own rules
permit. It is also the ranking format the reels stream was parked waiting for, at trade grain
rather than place grain.

---

## Two things the owner has to do, not the machine

1. **`article_topics.yaml` is owner-tunable and the model never touches it.** Seven of the eight
   above need a topic entry — id, question, `requires_metrics`, `public_interest`. Those are
   editorial priors, so they are yours. The questions above are proposals; the wording is what
   becomes the H1 and the card's question, so it is worth a read.
2. **Order.** Recommended: 1 and 2 first — one is nearly free, the other is the best story in the
   list — then 3 and 4. That is four articles, roughly two weeks of cadence at the 3-day floor,
   which is enough runway to see whether full auto behaves before committing more.

---

# 🔴 OWNER ACTION — two topic entries the builders cannot work without

`article_topics.yaml` is owner-tunable and the model never touches it (the file says so in its
own header). Two builders are now written, tested and proven, and **neither can ever be
selected** until their topic exists in that file: `topic_scorer` ranks only what is listed
there, so an unlisted topic has no score and is never offered to the engine.

Paste these two entries into `article_topics.yaml` under `topics:`. The `question` field is the
topic's NAME, not the article's headline — recurring builders emit a period-specific title of
their own ("Did Austin's AC rush follow the heat in August 2026?"), so the wording here only
has to identify the topic to you.

```yaml
  - id: austin-ac-rush-vs-heat
    question: "Does Austin's AC rush follow the heat?"
    requires_metrics: [permit_activity_hvac, cooling_degree_days]
    public_interest: 0.65
    money: false
    brand_safety_risk: 0.0
    # Two measured series over the same months, and no causal claim between them. Permit
    # counts stay an activity instrument: within one city, never a price.
    single_city_only: true

  - id: san-antonio-improvement-boom
    question: "Is San Antonio's home-improvement boom cooling off?"
    requires_metrics: [permit_activity_roofing, permit_activity_hvac, permit_activity_solar]
    public_interest: 0.55
    money: false
    brand_safety_risk: 0.0
    # The Austin question asked of the other metro, as a SEPARATE article. Permit counts are
    # comparable only inside one city's own filing system, so the piece never mentions Austin.
    single_city_only: true
```

`public_interest` values are yours to set — 0.65 and 0.55 are placed beside the existing
`austin-improvement-boom-cooling` (0.55) and `summer-hotter-than-normal` (0.50), and they
decide which of the three the engine reaches for first on any given cycle.
