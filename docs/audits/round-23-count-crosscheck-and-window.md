# Round 23 — SWDI's own count as a cross-check; the window limit tested

**Units stay open.** The owner read SWDI's REST usage documentation and it does not define the
columns — MAXSIZE is not mentioned. `maxSizeUnit` stays `null`. **Roof Scan ships with counts,
not sizes.**

---

## 1. The window limit — tested, but only the runner can answer

**I could not test it from here.** `www.ncdc.noaa.gov` and `www.ncei.noaa.gov` are refused at
CONNECT from this environment, exactly as in Round 22. So this round **adds the test** rather
than reporting its result, and the result is observable only on a dispatch after merge.

The evidence genuinely conflicts, and both halves are worth stating precisely:

| | Claim | Status |
|---|---|---|
| Round 21's response body | "maximum date range currently allowed is **744 hours**" (31 days) | **measured** |
| SWDI REST usage page | "The current limit of the date range size is **one year**" | **documented** |

Both cannot describe the same request — so a variable differs, and **one was never isolated**:
Round 21's failing request carried **`limit=5`**; Round 21b's working request did not.

The new probe step tries **31 / 90 / 180 / 365 days, each with and without `limit`**, prints
**every error body in full**, and summarises which windows were accepted. Its dry run against
fixtures where `limit` is the deciding variable produces exactly the reading that matters:

```
   31d no limit       accepted (31 rows)
   31d with limit=5   accepted (31 rows)
   90d no limit       accepted (90 rows)
   90d with limit=5   rejected (HTTP 500)
  365d no limit       accepted (120 rows)
  365d with limit=5   rejected (HTTP 500)

  LONGEST ACCEPTED WINDOW: 365 days.
  THAT CHANGES THE BACKFILL DECISION. … If one request covers a year, a
  backfill is ONE request and that reasoning no longer holds …
  NOTE: `limit` CHANGED THE OUTCOME.
```

**What it changes if longer windows work.** Round 22 declined a backfill because twelve 31-day
requests meant one-shot loop logic running its guard every day forever to do nothing. **If one
request covers a year, that reasoning collapses** — a backfill becomes a single request, and the
right move is to raise `MAX_WINDOW_DAYS` and let `computeFetchWindow`'s own backfill window
through unclamped. If 31 days is genuinely the ceiling for this query shape, the clamp stands and
the documentation's "one year" simply does not describe nx3hail with a bbox.

**`MAX_WINDOW_DAYS` stays 31 this round**, and its doc comment now records both claims, names
`limit` as the unisolated variable, and says: **raise this against the probe log, never against
the documentation alone — the documentation is what the 744-hour error already contradicted.**

---

## 2. The count cross-check

After each per-record fetch the fetcher issues **the identical query plus `&stat=count`** and
compares. It does **not** replace the per-record fetch and the replay asserts it never could: a
count has no coordinates, no timestamps and no MAXSIZE, and a future per-address reading needs
all three. It is cheaper, not more accurate.

**Compared against the parsed row count, not the emitted observations.** This fetcher
deliberately drops positionless rows and de-duplicates on key, so `emitted < parsed` is expected
and correct. Only *parsed vs SWDI* isolates the parser — which is the thing being checked. The
replay pins this: a dropped positionless row still reports `agrees`.

Reported on **every** run, agreeing or not — a check that only speaks when it fails is
indistinguishable from a check that is not running:

```
swdi-nx3hail/austin: count cross-check agrees — SWDI stat=count reported 24,
  parser kept 24 data row(s) (1 non-data row(s) rejected).
```

### The mismatch decision: warn and record now, fail later

**Recommendation and implementation: record the discrepancy on every row and warn loudly in the
ingest log. Do not fail — yet.**

- **Failing is the right end state and the wrong first move.** `stat=count`'s exact semantics
  have not been observed from here. If it counts before the bbox filter, or includes the trailer,
  a *correct* parser would mismatch on every run and a throw would keep the feed permanently dark
  over a difference in definition. Shipping a hard failure on an unverified assumption is the
  mistake rounds 19–19e cost five rounds.
- **A race is not the reason to be lenient.** This product publishes days behind real time
  (newest records 9 and 14 days old in the run below), so nothing is being written into the window
  between two back-to-back requests. If the counts disagree, something is genuinely wrong.
- **So the discrepancy has to be durable, not just logged.** A log scrolls away; the trailer bug
  survived precisely because nothing recorded it. Every observation now carries
  `countCheck: "agrees" | "disagrees" | "unavailable"` and `countCheckReported`, so anyone reading
  a single stored record can see whether the fetch that produced it was verified, and against what.
- **`"unavailable"` is a third state on purpose.** A failed or unparseable count query is not a
  disagreement and must never be recorded as one.

**The promotion condition, written down so the next round need not re-derive it: once one live
run reports `agrees`, promote the warning to a throw.** Section 2 of the probe checks exactly
that on live data and says which way it went.

---

## 3. `countGroupBy` — assessed, not implemented

**The question is not whether it groups. It is whether it groups by month.**

`nx3hail`'s only time column is `ZTIME`, a **full timestamp**. Grouping by it yields one group per
radar scan, not one per month — unless SWDI accepts a date-part expression, which is the thing the
probe's section 3 shows or does not. The dry run models the pessimistic case and the output makes
it plain: `countGroupBy:ZTIME` returned one row per distinct timestamp.

**Would it be cheaper than the per-record fetch for anything the product needs? No.** The two
things Roof Scan needs are a count *near an address* and, later, per-signature positions. A
server-side group-by returns neither: it cannot filter to a radius the bbox did not already
impose, and it discards the coordinates that make a per-address reading possible. It would save
one request per run while removing the only data the product is actually for.

**Recommendation: do not adopt it.** Keep the per-record fetch as the source. Revisit only if a
purely aggregate surface is ever wanted *and* the probe shows a date-part grouping exists.

---

## 4. A pre-existing defect this round found

`npx tsc --noEmit` reports an error in `scripts/replays/hailunit.ts` **at HEAD** — I shipped it in
Round 22:

```
error TS2367: This comparison appears to be unintentional because the types
'"swdi-nx3hail"' and '"noaa-storm-events"' have no overlap.
```

**`npm run check` does not catch it: `astro check` does not typecheck `scripts/`.** Round 22 ran
`tsc` after writing the fetcher and before writing the replay, so the error was introduced after
the last typecheck and never seen again.

Fixed — and the fix needed two attempts, which is itself the interesting part. Widening to
`string` was not enough: chaining the comparisons with `&&` lets TypeScript narrow the variable to
the literal after the first one, and the second is rejected all over again. They are now evaluated
separately, with a comment saying why.

**Worth considering separately:** `npm run check` leaving `scripts/` untyped means every replay in
that directory can carry type errors indefinitely. Flagged, not fixed — it is outside this round.

---

## 5. The generated files

Ingestion run through the real `runIngestion`, with `fetch` replaying the measured response shape
and a `stat=count` that agrees.

> **Provenance, unchanged from Round 22.** The column set, the absent units column, the MAXSIZE
> domain, the `totalTimeInSeconds` trailer and the absent county field are **measured**.
> **Coordinates and timestamps are synthetic.** Not committed.

```
swdi-nx3hail/austin        live   24 observations   KGRK
  observedAt 2026-08-06T10:00:00Z .. 2026-08-27T19:21:00Z  (newest 9 days old)
  maxSizeUnit=null   areaBasis=box-around-metro-reference-point-not-a-county
  COUNT CROSS-CHECK: agrees; SWDI reported 24, stored 24 observation(s)
  rows carrying the cross-check: 24/24
  rows mentioning "totalTimeInSeconds": 0

swdi-nx3hail/san-antonio   live   17 observations   KEWX
  observedAt 2026-08-06T10:00:00Z .. 2026-08-22T14:16:00Z  (newest 14 days old)
  COUNT CROSS-CHECK: agrees; SWDI reported 17, stored 17 observation(s)
  rows carrying the cross-check: 17/17
```

---

## 6. Verification

**This round changes no build artefact at all.** Code-only, the manifest is byte-identical to
HEAD — 344 artefacts, zero differences. Only the *generated data*, which is not committed, would
move `/methodology/`.

**Home Stress Index unchanged for both metros; six service pages and `/tools/plumbing-triage/`
byte-identical** — 10 files, proven with the generated files placed and the site rebuilt.

- `npx tsc --noEmit` — **clean** (it was not, at HEAD; §4).
- `npm run check` 187 files **0/0/0** · `build` clean · `verify-content` passes.
- `scripts/replays/hailunit.ts` — **34 → 44 assertions**. New: a dropped row does not make the
  check disagree, a real disagreement is recorded and does not discard the records, a failed count
  reads `unavailable` rather than `disagrees`, an unparseable count likewise, two requests per run
  with the second being the first plus `&stat=count`, and that `stat=count` never builds an
  observation.
- Full cold-start replay suite green.

---

## 7. Open items

1. **Dispatch the Round 23 probe step.** It settles the window limit, whether `limit` is the
   deciding variable, `stat=count`'s semantics, and whether `countGroupBy` can group by month.
2. **If the probe shows longer windows work**, raise `MAX_WINDOW_DAYS` and drop the no-backfill
   decision — it rested on a ceiling that may not exist for this query shape.
3. **If the probe shows `stat=count` agrees on live data**, promote the cross-check to a throw.
4. **MAXSIZE units remain unread.** Counts publishable, sizes not.
5. `npm run check` does not typecheck `scripts/` (§4).
6. Five TEMP probe steps now sit in one workflow, deletable together.
