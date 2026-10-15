# Round 52 — recording that a source changed its behaviour

**Built: the record, both readers, and the evidence requirement. Not built: the honouring
policy** — §3 brings that as a decision with its consequences measured, because labelling a
baseline across the storage break would publish **+560%**.

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

**Known blind spot, stated:** both scans can only see what the committed datasets retain. The
storage break was found in raw permit descriptions, which `permit-trade-activity` does not store.
A source behaviour change in any aggregate whose raw material we discard is **not detectable from
what we hold** — it needs a probe against the source, as Round 51 ran.

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
| **C · Compute each side separately**, and withhold a side too short to publish | post-break baseline only | **2 usable months — too short, withheld.** Self-heals: usable in ~6 more months | no effect |

### Recommendation, and where it disagrees with the owner's expectation

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

**What C costs, stated plainly:** storage leaves the autoposter's ranking until roughly April 2027.
It is currently rank 2–3, so this is a real cost in available stories — and it is the correct cost,
because the alternative is ranking a story on a baseline that means nothing.

**Not implemented pending the decision.** Both readers now report what they span; neither changes
what it publishes. The policy is one switch point in each.

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

---

## 5 · Verification

| check | result |
|---|---|
| `discontinuityunit.ts` | **30/30** — evidence resolves, span exact at every boundary, scoped to what it affects, not a version, twin identical |
| `evidence: []` | **compile error**, proven by editing it |
| `test_discontinuities.py` | **6/6** — record read, evidence paths exist, span boundaries mirrored, absent file reads empty |
| the live series | exactly **1 of 18** spans the break: Austin storage, not solar |
| autoposter suite | 405/405 |
| `npm run check` | 0 errors, 0 warnings, 0 hints |
| registered in the sweep | `discontinuityunit` added to `run-sweep.mjs` |
