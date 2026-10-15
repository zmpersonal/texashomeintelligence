# Round 52 — recording that a source changed its behaviour

**Built: the record, both readers, the evidence requirement, and — after the owner's decision —
the honouring policy itself.** §3 keeps the three options as they were measured, because the
reason the chosen one was chosen is the measurement: labelling a baseline across the storage
break would have published **+560%**.

The policy, in one line each: **a month-over-month claim across a break is refused and says why
(A); a baseline is computed on the near side of the break and withheld entirely when that side is
too short (C).** Nothing falls back to the far side.

---

## 1 · The asymmetry the design is built on

A version and a discontinuity look alike and are not. The owner's framing, which this round
takes as its premise: *a mapping version is ours to bump on a known date; a source behaviour
change is discovered later and applies retroactively to months already stored.*

Three consequences, each of which rules out a version field:

| | our methodology change | a source behaviour change |
|---|---|---|
| when it is known | on the day we make it | later, from outside evidence |
| what it applies to | the recount it triggers | months already stored, retroactively |
| **can recomputation remove it?** | **yes** — recount the window under the new rules | **no** — the upstream records genuinely differ |

The third is the real one. Round 45 turned row counts into distinct permits and Round 50 split
solar from storage; both recomputed **every month they hold**, so neither leaves a break in a
published series. No recomputation makes ten months of *"solar + battery, 11.4 kW"* comparable to
three months of *"backup battery system and additional meter socket"*.

So a discontinuity is **a fact about a series, held beside the data**, keyed by what it affects —
the same shape as `withdrawnArticles.ts`, which is this repo's existing precedent for a
hand-maintained typed record of something true about what we publish, with a reader that honours
it.

---

## 2 · What was audited for undocumented breaks

The owner's instruction was to measure rather than assume, naming Round 45 and Round 41a as
candidates.

| | verdict | why |
|---|---|---|
| **Round 45** permit counts: rows → distinct permits | **ours, not a break** | our arithmetic over unchanged source data; `trades-v2` recomputed the whole window |
| **Round 41a** drought county scoping | **ours, not a break** | *our own* Round 4b widened the file to three counties and the page never filtered; the fix filters across the whole window |
| **Round 50** solar re-base | **ours, not a break** | `trades-v3` recomputed every month; v2 rows stop being published |
| **Austin `energy_storage`, from 2026-07** | **a source break** | recorded, with evidence — see §4 |

Then two scans over every committed dataset:

**Identity scan** — fields whose change mid-series means the series stopped measuring the same
thing (`sourceRef`, `stationName`, `units`, `baseF`, `radarStationId`, `sourceProduct`,
`areaBasis`, `maxSizeUnit`, `county`, `countyFips`, `strategy`): **nothing found.** Every NOAA
station, unit and base is stable across its whole series; the hail dataset's radar-station
variation is per-event coverage, not a series change; the drought files hold their three counties
throughout.

**Composition scan** over `sourceValues`, the retroactive form of item 36: **nothing flagged** —
and *that result is itself a finding*. Under `trades-v2` Austin solar's composition moved
51/49 → 69/31 → 87/13 → 91/9 across the break, which a composition check would have caught. Under
`trades-v3` every category has a **single** source value at 100% in every month, because Round 50's
split gave each one a clean mechanism. **Fixing the mapping removed the detector's input.**

That is not an argument against the split, which is correct. It is the argument that **item 36 does
not subsume item 41**: a detector that works on mixed mechanisms goes blind exactly when the
mapping is tidied, and a recorded fact with evidence does not.

Both scans have the same ceiling, and it is not a caveat on this section — it is the round's
conclusion. See §6.

---

## 3 · THE DECISION: what "honouring" means

A break at month M separates months before M from M onward. Today exactly **one** of the 18 series
the autoposter holds spans the recorded break — `austin_metro / permit_activity_energy_storage` —
and **solar does not**, which Round 51 measured directly (post-break mean −0.3 sd from pre-break;
storage is **+8.7 sd**).

What crosses what, today:

| computation | storage | solar |
|---|---|---|
| month over month (Sep vs Aug) | both months post-break — **crosses nothing** | crosses nothing |
| the 13-month window: mean, peak, trough, half-over-half | **crosses the break** | n/a — no break |

### The three options, measured

| | what it does | storage today | solar today |
|---|---|---|---|
| **A · Refuse** to compute across a break | the figure is withheld and the reason given | the window mean, peak, trough and half-over-half are all withheld; `movers`' own signals read the whole series, so storage drops out of ranking entirely | no effect |
| **B · Compute and label** | the number publishes with a caveat attached | publishes **"+560% vs its average"** | no effect |
| **C · Compute each side separately**, and withhold a side too short to publish | post-break baseline only | **3 complete post-break months (Jul–Sep) — under the 6-month minimum, so withheld.** Self-heals: publishes again once December 2026 is complete, i.e. from January 2027 | no effect |

### Recommendation, where it disagreed with the owner's expectation, and the decision

The owner expected *refuse-and-say-why for a month-over-month claim and label for a longer
baseline*. The first half is right and today costs nothing: both storage months are post-break, so
the rule only bites when two months straddle the break, and then refusing is clearly correct.

**On the baseline I think labelling is wrong, and the number is the reason.** Storage's 13-month
mean is **28.5** against a post-break level of **188**. Option B publishes *"+560% above its own
average"* — which is the exact shape of the sentence Round 50 withdrew (*"159% above its 11-month
average"*), six times larger, with a footnote. A label does not make that number true; it makes it
cited. And the autoposter's architecture makes it worse: every numeral a post may carry comes from
the feed's `figure` string, so a labelled baseline would travel into copy as a number with its
caveat in a different field.

**So: refuse across a break for a month-over-month claim (A), and compute per side with a minimum
history for a baseline (C).** C differs from A in the way that matters — it is self-healing. A
refuses forever; C starts publishing a true post-break baseline once the post-break side is long
enough, which is the behaviour a series that genuinely restarted deserves.

**What C costs, stated plainly:** storage leaves the autoposter's ranking until **January 2027**.
Three complete post-break months exist (July, August, September); the minimum is six, so the
series returns once December 2026 is complete. It is currently rank 2–3, so this is a real cost in
available stories — and it is the correct cost, because the alternative is ranking a story on a
baseline that means nothing.

*(An earlier draft of this section said both "~6 more months" and "roughly April 2027". Both were
wrong and they were wrong differently: the post-break side already holds three months, not two,
and six months from a three-month base is December, not April. The date above is the one the
arithmetic gives.)*

**THE OWNER'S DECISION: A for month-over-month, C for baselines** — *"your argument on the label
is better than mine — flip both switches."* Implemented this round; §4 is what that turned into.

**The minimum is six months, and what it is compensating for:** a half-over-half comparison needs
three months on each side to be a comparison rather than two points against two points. The
Poisson noise floor already in `tradeSegments.ts` tests the SIZE of a change; it cannot test
whether the window had enough months to mean anything, which is a different question and the one
this number answers. It governs a window that was **cut** — a short unbroken window is governed by
whatever already governed it, because raising that for every series would be this round widening
its own scope.

---

## 4 · What landed

**`site/src/data/discontinuities.ts`** — the record. Keyed by `datasetId` / `location` / `series`
(each accepting `*`) and `fromMonth`, carrying what changed *in the source's terms*, `cause`,
`discoveredAt` (deliberately distinct from when it happened), and evidence.

**Evidence is structurally required, as instructed.** `evidence` is typed
`readonly [DiscontinuityEvidence, ...DiscontinuityEvidence[]]`, so `evidence: []` is a **compile
error** — proven: *"Source has 0 element(s) but target requires 1."* The replay then requires every
entry to carry a URL or a repo path, every path to exist, and **at least one entry to be a repo
path rather than only a link** — because a live document can change under us, which is exactly what
happened to the document this break records.

**Both readers, built with the record rather than after it.** `tradeActivity()` returns
`spansDiscontinuity`, `discontinuities` and `crossedBy: { window, monthOverMonth }`;
`thi_source.Series` carries `discontinuities`, populated per series. A recorded fact nothing
consults is this family's recurring defect — Round 46 a config key with no consumer, Round 49 a
consumer with no config, Round 50 a stored field with no reader — and the round closing the third
face must not add a fourth.

**A JSON twin, because parsing TypeScript from Python is a second definition.** The TS module is
authoritative and holds the compile-time guarantee; `discontinuities.json` is emitted from it and
the replay asserts the two are **byte-identical**, so a stale twin fails the build rather than
giving the two readers different answers. This repo already reads `withdrawnArticles.ts` from
Python by regex, and getting that regex right for a second entry took two attempts.

**The cross-metro copy rule is in the voice guide**, not only the backlog — `specs/VOICE-GUIDE.md`,
with the ✗/✓ pair and the general form, next to the slot discipline the caption call already obeys.

### The policy, as code

**The site: the window is cut, and the cut is the arithmetic.** `segmentsOf()` slices the months at
every break the window spans and `compare()` computes each side alone — so there is no path through
the module that produces a mean, a half-over-half change, an amplitude or a composition from rows
on both sides of a break. **Not a path that produces one and labels it.** A label is advice; a
slice is arithmetic, and the difference is what an answer engine quoting one figure gets.

`TradeActivity.comparison` is the near side's figures or **undefined**, with `withheld` saying why.
That shape is the point: the withheld case carries **no number at all**, so a consumer cannot
publish a figure it was not given. `BelowHero` now *requires* a comparison in its props type, and
`ServicePage` and `/tools/roof-scan/` refuse to build a page whose figures are withheld rather than
dropping a section or falling back to pre-break months — what such a page should say instead is
copy, which is the owner's.

**Why a new module.** The pure half moved to `src/lib/tradeSegments.ts`. `tradeActivity()` reaches
the generated datasets through `import.meta.glob`, which exists only under Vite, so the layer that
decides whether a figure may be published at all could otherwise be tested only by building the
site and reading the HTML back. Round 41a lifted `specObservations` out of its barrel for the same
reason; that layer decided which **rows** a page spoke for, this one decides which **months** a
number speaks for. Everything is re-exported; no caller changed.

**The autoposter: every place a comparison is made, plus a coverage guard.**

| where | what changed |
|---|---|
| `Series.current_segment` / `.withheld` / `.mom_breaks` | the near side, why it publishes nothing, and whether the last two periods straddle a break — mirroring the site's span rule |
| `_figure` | policy A: the month-over-month tail is replaced by *"month over month withheld — the source changed how it files this work from 2026-07"*, with **no percentage** |
| `_area_metric` | the current reading still publishes (a count of what a city issued is a fact); `vs_baseline` is the near side only and absent when it is too short; `mom`/`crossed` absent when the two periods straddle. Every absent field names itself in a new `withheld` array — asserted, not remembered |
| `build_rows` | policy C in ranking: a withheld series is **not ranked at all**. `self_deviation` measures the newest period against its own history, and across the break that history is a different instrument — which is how 4 permits in May against 188 in September would have become the week's top story on the strength of the defect |
| `_permit_facts`, `_sa_facts` | **halt**, rather than quietly writing the piece about the trades that are left: both builders choose their verdicts by sorting the trades, so a silently shorter sort changes what the article asserts without anyone deciding to (Rule 1 — the decision goes to a person) |
| `_assert_every_break_is_read` | `_breaks_spanned` is wired into the permit loader and no other, so a break recorded for drought tomorrow would be read by nobody and every drought figure would be computed across it in silence. A record for a dataset no loader honours now **halts the run** |

**Policy A is unreachable today, is tested anyway, and says so.** The last two periods straddle a
break only when the newest period is the first one at or after it — which leaves one period on the
near side, which policy C withholds first. So under a six-month minimum nothing live reaches A's
branch. It stays because otherwise the thing stopping a straddling month-over-month claim would be
a tuned number rather than a rule: lower the minimum and A is what refuses. The straddling series
is built by hand in the test and the refusal string is read back.

---

## 5 · Verification

| check | result |
|---|---|
| `discontinuityunit.ts` | **45/45** — evidence resolves, span exact at every boundary, scoped to what it affects, not a version, twin identical, **and §6: the window is cut at the break, at the minimum in both directions, with the slicing shown to be what withholds the figure** |
| `evidence: []` | **compile error**, proven by editing it |
| `test_discontinuities.py` | **14/14** — the reader, plus both switches: the segment and the minimum at the boundary, the refused `mom` figure with no percentage in it, the feed publishing the reading and withholding the comparison, a withheld series dropped from ranking, both article builders halting, and the coverage guard |
| the two readers' minimum | **one number** — the Python test reads `MIN_SEGMENT_MONTHS` out of `tradeSegments.ts` and asserts they agree, so the policy cannot drift between them |
| non-vacuity | the same months with the record removed publish a whole-window figure (9 months vs 6/0) — the slicing is the policy, not the shape of these numbers |
| the live series | exactly **1 of 18** spans the break: Austin storage, not solar. It now publishes its September count and `mom` (both months post-break) and withholds `vs_baseline`; it is gone from the ranking |
| autoposter suite | **413/413** |
| `npm run check` | 0 errors, 0 warnings, 0 hints |
| `npm run build` | completes. No live page's series spans a break, so no published figure moves: `saservicerender` **315/315** and `roofscanrender` **105/105** recompute the permit figures from the archive and read them out of the served HTML, and both are unchanged |
| `npm run sweep` | **34/34 steps** |
| registered in the sweep | `discontinuityunit` added to `run-sweep.mjs` |

### One pre-existing sweep failure, fixed — and it was mine

`permitcountunit` was **red on `main`** before this round, on a check I wrote and then broke:

```
FAIL  Austin asks Socrata for permit_number — the identifier is not even on the wire
```

The request was fine. The assertion was `/\$select:\s*"permit_number,/` against the fetcher's
**source text**, and Round 51 made `$select` an array so a probe could add a column — so the
regex stopped matching while the wire never changed. A test of the source's prose rather than its
behaviour, which is a class already logged in this project, and it had been training the sweep to
read red as normal.

It now builds the request with the fetcher's own `fetchAustinTradeRows` and reads `$select` off
the URL handed to `fetch`, which is stubbed so nothing leaves the machine (Round 49's rule: a
verifier calls the project's own request builder, per request). **Proven non-vacuous** — remove
`permit_number` from the select list and it fails, naming the list it actually saw:

```
FAIL  Austin asks Socrata for permit_number — $select=permit_type_desc,work_class,description,issue_date
```

---

## 6 · What this round could not have found

The detector half of this round is two scans over everything we hold, and both have the same
ceiling. It belongs here rather than in a caveat beside them, because it is the most important
thing the round learned.

> **Both scans see only what the datasets retain — and the storage break lived in raw descriptions
> we don't store.**

`permit-trade-activity` stores monthly aggregates. The break is a change in how Austin *words and
splits* a filing: ten months of *"solar + battery, 11.4 kW"* became three months of *"backup
battery system and additional meter socket"* filed as a separate Auxiliary Power EP. Nothing in the
aggregate moved except the count, and a count going up is what a real surge looks like.

So the honest account of how this was found: **the owner asked a question that happened to need
descriptions.** Round 51 went to the raw permits to ask what the storage months actually described,
and the archived manual settled it. The detector built this round would not have found it — and
neither would the composition scan, which under `trades-v3` has no mixture left to watch (the
standing rule in `docs/v3/BACKLOG.md`: *a correction can remove the signal that would have found
the next one*).

What that leaves true, stated plainly: **a source behaviour change in any aggregate whose raw
material we discard is not detectable from what we hold.** The record and its readers make such a
break *durable once known*. They do nothing to make it *noticed*. Noticing it currently requires a
probe against the source, run because someone wondered.

Whether that can be closed cheaply — a description shape hash or a vocabulary fingerprint per
month, which is not a description and does not store one — is the next round's question, and the
owner has scoped it as **measure only**: would it have caught storage in July, and would it have
false-positived on anything in the thirteen months we hold?
