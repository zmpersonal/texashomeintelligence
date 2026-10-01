# Round 46 — the stated-guarantees sweep

Date: 2026-10-01 · Branch: `claude/thi-plan-review-m40n0x`, from `origin/main` at `ed49578`
(Round 45 merged).

**What this round hunted.** Four guarantees failed in rounds 43–45, all the same shape: something
asserted a property the code did not enforce, and nothing checked. This is the inventory of the
rest of them.

**What it found first.** A claim on `/methodology/` that was false on the live site while the sweep
was running, falsified two hours after it shipped by ordinary ingestion. That is in Tier 1 below and
was fixed before the inventory continued, per §5 of the brief.

**The pattern, stated once.** Every finding here is a claim with no executing check. The three
sub-shapes, in rising order of danger:

1. **Stale prose** — the code changed, the sentence did not. Visible to anyone who reads both.
2. **Unearned adverb** — "provably", "always", "never", "exactly" attached to a property nothing
   tests. The sentence was true when written and nothing holds it there.
3. **Dormant mechanism** — a constant, flag or verdict that is written and never read, or a
   condition recorded with no consumer. These are the dangerous ones, because they are invisible
   until the day the mechanism is used, and then they fail at full scale. Round 45's
   `CATEGORY_MAPPING_VERSION` was one. **Three more are below.**

---

## Tier 1 · Published claim wrong, live

### F1 · `/methodology/` said the electricity feed carried an "Out of date" badge. It said LIVE. — FIXED

| | |
|---|---|
| **The claim** | "…and the electricity feed carries an **Out of date** badge, because that is what it is." |
| **Where** | `src/pages/methodology/index.astro:221`, in the Round 43 correction note |
| **What actually happens** | `/data/texas/electricity-prices/` renders `live-badge` — **LIVE · Data through Jul 1, 2026** |
| **Consequence** | **Published claim wrong**, on the page whose subject is the site's own honesty, contradicting another published page |

Measured timeline:

| time (UTC, 2026-10-01) | event |
|---|---|
| **14:20:09** `d878775` | the note ships. Newest EIA row 2026-05-01 → 123 days old vs the 100-day window → `out-of-date`. **True when written.** |
| **16:26:48** `b74c8d5` | scheduled ingestion adds real 2026-06 (15.94¢) and 2026-07 (15.88¢). Newest 92 days → `current`. |
| ~16:30 | `data-ingestion.yml:92` deliberately omits `[skip ci]`, so the commit deploys. Contradiction live. |

Two hours and six minutes from approved to false. Nothing connected the sentence to the badge it
described.

**Fixed this round** (`12adb97`): the sentence now states the mechanism — the badge resolves from the
age of the data, not the success of the fetch — and dates the state to the correction. Two further
figures in the same entry were anchored to "at the time of this correction" on the same principle,
and the removal count was corrected from "ten of them" to "seven removed and three relabelled".

**Which side I believed, and why:** the code. `resolveDisplayStatus`, the data page and the badge are
all correct; the prose was a snapshot of a moving value.

### F2 · The fetch window forecloses every upstream revision, and a page promises otherwise

| | |
|---|---|
| **The claim** | "The EIA revises recent months as utilities report, **so the newest one or two figures can move**." — rendered copy, `src/lib/dataPages/texasElectricity.ts:143` |
| **Where else** | `types.ts` names "a corrected NOAA storm report" as the worked example of the key-replace mechanism |
| **What actually happens** | `computeFetchWindow` sets `since` to the newest observation's `observedAt`; `eiaElectricityPrice.ts:48` passes it through as `start=2026-07`. Only the newest month is ever re-requested. |
| **Consequence** | **Published claim wrong, and published figures can silently diverge from the source** with nothing detecting it |

`mergeObservations` replaces by key, so the correction path is fully built on the writing side — and
the window means it can only ever fire for one record. Measured across every live dataset, the
`since` the next run will use:

| dataset | next `since` | revisions reachable |
|---|---|---|
| `eia-electricity/texas` | **2026-07-01** | the newest month only; the page claims two |
| `noaa-storm-events/austin` | **2026-06-15** | nothing before mid-June — the doc comment's own example |
| `noaa-storm-events/san-antonio` | 2026-06-20 | same |
| `noaa-climate/*` (3 files) | 2026-08-01 | GSOM revisions before August unreachable |

**Sequenced as Round 47** on the owner's ruling: fix the mechanism, not the sentence — the copy
describes what the site should do. The round's first question is whether anything has already
drifted, which **cannot be answered from a Claude Code session** (no external host is reachable) and
needs an Actions-shaped probe that re-requests a wider window per live dataset and diffs against
disk. If EIA has revised May or June and we are publishing the stale value, that is a live wrong
figure and it jumps the queue.

---

## Tier 2 · A published figure could go wrong with nothing failing

### F3 · `badgeunit` cannot fail. It is 1 of 18 sweep steps, and it guards the mechanism behind F1 and F2

| | |
|---|---|
| **The claim** | registered as a sweep step; reports `ok badgeunit` on every run, and has for 46 rounds |
| **Where** | `scripts/replays/badgeunit.ts` — 24 lines |
| **What actually happens** | **zero assertions, no failure path.** It prints a table of every dataset's badge and exits 0 unconditionally. The sweep line a reader sees is the last row of that table. |
| **Consequence** | **The badge mechanism has no test.** Both Tier 1 findings are badge/freshness claims. |

It also re-implements `freshnessOf` (`d.status === "sample" ? "sample" : resolveDisplayStatus(...)`)
rather than calling it, so even as a report it can drift from what pages render. The two
implementations agree today — I checked `latestObservedAt` against its `.map().sort().at(-1)` — which
is luck, not structure.

Mechanical result across all 28 replay files: **17 of 18 sweep steps have a failure path; `badgeunit`
is the only one that does not.** (`browser.mjs` also has none and is a shared helper, not a step.)

### F4 · `swdiHail`'s own promotion condition has been satisfied for 18 days and nothing consumes it

| | |
|---|---|
| **The claim** | "once ONE live run reports `agrees`, promote this to a throw. Until then the discrepancy is loud in the log and durable on every row." — `swdiHail.ts:355` |
| **What actually happens** | `countCheck: "agrees"` on **105 Austin rows since 2026-09-13** and **141 San Antonio rows since 2026-09-14**. The guard still only `console.log`s. |
| **Consequence** | A parser regression that loses or invents hail rows warns into a log nobody reads and **publishes a wrong hail count**. Hail counts render on `/tools/roof-scan/` and the storm data pages. |

This is the version-constant shape exactly: a recorded condition with no consumer. The condition is
not even wrong — it was met, on both metros, and the code cannot notice.

Partly closed this round: `datasetintegrityunit` now refuses to **commit** a `disagrees`. Ingestion
still will not fail on one, which is what the comment promises.

### F5 · `METHODOLOGY_VERSION` has no reader, and is not in the merge key — so a bump overwrites history

| | |
|---|---|
| **The claim** | CLAUDE.md: "derived indices store the underlying observations **+ methodology version that produced them**." `tradeCategories.ts:64`: "a count produced under one mapping is not comparable with a count produced under another." |
| **Where** | `runIngestion.ts:6` — `METHODOLOGY_VERSION = "v1"`, written onto all **31** dataset files |
| **What actually happens** | **Nothing reads `DatasetFile.methodologyVersion`.** The only read of any `methodologyVersion` anywhere is `db.ts:69`, binding the *brief's* version into D1 — and nothing selects on that column either. And `mergeObservations` keys on `key` alone, so the version is **not** part of the identity. |
| **Consequence** | A bump — the documented way to signal an incomparable recomputation — would **silently overwrite every existing row under the same keys**, destroying the old series rather than preserving it. That is a direct violation of "store history, never overwrite". |

This is the **inverse** of Round 45's defect and the same root. There, the version *was* in the key,
so a bump doubled every figure. Here it is *not* in the key, so a bump erases the comparison it
exists to make possible. Both halves were written; neither was ever read.

`BRIEF_METHODOLOGY_VERSION` is the same shape at lower stakes (insert-only, no selector, internal).
The stress index's `METHODOLOGY_VERSION` is the one that is genuinely consumed — it renders as an
eyebrow on `/methodology/home-stress-index/`, so a bump is at least visible.

---

## Tier 3 · Would break on a future change

### F6 · `analysis/[slug].astro:130` badges a real-but-stale series as a **sample**

`status={dataset.status === "live" ? "current" : "sample"}` bypasses `resolveDisplayStatus`
entirely — the one page that does. Two wrong outcomes: a `live` feed past its window badges
**current** (the overstatement `dataFreshness.ts` was built to end), and a `stale` or `error` feed
badges **sample**, telling a reader a measured figure is a fabricated placeholder. The second
inverts the project's hardest data rule.

**Dormant only because the single article declaring an `embed` is
`are-texas-electricity-prices-still-going-up.md`, which is `published: false` and serves 410.** The
moment any new article embeds a dataset, it is live. Worth fixing early in whatever round sequences
Tier 3.

### F7 · `observedAt` means "when the event occurred", except in three fetchers where it is the ingest time

`types.ts`: "When the underlying real-world event/reading/period occurred." Written as `now` or
`ingestedAt` by `arrCollectionSchedule.ts:152`, `femaFlood.ts:72`, `usdaSoil.ts:89`.

The compensating knowledge exists — `dataFreshness.ts` says of two of them "`observedAt` is our
ingest date rather than a city timestamp" and sizes their windows accordingly — but it lives in a
different file from the type that makes the claim, and `femaFlood` is not mentioned there at all
(dormant: it is a sample stub). Consequence: a future fetcher author or a reader computing event age
from `observedAt` is wrong for three datasets, and the authoritative doc comment tells them they are
right.

### F8 · "`FeedStatus` matches `DataStatus.astro`'s contract exactly on purpose" — it has not since the freshness round

`types.ts` header. `DataStatus.astro` takes `DisplayStatus` (5 states, resolved at render from data
age); `FeedStatus` is 4 states recording the fetch outcome. The same comment adds "whatever a dataset
file says here is what a data card is able to render without any page-level 'is this real?'
branching", which is the exact overstatement the freshness round removed. **Code right, prose stale**
— and F6 is a page that still does what this comment describes.

### F9 · "`requiredEnvVars` is provably what each fetcher actually uses" — four fetchers use an undeclared var

`types.ts` on `FetchContext.env`. Measured:

| fetcher | declares | reads |
|---|---|---|
| `austinPermits.ts` | `[]` | `env.SOCRATA_APP_TOKEN` |
| `permitTradeActivity.ts` | `[]` | `env.SOCRATA_APP_TOKEN` |
| `blsWages.ts` | `[]` | `env.BLS_API_KEY` |
| `censusAcs.ts` | `[]` | `env.CENSUS_API_KEY` |

**The code is right and the prose is wrong, and I believe the code.** All four tokens are optional —
each fetcher's own header says so, and they only raise an anonymous rate limit. `runIngestion` uses
`requiredEnvVars` to *fail the run* on a missing var, so declaring an optional token there would
break ingestion whenever it is unset. The field is provably what each fetcher **requires**; "uses" is
the false word, and nothing tests either reading. The half that *is* enforced by construction — no
fetcher reads `process.env` directly — I verified holds in all 19 fetchers.

Consequence: a future round auditing secret usage from `requiredEnvVars` concludes the Socrata, BLS
and Census tokens are unused and could be revoked. Secrets are 🔴 human-owned, which makes this the
most expensive wrong conclusion in Tier 3.

### F10 · `valuationUsd` is written on every Austin permit row and read by nothing

`municipal-permits` carries `valuationUsd` on all 2,089 observations; grep finds **zero** consumers
outside the fetcher. It is also the single quantity this project forbids publishing from permit data
(Round 6, and CLAUDE.md's permit rule). Not wrong today — it reaches no page — but it is a loaded
field sitting in a public repo with a plausible-looking name, and the next round that wants a cost
figure will find it first.

### F11 · `emitShards` returns a hardcoded `unusableCount: 0`

`emitShards.ts:84`. A field named for a measurement that function never takes. It survives only
because its sole caller overrides it (`arrCollectionSchedule.ts:157` substitutes the real count,
currently a genuine 0 of 178,060 rows). A second caller would publish a fabricated zero as a
measurement. This is `permitCount` in miniature, caught before it had a chance.

### F12 · CLAUDE.md and ROADMAP forbid linking Services; the footer deliberately links seven service pages

| | |
|---|---|
| **The claim** | `CLAUDE.md:85` "**Services** anywhere (removed permanently from nav; do not re-add)" · `ROADMAP.md:84` "permanently removed from nav — **do not re-add or link**" |
| **What actually happens** | `Footer.astro:115` renders a `Services` column of seven `/austin/<service>/` links |

**The prose should change, not the code.** The footer's own comment records the reasoning from
**Round 10b** (not Round 33 — Round 33 split out the adjacent published-surfaces column): the
`/services/` *hub* link was removed as the last piece of chrome re-adding it, and the individual
location × service links stay because they are the indexed content pages and dropping them would cut
a third of the site's internal linking, which is KPI #1. That distinction — no nav item, no hub, no
hub link; individual content pages remain linkable — is sound and is what the code implements.
Neither CLAUDE.md nor ROADMAP makes it, and ROADMAP's "or link" contradicts it outright while the
footer cites ROADMAP as its authority.

Recommended wording, for the owner's call: *"the **Services hub** (`/services/`) and any nav item or
link to it — permanently removed, do not re-add. The individual location × service content pages stay
and stay linkable."*

### F13 · The footer's own rationale invokes fourteen pages; the column links seven

Same comment: "the individual location x service links STAY: those are **the fourteen** indexed
content pages". The column maps `orderedServices` over `/austin/${svc.id}/` only. Both metros have
all seven pages built (verified in `dist/`), so **San Antonio's seven get no footer link at all**.
Either the comment overstates the column or the links are missing; since the rationale is explicitly
about internal linking for KPI #1, I believe the links are missing and the comment is right about
intent.

### F14 · `CLAUDE.md:97` "No Tools, no Services" vs the footer's `/tools/` link

Identical shape to F12, same file. The Tools *nav item* is out of scope for this build; `/tools/` the
page exists and is footer-linked (and `toolshubrender` guards it with 44 assertions). The rule reads
as a ban on the surface, not the nav item.

---

## Tier 4 · Cosmetic, and one disclosure gap

### F15 · `/data/austin/roof-permits/` counts 2,089 permits across 1,568 case numbers

Measured: 266 case numbers carry more than one permit (suffixes `EP` 884, `BP` 784, `PP` 217,
`MP` 204), contributing **521 extra rows — 25% of the total**. "2,089 permits issued" is literally
true: these are distinct permits, and Austin's feed is one row per permit (Round 45 established
59,811 rows = 59,811 distinct). But a reader taking it as 2,089 roof *jobs* overcounts by a third,
and Round 45 judged exactly this worth saying on the trade pages. The page is otherwise careful —
"roof-related", "this total is a text match and is broader than roof replacement", "read that share
as a floor" — so this is a missing sentence, not a wrong number.

### F16 · "No `SAMPLE` on an indexed page" read literally would delete two honest disclosures

`CLAUDE.md`. Both roofing pages contain the word, in sentences whose purpose is to say a feed is a
placeholder and that **nothing on the page draws from it**. Only one built page carries a
`sample-badge` — `/methodology/`, matching its own prose. The rule means no SAMPLE *figure or badge*
on an indexed page; an agent applying it literally would remove the disclosure it exists to require.

### F17 · Provenance fields with no consumer

`swdi-nx3hail`: `probabilityOfHail`, `probabilityOfSevereHail`, `radarStationId`, `countCheckReported`.
`noaa-climate`: `measurementFlag`. All published on every row, none read anywhere. These are **not**
findings in the F10/F11 sense — several are explicitly labelled "Provenance, carried not interpreted"
and that is honest and correct. Recorded only so a future round does not mistake them for live inputs.

---

## Checked and found sound

Recording these so the next sweep does not spend its budget here. Each looked like a finding.

| Claim | Verdict |
|---|---|
| `key` "unique within one dataset file" | **Guaranteed by construction** — `mergeObservations` keys a Map. Now also asserted on disk (8,994 rows, 0 violations). |
| `observations` "oldest first" | **Guaranteed by construction** — the same merge sorts by `observedAt`. Now asserted. |
| `completenessFlag` | **Acted on.** An `E`-flagged station is rejected (`noaaClimate.ts:444`) with a real positive control in `climateunit` (a measured two-year/`E` station). Committed rows are `S` and `R`. |
| `arr` `ambiguousCount` computed twice | **The two counters agree by construction.** `emitShards` counts keys holding `AMBIGUOUS`; the fetcher's `seen !== AMBIGUOUS` guard makes its counter increment once per key too. Checked because they looked like they would diverge. |
| "No LLM in the runtime or ingestion path" | **Clean** — no model call, SDK import or completion endpoint anywhere in `src/` or `scripts/`. |
| "Secrets never reach the browser" | **Clean** — no secret-shaped string in `dist/client`. |
| "Permit data is an activity instrument, not a price instrument" | **Clean** — zero `$` figures on all six permit pages. |
| `urlVerifiedByFetch` | **Honest by typing** — declared `?: false`, so it cannot assert a verification that never happened. |
| A seed row in a live dataset | **None** — all four files carrying `seed: true` are `status: "sample"` with `lastSuccessAt: null`. Now asserted. |
| Failure paths across the replay suite | **17 of 18 sweep steps can fail.** Only F3 cannot. |

---

## Assertions added this round

One new unit, `scripts/replays/datasetintegrityunit.ts`, 15 checks, registered in the sweep. Four
properties, **all already true** — which is the point; each is stated somewhere and nothing executed
it.

1. No `seed` row in any live or stale file (27 scanned).
2. Keys unique within each file (8,994 rows scanned).
3. `observations` oldest-first in every file.
4. No recorded self-check failure on disk: `countCheck: "disagrees"` or `completenessFlag: "E"`.

**Every predicate carries a positive control, with a negative case beside it** — a planted seed row
in a live file is caught and the same row in a sample file is not; `"disagrees"` is caught and
`"agrees"` is not; a forbidden value in the wrong dataset is ignored. That is F3's lesson applied
pre-emptively: a scan over a clean tree and a broken predicate print the same thing.

Each assertion also reports what it scanned, so a check that has quietly stopped seeing files is
visible as a count of zero rather than as a pass.

Nothing else was fixed. Everything in Tiers 2–4 is reported for sequencing.

---

## Method note — how each class was searched, and what could not be

**A · Names that assert a meaning.** Searched exhaustively where it was mechanical, read where it
was not.

- *Published field names:* enumerated **every** field in all 31 committed dataset files by parsing
  them (19 datasets, plus the per-observation and top-level envelopes), then traced each
  suspicious one to its writer and its readers by grep. Complete for the committed tree — this class
  had a finite population and I covered all of it.
- *`is*`/`has*`/`verified*`/`validated*`/`normalized*` identifiers:* grep over `src` and `scripts`,
  485 hits, collapsed to 47 distinct identifiers by frequency, then filtered by hand to those
  asserting a *property* rather than performing a type check (`isArray`, `isNaN`, `isFinite` and
  friends discarded). Read the survivors: `urlVerifiedByFetch`, `checkedByHumanOn`, `hasRealHistory`,
  `hasPersonalShape`, `isSeed`, `isWithheld`, `isRoofingRelated`, `canSignLinks`, `countCheck`,
  `completenessFlag`, `unusableCount`, `ambiguousCount`. **Thin spot:** I did not read all 129
  `confirmed` / 24 `confirmedOn` sites. They are human attestations of a date, which no code can
  verify by construction, and `noticefreshunit` already ages them — but I did not confirm that every
  one of them is covered by it.

**B · Prose that describes mechanism.** This is the class that cannot be grepped, and where coverage
is most uneven. What I read in full: `src/ingest/types.ts` (the source of F7, F8 and F9 — a 70-line
file of nothing but claims, and the densest find in the round), `dataFreshness.ts`,
`DataStatus.astro`'s header, `merge.ts`, the whole Round 43 entry on `/methodology/`, `CLAUDE.md`'s
non-negotiable rules, `ROADMAP.md`'s out-of-scope list, and `Footer.astro`'s Round 10b comment.
What I searched rather than read: badge-label prose (one grep, bounded — exactly one standing claim
exists site-wide, and it was F1); `$`-figure prose on permit pages; SAMPLE mentions in built HTML.
What I **did not** cover: the `SourceRef.used` sentence on every source of every page (I checked the
two permit ones in Round 45 and spot-checked the TDI disclosure here); the per-signal copy in the
stress index; `llms.txt` and `robots.txt`; the `belowHero` `context` and `omitted` blocks. **Call
this class half-swept.** The method that would finish it is reading each rendered sentence that
describes a mechanism against the code it describes, which is roughly a round's work on its own.

**C · Mechanisms whose other half is missing.** Found by following constants and fields to their
consumers, which is the only method that works here — neither an identifier grep nor a prose read
finds a missing reader. Concretely: grepped each of the four `*METHODOLOGY_VERSION` /
`*MAPPING_VERSION` constants and separated writes from reads (F5); grepped every published field
name for a consumer outside its own fetcher (F10, F11, F17); followed `countCheck` from its
computation to the log, to the row, to nothing (F4). **Covered well, because the population is
enumerable:** every constant and every published field. Not covered: produced *state* that is not a
named constant or a published field — in-memory flags, intermediate values, thrown-error paths that
have never executed. The brief asked for "guards whose failure path has never executed" and I did
not systematically find those; the one I did find (F4) surfaced because its condition is recorded on
disk where I could count it.

**D · Vacuous assertions.** One mechanical result and one thin read.

- *Mechanical, and complete:* every one of the 28 replay files, checked for a failure path and an
  assertion count. **F3 is the only sweep step that cannot fail**, and that is a complete answer to
  "which replays are incapable of failing".
- *Thin:* "would this fail if the behaviour were wrong?" needs reading or mutation, and I did
  neither at scale. I read `badgeunit` in full (24 lines), `saservicerender`'s `expected()` and
  re-captioned assertion (Round 45), `withdrawnrender`'s 410-with-404-control pair, and
  `climateunit`'s `E`-flag station. I also counted source-text assertions per file — the
  `.test(src)` form that encodes current text by construction — and found 48 across 11 files.
  Those are **legitimate here** (the project uses them deliberately, to read a bar out of the source
  rather than restate it) but each is a candidate, and I did not evaluate them individually.
  **The honest answer is that class D is covered only for "can it fail", not for "would it fail".**
  The method that would settle it is mutation: break each guarded behaviour deliberately, one at a
  time, and confirm the matching replay goes red. That is mechanical, slow, and worth its own round.

**What could not be searched from here at all.** No external host is reachable from a Claude Code
session, so every claim about what an upstream source currently returns is unverifiable in this
environment. That is exactly what blocks F2's first question — whether a published EIA figure has
already drifted from the source — and it needs an Actions-shaped probe. The same limit means
`checkedByHumanOn` dates and `urlVerifiedByFetch` can only ever be attestations from here.

**One thing I got wrong and corrected mid-round.** I expected `arr`'s two `ambiguousCount`
implementations to diverge and nearly wrote it up as a finding; reading the `seen !== AMBIGUOUS`
guard showed they agree by construction. It is in the sound list rather than the inventory because
the measurement said so, not because it looked fine.
