# THI Website V3 — Backlog

Owner's idea dump for the V3 revision cycle, with a grounding note per item and the decisions
each one needs before it can be built. **This is a backlog, not a plan of record.** Nothing here
is approved for build except what a round prompt explicitly scopes.

Grounding notes were written from a read of `main` at `a995ebc` (2026-09-22) in a chat session,
not by Claude Code. **Treat every factual claim below as unverified until a round confirms it
against the repo** (CLAUDE.md Rule 1; the Round 30 premise failure is the reason this line exists).

Publication note: this repo is public. This file carries direction and decisions only. Anything
about other properties the owner operates, or about the repo's own visibility, is held by the
owner outside the repo and is deliberately absent here.

---

## Proposed round sequence

| Round | Objective | Items | Blocked on |
|---|---|---|---|
| 31 | Analysis discoverability + article formatting | 9, 10 | nothing (nav + homepage module surfaced as decisions, not built) |
| 32 | Zero broken internal links (shipped) | — | nothing — done, see `docs/audits/round-32-broken-data-links.md` |
| 33 | Footer restructure (shipped) | 2 | nothing — done, see `docs/audits/round-33-footer.md` |
| 34 | Dashboard free-account card accent | 5a | nothing — small |
| 35 | Privacy disclosure → tag container → conversion events | 3 | D3a–D3d; privacy copy is 🔴 owner-approved before any tag ships |
| 36 | Metric contract for external readers (`data-metric` / JSON) | 6 | D6 (the consumer's config) |
| 37 | Hero system evaluation (probe, then build) | 4, 5b | D4a–D4c |
| P1 | Probe: county appraisal data | 1 | probe only — no build until data + legal gates pass |
| P2 | Probe: crime data | 7 | probe only — D7 |

Probes (P1, P2) can run in any gap; they write an audit and change no served page.

**Sequence set by the owner after Round 46** (2026-10-01), ahead of the items above:

| Round | Objective | Source |
|---|---|---|
| 47 | The fetch window. Starts with an Actions drift probe — re-request a wider window per live dataset, diff against disk. A drift means we are publishing a stale figure and it jumps the queue. Then fix the window so the revision mechanism reaches what the copy says it reaches. | Round 46 F2 |
| 48 | The dormant mechanisms, as one round because they are one shape: `badgeunit` (assertions + a failure path, and call `freshnessOf` rather than re-implement it), `METHODOLOGY_VERSION` (into the merge key or removed — written-and-never-read is worse than absent), `swdiHail`'s promotion (act on the condition that fired 13/14 September), and `analysis/[slug].astro:130` before a new article embeds a dataset. | Round 46 F3, F5, F4, F6 |
| 49 | Mutation testing on the replays. Round 46 answered "can it fail" for all 28 and "would it fail" for 4. Break each guarded behaviour deliberately, confirm the matching replay goes red, fix or flag the ones that do not. | Round 46 class D |
| 28 | The ledger tier (item 28 below). Sequenced after 49. | owner |
| — | Stale-prose cleanup: ROADMAP's "do not re-add or link", `CLAUDE.md:97`'s "No Tools, no Services", `types.ts`'s `observedAt` and `FeedStatus` claims, with class B's unswept half folded in. | Round 46 F7, F8, F12, F14 |
| 50 | The permit discrepancy, as a measurement round (item 34). Shipped — see `docs/audits/round-50-permit-overlap.md`. Closed 34; raised 35, 36, 37. | owner |
| 50b | **Austin's solar mapping (item 35)** — split into `solar` and `energy_storage`, bumped to `trades-v3`, both series re-based, feed refreshed. Shipped on the branch; the article and methodology copy are drafted and awaiting the owner. | Round 50 |
| 50c | **The withdrawal** (item 35's article half). `published: false`, 410 Gone, registry entry, `withdrawnrender` §6 and a 404 control. Built on the branch; the methodology and notice copy are drafted and awaiting the owner. | Round 50 |
| 51 | **The storage finding, measured** — read, not written. See `docs/audits/round-51-storage-series.md`. It is a step at July, the vocabulary inverts across it, and the series is not comparable either side. Austin-only: San Antonio's permit file has no description column. | Round 50 |
| 52 | **The feed's missing mapping version** (item 38). Owner-scoped as its own round, after the withdrawal lands: a feed with no mapping version is a stale feed indistinguishable from a fresh one, and that is what nearly published a v2 figure on 2026-10-15. | Round 50 |

---

## Open now — raised by Round 50

These sit above the older numbered items because one of them is live and wrong. Items 1–34 are
further down, in their original order.

### 35 · Austin's published "solar" permit counts are mostly battery storage — MAPPING FIXED, COPY PENDING

Round 50, measured. Austin assigns solar from `work_class = "Auxiliary Power"` as well as from
description text. `Auxiliary Power` is the class the city uses for distributed energy resources
generally — PV, storage, generators, V2H — and **from July 2026 storage came to dominate it.**

| month | published solar | permits naming solar | % naming no solar |
|---|--:|--:|--:|
| 2025-09 … 2026-06 | 33–160 | 32–156 | **2.2–8.9** |
| 2026-07 | 93 | 72 | 22.6 |
| **2026-08** | **224** | **80** | **64.3** |
| **2026-09** | **240** | **62** | **74.2** |

142 of August's 144 non-solar permits and 178 of 178 in September describe energy storage.

**A live article is wrong.** `/analysis/is-austins-home-improvement-boom-cooling-off/` headlines
"224 solar permits in a single month, up 138% month over month — the largest month in the twelve
we hold". On permits that name solar: 80, **+11.1%**, and 6th in the window. The autoposter's
feed also has `austin_metro / permit_activity_solar` ranked #4 at "240 solar permits in 2026-09",
so **a future cycle can publish another one.**

San Antonio is unaffected — its solar is the explicit `Solar - Photovoltaic Permit` type.

**Owner took option 2, Round 50: split into `solar` and `energy_storage`.** Done — the mapping,
the `trades-v3` bump, the re-base of both series, and the feed refresh that retires the old
numbers from the autoposter. §10 of the audit has every figure that moved. Storage is now its own
series and it is the better finding: 4 permits in May 2026, 29 in July, 146 in August, 188 in
September.

**What is still open and is yours:**
- **The article.** The finding does NOT survive recomputation, and it fails twice — the solar
  section reverses (159% above its average → 1.9% below) and so does the article's own verdict
  (1 of 3 trades below → 2 of 3). Both roads are drafted in `round-50-drafts.md`; the
  recommendation is withdrawal on the electricity article's reasoning.
- **The `/methodology/` entry**, drafted in the same file.
- **A builder for `energy_storage`.** The category ranks 3rd in the feed and nothing can write
  it, so the machine cannot publish a storage claim by accident — and cannot tell the story
  either. That is the next round's obvious candidate.

### 36 · A composition check on `sourceValues`

Round 50. The defect in item 35 was visible in the committed file for four months and nothing
read it: `toObservations` stores `sourceValues` — the per-source-value permit counts — on every
monthly observation, and Austin's August solar row says `Auxiliary Power: 194` against
`description mentions solar/photovoltaic/PV: 30`.

A check that flags when a category's mechanism mix moves sharply month over month would have
caught it in **July, at 22.6%**, from data already on disk, with no new source. It generalises to
any category in either metro.

Third face of a pattern now worth naming as a family: Round 46 found **a config key with no
consumer**; Round 49 found **a consumer with no config**; this is **a stored provenance field
with no consumer** — the data that would have raised the alarm, recorded faithfully and never
looked at.

### 37 · ~~`austinPermits.ts` shortens before it redacts~~ — FIXED, Round 50

Round 50, noticed in passing, not fixed — it is a PII question in a different file and deserves
its own decision. `austinPermits.ts:116` calls
`redactPersonalShapes(row.description?.slice(0, 300))`. A personal shape straddling character 300
is cut in half, after which the redactor cannot match it, so a fragment can reach the committed
`municipal-permits` archive. This is the inverse of Round 47's rule. Severity looks low — a
fragment rather than a full address.

**FIXED in Round 50, and the backfill script does NOT cover it** — checked, as this item asked:
`redact-committed-descriptions.ts` reads the value already on disk, which is the truncated one, so
it sees the same unmatchable fragment. Proven rather than asserted: an address placed to straddle
character 300 leaks `1234 M` under the old order **and records zero removals**, so the run log
reported a clean pass. Two further findings came out of the same read — San Antonio's fetcher had
no redaction pass at all (latent, not live: no description column resolves, so all 5,666 committed
descriptions are empty), and this round's own probes published two personal names before being
rewritten to emit structural predicates instead of free text.

### 40 · ~~The power article's answer section is one paragraph~~ — FIXED IN THE BUILDER, Round 50

Found by the first full `npm run sweep` since Round 48 published that article. `analysisrender`
asserts the answer section renders as exactly two paragraphs — the verdict alone, then the figure
that supports it — which is the shape every other article uses:

```
**Mostly no — more trades are running above their own pace than below it.**

4 of 7 trades above their own average in August 2026 (…)
```

`are-texas-power-prices-still-going-up-jul-2026` runs them together:

```
**Yes.** Texas residential electricity is dearer than it was a year ago. The average
residential price in July 2026 was 15.88 cents per kilowatt-hour — up 3.4% year over year…
```

The answer box still renders and is still styled as a box; what is lost is the separation of the
verdict from its evidence, which is the convention the assertion exists to hold. **Not fixed
here: it is article copy, which is the owner's.** Two roads — split the paragraph, or decide the
convention does not apply to a one-line verdict and narrow the assertion. **Relaxing the
assertion to make a red check green is not one of them.**

**Why it sat for three days.** Round 48 ran the sweep as `npm run sweep 2>&1 | tail -4`, which
discards the exit code AND shows only the last four lines — and this failure prints in the middle
of the log. The standing rule written that same round ("a pipe discards the exit code you were
checking") was written about this exact command, and this is its first retroactive victim: the
rule was logged, the run that logged it had already missed something.

**ANSWERED, and the answer changed the fix. It is the TEMPLATE, not that one article.**
`write_power`'s body template ran the verdict and the figure on the same line:

```
{verdict} The average residential price in {label} was {c['C1'].figure} — …
```

Every other live builder writes `{verdict}` followed by a blank line. So this builder would have
produced a one-paragraph answer section **every month it ran**, and the fix is in the builder with
the live article corrected to match — not the article alone. Owner's ruling: split it, keep the
wording, do not relax the assertion.

**What landed:** the break in the template; the same split in the live article, at the same point,
so the builder's output for July 2026 now matches the corrected file; and a new guard,
`test_EVERY_BUILDER_puts_the_VERDICT_IN_ITS_OWN_PARAGRAPH`, which checks all five live builders at
the template rather than waiting for a published article to be swept. Proven by reverting the
template and watching it name the builder. `analysisrender` is untouched and the sweep is 33/33 —
the first fully green sweep since Round 48.

**The generalisable half:** `analysisrender` can only catch a breach of house shape AFTER an
article is published and swept. A template assertion catches it before anything is written. Where
a rendered-output check guards a convention, the generator deserves one too.

**Found in passing, not fixed:** `run_article.write` (line ~131) and `build_claims` are DEAD —
`TOPIC_ARTICLES` registers them at line 532 and both entries are overwritten at 667 and 1008, and
nothing else references them. It is a ~260-line builder carrying a full article template,
including its own answer-section shape, that no reader reaches. Same family as
`article_engine._metric` (Round 46 F18, deleted in Round 49). Needs the owner's call: delete it or
wire it.

### 38 · `social-feed.json` carries no mapping version

Round 50, found while confirming that the queued article could not be built from the old series.
The cadence reads the COMMITTED feed, not the datasets. The feed records `generated_at` and
nothing about the methodology behind its numbers, so **a feed built under `trades-v2` is
indistinguishable from one built under `trades-v3` except by its timestamp** — and only to a human
reading two timestamps.

This round refreshed the feed by hand in the same run as the re-ingest, so the live state is
correct. The gap is that nothing would have caught it: re-ingesting alone leaves a stale feed that
looks entirely healthy, and every figure in it is "legal" by the gates' definition because it
traces to the feed.

Same family as item 36 (a stored provenance field with no consumer) with the opposite shape:
**provenance that was never stored at all.** A `mapping_versions` block on the feed, plus a check
that the cycle refuses a feed whose versions disagree with the datasets on disk, would close it.

**Owner-scoped as its own round (52), after the withdrawal lands.** It is the real one of the
pair: 39 is latent at a version number we have not reached, this one nearly published a v2 figure
on the day it was found.

### 39 · Both mapping-version readers compare versions as STRINGS

Round 50, latent, not triggered. `site/src/lib/tradeActivity.ts` does `.sort().at(-1)` and
`autoposter/src/thi_source.py` does `version > versions.get(trade, "")` — both lexicographic. So
`trades-v10` sorts BELOW `trades-v2`, and at the tenth bump both readers would silently publish
v9 while v10 sat on disk unread.

`trades-v3` is safe, which is why this was logged rather than fixed mid-bump: changing the
comparison also means changing `permitcountunit.ts`, which asserts the `.sort().at(-1)` idiom by
name. Worth doing before v10, and the natural moment is whenever that assertion is next touched.

The failure mode is the one this mechanism exists to prevent, reached by a different route: not a
mixture of versions, but confidently publishing the wrong single one.

### 41 · Nothing records the SOURCE changing its behaviour

Round 51. `CATEGORY_MAPPING_VERSION` exists so a change in OUR methodology cannot be silently
compared across. Nothing expresses the other direction: the City of Austin changed how it
describes battery work around July 2026 — the vocabulary inverts, system sizes disappear, 90% of
permits share one description shape — so the storage series measures a different thing either
side of July, and no field on any observation says so.

Item 36 (a composition check on `sourceValues`) would have **detected** it. It would not have
**recorded** it, and a reader comparing June to September gets no warning. The instrument is
either a `sourceBehaviourVersion` alongside the mapping version, or a documented series break
that the renderer honours.

This is the third face of the provenance family: Round 46 found a config key with no consumer,
Round 49 a consumer with no config, Round 50 a stored field with no reader. This is a fact with
nowhere to be stored.

### 42 · Austin may be starting to use a `Roof` work class

Round 51, noticed in passing, not a round. Round 6 measured `work_class = "Roof"` as **one row in
54,798** and concluded Austin has no roofing class worth the name — which is why Austin roofing is
a description-text match, with the 35%-re-roofing / 32.5%-adjacent / 32.5%-unrelated split that
implies. The class **first appears in the window in 2026-08** and is still under 200 permits.

If the city keeps using it, Austin roofing could be read from a real class instead of a text
match, which would be a material improvement to the most-caveated figure on the site. Worth
re-measuring in a few months rather than acting on now.

## Standing rule — a probe writes the measurement, not the material

Round 50, and it is my own error rather than one found in the code.

The round's probes wrote permit descriptions into committed JSON, having passed them through
`redactPersonalShapes` first. That function catches address and phone SHAPES and knows nothing
about names. Two descriptions carried a personal name and reached a public repo.

The reflex was wrong before the function was: **I reached for the redactor instead of asking
whether the field needed writing down at all.** The descriptions were evidence for a hand-read,
and a hand-read happens against the run's own output. Nothing downstream needed the text — the
tally needed to know whether a description mentions roof, solar or a battery, which is four
booleans.

> **A probe writes the measurement, not the material. A description is evidence for a count, not
> something the count needs to carry.** Where free text is genuinely needed, it is read from the
> run output and left there; what gets committed is the structural predicate the measurement
> actually used.

Redaction is a last line, not a licence. It cannot be the reason a field is safe to publish,
because it only knows the shapes someone thought to teach it — and a name is not one of them.
Both probes are now structurally incapable of emitting free text, which is a stronger guarantee
than a redactor applied correctly.

## Standing rule — reusing a request builder with hand-chosen arguments is still a hand-built request

Round 50, and it is the third tightening of the same rule in three rounds.

Round 49 hardened "use the repo's own code" into "**per request**", after a probe imported one
request builder and rebuilt another by hand. This round found that the same probe's *Austin*
request — the one that did call `austinTradeWhere` — was also wrong, because it chose the bounds
by hand: `between '2026-09-01' and '2026-10-01'`, and Socrata's `between` is inclusive at both
ends. The window was September plus a day, and the 4,233 it produced went into the backlog as a
September figure and stayed there for a round.

The ingestion never bounds a month that way. Its predicate spans the whole recount window and
each row's month comes from parsing its own `issue_date`.

> **The builder guarantees the shape of the query, never that the arguments mean what you think.
> Where the pipeline derives an argument, derive it the same way — do not retype it.**

The honest summary of the three rounds: obeying the letter of this rule has not once been enough.
Each time, the part left to hand was the part that broke.

## Standing rule — a control must state the population it could not have seen

Round 50. The Austin solar mapping carried this evidence in its own comment:

> *"of the 469 Auxiliary Power rows inside the roof-matched archive, 463 (98.7%) mention solar.
> That measurement is on the roof-matched subset, not the full 808 in the window, so it is strong
> evidence rather than proof"*

The caveat is there. What is missing is the **direction** of the bias. The roof-matched archive is
selected by the word *roof*; rooftop solar contains it, a battery cabinet and a meter socket do
not. So the 98.7% was measured on a population from which the counterexample had already been
filtered out, and it read as reassurance for fourteen months while the thing it appeared to rule
out took over the category.

> **A control taken on a subset must say which population it excluded, and why that exclusion
> cannot hide what the control is meant to rule out.** "Measured on a subset, so evidence not
> proof" is not enough — it understates, because a biased subset is worse than a small one.

Same family as Round 47's 178-mile distance and Round 49's °C-days: a control that cannot see the
thing it is meant to rule out is not a weak control, it is a misleading one.

## Standing rule — a replay that reports a value is not a check

**When a replay measures something worth measuring, it asserts it.** A value printed into a
note is documentation; only an assertion fails a round. Two drifts survived precisely this gap:

- **The eyebrow's 3px.** `eyebrowrender` printed the computed font size in every assertion's
  note and never asserted it, so a 15.04px render sat under a rule asking for 12px across 225
  indexed pages until Round 36 went looking (item 12).
- **The `/home/` label check that had nothing to look at.** It loaded the signed-in dashboard
  without a session, found no label, and counted "no accented label found" as a pass. An
  assertion that cannot fail is not a check — it now loads a session, requires the label to be
  **present** as well as correct, and separately asserts the page did not redirect (Round 34).

- **`badgeunit`, found by Round 46 and still open as part of Round 48.** The purest violation of
  this rule in the repo, and the oldest: it prints a table of every dataset's resolved badge and
  contains **zero assertions and no failure path**. It has reported `ok` as a registered sweep
  step since Round 1. It is the only one of 18 steps that cannot fail — and it is the only test of
  the badge mechanism, which is what both of Round 46's live findings were about. The standing rule
  was written after the eyebrow and the `/home/` label; nothing went back and applied it to the
  step that needed it most.

The pattern in all three: the replay was looking at the right thing and declined to hold it to
anything. If a number is worth printing, decide what it must be.

---

## Standing rule — a tuned number says what it is compensating for

Round 47. `REVISIT_DAYS["eia-electricity"]` was set to 400 days on the reasoning
"a year-over-year comparison needs thirteen months". It did nothing: 400 days before
2026-10-11 is 2025-09-06, so the request started at 2025-09 — **later than the 2025-08 row
already on disk**, which survived only because merging never deletes. The series did not grow
by a single month.

The requirement was never thirteen months. It is **thirteen months before the newest PUBLISHED
month**, and the EIA runs about three months behind real time, so the reach is fifteen months
from today — and it widens whenever their lag does. 800 days absorbs the lag instead of tracking
it.

**So: any entry that encodes a requirement relative to a moving upstream lag states the
arithmetic in its comment** — the requirement, the lag, and the product — rather than leaving a
number someone later reads as arbitrary and trims. A tuned constant with no derivation beside it
is a number nobody can safely change.

It also generalises past this table: the same applies to a noise floor, a window, a threshold, or
any constant chosen against something that moves upstream.

---

## Standing rule — a test whose base case is live data is pinned to the world

Round 48, logged beside the tuned-number rule because it is the same failure wearing different
clothes: a constant that encodes something moving upstream, and an assertion that encodes
something moving upstream.

The autoposter's L16 flip tests prove a verdict is computed rather than typed, by inverting the
controlling figure and showing the conclusion moves. Three of them used the **real** claims as
one of the two branches and forced only the other:

```python
falling = write_power({}, claims, feed)["body"]          # the REAL data, assumed to fall
rising  = write_power({}, _rising(claims), feed)["body"] # forced
assert "**No.**" in falling
```

That works for exactly as long as Texas power keeps getting cheaper. It stopped: July 2026 is
15.88¢ against July 2025's 15.36¢, **+3.4%**, so the builder correctly answered "**Yes.**" and
the flip test went red for the one reason a flip test must never go red — *the world moved, and
the code was right*. A fourth test had the same shape through the weather branch ("neither metro
had a mild month"), and a fifth asserted a tally of 4 of 7 trades.

**So: force BOTH branches, and tie the real data to its own sign rather than to a direction.**

```python
falling = write_power({}, _falling(claims), feed)["body"]
rising  = write_power({}, _rising(claims),  feed)["body"]
assert "**No.**" in falling and "**Yes.**" in rising
# the tie to reality, with no direction written down:
assert ("**Yes.**" in write_power({}, claims, feed)["body"]) is c["C2"].figure.startswith("up")
```

The last line is the part worth copying. It keeps the test honest against real output — which is
why these tests read real data in the first place — while asserting a *relation* instead of a
value. Same family as the date-pinned assertions Round 48 rewrote: an assertion pinned to a
market condition, a month name, or whatever the newest ingestion happened to reach is an
assertion with an expiry date nobody wrote down, and the third time it fires somebody silences
it.

---

## Standing rule — a check that fails open needs a separate assertion that it can RUN

Round 49. The source check was deliberately built to fail open: an unreachable source records
`unverified` and the cycle proceeds, because refusing to publish a correct article over a federal
API outage is the wrong trade. That reasoning is sound and the first live run vindicated it — EIA
returned HTTP 500 twice in ninety seconds and the articles were unaffected.

The cost of that trade is what this rule is about. **Failing open converts every cause of
non-execution into a result indistinguishable from a healthy quiet.** It shipped onto the
publishing path with no `EIA_API_KEY` in `autoposter-cadence.yml` — present in the temporary
probe workflow, absent from the cycle. Nothing would have failed. Every cycle would have
authenticated against nothing, failed open, and written `unverified` for the electricity claim
forever, while the ledger showed a verification step faithfully executing. The suite was green
throughout.

This is the mirror of Round 48's pattern. There it was **a config key with no consumer**
(`autonomy_gate`, with a comment describing a safety property nothing read). Here it is **a
consumer with no config** — and fail-open is the thing that makes it silent rather than loud.

**So: wherever a check is allowed to not-run, something else must assert that it can.** Not that
it passed — that it was capable of running. For this one the assertion reads the env vars
`verify-claim.ts` actually references and requires the cycle step to supply each, so a new keyed
source cannot be added without wiring its secret through. It was proven by deleting the line and
watching the test fail, per the flip-test rule.

A corollary worth stating because it nearly bit: **a secret wired into a probe workflow is not
wired into the thing the probe was measuring.** Probes run in their own file with their own env;
the measurement they produce says nothing about the production path's credentials.

## Standing rule — a verifier calls the project's own request builder, PER REQUEST

Round 49, and the qualifier is the whole lesson. The source-verifiability probe **did** import
`austinTradeWhere` rather than retyping the Socrata predicate, with a comment explaining why that
mattered — and then, in the same file, rebuilt the NOAA request by hand. It omitted
`units=standard`, NCEI answered in °C-days, and the probe reported a correct **695 °F-days as
386.3**. A 1.8× ratio looks exactly like a published figure being wrong.

A second bug in the same pass: the Austin month list was not deduped (one record per
(category, month)), so `.at(-2)` returned the incomplete current month, and the comparison ran
against a month the series deliberately does not publish.

**So the rule is not "use the repo's code in your probe". It is: every outbound request a
verifier makes is built by the code that built it for ingestion — each one, individually.** A
file that gets it right once has proved nothing about its next request. Where no such builder is
exported, export one (`noaaClimate.verifyMonthlyCdd`) rather than writing a second copy of the
URL.

This is the strongest argument the project has against verifying figures with an *independent*
reimplementation of each source request. That design buys unit and parse errors — which calling
our own fetcher cannot catch — at the price of false alarms about correct figures, and two of
those happened within an hour of writing one. **A gate that cries wolf about correct figures gets
switched off**, which is worse than the hole it was closing.

Both bugs were caught by the numbers being implausible, which is not a defence — it is the
178-mile distance of Round 47 again. A control with a known answer would have caught both
immediately: run the check first against a value already on disk and require agreement.

---

## Standing rule — a pipe discards the exit code you were checking

Round 48, and logged with a correction attached: I reported this to the owner as a third
codebase instance of "a step that cannot do its job reporting success", alongside the
autoposter's `sys.exit` gap and the OG generator's first-failure exit. **It is not.**
`scripts/run-sweep.mjs:141` handles a worker that never answers exactly right:

```js
console.error(`no worker answered on ${BASE} within 60s`);
process.exit(1);
```

The sweep exited 1. What reported 0 was **my own invocation**:

```bash
npm run check 2>&1 | tail -4; echo "=== sweep ==="; npm run sweep 2>&1 | tail -4
```

A pipeline's status is its LAST command's, so `| tail` returns 0 whatever came before it, and
`A; B` reports B's. The sweep's refusal to run its render replays against no worker was correctly
loud and I piped it into silence, then read the 0 as a pass.

**So: never read a pass off a command whose output you piped.** Where the exit code is the thing
being checked — a build, a sweep, a test run, a generator — run it bare, or capture the status
before the pipe (`set -o pipefail`, or `cmd > out; code=$?; tail out`). Same family as the two
real defects this round fixed, with the same shape (a verdict that cannot reach the thing reading
it) and a different culprit: a check can be sound and still be read wrong by whoever runs it.

---

## Standing rule — redact before you shorten

**Masking matches the whole value, so any truncation of a string that might hold a secret
defeats it.** Round 47: the revision-drift probe printed `error.slice(0, 160)`, which cut a
36-character API key in half; the fragment no longer matched the secret, so GitHub's mask did not
fire. The scheduled ingestion logs — same key, same error text, untruncated — rendered it `***`
correctly. The probe was the only thing that leaked it, and the probe was mine.

This governs every probe and audit workflow, not just that one. Redact first, then shorten.
`src/ingest/redactSecrets.ts` is the shared pass; `SECURITY.md` carries the rule.

The wider lesson is about where a guarantee can live: a helper protects the call sites that
remember it, and the **sink** protects the ones that don't. `lastError` is the single field
through which arbitrary error text reaches a committed file, so that is where the redaction has
to be, and that is where the assertion points.

---

## Standing test — does the number change the action?

**Before any new data domain is proposed, it has to pass this: does the reading's VALUE change
what a homeowner does?** Not "can an action be written for it" — an action can always be
written. Every signal THI ships passes the real test. Drought changes what to do with water this
week; a freeze forecast changes what to do tonight; recorded hail changes whether looking at the
roof is worth doing now rather than at the next seasonal check.

A reading whose action is the same whatever the number says is a reminder with a number stapled
to it, and the data is doing no work. Established in `docs/audits/round-35b-crime-memo.md` §1,
which is where crime failed it.

---

## Standing note — how a probe can get its data

**No external host is reachable from a Claude Code session.** Measured repeatedly: every host
tried answers **403 to CONNECT** — a gateway policy denial, not DNS, TLS or a timeout. That
includes `texashomeintelligence.com` itself and **the feed hosts already shipping**, such as
`data.austintexas.gov` and `data.sanantonio.gov`.

That is not a contradiction of the live ingestion. **Ingestion runs in GitHub Actions**
(`.github/workflows/data-ingestion.yml`), on runners with ordinary egress, and never in a
session. A host working in production says nothing about whether it is reachable here, and a
round must never assume otherwise — Round 35 was scoped on that assumption and stopped at its
first command.

**So every probe takes one of three shapes:**

| shape | what it is | when it fits |
|---|---|---|
| **Files on disk** | the owner downloads terms, a field dictionary and a sample, and commits them (`docs/source/…`) | the default. Answers availability, granularity and comparability without a single fetch |
| **A temporary Actions workflow** | a throwaway workflow that fetches and commits exactly what the probe needs, then is deleted | when the data is large, or needs many requests, or must be re-pulled |
| **An owner-widened network policy** | the session's egress is opened to named hosts | when a probe is genuinely iterative and the two above would mean many round trips |

One nuance worth knowing, and deliberately left unverified: **MCP-backed sources may not be
subject to this**, because an MCP server reaches the network through its own infrastructure
rather than this sandbox's egress. That could make a SEMrush-style probe (the reserved
content-demand system) feasible in-session where direct HTTP is not. **UNTESTED, and not to be
tested until something actually needs it** — a call spends the owner's API units, which is
ask-first under `SECURITY.md`, and nothing on this backlog needs it today (owner's instruction,
2026-09-22). Recorded so a future round knows the question exists, not as a capability to rely
on.

**Which shape each probe-style item would take:**

- **Item 1 · appraisal data** — *files on disk*, and not merely because of egress: the districts
  refuse non-browser clients and one publishes no bulk export at all. Owner-gated, records
  requests. See the item.
- **Item 7 · crime** — *moot.* Closed on reasoning in Round 35b without any data; see the item.
- **Item 3 · tag container / pixels** — not a probe. Needs owner accounts and approved privacy
  copy, not a fetch.
- **Item 6 · metric contract** — not a probe. Needs the consumer's config from the owner.
- **Items 4 / 5b · hero system** — not a probe. Design decisions.

---

## Items

### 1 · County appraisal data → property-tax overpayment estimate

> **DEFERRED — owner-gated: requires records requests.** Not probeable from a Claude Code
> session as things stand; see the three corrections below.

**Owner:** County appraisal reports etc. to calculate how much someone is overpaying on their
property taxes.

**Grounding:** New data domain; no appraisal-district ingestion exists.

**Three corrections, 2026-09-22.** The line this item used to carry — that the sandbox
allow-list already includes the Travis, Bexar, Harris, Dallas and Tarrant CAD domains — **is
wrong**, and two further facts close the in-session route entirely:

1. **All five CAD domains are refused by egress.** `traviscad.org`, `bcad.org`, `hcad.org`,
   `dallascad.org` and `tad.org` each answer 403 to CONNECT, as do `www.traviscad.org` and
   `public.hcad.org`. Measured directly, not inferred.
2. **Travis CAD's own server refuses non-browser clients** (established outside this sandbox),
   so lifting the egress rule alone would not be enough.
3. **Bexar CAD publishes no bulk parcel export at all.** Parcel data is obtained by signed
   Public Information Act request — a human, paper-and-signature step, not a fetch.

**What it would now take:** the terms-of-use / data-licensing document first, since it can end
the item on its own; then a field-layout document plus a bulk file or a sample of one; one
parcel's detail page end to end; and whatever ARB/protest statistics the district publishes,
which is the only thing that could support a word like *overpayment* rather than *value*.
Handed over as files, not fetched.

**Why this is a probe first:**
- *Data gate (Meta-Rule 5).* Unknown whether CAD data is available in bulk, at parcel grain,
  with the fields a comparable-value estimate needs, under terms that allow republication.
- *Honesty.* "How much you are overpaying" is a claim about one specific property. Every THI
  figure today is county- or metro-level and says so. An overpayment figure is a **modelled
  estimate** by construction and must be labelled as one — or withheld.
- *Regulatory.* Texas regulates property tax consultants. Whether a free self-help estimate
  touches that regime is a question for someone qualified, not for the build. Name it; don't
  answer it.

**Decision needed:** none yet — the probe's audit produces the decision list.

### 2 · Footer restructure

> **SHIPPED — Round 33** (`docs/audits/round-33-footer.md`). Four columns: brand + Connect,
> Company, Services, Data. Decisions taken: D2a keep all seven service links in their own
> column · D2b Tools in Company · D2c metro links are anchors on `/data/`, no location hubs ·
> D2d no About link until there is copy · D2e Facebook only.
>
> **Pinterest added in Round 36** (`docs/audits/round-36-chrome-and-reminders.md`), same
> treatment, into the same profiles array; the Connect block stays on one row and the footer
> height is unchanged at both widths. **Still open from this item:** the About page and its
> link, and a YouTube icon if that account is ever created.

**Owner:**
- Locations → **Company**: add About, keep locations (Austin, San Antonio), Sign in, My Dashboard
- Services → **Connect**: remove all services
- Company → **Data**: Data Catalog, Methodology, Austin Data, San Antonio Data, Privacy
- Narrow the left "Texas Home Intelligence" column — only ~50% of its current height should be
  dead space
- Add social icons: Facebook, YouTube, Pinterest

**Grounding:** `site/src/components/Footer.astro`. The live footer differs from the screenshot the
owner annotated: Round 29 added **Tools** to the Company column, and "All services" was already
removed in Round 10b. The footer is on every page, so it is the site's largest internal-link
surface.

**Decisions needed:**
- **D2a — the seven service links.** Round 10b kept them deliberately: they are the only
  sitewide inbound links to the Austin × service pages. Removing them may leave some of those
  pages with thin or no inbound links. Options: (a) remove, after an orphan check proves
  every service page keeps an inbound link from elsewhere; (b) move them into the Data or
  Company column; (c) keep a compact "Guides" row. Recommendation: (a) only if the check passes,
  otherwise (b).
- **D2b — Tools.** The owner's list omits Tools. Removing it re-creates the exact orphan Round 29
  fixed. Keep it (Company column) unless the owner wants `/tools/` de-indexed.
- **D2c — "Austin Data" / "San Antonio Data" targets.** There is no `/data/austin/` hub route
  today (`site/src/pages/data/[location]/` has only `[topic]`). Options: build two thin location
  hubs (config-driven), or link to anchors on `/data/`. Recommendation: config-driven hubs.
- **D2d — About.** No `/about/` page exists. It needs owner copy (copy discipline: provided copy
  is frozen; new copy comes from the owner). Recommendation: build the route when copy arrives;
  don't ship a placeholder.
- **D2e — social URLs.** The three profile URLs, or confirmation the accounts exist. No icon ships
  pointing at a profile that doesn't exist or a guessed URL.
- Also: an **Analysis** link belongs in the footer once Round 31 lands (see item 10).

### 3 · Tag container, ad pixels, conversion goals

**Owner:** Install Google Tag and connect it; inside it install the Facebook pixel and the
Pinterest pixel; in Analytics, set conversion goals — leads — broken out by vertical.

**Grounding:**
- `Base.astro` already loads **gtag.js directly**, gated on `PUBLIC_GA4_MEASUREMENT_ID`, with an
  AI-referral session parameter and a `window.__thiTrack()` event shim. Events already fired:
  `zip_selected`, `signup_cta_clicked`, `home_created`, `reminder_created`,
  `reminder_completed`, `weekly_email_pref_set`.
- `/privacy/` currently states that analytics are **switched off**, that the site uses exactly
  **three** services, that THI is **not running an advertising business**, and that it does
  **not track which pages you read while signed in**. Ad pixels contradict all four.
- The lead handoff is **not live** (HANDOFF, Round 24). There are no "leads" to count yet.

**Decisions needed:**
- **D3a — privacy first.** The privacy page must be rewritten and live *before* any tag or pixel
  loads (the Round 24 precedent: disclosure precedes mechanism). Owner approves the copy. 🔴
- **D3b — where pixels load.** Recommendation: public pages only; never on `/home/*` or any
  signed-in surface, which keeps the "we don't track what you read while signed in" promise true.
- **D3c — consent.** Whether a consent banner is wanted for ad pixels. Owner/legal call.
- **D3d — "leads by vertical."** Until the handoff exists, define conversions as the events that
  do exist, tagged with a `vertical` parameter where one applies (e.g. `roof-scan` → roofing,
  `ac-lifespan` → HVAC, `plumbing-triage` → plumbing, service-page CTAs by service slug).
  Container ID, pixel IDs and GA4 conversion marking are owner-side (🔴).
- The existing `__thiTrack` shim means a container migration is a loader swap plus `dataLayer`
  pushes, not a rewrite of every call site.

### 4 · New heroes (Scrolltide templates)

**Owner:** Candidate hero templates from `scrolltide.co/templates` — Billet for a THI membership
page; Willow (or a plumbing rendering) for location pages; Glowinn for service-specific pages;
Meridian as a general base case; the bookmark card component as a section. Open question: are
they AI/SEO friendly? If not, restrict them to lead-gen pages.

**Grounding:** Nothing from Scrolltide is in the repo. A previous hero set produced in Claude
Design exists (tools heroes). CLAUDE.md requires facts in served HTML (not JS-only) and fixes the
indexed pages as AI-first, not conversion-first.

**Decisions needed:**
- **D4a — licence.** Whether the templates may be used and modified on this site.
- **D4b — the SEO/AI test**, answered by measurement, not assumption: served HTML contains the
  headline and every figure; LCP/CLS under budget on mobile; works with JS disabled; no content
  hidden behind scroll triggers. Pages that fail stay off indexed routes (`/lp/` only).
- **D4c — "THI Membership."** No membership page or product exists. Scope it before designing a
  hero for it.
- Route: visual adaptation → Claude Design (export into the repo); wiring → Claude Code.

### 5 · Dashboard free-account card

> **5a SHIPPED — Round 34** (`docs/audits/round-34-eyebrow-accent.md`). The "Free account · Two
> minutes" eyebrow carries the logo's Caliche Amber as ink `#0E1726` on an amber `#C4772E` pill,
> **5.15:1**. Applied through a modifier class so the two quiet `.card-tag` labels are untouched.
> 5b (hero system) is unaffected and still open.

**Owner:** (a) The "FREE ACCOUNT · TWO MINUTES" eyebrow should be accented in the logo orange.
(b) This might be the place for a Scrolltide hero.

**Grounding:** The card lives on the ZIP dashboard (`site/src/pages/dashboard/[zip]/`,
`LaunchNotify.astro`). The logo orange is BRAND.md's accent, **Caliche Amber `#C4772E`**,
"sparing (~3%), one deliberate accent per view." The dashboard is exempt from the AI-extraction
ruleset (CLAUDE.md), so (b) is less constrained here than on indexed pages.

**Decisions needed:** (a) none — check the view has no competing accent and that amber on the
eyebrow's background meets WCAG AA for its text size. (b) folds into item 4.

### 6 · Machine-readable metrics for an external reader

**Owner:** Add `data-metric` attributes to the data pages. A `config/sources.yaml` elsewhere
selects on things like `[data-metric='permit-count']`; if the attributes don't exist, add them to
the elements holding the headline figures — or better, expose a small JSON endpoint per dataset
and set `json_url`, dropping scraping entirely. Right now `signals` reports "selector matched
nothing" for every source.

**Grounding:** `config/sources.yaml` and `signals` are **not in this repo**. No `data-metric`
attributes exist in `site/`. Datasets are already committed JSON rendered at build time, and CSV
routes already exist per topic (`/data/[location]/[topic]/[csvName].csv`).

**Decision needed:**
- **D6 — the contract.** The owner supplies the consumer's `sources.yaml` (or its list of metric
  names and expected shapes). Recommendation: JSON endpoints, statically generated at build time
  from the same committed data (no serving-path fetch, no new cost), with each value carrying
  `source` and `asOf` — THI's honesty rules apply to machine-readable output too. Add
  `data-metric` attributes as well; they are cheap and help any reader.

### 7 · Crime stats and data feeds

> **REOPENED, NARROWED — owner's ruling, 2026-09-25.** The Round 35b verdict **stands for what
> it tested** — a per-ZIP public signal or score — and that stays closed. Reopened: crime as
> **article** subject matter at metro level, and as a **context reading on `/home/` only**.
> Never on the 225 indexed `/dashboard/<zip>/` pages; no score, rank, index or comparison; no
> Home Stress Index signal; no recommendation line.
>
> **PROBED — Round 37** (`docs/audits/round-37-crime-data-probe.md`), data fetched and measured.
> **Article: VIABLE** — both metros publish incident-level records, Austin as Public Domain and
> San Antonio as CC-BY, current to within weeks, every figure ledger-verifiable. **`/home/`
> reading: viable for San Antonio only, and recommended against.** San Antonio publishes a ZIP
> per row, which the account already holds, so it resolves with no geocoder. **Austin cannot
> support it at all:** its finest geography is a census block group (99.5% populated) that
> cannot be derived from a stored address without sending that address to a third party, which
> the privacy page forbids. A ZIP-level count also still fails the standing test — the number
> changes no action — which is why the ruling attaches none.
>
> **Not comparable across metros, in three independent ways:** geography (block group vs ZIP),
> taxonomy (UCR plus free text vs NIBRS), cadence (weekly vs monthly). The round-6 permit ruling
> applies — measure within a city, never across.
>
> **D7d — CLOSED, not deferred** (owner, 2026-09-25). **No `/home/` crime reading, and no path
> back to one from today's data.** Austin cannot resolve its census block group to a home without
> sending a member's street address to a third party, which the privacy page forbids; San Antonio
> resolves trivially but a ZIP is not a home. A revisit would need data **neither city publishes
> today** — an address-level or coordinate-level geography from Austin, and something finer than
> ZIP from San Antonio. Not "waiting on a decision": waiting on data that does not exist.
>
> **D7c — DONE.** One article, San Antonio, shipped in Round 38
> (`docs/audits/round-38-sa-crime-article.md`): *What does San Antonio's police offence data
> actually cover?* The §E candidate chosen was the records piece, and the choice turned out to be
> **forced rather than preferred** — the reporting-lag candidate is not computable for San
> Antonio, because the file carries no occurrence date and its `DateTime` column is a single
> constant extract stamp. No cross-metro comparison, no rate per head, no sub-metro figure, no
> recommendation line. **Nothing the probe fetched is kept** — the audit quotes the licence strings,
> the robots rules, the counts and the resource URL it relies on.
>
> **One correction the audit carries against itself:** `data.sanantonio.gov`'s robots.txt
> disallows `/api/` for all agents, and the probe made six `/api/3/action/` calls before that was
> noticed. The CSV resource path is permitted and is the route any build round must use — **no
> `/api/3/action/` call, ever.**

> **Round 35b's reasoning, unchanged and still governing the closed part.** Answered on
> reasoning, not data: **no candidate framing produces
> a reading whose value changes what a homeowner does.** The best honest line pairs a crime number
> with an action — check the lighting, check the locks — that is correct whatever the number says,
> which means the data does no work. Separately, it is the one THI reading with a mechanism by
> which a reader is worse off for its publication, and the only one whose downside falls partly on
> people who never visited the site.
>
> **The data was never the binding constraint.** Even the best case sections A–D could have
> returned — clean, point-located, current, comparable data under permissive terms — would not
> change the answer, which is why the memo was written without gathering a file.
>
> **Still open and NOT answered here:** the fair-housing and steering question, which is named in
> the memo's §2 the way HANDOFF names its lead-handoff regulatory question, and which belongs
> with counsel **before** any reconsideration rather than after.
>
> **Worth keeping:** the homeowner benefit lives in security-adjacent reminders — an
> exterior-lighting check, a lock or alarm test — which need no crime data and are two rows in the
> existing reminder catalogue. Logged as **D7a**.

> **Reachability, for the record (2026-09-22).** The Round 35 probe stopped before measuring
> anything: all six sources answer 403 to CONNECT — `data.austintexas.gov`,
> `data.sanantonio.gov`, `opendata-cosagis.opendata.arcgis.com`, `www.sanantonio.gov`,
> `api.usa.gov`, `cde.ucr.cjis.gov`. See the standing note above; this is now a known property of
> the environment rather than a finding about these sources.

**Owner:** Add crime stats and API data feeds.


**Why this is a probe first:**
- *Data gate.* What APD and SAPD (and county) publish, at what grain, how current, and under what
  terms.
- *Brand.* THI is an instrument panel, not an alarm. Crime data is the easiest data on the site to
  present as alarm.
- *Risk.* Neighbourhood crime figures on a housing-adjacent site raise fair-housing concerns in
  how they are framed and where they appear. Name it; the owner decides with qualified input.

**Decisions, all taken 2026-09-22:**
- **D7 — ACCEPTED.** Crime does not belong on THI. Item closed.
- **D7a — YES, but not now.** The security-adjacent reminders are split out as **item 13**.
- **D7b — NOTED.** If crime is ever revisited, the fair-housing question goes to counsel
  **first**, ahead of any data gathering. That ordering is the standing instruction, not a
  suggestion.

### 9 · Article formatting

**Owner:** Improve the formatting on the articles (example:
`/analysis/are-texas-electricity-prices-still-going-up/`).

**Grounding (from the live render):** Content structure is sound — a direct answer first,
sourced figures, a data table. Formatting gaps: no visible publish/updated date or author line
(present only in metadata); "The short answer" renders as ordinary prose; the headline figure is
not visually elevated even though the frontmatter `card` block already holds it, ledger-verified;
the Sources list is bare text; typographic minus signs; no related reading or link onward to the
underlying data page.

**Scope → Round 31.**

### 10 · A proper blog / analysis page

**Owner:** Articles are being published but are effectively impossible to reach from the
homepage, and there is no page listing them.

**Grounding:** `/analysis/` **does exist** (`site/src/pages/analysis/index.astro`) — a plain list.
Nothing outside `/analysis/` links to it: not the nav, footer, or homepage. The hub and every
article appear to be orphans; the articles began publishing after Round 29's orphan sweep. **To be
confirmed by `check-orphans.mjs`.**

**Decisions needed:**
- **D10a — nav.** CLAUDE.md fixes the header nav at Data, Locations and My Dashboard. Adding
  "Analysis" is a Rule 1 change. Recommendation: add it — it is the site's most citable layer.
- **D10b — homepage module.** A "Latest analysis" section needs owner-approved heading copy.
  Recommendation: yes, three most recent, rendered at build time.

**Scope → Round 31** (footer link + hub + article template; nav and homepage module built only on
owner approval).

### 11 · Data-page slug parity

**Owner (Round 32 decision A):** Austin storm events publish at `/data/austin/roofing/`,
San Antonio's at `/data/san-antonio/storms/`. Candidate fix: 301 roofing → storms with roofing
as a section; needs its own round (URL move, citation risk).

**Grounding (measured in Round 32, not a chat read):** both pages render the same feed —
`austinRoofing.ts` is `topic: "roofing"`, `sanAntonioStorms.ts` is `topic: "storms"`, and both
carry `datasetId: "noaa-storm-events"`. Austin's file holds 88 non-seed records over 7 counties
(wind 33, flood 34, hail 20, tornado 1); San Antonio's 94 over 8. `/data/austin/roofing/` is not
a roofing subset: its own description covers "hail, wind, flood and tornado events for the
seven-county Austin area". The mismatch cost a broken link — the readings layer asked every
metro for `storms` and Austin did not have it — which Round 32 fixed at the source. **Nothing is
broken while this sits:** the Austin storm reading keeps its source and as-of and carries no
onward link, where San Antonio's links out.

**Why its own round:** moving a published, indexed URL is a citation risk (KPI #1), needs a 301,
touches `llms.txt`, the sitemap, the CSV endpoint and every cross-link, and the alternative —
adding `/data/austin/storms/` beside the roofing page — publishes the same 88 records at two
URLs, which is the near-duplicate an answer engine resolves by picking one.

**Decisions needed:** which direction the 301 runs, and what the surviving page is called.

**Scope → unscheduled.** Options and the Round 32 recommendation are in
`docs/audits/round-32-broken-data-links.md` §4.

### 12 · `.card p` overrides the label type on every `.card-tag`

> **SHIPPED — Round 36** (`docs/audits/round-36-chrome-and-reminders.md`). Fixed with one rule,
> `.card .card-tag { font-size: var(--thi-fs-label) }` — two classes beat `.card p`'s class plus
> element without touching it, so no other paragraph in any card moved. Verified by a
> rule-level diff of two builds: **one rule added, none removed, none changed.**
>
> **It removed wraps rather than causing them.** Two of the three eyebrows were already wrapping
> to two lines at 390px at the old size, unmeasured. At the label size the count never rises at
> any width and falls in four cases. **Contrast unchanged at 5.15:1**, and 12px/600 is still not
> WCAG large text, so the 4.5:1 threshold still applies — now asserted alongside the size, which
> this file previously reported and never checked.
>
> **One thing left, and it is copy, not type:** the signed-in condition eyebrow wraps at 360px
> and narrower at *either* size, because the string is longer than the column. Nothing clips.
> Shortening it would be a copy change.

**Found in Round 34's grounding, measured not assumed.** `.card-tag` asks for
`font-size: var(--thi-fs-label)` — `0.75rem`, 12px. It renders at **15.04px**, because
`.card p { font-size: .94rem }` is more specific and the eyebrow is a `<p>` inside a `.card`.
The label token is being ignored wherever a `.card-tag` sits in a card, which is all three of
them: the free-account eyebrow and the "Modeled — per-ZIP coming soon" label on a ZIP dashboard,
and "<alert> · condition detected" on the signed-in dashboard.

**Why it needs its own round rather than a one-line fix:** putting the eyebrows back on the
label scale shrinks them by 3px on 225 indexed pages plus the signed-in view, which changes the
card's type rhythm and the vertical space the heading beneath it sits in. It is a type change
dressed as a specificity bug. It also wants a decision on whether the fix is a more specific
`.card .card-tag` rule, a reordering, or dropping `.card p`'s size altogether — the last of which
reaches every paragraph in every card on the site.

**Not a contrast problem.** 15.04px at weight 600 is not WCAG large text either way (that needs
18.66px AND bold), so the 4.5:1 threshold Round 34 measured against applies at either size.

**Decision needed:** which fix, and whether the eyebrows should be 12px at all.

**Scope → unscheduled.**

### 13 · Security-adjacent reminders in the maintenance catalogue

> **SHIPPED — Round 36** (`docs/audits/round-36-chrome-and-reminders.md`). `exterior-lighting`
> ("Exterior lighting check") and `locks-latches` ("Locks and alarm test"), **both at 180 days**
> — the twice-a-year rhythm the smoke/CO test already sets, which is when a homeowner is walking
> the house anyway. Editable like every other row. Both pass the banned-phrase guard, name no
> area and imply no threat, and one is proven end to end: added, rendered, and recalculating its
> next due date from the day it is marked done. **The owner may change either cadence** — that
> was the standing instruction, and the numbers are an argument about batching rather than a
> finding.

**Owner (D7a, 2026-09-22): yes, but not this round.**

**What it is:** two rows in the existing reminder catalogue — an **exterior lighting check** and
a **lock / alarm test**. The catalogue already carries eight recurring tasks on the same
mechanism, including a smoke/CO alarm test, so this is a list addition rather than a feature.

**Where it came from:** Round 35b's crime memo. Working through whether a crime reading could
end in a homeowner action showed that the *action* is worth having and the *data* is not — the
advice is correct whatever any crime figure says, which is precisely why it needs no crime feed,
no probe and no new data domain.

**Constraints it inherits:** the reminder engine's own grammar. A cadence in days, a task a
homeowner can mark done, and copy that stays inside the banned-phrase guard — conditions and
checks, never damage and fix. Nothing here implies a threat or references an area.

**Decision needed:** the two default cadences, and whether the pair ships as one item or one at
a time.

**Scope → unscheduled, small.**

### 14 · The condition eyebrow's label is longer than its pill

**Owner's, to write — copy, not type.** Logged from Round 36; no replacement copy is proposed
here.

**What renders:** `/home/`'s condition card carries `{alert.label} · condition detected` as its
eyebrow. Four alert labels exist — Freeze, Hail, Extreme heat, and Heavy rain and flooding — so
four strings are possible, and the one a reader sees depends on which condition fired.

**Measured** at the 12px label size Round 36 restored, by substituting each label into the real
pill and counting its rendered line boxes (not by calculating widths — an arithmetic check
disagreed with the render by a pixel, and the render is what a reader sees):

| eyebrow | 390px | 360px | 320px |
|---|---|---|---|
| FREEZE · CONDITION DETECTED | 1 line | 1 line | 1 line |
| HAIL · CONDITION DETECTED | 1 line | 1 line | 1 line |
| EXTREME HEAT · CONDITION DETECTED | 1 line | **2 lines** | **2 lines** |
| HEAVY RAIN AND FLOODING · CONDITION DETECTED | **2 lines** | **2 lines** | **2 lines** |

So two of the four fit everywhere, one wraps below the design width, and **the longest wraps at
the design width itself**. Nothing clips at any width — a wrapped eyebrow is legible, just two
lines of a shouting label where one was intended.

**Why type cannot fix it.** At the previous 15.04px every one of these was worse; the label size
removed wraps rather than causing them (item 12). Going smaller than the label token would break
the type scale, which BRAND.md does not permit buying a fit with. The string is longer than the
column, and only the string can change.

**Constraint on whatever replaces it:** it is rendered by `.card-tag`, shares that pill with two
other eyebrows, and is uppercased by CSS — so it is read at roughly 1.4× the character width of
its source, and a replacement should be judged at 320px with the longest alert label, not at
desktop with the shortest.

**Decision needed:** the replacement wording, from the owner.

**Scope → unscheduled, copy.**

---

### 15 · Metro expansion — Fort Worth is the only viable candidate

**Measured in Round 39** (`docs/audits/round-39-metro-expansion-probe.md`), against the seven
metros the round named. Carrying the findings here so the sequencing decision does not need the
audit reopened.

**Verdict, in one table:**

| Metro | Verdict | The deciding fact |
|---|---|---|
| Fort Worth | **FULL** | 1,616,404-row permit feed, CC BY 4.0, modified the day of the probe, with a real date field and trade mix above Austin's. |
| Dallas | **NOT VIABLE** | Building permits stop in 2020 (52,037 rows dated 2019, 27,459 dated 2020, zero after). The only live permit data is right-of-way work. |
| Houston | **NOT VIABLE** | `data.houstontx.gov` disallows `/api/` and `/datastore/*` to `User-agent: *` — both CKAN machine-readable routes. No alternate publisher found. |
| New Braunfels · San Marcos · Round Rock · Kyle | **ALREADY SERVED, minus permits** | Their ZIPs are in the committed crosswalk today and already get every weather signal. None publishes a permit feed. |

**The corridor is not an expansion question.** 78130, 78132, 78666, 78664, 78665, 78681 and 78640
already resolve to Austin or San Antonio and are already drought-county-granular. A homeowner in
any of the four gets the full weather, drought, storm, hail, air-quality and cooling-load read
today. The only gap is city-issued permits, which none of them publishes.

**What Fort Worth would cost.** Not config-only. Roughly 15 files, of which:
a new `fortWorthPermits.ts` (ArcGIS GeoServices — a third API shape after Socrata and CKAN);
a trade mapping in `tradeCategories.ts`; the `"austin" | "san-antonio"` union widened in eight
fetchers; new crosswalk rows for the DFW MSA cut from the owner's Census file (**owner seam**);
and a CC BY 4.0 licence notice that is stricter than what the Austin and San Antonio data pages
carry today.

**Blockers to settle first, both Rule 1:**

1. **`site/src/lib/account/alerts.ts:134` silently mislabels a third metro.**
   `areaId === "san-antonio" ? "San Antonio" : "Austin"` — a Fort Worth alert would read
   "Austin". It typechecks and builds. **Fix this before any metro is added**, not during.
2. **`Owner_Full_Name` is in the Fort Worth feed.** Must be an explicit exclusion in the fetcher,
   never an oversight.

**Also noted, unrelated to expansion:** the NWS forecast fetcher is **Austin-only**
(`Record<"austin", …>`); San Antonio was never wired to it.

**Decision needed:** whether to add Fort Worth at all, given that it makes "Austin & San Antonio"
stale in the nav and arguably in the brand — a positioning question, not a data one. Houston and
Dallas need no decision: they are not available, and Houston's is reversible only by an approach
to the city, not by code.

**Scope → unscheduled, medium (one metro ≈ one round, plus the two blockers first).**

---

### 16 · ✅ CLOSED by Round 41b — Nav named two metros, in owner copy

**Owner's, to write — copy, not code.** Logged from Round 40; no replacement copy is proposed
here.

`site/src/components/Nav.astro` carries two things a third metro would contradict:

1. The **Locations dropdown**, which lists Austin and San Antonio as two literal `<a href>`s.
   Deriving it from the locations collection is a one-line change.
2. The **eyebrow string** `"Austin & San Antonio • more Texas metros coming soon"`. This is copy,
   and CLAUDE.md freezes copy once provided.

Round 40 left **both** alone on purpose. Deriving the dropdown while leaving a line that names
exactly two metros would make the page disagree with itself — the dropdown would show three, the
line above it would say two. The two have to move together, and the line is the owner's to write.

**CLOSED.** The owner supplied `Central Texas • more metros coming soon`, and Round 41b shipped
it with the dropdown change — San Marcos and New Braunfels now sit under their metros.

**Scope → blocked on copy, then small.**

---

### 17 · The NWS forecast fetcher is Austin-only — affects live accounts now

⚠️ **THIS IS A GAP IN THE LIVE PRODUCT TODAY, NOT A THIRD-METRO ISSUE.** Owner's framing on the
Round 40 approval, recorded here so the item is never read as expansion work: every San Antonio
account on the live site is currently unable to receive a freeze or extreme-heat alert, and has
been since those alerts shipped. Nobody is waiting on Fort Worth for this.

Found in Round 39, confirmed in Round 40. `site/src/ingest/fetchers/nws.ts` is typed
`Record<"austin", …>` and exports only `nwsAustin`. **San Antonio was never wired to it.**

This is not a third-metro gap — it is a gap in the second metro. `nws-api` is the feed the freeze
and extreme-heat alerts read (`lib/account/alerts.ts`), and the heat-load signal names it when it
is missing: *"No National Weather Service forecast feed for {area}."* So San Antonio accounts
cannot currently receive a freeze or heat alert.

Round 40 did not touch it: wiring San Antonio means ingesting a feed that is not ingested today,
which is new data and a behaviour change, and that round's constraint was that nothing moves.

**Decision needed:** whether San Antonio should have forecast-driven alerts. If yes, this is
small — the fetcher already resolves its gridpoint from a lat/lon, and the centroid is in
`ZIP_AREAS`.

**Scope → unscheduled, small.**

---

### 18 · Two sweep steps fail on a clean tree

Found in Round 40 while establishing a baseline. Both fail on `main` with no changes applied, so
`npm run sweep` has read **26/28** for some time and the two failures are invisible as signal.

- **`weeklyunit`** — `scripts/replays/weeklyunit.ts:34` reads `/tmp/austin.bak.json`
  unconditionally. That file is a leftover from an earlier run on the same machine; in a fresh
  container it does not exist and the unit dies with `ENOENT`. A gate that passes only when `/tmp`
  happens to hold state from a previous run is not a gate.
- **`r9render`** — fails identically on a clean tree. Not diagnosed.

This matters beyond the two tests: a sweep with standing failures trains everyone to read
"26/28" as success, which is exactly how a real regression gets through.

**Scope → unscheduled, small. Do this before the next round that relies on the sweep as a gate.**

---

### 19 · Drought pages: show all metro counties, or keep one?

Round 41a fixed the live defect by scoping each drought page to the county its copy already
names (`docs/audits/round-41a-drought-county-fix.md` §5). That was the minimal correct change:
it made approved copy true without needing new copy.

**The open question is whether it is the right page.** The file holds three counties per metro
and the fix now hides two of them. An Austin reader arguably wants Hays and Williamson alongside
Travis — it is more data, correctly labelled, from a feed already ingested.

Option B was built and measured in 41a. It renders 68 rows and resolves every county, but it is
**not a config change** — it needs three decisions, and all three are copy:

1. **The lede.** "recorded for Travis County" has to become a claim about several counties.
2. **The headline stat.** B does not fix the tie-break: three rows still share the newest date,
   so it needs an explicit "the primary county's latest" rule on top. `datascopeunit` §3 fails
   on B as drafted.
3. **Every "weeks" figure.** B still says "68 of the 68 weekly readings" over a 58-week window,
   and "57 weeks reached D2 or worse". Those count county-weeks. Under the shipped fix they are
   58 and 54 and simply correct; under B each needs re-framing.

**Also worth knowing before deciding:** the neighbouring counties are thin. Travis and Bexar
have **58 weekly readings**; Hays, Williamson, Comal and Guadalupe have **5** each
(2026-08-25 → 2026-09-22), because they were only added to the ingest recently. A three-county
page would be one long series and two short ones.

**Decision needed:** whether to do this at all, and if so the replacement copy.

**Scope → blocked on copy, then small.**

---

### 20 · ✅ CLOSED by Round 41d — two shipped fetchers requested robots-disallowed paths

**Found in Round 41c** (`docs/audits/round-41c-per-location-feeds.md` §0), by applying Round 39's
robots guard to hosts the production ingest already uses. ~~Your ruling is needed before any per-location work on these two feeds can proceed.~~
**CLOSED — no ruling was needed.** Round 41d found a permitted path for both: the identical SWDI
web service on the NCEI host, whose robots carries no `/swdiws/` rule, and NCEI's Access Data
Service with `includeAttributes=true` for monthly normals. Both were moved and proven equivalent
value-for-value, with nothing published changing. See
`docs/audits/round-41d-robots-allowed-paths.md`. The evidence below is kept as the record of
what was wrong and how it was found.

**1 · `swdiHail.ts`.** `www.ncdc.noaa.gov/robots.txt`, `User-agent: *`, contains
`Disallow: /swdiws/` and `Disallow: /*.csv`. The fetcher requests
`https://www.ncdc.noaa.gov/swdiws/csv/nx3hail/…`, matched by both. This feed publishes on
`/data/austin/roofing/` and `/data/san-antonio/storms/`.

**2 · `noaaClimate.ts`.** `www.ncei.noaa.gov/robots.txt`, `User-agent: *`, contains
`Disallow: /data*`, with the only `Allow:` being `/data/oceans/coris/library*`. Exactly one of
the fetcher's four NCEI URL families is caught: `data/normals-monthly/1991-2020/access/` — the
index and every station's normals CSV. The GSOM observations (`/access/…`), the GHCND station
table and the storm-events listing (both `/pub/data/…`) are all permitted.

**Nothing was changed.** Changing either breaks a live reading, and the decision is not Claude's.

**The tension is real and worth stating both ways.** Round 37's correction established that this
project treats `robots.txt` as binding; Round 39 made it a mechanism. Against that: `swdiws` is
*SWDI Web Service* and the Access Data Service is likewise published for programmatic use, and a
scheduled API client is arguably not a crawler. Either position is defensible. **The current
state — a written standard saying one thing while two shipped fetchers do another — is not.**

**Decision needed:** narrow the standard to say it governs crawling and not documented web
services (and record that), or change the two fetchers and accept losing the hail count and the
cooling-load normals. A third path exists for NCEI specifically: ask NOAA whether an alternate
normals endpoint outside `/data*` is published.

**Knock-on:** Round 41c could not measure whether the station 5.2 miles from New Braunfels has a
usable 1991–2020 normal, because that check reads the disallowed path. Per-location cooling load
is blocked behind this item.

**Scope → blocked on your ruling, then small for the standard / medium for the fetchers.**

---

### 21 · Per-location feeds: only Census ACS passes, and it needs 41b first

Round 41c measured whether four per-metro feeds can resolve per location.

| Feed | Finer grain? | Nearest real source to NB / SM | Blocked on |
|---|---|---|---|
| **Census ACS** | **yes — `for=place:`** | the city itself | **41b's location entity** |
| Cooling load | yes — station id | **5.2 mi / 4.2 mi** | item 20 |
| Hail | yes — `bbox` already | n/a | item 20, **and box geometry** |
| Air quality | yes — `zipCode` already | **no monitor within 25 mi** | nothing to build |

**Census ACS is the one clean pass**, with **five vintages (2019–2023)** at city grain. It is not
a relabelled county figure: San Marcos city is **30% owner-occupied against Hays County's 64%**.
It is unbuilt only because `censusAcs.ts` writes `census-acs/{location}.json` keyed by `AreaId`,
and a place is not an area — giving New Braunfels an `AreaId` would make it a metro.

**Air quality is a dead end, not a blocked one:** 78130, 78132 and 78666 return no rows at all.
78640 (Kyle) returns a reading and it is **Austin's** — AirNow answers by *reporting area*, so if
this feed is ever extended it must publish `ReportingArea` as the label.

**Hail needs a second decision beyond item 20:** `BOX_PAD_DEGREES = 0.5` is a ~69-mile box, and
New Braunfels sits 29.6 miles from the San Antonio point. Two such boxes would count mostly the
same storms. Per-location hail requires shrinking the pad, not just moving the centre.

**Scope → ACS is small once 41b lands; the rest waits on item 20.**

---

### 22 · Unresolved: does a blank line end a robots.txt group?

Round 41d, §3. Round 41c changed the probe guard so a blank line closes a group. That rests on a
contested reading of RFC 9309, whose ABNF (`startgroupline+ *(rule / emptyline / commentline)`)
allows empty lines inside the rule section but is silent on one between two `User-agent:` lines.
**Google's reference parser does not treat blank lines as separators.**

Under Google's reading, `www2.census.gov` — `User-agent: *`, blank, `User-agent: RavenCrawler`,
`Disallow: /` — refuses everything for `*`, which is what the pass-1 parser concluded before it
was "fixed".

**It changed no verdict in 41c or 41d**: both NOAA files put rules immediately after
`User-agent: *`, so the two readings agree on every path either round touched, and 41d verified
that explicitly rather than assuming it. The Gazetteer fetch in 41c is the only call whose
outcome depends on it.

**Decision needed:** which reading the project adopts, written down once. Worth resolving before
any future probe leans on the permissive one.

**Scope → unscheduled, small.**

---

### 23 · Per-location hail needs the bbox pad shrunk, not just re-centred

Out of scope for 41d, raised by 41c. `swdiHail.ts` sets `BOX_PAD_DEGREES = 0.5` — a ±0.5° box,
roughly 69 miles across — around a metro point. New Braunfels sits **29.6 miles** from the San
Antonio point and San Marcos **29.6 miles** from Austin's, so two such boxes would share most of
their area and count largely the same storms.

Moving the centre alone would produce two "local" counts whose difference is an artefact of box
placement rather than of weather. **Per-location hail requires a smaller pad**, and the existing
`areaBasis` note — "signatures near the city, never in Travis County" — has to be restated per
city.

**Decision needed:** what pad, and on what basis. A pad is a claim about what "near" means, so
it wants a reason rather than a round number.

**Scope → unscheduled, small, but blocked on the pad decision.**

---

### 24 · ✅ CLOSED by Round 41b — cooling load: New Braunfels has a station, San Marcos does not

Round 41e measured this against the existing bar in `noaaClimate.ts` — `USW` within 0.35°, must
carry `years_`, 12/12 months, zero months flagged `E`, zero months under 10 years — and verified
the probe reproduces what the site ships today, Kelly AFB's `years=2, comp_flag=E` rejection
included. See `docs/audits/round-41e-corridor-cooling-load.md`.

| City | Verdict | Station | Distance |
|---|---|---|---|
| **New Braunfels** | **PASS** | USW00012971 | **5.2 mi** — nearer than San Antonio's own (6.0) |
| **San Marcos** | passes the rule; **recommend withholding** | USW00012971 | **12.9 mi** — New Braunfels' station |

**New Braunfels gets a real reading:** 17–20 years of record, no estimated months, 141 monthly
GSOM actuals (2015-01 → 2026-09), and an annual 3,144 CDD against Austin's 3,290 and San
Antonio's 3,474 — measurably different from both, not a relabelled metro figure.

**San Marcos is the honest no.** Both stations named San Marcos — Gary AFB (4.2 mi) and San
Marcos Muni (4.5 mi) — publish **no 1991-2020 monthly normals** at all. What the rule returns
instead is New Braunfels' station 12.9 miles off, so two city pages would show one identical set
of twelve numbers. Recommended wording is in the audit §6.

**✅ BOTH DECIDED AND SHIPPED IN ROUND 41B.** San Marcos is withheld with a stated reason,
enforced in code — `locationSite()` throws for a location with no `climateStation`, so it cannot
be registered by accident. The station's NOAA name `AUSTIN SAN ANTONIO` never renders; the card
leads with the distance, and both the name and the id are asserted absent from the page's HTML.
See `docs/audits/round-41b-corridor-locations.md`. The two questions as originally posed:

1. **Whether to publish San Marcos at all.** If yes, the defensible form labels the reading by
   station and distance rather than by the city — the discipline 41a established.
2. **The station's published name is `AUSTIN SAN ANTONIO`.** On a New Braunfels page a source
   line naming it would read as an error. The name is NOAA's; whatever renders it has to lead
   with the distance or carry the id without the name.

~~Blocked on 41b~~ — unblocked: Round 41b gave `noaaClimate.ts` a *site* rather than a metro id,
so a city is now a config row.

**Scope → done.**

---

### 25 · `/new-braunfels/` and `/dashboard/78130/` disagree about the same ZIP

Round 41b. The city page publishes **Comal County** readings. The ZIP dashboard for 78130 —
which is New Braunfels' main ZIP — publishes **Bexar County** readings, because the dashboard
resolves a ZIP to its metro and then reads that metro's primary county.

**The city page is the more accurate surface.** 78130 is in Comal County, and Comal is what the
city page measures.

**This is inconsistent, not false**, which is why it can wait. The dashboard's own copy already
tells the reader exactly what it is doing, verbatim:

> 78130 is in Comal County. The readings shown are for Bexar County, which is the county we
> publish for the San Antonio metro — so they describe nearby conditions rather than Comal
> County itself. This ZIP spans 2 counties in the metro. It also crosses the Austin–San Antonio
> metro boundary; we report it under San Antonio.

plus a separate boundary note naming both metros. A reader is not misled; they are told less
than the city page could tell them.

**Not reconciled in 41b** — the dashboard reads per-metro artifacts, and pointing a ZIP at its
own county's readings is a change to how every ZIP resolves, not a change to one page. That
wants its own round and its own verification.

**Decision needed:** whether the ZIP dashboard should prefer the ZIP's own county where one is
ingested (Comal, Hays, Williamson and Guadalupe all are), falling back to the metro's primary
county otherwise — and what that does to the 52 of 231 crosswalk rows where the two differ.

**Scope → unscheduled, medium.**

---

### 26 · ✅ RESOLVED by Round 43 — fabricated seed rows survived retirement

*Kept as logged by Round 42, when it was live. The closure record is the item 26 below.*

Round 42, found while tracing an unexplained row in `census-acs/austin.json`. Full evidence in
`docs/audits/round-42-acs-vintage.md` §5. **Present on `main`, not introduced by any branch.**

Nine rows across eight generated datasets, all written by one bootstrap run at
`2026-08-23T07:05:17`, all carrying values byte-identical to `seed.ts`'s `GENERATORS`, and
**none carrying `seed: true`** — so `runIngestion`'s `filter((o) => !o.seed)` has never retired
them and never will.

**The one that is published.** `eia-electricity/texas.json` is `status: live`, its real EIA
series stops at **2026-05**, and its three newest rows — 2026-06/07/08 at 13.58 / 13.73 /
13.88¢ — are the last three values of the deterministic seed series, reproducible by re-running
`mulberry32(seedFromString("eia-electricity/texas"))`. `latest()` takes the newest, so **13.88¢
renders on eight built pages**: the homepage (under a **LIVE** badge, "Latest (August 2026)",
sourced to the EIA), `/data/texas/electricity-prices/` (including "about $139 a month on a
1,000 kWh bill", the FAQ "the most recent month the EIA has published", and the CSV), both
`/{metro}/hvac/` pages, `/tools/ac-lifespan/`, `/analysis/`, and
`/analysis/are-texas-electricity-prices-still-going-up/` — whose answer "No" rests on "down
10.2% year over year" and "a 17.4% fall in one month", both artifacts of the seed tail sitting
~2.5¢ below the real series.

**Why three guards all miss it.** `verify-content.mjs`'s `looksSeeded` and
`purge-seed-observations.mjs`'s `isSeed` are the same test: `seed === true`, a `sample-` key
prefix, or the literal `SAMPLE` in the value. The purge calls those "the two fingerprints
`seed.ts` has **always** written" — false. Only `noaaStormEvents` and `municipalPermits` write
the prefix; `eiaElectricityPrice` and the `single()` helper write a bare `monthKey`. Only three
of the ten `single()` feeds embed SAMPLE. **Eight of the thirteen generators carry neither
fingerprint.** The proof is the single counter-example: `fema-nfhl/austin.json` holds the only
`seed: true` row left in the tree, and it is the one whose value says `"X (SAMPLE)"`.

`verify-content` passing is therefore not evidence these rows are absent.

**The rest do not render today** — `census-acs/austin`'s 34 yrs / 58%, `nws-api/austin`'s
96/74°F, `airnow/austin`'s AQI 42, and three `status: sample` files that `latest()` correctly
withholds. But that is position, not protection: `eia-electricity` is what happens when a real
feed stalls and a fabricated row becomes the newest, and `nws-api` and `airnow` are one outage
away from it.

**Fix, not applied:** (1) delete the nine rows — the purge script cannot find them; (2) widen
the fingerprint at source so it cannot recur, by having `seed.ts` write a `sample-` prefixed key
from *every* generator, and correct the comment that claims it already does; (3) re-run the
gates. This removes a published figure from the homepage, a data page, a CSV and an indexed
analysis article, so it is the owner's call.

**Scope → own round, urgent.**

---

### 27 · `EXCLUDED_INPUTS` still says census-acs is Austin-only

Round 42, one line. `src/lib/stressIndex/config.ts` excludes `census-acs` because "it is a metro
median and **we only hold it for Austin**". Since 41b we hold four files — Travis, Bexar, Comal
and Hays — so the stated reason is stale even though the exclusion may well still be right (the
grain argument stands on its own; the availability argument no longer does).

Trivial, but it is a reason-of-record for excluding a signal from a published score, so it
should say something true.

**Scope → trivial, bundle with any stress-index round.**

---

### 26 · ✅ CLOSED by Round 43 — closure record for item 26 above

*Numbering: this is the closure of the item 26 immediately above, which Round 42 logged and
Round 43 fixed. The two were written on branches that merged in the opposite order to the one
they were done in, and they are kept side by side rather than collapsed — the finding and its
resolution are both worth reading.*

Round 43 removed them. **The count was ten, not nine** — `airnow/san-antonio.json` was seeded on
2026-08-24 and Round 42's scan anchored on 2026-08-23, so its inventory missed one. Seven rows
deleted from live datasets, three tagged and kept as marked placeholders in sample datasets, one
(`fema-nfhl`) already correct.

Detection no longer describes `seed.ts`, it executes it: `seedObservationsFor()` regenerates a
generator's exact output for any run date, and a row is seed output iff some run date reproduces
its key and its value. `scripts/replays/seedunit.ts` asserts it on every sweep, with a positive
control over every generator and a §5 that re-runs the dead fingerprint test to prove it still
misses 22 of 71 rows. Full inventory and the page-by-page before/after in
`docs/audits/round-43-seed-contamination.md`.

**Two things from this item remain open, and both are the owner's — see item 29.**

---

### 28 · The ledger's `data` tier means "traces to the dataset file", not "traces to the source"

Round 43. The claim ledger is sound as a mechanism and it worked exactly as specified — the
specification is the gap.

`data` is defined in each ledger's header as *"traces to the feed."* The electricity article's
C1 ("13.88¢/kWh in August 2026") did trace to the feed: the fabricated row was in
`eia-electricity/texas.json`. **A seed row satisfies the `data` tier by construction**, because
the tier verifies provenance to the THI dataset file rather than to the upstream agency.

Three `derived` claims then inherited it with arithmetic that is all exactly correct —
13.88/15.46, 13.88/16.99 and 13.58/16.44 each give the stated percentage to one decimal. Correct
arithmetic on a fabricated input is still a published falsehood, and `derived` has no way to
notice.

The verification method cannot catch it either: Round 38 established figure checking by **string
match against the ledger** ("32 distinct figures, 0 missing"). A figure that is in the ledger and
in the dataset passes every check that exists.

`seedunit` now stops a fabricated row reaching a dataset file at all, which closes this route in
practice. It does not close the definition — anything else that gets into a dataset file wrongly
would still clear the `data` tier.

**Options, not chosen:** have the ledger tooling call `reproducibleFromSeed()` so `data` requires
a row that is not reproducible from `seed.ts` (cheap, and already implemented); or carry the
row's `ingestedAt` and the feed's `status` into the ledger entry so a reader can see what was
verified; or simply state the tier's real meaning in the header so nobody reads more into it.

**✅ CLOSED by Round 49** — and the premise needed correcting first: `data` did not assert
"traces to the dataset file" either. `verify_ledger` checked a known tier string, a non-empty
source, and an `as_of` that parsed and was in bounds. Nothing in `claim_ledger.py` ever opened a
dataset file, and `article_engine._metric` — the one function that would have tied a claim to the
feed — had no caller.

What landed: the tier docstring and `/methodology/` say what `data` means; transcribed claims are
re-asked at their source at publish time through the project's own fetcher, raising on a
disagreement and failing open with a loud record on an unreachable source; a `verified` field
records which of the three happened, set by the engine and never by a builder; `official` was
given a mechanical meaning it did not have (`timeless` plus a document a reader can open), having
run checks identical to `data` until then; and aggregated figures were deliberately NOT given a
provenance tier they cannot earn. See `docs/audits/round-49-ledger-tier.md`.

---

### 29 · ✅ CLOSED on the site side — withdrawn, card deleted, correction published

Round 43 plus its follow-up. Everything on THI itself is done; the only thing left is the
Facebook post, which the owner is correcting directly.

**The article is withdrawn.** `published: false` removes its route, sitemap entry, hub listing
and every internal link. Its URL returns **410 Gone** rather than 404 — it was published and
indexed, and 404 would tell a crawler it might come back. Implemented as
`src/data/withdrawnArticles.ts` plus an SSR rest route under `/analysis/`, asserted by
`scripts/replays/withdrawnrender.mjs` (31 checks): the 410 and its body, that all five published
articles and the hub still return 200, and that an unknown slug still gets 404 — a typo is not a
retraction.

**The OG card is deleted**, with its sidecar. `/images/og/are-texas-electricity-prices-still-going-up.png`
was a static asset in `public/`, unaffected by `published: false`, and served **200** with the
figure as pixels — which a text grep structurally cannot see. `withdrawnrender` now asserts its
absence by path. Owner's call and owner's reasoning: *"a fabricated figure on a 200-serving URL
is worse than a broken image on a post I'm about to correct anyway."*

**The public correction note is published** at `/methodology/`, extending its own
*"Do you ever publish placeholder numbers?"* answer — which until now claimed bootstrap rows
"are retired automatically the first time a real fetch succeeds", the clause this incident
disproves. Both changes shipped together.

**The window in the note is 28 August to 1 October 2026**, verified from the deploy history
rather than from when the row was written. On 23 August nothing rendered: the dataset was
`status: sample`, and both `publishable()` and `latest()` withhold a sample dataset, so the data
page did not exist and no page carried a reading. The first published surface was
`/data/texas/electricity-prices/` and its CSV, the day that page shipped. §9 of
`docs/audits/round-43-seed-contamination.md` has the commit-by-commit derivation — and corrects
a premise of Round 42's §5 along the way: the claim that this repo's history begins 2026-09-11
was an artefact of a **shallow clone**, not a fact about the repo.

**The retracted figure now appears in exactly one built file — `/methodology/` — and that is
deliberate.** A correction that will not name the number it retracts is not a correction.
`withdrawnrender` §5 asserts precisely that: 13.88¢ appears once, on that page, in retraction
framing, beside the corrected figure; and the three derived percentages appear nowhere at all. A
later round reading a bare grep hit as a regression would delete the record, so the invariant is
encoded rather than remembered.

**Deliberately left:** `autoposter/tests/test_card.py` holds the figure in an inline fixture and
`autoposter/articles/…/facebook-promo.json` records the post. Neither is served; the second is
the audit trail of the post itself.

**Scope → done, except the Facebook post, which is the owner's and in hand.**

---

### 30 · San Antonio's seven service pages get no footer link while Austin's do

Round 46, logged by the owner as a separate decision rather than a fix: it changes the site's
internal linking on **KPI #1**, so it is a direction call, not a cleanup.

`Footer.astro:115` renders a `Services` column by mapping `orderedServices` over
`/austin/${svc.id}/` — **Austin only, seven links.** Both metros have all seven service pages
built (verified in `dist/`), so San Antonio's seven are reachable from no footer at all.

The column's own Round 10b comment justifies keeping it on the grounds that "the individual
location x service links STAY: those are **the fourteen** indexed content pages, and dropping them
would cut a third of the site's internal linking to nothing (KPI #1)." The rationale invokes
fourteen pages; the column links seven. Either the comment overstates the column or the links are
missing — and since the rationale is explicitly about internal linking for citation, Round 46's
reading is that **the links are missing and the comment is right about intent**.

**The decision this needs:** whether a fourteen-link footer column is the right shape, or whether
San Antonio's seven belong somewhere else — the metro hub already links its own services, and a
fourteen-item column is a different piece of chrome from a seven-item one. Not whether the pages
deserve links.

**Scope → small, wants a decision first.** Related: Round 46 F12 (ROADMAP's "do not re-add or
link" forbids exactly what this column does, and the prose is what should change).

---

### 31 · An article is governed by its tightest metric, not by its subject

Round 48, logged by the owner rather than decided by a one-line widening — because the widening
that prompted it is a workaround and the rule underneath is a design question.

`claim_ledger` applies a per-metric staleness bound to **every claim in a piece, independently**.
The electricity article deliberately pins both of its series to one period, so every claim ages
together and "the staleness gate judges the article the reader actually gets". The consequence:
its cooling-degree-day **cross-check** claims carry the EIA's ~3-month-old month and are judged
against a bound set for NOAA's ~1-month lag. The article's own subject was inside its bound and
four supporting claims were not, so the whole piece halted — which is how `electricity-still-rising`
came to sit at rank 0, eligible and unbuildable, blocking four publishable articles.

The workaround applied in Round 48: `cooling_degree_days` widened 90 → 120 days to match the
price bound, so the oldest claim any article legitimately carries on that metric fits. It is
honest about *that* metric's own lag and it is not the rule.

**The rule this wants:** bound an article by its **primary** metric — the thing it is about, the
one its card and title name — and judge a cross-check against the lag of **its own** source,
flagged as supporting rather than load-bearing. A cross-check exists to answer an objection
("was it just a mild summer?"); an answer from a month that is three months old is still an
answer to that objection, because the objection is about the same month the price is from.

**Why it needs a decision and not a patch:** the alternative reading is that a piece is only as
current as its oldest claim, full stop, and that pinning two series to one period was the right
call precisely so a reader is never shown a July price beside a September temperature. Both
positions are defensible, and the widening above quietly chose neither. Whichever wins, the
losing argument should be written down in `claim_ledger` rather than inferred from a number in
`config.yaml`.

**Scope → medium, wants a decision first.** Touches `claim_ledger.verify_ledger`, the
`staleness_hours` table, and the two builders that carry cross-checks (power, AC-rush).

---

### 32 · Inline source-and-as-of is doing two jobs at once

Round 48, logged by the owner as a question rather than a fix. The trade it names is currently
the right one; what is not settled is whether it is the only available one.

G2 requires every claim's source and `as_of` to be visible on the artifact the reader gets, and
the article builders satisfy that by interpolating both into the prose at the point of use. On a
piece that cites three datasets about two metros, that produces a paragraph like:

> Austin recorded 644 cooling degree-days in July 2026 (NOAA NCEI Global Summary of the Month, as
> of July 2026), against a July normal of 644.8 cooling degree-days (NOAA NCEI U.S. Climate
> Normals 1991-2020) — -0.1% against the normal. San Antonio recorded 607 cooling degree-days
> (NOAA NCEI Global Summary of the Month, as of July 2026) against 643.3 cooling degree-days
> (NOAA NCEI U.S. Climate Normals 1991-2020) — -5.6% against the normal.

Four sentences, four parentheticals, the same two source names four times. **Owner reading
2026-10-12: leave it. Density is the price of inline sourcing and it is worth paying** — a
citable page is KPI #1, and a figure whose source is a footnote away is a figure a crawler may
lift without it.

**The question for later:** inline sourcing is carrying provenance AND readability, and those
pull against each other as a piece cites more datasets. There may be a presentation that serves
both — the source named once per paragraph with the repeats dropped, a sourced-figure component
that renders the attribution as markup rather than as prose, a per-article source block the
figures reference. Any of those has to keep G2 literally satisfied on the rendered HTML, not just
in the author's intention, which is the part that makes it a design question and not a styling
one.

**Scope → wants a decision first, then medium.** Touches every `write_*` builder, G2 in
`validator.py`, and the analysis route's rendering.

---

### 33 · C4 should say it governs machine-built articles only

Round 48, logged by the owner rather than changed, because the rule it would narrow is a real one
and narrowing it is a decision about what a card is allowed to be.

`autoposter/src/card.py` C4: *"the question is the article's H1, verbatim. A card that asks a
different question than the page answers is a bait card, however true both are."*

On 2026-10-12 a hand-authored article's card was given a shorter question than its H1 — the
59-character original overflowed the 1200x630 card, and the measured ceiling was 54 with that
subhead (at 59, no subhead length fits at all, down to 21). The card now asks "What does San
Antonio's police data cover?" while the page's H1 remains "What does San Antonio's police offence
data actually cover?".

C4 never saw it, because it only ever judges articles the ENGINE builds. **So the divergence is
permitted today by accident of scope rather than by design**, and the comment states a rule
broader than the code enforces — exactly the class Round 46 inventoried.

**The consequence, which is the reason this matters beyond tidiness:** the autoposter cannot do
what was done here. A generated title that will not fit has no escape but a shorter title,
because C4 forbids shortening the card question and the card gate then refuses. Measured headroom
on the tightest machine-built card today — the power article, question 49 characters, rendering
at 36px against a 32px floor — is **15 characters**, and its length is stable across months, so
this is headroom rather than a countdown.

**The decision:** either C4's comment says it governs machine-built articles only and names the
hand-authored case as the exception, or the rule holds everywhere and hand-authored cards must
shorten the H1 too. The owner's position as logged is the first, taken deliberately rather than
by amending a comment to match what the code happens to do.

**Scope → small, wants a decision first.** Related: Round 48 audit §7.

---

### 34 · ~~Our per-category permit counts sum to more than the city's distinct permits~~ — CLOSED, Round 50

Round 49 measured it and did not chase it; the owner scoped it as the next round rather than a
backlog line, because **it is a measured discrepancy on a published figure.**

Asked of the City of Austin, over the ingestion fetcher's own `$where` predicate, for 2026-09:

| | |
|---|--:|
| `count(1)` — rows | 4,233 |
| `count(distinct permit_number)` — permits | **4,233** |
| our per-category counts, summed | **4,434** |

The city's two numbers being equal confirms Round 45's finding from the source: Austin has
**0.00% duplication**. Ours is 201 higher.

**The likely cause is our own classifier**, not the city: `permitTradeActivity.ts` assigns a
trade from `permit_type_desc`, `work_class` AND description text, so one permit whose description
mentions both roofing and solar is counted in both categories. Round 45 measured *the city's*
`permit_type_desc` as spanning one type for every Austin permit — a different question from
whether OUR mapping assigns one category.

**Unverified.** That is the hypothesis, not the finding. The finding is the 201.

**Why it matters enough to be a round.** Nothing in the project states that the per-category
counts are not additive, and nothing measures the overlap. A reader adding up the trade table on
a data page — or an answer engine doing the same — gets a number the city would not recognise,
and we would have no way to explain it. The same question applies to San Antonio, which cannot be
asked at the source at all (a 27.9 MB CSV with no server-side aggregate), so there it is only ever
answerable on our side.

**What the round should settle:** whether the overlap is what we think, how large it is per month
and per metro, whether any rendered page or article sums the categories, and whether the fix is a
stated caveat, a deduplicated total alongside the per-trade counts, or a classifier that assigns
one trade per permit.

**Scope → medium. Measurement first, then a decision.** The Socrata cross-check is one request
and ~230 ms (`docs/audits/round-49-probe.json`).

**CLOSED by Round 50** (`docs/audits/round-50-permit-overlap.md`). Three corrections to the
framing above:

1. **The 201 was wrong — it is 344 (8.41%).** The 4,233 came from a window that was September
   *plus 2026-10-01*: Socrata's `between` is inclusive at both ends. Measured and confirmed to
   the permit (W1–W3).
2. **The hypothesis was right about the mechanism and wrong to call it a defect.** Austin's
   overlap is the description-text paths crossing the permit-type path, and the classifier's own
   comment already says so: a rooftop solar install filed as an Electrical Permit is electrical
   by class and solar by the city's words. Both counts are correct. Only the *sum* is meaningless
   — and nothing publishes a sum.
3. **San Antonio overlaps too, by a different mechanism entirely** — one commercial project
   number carrying electrical, mechanical and plumbing sub-permits. 3.3–7.5% a month. Not an
   error of ours: the city is saying the project involves three trades.

Additivity has never held in either metro in any month (Austin 3.1–9.6%, SA 3.3–7.5%). No reader
has seen a cross-trade sum, because none is published anywhere. The open decisions are item 35
(the live solar defect the round turned up) and the additivity options in §7B of the audit.
