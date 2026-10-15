# Round 53 — would a description fingerprint have caught the storage break?

Date: 2026-10-15 · Branch: `claude/thi-plan-review-m40n0x`, from `origin/main` at `27f9925` (the
Round 52 merge).

**MEASURE ONLY. Nothing is built and nothing is wired into ingestion.** The probe
(`site/scripts/audits/round-53-shape-fingerprint.ts`, run on Actions, commits its own
measurement) and the offline rule sweep (`round-53-fingerprint-rules.ts`) are both audit tools.

---

## The answer

**Yes — one rule, and it would have fired at the time, not only in hindsight.**

> Fire when, against the trailing three months of the same category, the **top description shape's
> share at least doubles** AND **distinct shapes per permit falls to 0.8× or less**.

| | fires? | numbers |
|---|---|---|
| `energy_storage` / **2026-07**, today's mapping — the break | **yes** | top share 58.6% vs 14.2% trailing (**4.12×**); shapes per permit 0.414 vs 1.000 (**0.41×**) |
| `v2_solar` / **2026-07** — the series actually being watched in August | **yes** | top share 18.3% vs 6.2% (**2.97×**); shapes per permit 0.688 vs 0.877 (**0.78×**) |
| every other cell — 6 categories × 10 complete months | **no** | 60 evaluable cells, **zero other fires** |

Three things qualify that, and all three are in the detail below: **half of what I proposed does
not work** (vocabulary novelty never sees it); **the margin at the time was thin on one of the two
axes** (0.78 against a 0.8 threshold, where the nearest innocent cell sits at 0.79); and it covers
**6 of the 13 permit series** and only the class of change that templates wording.

---

## 1 · What was measured

One Actions run, one request path — `recountWindow` → `fetchAustinTradeRows` → `classifyAustin`,
the same three pieces the ingest uses (Round 49's per-request rule).

| | |
|---|---|
| window | 2025-09-01 → 2026-10-15, the ingest's own 13-month recount window |
| rows | **47,599** read, server `count(1)` **47,599**, **0** unclassified |
| cells | 84 (category, month); **60 evaluable**, 24 not — 18 lack three prior months for a baseline, 6 are the partial month `2026-10`, which the readers already drop |
| categories | electrical, energy_storage, hvac, plumbing, roofing, solar |
| plus | `v2_solar`, the pre-Round-50 bucket, reconstructed — see §3 |

Per cell, ten numbers: `permits`, `withDescription`, `emptyDescriptions`, `distinctShapes`,
`shapesPerPermit`, `topShapeShare`, `top3ShapeShare`, `distinctTokens`, `newTokenShare`,
`jaccardVsTrailing`. A "shape" is the description lowercased, with every run of digits collapsed to
`#` and whitespace squeezed — so *"BATTERY STORAGE 13.5 KWH"* and *"battery storage 27 kwh"* are
one shape. **The hashes used to group them are discarded; so are the tokens.** §6 is the argument
that this meets the design constraint rather than approximating it.

---

## 2 · Question 1 — would it have fired in July?

The break month, beside the control:

| cell | permits | count move | top shape share | shapes per permit |
|---|---|---|---|---|
| `energy_storage` **2026-07** | 29 | **+123.1%** | **58.6%** (trailing 14.2) | **0.414** (trailing 1.000) |
| `solar` **2026-04** | 72 | **+125.0%** | 5.6% (trailing 8.1) | 0.889 (trailing 0.879) |

**That is the whole finding in two rows.** Two months with nearly identical count moves — +123% and
+125% — and opposite fingerprints. The count cannot tell them apart; it is the same number. The
fingerprint says one month's descriptions collapsed onto a handful of templates while the other's
stayed as varied as they had been. *That* is the discriminator the count never had, and it is why
the August story was wrong: we read a templating change as a surge, and there was a measurable
difference between the two all along.

A control has to say what it could not have seen (standing rule): `solar/2026-04` is one cell, and
it is the only evaluable cell whose count move is within 20 points of the break's. It is not a
sample of "genuine surges" — it is the only comparable one the window contains.

---

## 3 · The harder reading of question 1 — would it have fired *then*?

Today the storage rows are their own category. **In August they were not.** `trades-v2` mapped the
whole `Auxiliary Power` work class into `solar`, so the templated rows arrived diluted by every
genuine solar permit — 29 of 93 in July. The detector would have been watching that bucket, not
this one.

So the probe reconstructs it: `v2_solar` = today's solar classification ∪ every `Auxiliary Power`
row, which is exactly the one line Round 50 removed. Nothing else about solar changed in that
commit (`AUSTIN_SOLAR_TEXT` and the permit-type map's solar entries are byte-identical across it),
so this is a set union over the current classifier rather than a second copy of the old one — a
re-implementation would be a second definition that can disagree with the first.

| `v2_solar` | permits | top share | ratio | shapes per permit | ratio |
|---|---|---|---|---|---|
| 2026-04 | 79 | 5.1% | | 0.899 | |
| 2026-05 | 48 | 8.3% | | 0.833 | |
| 2026-06 | 79 | 5.1% | | 0.899 | |
| **2026-07** | 93 | **18.3%** | **2.97×** | **0.688** | **0.78×** |
| 2026-08 | 224 | 59.8% | 5.66× | 0.362 | 0.45× |

**And at the time, the count showed nothing.** Under `trades-v2` July's solar count moved
**+17.7%** — 79 permits to 93, the sort of month-to-month wobble the noise floor exists to
dismiss. The templated block was inside it, and the fingerprint moved **2.97×** on the same rows.
That is the case for this thing in one line: in the month it mattered, on the mapping that was
live, the count had no signal and the fingerprint did.

**It clears the rule in July, and clears it decisively in August.** Of the 447 swept rules that
catch the break on today's categories, **45 also catch it on v2** — and the dilution is what
separates them: a points-based threshold (*top share up 15 points or more*) is clean on today's
mapping and **misses the break at the time**, because 18.3 − 6.2 is only 12.1 points.

This is the inverse of the standing line Round 52 logged. There, fixing the mapping removed the
signal a composition scan would have read. Here, the *unfixed* mapping was also suppressing this
detector — the same defect that hid the break diluted the evidence of it. A detector's sensitivity
is a property of the categories it runs on, not only of its own arithmetic.

---

## 4 · Question 2 — would it have false-positived?

**No — zero other fires in 60 evaluable cells.** But the reason is the conjunction, and the near
misses are worth more than the headline:

| cell | permits | top share ratio | shapes/permit ratio | fires? | why not |
|---|---|---|---|---|---|
| `roofing` 2026-01 | 121 | **2.55×** | 0.86× | no | concentration moved, diversity held |
| `roofing` 2026-06 | 191 | **2.55×** | 0.91× | no | same |
| `electrical` 2026-08 | 1,512 | **5.24×** | 0.96× | no | same |
| `electrical` 2026-09 | 1,634 | **2.49×** | 0.91× | no | same |
| `hvac` 2026-07 | 1,225 | 1.25× | **0.79×** | no | diversity moved, concentration held |
| `v2_solar` 2026-07 | 93 | **2.97×** | **0.78×** | **yes** | both |

Each signal alone is dirty. Concentration alone fires on roofing twice and electrical twice;
diversity alone fires on HVAC. **Only the pair separates a template from a busy month** — and the
margins are complementary rather than comfortable: at the time, the break cleared the ratio test
with 49% headroom and the diversity test by **0.78 against 0.80**, with HVAC sitting at 0.79. One
axis carries the separation on each side.

That is the honest shape of the answer to "would it have false-positived": not a detector with a
wide moat, but a conjunction where every innocent cell in thirteen months fails one of the two
tests, several of them narrowly.

**The electrical rows are not noise, and should not be read as a false positive avoided.**
Electrical jumps to 5.24× its baseline concentration in August for the same reason storage does —
Austin's Auxiliary Power EPs are also electrical permits, so the same templated wording entered
that bucket too. The break is visible in a second series, and the proposed rule does not see it
there. A rule loose enough to catch it (ratio alone) is the rule that also fires on roofing twice.

---

## 5 · What does not work — the vocabulary half of my own proposal

I proposed two things last round: a shape hash and a vocabulary fingerprint. **The vocabulary half
fails, and it fails on the break itself.**

| `energy_storage` | newTokenShare | trailing |
|---|---|---|
| 2026-04 | 43.5% | |
| 2026-05 | 33.3% | |
| 2026-06 | 53.1% | |
| **2026-07** | **31.3%** | **43.3%** |

The break month's vocabulary novelty went **down**. Templating does not introduce new words; it
repeats the same ones. Every swept vocabulary rule — `newTokens +5pt` through `+20pt`, at every n
floor — **misses the break entirely** and fires on one to four other cells (`solar/2026-04`,
`solar/2026-06`, `energy_storage/2026-04`, `energy_storage/2026-06`), which at n = 10–74 is
small-sample churn. `jaccardVsTrailing` behaves the same way.

So: half of what I asked you to let me measure is dead, and measuring it is how that was found
rather than argued.

---

## 6 · Does it meet the design constraint?

**It meets it, and it meets it fully rather than approximately.** You asked for a measurement, not
a sample, after a round spent proving we should not store descriptions.

- **Nothing stored is derived from a single description.** Every field is a count or a share over a
  whole category-month. `topShapeShare = 58.6` says "the commonest wording covered 58.6% of 29
  permits" and nothing about what the wording was.
- **No hash is stored.** Hashes group identical wordings inside one run and are discarded. This is
  the part that would otherwise only approximate the constraint: a stored hash is not readable as
  text, but it is *testable* against a guess — hand it a candidate description and it confirms or
  denies. There is no hash in the output, so there is nothing to test against.
- **No token is stored.** Tokens are counted, then dropped. A clerk's one-off personal name
  contributes `+1` to `distinctTokens` and leaves no trace.
- **Asserted, not promised.** The probe's workflow walks the output structure and fails the run on
  any long, spacey string, reporting the JSON **path** and never the text. And it re-runs itself
  against the same file with one description-shaped string planted in it, recording `guardCanFire`
  — because this round's whole constraint resting on a guard that had never fired would be worth
  nothing. Result: `{"offenders": [], "guardCanFire": true}`.

One structural reason this is clean: **the ingest re-reads all thirteen months every run**
(`RECOUNT_MONTHS = 13`). So the cross-month comparisons are computable fresh each time and nothing
about a token or a shape has to survive between runs. Had the ingest been incremental, a novelty
measure would have needed retained tokens — free text — or retained hashes, the weaker answer.
The constraint is satisfied for a structural reason, not a lucky one.

---

## 7 · Cost

| | |
|---|---|
| extra requests per ingest | **none.** `description` is already in the ingest's `$select`, because Austin's classifier needs it |
| extra CPU per ingest | **315 ms**, measured — 54,200 normalise+hash+tokenise passes over real Austin descriptions (mean 144 chars), which is one window's worth of category-rows |
| for scale | the probe's whole fetch-classify-fingerprint step took **5 s** on the runner, of which this is ~6% |
| extra storage per ingest | **78 rows of eight numbers** (6 categories × 13 months), alongside observations the file already holds |
| San Antonio | **nothing**, because there is nothing to compute |

A detector nobody runs is the same as none, and nothing here gives anyone a reason not to run it.

---

## 8 · What it cannot see

Stated plainly, because a detector's reach is the part people forget:

1. **Seven of the thirteen permit series.** San Antonio's export has **no description column** —
   measured in Round 51 and cited rather than re-fetched. Every San Antonio category is classified
   by the city's own permit type, so there is no description vocabulary to fingerprint. The
   analogous check there is the permit-type mix, which is item 36.
2. **Any change that does not template wording.** A source that re-words diversely, renames a
   permit type, or stops publishing a field leaves shape concentration untouched. This catches the
   class where a filing becomes a standard form — which is what happened in July, and is a common
   municipal shape, but is not "source behaviour changes" in general.
3. **The first three months of any series**, which have no trailing baseline, and the current
   partial month.
4. **The month it happens in.** It fires on the first *complete* month after the change, which is
   the earliest anything can under the completeness rule the readers already apply.

---

## 9 · The timing, which is the part that decides whether this was worth anything

- **July 2026** — the filing practice changes.
- **~1 August** — July completes; the first ingest after it would have fingerprinted
  `v2_solar/2026-07` at 2.97× concentration and 0.78× diversity. **The rule fires.**
- **11 September** — *"Is Austin's home-improvement boom cooling off?"* is published, with the
  solar figure the break had corrupted.
- **~1 September** — August completes; `v2_solar/2026-08` reads 59.8% and 0.362. **Every swept
  rule fires**, ten days before publication.
- **15 October** — the article is withdrawn. Third withdrawal.

So the fire would have landed **five weeks before publication** on the thin-margin rule, and **ten
days before** on any rule at all. Not a hindsight detector.

---

## 10 · Recommendation

**It would have worked. I am not building it, per your instruction** — this is the measurement you
asked for and the decision is yours.

If you greenlight a build round, these are the things that round has to get right, and they are all
visible in the numbers above:

1. **The rule is a conjunction or it is nothing.** Either signal alone fires on ordinary months.
2. **No n floor above 29.** The break month had 29 permits; every swept rule with `n ≥ 30` misses
   it. The sweep shows `n ≥ 0`, `≥ 10` and `≥ 20` are identical on this window.
3. **It is a flag for a human, never an automatic withholding.** A recorded discontinuity needs
   evidence (Round 52's requirement, enforced in the type). This produces a *suspicion* — "these
   descriptions templated in July" — which is the beginning of the Round 51 investigation, not a
   substitute for it. Wiring it to `discontinuities.ts` directly would be recording a rumour.
4. **It states the population it covers** wherever it reports, or it will be read as covering San
   Antonio too.
5. **The thin margin is a standing fact about it**, not a bug to tune away: the separation at the
   time was 0.78 against 0.80 with an innocent cell at 0.79. Any build must say what its threshold
   is compensating for, and re-measure the margin as months accrue.

---

## 11 · Artifacts

| file | what it is |
|---|---|
| `docs/audits/round-53-fingerprint.json` | the probe's measurement — 84 cells, the v2 reconstruction, the window |
| `docs/audits/round-53-textcheck.json` | the free-text guard's result, including `guardCanFire` |
| `docs/audits/round-53-rules.json` | the offline sweep — 612 rules, what each fired on, the control, the v2 verdict |
| `site/scripts/audits/round-53-shape-fingerprint.ts` | the probe (Actions only; one request path) |
| `site/scripts/audits/round-53-fingerprint-rules.ts` | the sweep (offline; reads the JSON and nothing else) |
| `.github/workflows/tmp-r53-fingerprint-probe.yml` | temporary, as Round 51's were — delete when the round is decided |
