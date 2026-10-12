# Round 49 — what the ledger's `data` tier actually asserts, and what it could

Date: 2026-10-12 · Branch: `claude/thi-plan-review-m40n0x`, from `origin/main` at `82657d7`.
**Proposal only. Nothing here is implemented.**

Backlog 28 records the tier as meaning *"traces to the dataset file, not to the upstream
source."* Reading `verify_ledger` line by line, it does not assert that either.

---

## 1 · Grounding — the tiers, quoted, and what each one mechanically asserts

`autoposter/src/claim_ledger.py:8-17`, verbatim:

```
EVIDENCE TIERS, and what each is allowed to do:
  `data`     — traces to a figure in social-feed.json. May be STATED plainly.
  `official` — an official published source with a date, outside our feed. May be STATED,
               attributed to that source.
  `derived`  — arithmetic this code performed on `data` figures (a YoY change from two
               readings). May be STATED, and the derivation is recorded so a reader can redo it.
  `external` — research leads (Manus / Perplexity / general reading) with no underlying data.
               **May never be stated as fact.** Cut, or downgraded to explicitly-hedged
               language that attributes the uncertainty. Enforced, not advised.
```

`verify_ledger` is the only thing that reads `claim.tier`. In full, for a stateable claim it
checks: the tier string is known; `source` is non-empty; `as_of` is non-empty, parseable, not in
the future, and inside the metric's staleness bound; and for `derived`, that `derivation` is a
non-empty string.

| tier | what it asserts, literally | what a reader of a THI article assumes | the gap |
|---|---|---|---|
| `data` | a source string exists, a date exists and is in bounds | **the agency published this number** | the tier touches neither the upstream source nor our own file |
| `official` | *identical checks to `data`* | an outside authority published it, and we say which | `data` and `official` are **mechanically the same tier** under two names |
| `derived` | `derivation` is a non-empty string | the arithmetic is right, and so are its inputs | nothing re-executes the arithmetic; **correct arithmetic over a bad input passes** |
| `external` | unhedged → refuse; hedged → the text must carry an uncertainty marker | hedged, never stated as fact | **none — this tier works, and it is enforced** |

**Nothing in `claim_ledger.py` or `card.py` opens `social-feed.json` or any dataset file.** The
only occurrence of the feed's name in the module is the word in that docstring.

**`article_engine._metric(feed, area, metric)` — the one function that would tie a claim to the
feed, raising `"absent from the feed — the engine will not invent it"` — has no caller.** It is
the dead remnant of the mechanism the docstring describes. Same class as Round 46 F18.

**What makes a `data` figure trace to a file today is convention, not a check**: builders compute
from `thi_source.load_history`. Measured against the two live builders, all six current `data`
claims do trace — C1 `15.88`, C5 `644`, C8 `607` (power) and H1 `1,097`, C1 `695`, H3 `1,035`
(AC rush) each appear in the corresponding generated JSON. A builder that typed a plausible
number with a source string and a recent date would clear every gate in the stack, because G1
then checks the prose against that claim — a closed loop inside the article.

### The distinction that the rest of this round turns on

Two unlike things wear the `data` tier:

- **Transcribed** — the upstream publishes the exact number we state. EIA's 15.88 ¢/kWh; NOAA's
  695 cooling degree-days. One addressable request returns the same value.
- **Aggregated** — the upstream publishes **rows** and we compute the number. 1,097 HVAC permits.
  There is no upstream value to compare against.

Of the six live `data` claims, **four are transcribed and two are aggregated.**

---

## 2 · Measured — can a `data` claim be checked against its source?

Measured in GitHub Actions on 2026-10-12 — run `38271357755`, result committed at
`docs/audits/round-49-probe.json` — because no external host is reachable from a Claude Code
session. Seven requests, **6.9 s** total. The probe is
`site/scripts/audits/round-49-source-verifiability-probe.ts` and its workflow is
`tmp-r49-source-probe.yml`, both temporary: they go when this round is decided.

| source | kind | reachable, and by whom | addressable to the one value a claim cites? | ours | theirs | cost |
|---|---|---|---|---|---|---|
| EIA retail-sales | transcribed | 200 — **requires `EIA_API_KEY`** | **yes** · `(stateid=TX, sectorid=RES, monthly, period)` → exactly one row | 15.88 | 15.88 | 304 ms, 687 B |
| NOAA GSOM, Austin | transcribed | 200 — no key | **yes** · `(station, month, dataType)` → one value | 695 | 695 | 306 ms, 60 B |
| NOAA GSOM, San Antonio | transcribed | 200 — no key | **yes** · same | 689 | 689 | 234 ms, 60 B |
| Austin Socrata — `count(1)` | aggregated | 200 — token optional | **yes** · server-side aggregate over our own `$where` | — | 4,233 | 723 ms, 21 B |
| Austin Socrata — `count(distinct permit_number)` | aggregated | 200 — token optional | **yes** · same | — | 4,233 | 227 ms, 42 B |
| San Antonio CKAN `package_show` | aggregated | 200 — no key | a resource URL, not a value | — | resolved a CSV | 3.1 s, 9 KB |
| San Antonio permits CSV | aggregated | **200 — plain request, no headers** | **none** · a CSV cannot be asked for a count | — | — | 2.0 s, **27.9 MB** |

**Three findings.**

**Every transcribed claim matched exactly**, and checking all four costs **844 ms and under a
kilobyte**.

**Austin's aggregate is checkable at the source; San Antonio's is not.** Socrata answers
`count(distinct permit_number)` over the fetcher's own predicate, so the Round 45 defect's
signature — a count of rows wearing the word "permits" — is visible from outside in one request.
The city reports `count(1)` = 4,233 and `count(distinct permit_number)` = 4,233 for 2026-09:
**0.00% duplication, confirmed from the source**, which is what Round 45 measured from the rows.
San Antonio cannot be asked at all. Checking an SA count means downloading 27.9 MB and recounting.

**One correction to the round brief's premise.** The San Antonio CSV did **not** 403. A plain
`fetch` with no headers, from an Actions runner, returned 200 and 27.9 MB. Whatever refused
before is not refusing that path now. Recorded as measured rather than as expected.

**One thing worth logging separately.** Our per-category counts for 2026-09 sum to **4,434**
against the city's **4,233** distinct permits — 201 more. The likely cause is our own
description-based mapping classifying a permit into two trades (Round 45 measured *the city's*
`permit_type_desc` as spanning one type for every Austin permit, which is a different question).
**Unverified**, and nothing in the project states or measures it. A reader adding up our trade
table gets a number the city would not recognise.

---

## 3 · The options

### A · A tier that asserts upstream verification, `data` demoted to what it is

Before publishing, re-fetch each transcribed claim's value from its source and require a match.
`data` is renamed in its docstring to "computed by this project from a THI dataset file".

- **Catches what today's doesn't:** a fabricated row; a file that has gone stale against a
  revised source; an upstream that has changed a number since we stored it; a claim about a
  period the source does not have.
- **Costs:** `EIA_API_KEY` must be added to the `autoposter` GitHub Environment — 🔴 owner-only,
  and it widens what that environment can reach. The autoposter is Python and the fetchers are
  TypeScript, so verification shells out to a thin entry point that calls the real fetcher (node
  and the site's dependencies are already installed in the cadence job for the card renderer).
  **It puts the network on the publishing path**: a source that is down blocks a correct article,
  so the behaviour has to be chosen — refuse, or publish and say the claim is file-verified only.
  844 ms per article.
- **Still wouldn't catch:** every aggregated claim, which is both permit figures. And — this is
  the part that matters — **calling our own fetcher verifies nothing about our own fetcher.** It
  proves the file matches what the fetcher gets today. A unit error, a parse error or a wrong
  predicate is invisible, because both sides share it. Verifying with an *independent* request
  catches those too, and is a reimplementation whose own bugs produce false alarms — §6 is this
  round's demonstration, twice over.

### B · The claim carries how it was verified — file, source, or neither

Add a field to `Claim` recording the verification that actually happened, rendered in the
published ledger and explained in the methodology.

- **Catches:** on its own, **nothing**. It is a record, not a gate. It becomes a gate only with a
  rule attached ("a claim verified against neither may not be stated"), at which point it is
  Option A wearing a field instead of a tier.
- **Costs:** very small. No secret, no network, no new failure mode.
- **Still wouldn't catch:** anything, unless the field is *earned* rather than declared. A field a
  builder sets by hand is `autonomy: review` again (Round 46 F18).

### C · Say plainly what `data` means, change nothing mechanical

Rewrite the docstring and the methodology to state that `data` means "computed by this project
from a dataset file this project ingested", and that provenance to the agency is not verified at
publish time.

- **Catches:** nothing. **Ends** a stated-guarantee failure, which is a real and separate good:
  the thing that misled in Round 43 was the gap between the words and the mechanism.
- **Costs:** an hour. No risk.
- **Still wouldn't catch:** the seed row, or anything else.

---

## 4 · The test: would it have caught the September electricity figure?

The claim: *"Texas residential electricity averaged 13.88 cents per kilowatt-hour in August
2026"*, tier `data`, source EIA, `as_of` 2026-08-01. The seed row was in
`eia-electricity/texas.json`, keyed `2026-08`, with a plausible value and a correct-looking date.

**Option A stops it, and for the right reason.** The verification is a single addressable
request: `facets[stateid][]=TX & facets[sectorid][]=RES & frequency=monthly & start=end=2026-08`.
EIA runs about three months behind, so in September 2026 that request returns **zero rows** — not
a different number, *no such period*. The claim cannot be verified and is refused. That is
exactly the shape a fabricated future month has, and the probe shows the request costs 304 ms.

The three `derived` claims that inherited it (13.88/15.46, 13.88/16.99, 13.58/16.44 — all
arithmetically perfect) fall with it, because their inputs no longer verify.

**Option B stops it only if the field is earned**, i.e. only if it is Option A.
**Option C does not stop it.** It would have made the article's own methodology say that the
figure was never checked against the EIA, which is not nothing, and is not a catch.

Worth stating: the specific Round 43 route is **already closed in practice** — `seedunit` stops a
fabricated row reaching a dataset file, and `datasetintegrityunit` asserts no seed row survives in
a live or stale file. What Option A adds is coverage of everything *else* that can be wrong in a
file: a stale capture, an upstream revision, a period that never existed.

## 5 · The second test: the permit counts — and a tier is the wrong instrument

The claim: San Antonio plumbing permits, tier `data`, source City of San Antonio, real date. The
figure came from the city's own feed. The rows were real. **The provenance was perfect and the
number was wrong**, because `permitTradeActivity.ts` incremented once per row and San Antonio
lists a permit on several rows when it spans more than one type or stage.

**No provenance tier catches this, and none should be stretched to.** Every tier asks *where did
this come from*; the defect was *what did we do with it*. A tier that passed would have been
right to pass.

What catches it is a **property assertion on our own aggregation** — count distinct identifiers,
not rows — which is what Round 45 built and what `permitcountunit` now guards.

One genuine addition the measurement supports: for **Austin**, the city will answer `count(1)`
and `count(distinct permit_number)` over our own predicate, so a cross-check against the source
*can* detect the rows-vs-permits class without reimplementing anything — 950 ms for the pair.
**San Antonio cannot be asked**, so the same class is only ever catchable on our side there. That
asymmetry is itself worth publishing in the methodology rather than smoothing over.

---

## 6 · Recommendation

**A, narrowed to transcribed claims, with B's field as its record and C's wording regardless.**

1. **C first, unconditionally.** The docstring and `/methodology/` say what `data` means today.
   This is the F18 lesson: the dangerous half is the gap between the words and the mechanism, and
   it costs nothing to close.
2. **A for the four transcribed claims**, by calling the repo's own fetcher — not an independent
   request. That choice is deliberate and limited: it catches a fabricated, stale or drifted
   file, and it does **not** catch a bug in the fetcher. Say so in the methodology rather than
   letting "verified against the source" imply more than it does.
3. **B's field records which of the three happened**, set by the engine, never by a builder.
4. **Aggregated claims are not given a provenance tier they cannot earn.** They keep a property
   assertion on our side, and Austin additionally gets the server-side `count(distinct)`
   cross-check because the city will answer it.
5. **Not recommended:** an independent reimplementation of each source request. §7 is two
   demonstrations in one afternoon of what that costs.

**The open decision for the owner, stated plainly:** Option A puts the network on the publishing
path and `EIA_API_KEY` in the autoposter environment. Both are real costs, and a cycle that
refuses to publish a correct article because the EIA is down is a failure mode this project does
not have today.

---

## 7 · Two mistakes of mine, in the probe that measured all of this

**The probe reported our cooling degree-days as wrong.** Pass 1 (run `38271127410`, the
committed result at `70b860c`) read 386.3 against our 695 —
a 1.8× ratio that looks exactly like a published figure being wrong. It is a **unit**: the probe
omitted `units=standard`, so NCEI answered in °C-days. 386.3 × 1.8 = 695.34 → **695**; San
Antonio 382.6 × 1.8 = 688.68 → **689**. Both of our figures are right to the digit, and
`noaaClimate.ts:527` has always set that parameter.

I rebuilt that request by hand **in the same file where I imported `austinTradeWhere`
specifically so I would not** — and then wrote a comment explaining why importing it mattered.
That is Round 44's lesson landing inside the round that quotes it, and it is the strongest
argument in this document against §3A's independent-request variant: an independent
reimplementation produced a false alarm about a correct figure within minutes.

**The probe compared the wrong month.** `rows` holds one record per (category, month), so taking
`.at(-2)` of the un-deduped month list returned 2026-10 — the incomplete current month the series
deliberately drops. The comparison was against a month we do not publish.

Both were caught by the numbers being implausible, which is the same defence that caught the
178-mile distance in Round 47 and is not a defence. A control with a known answer would have
caught both immediately: the GSOM probe should have been run first against a month already on
disk and required to agree.
