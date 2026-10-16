# Round 54 — the description-shape detector, built

Date: 2026-10-16 · Branch: `claude/thi-plan-review-m40n0x`, from `origin/main` at `27f9925` (the
Round 52 merge).

Round 53 measured whether a description fingerprint would have caught Austin's battery-storage
break and said yes. This builds it, under the owner's two conditions. **It changes nothing about
what publishes.**

---

## What it is, in four files

| file | what it does |
|---|---|
| `site/src/ingest/descriptionShape.ts` | accumulates the fingerprint inside the Austin loop that already reads descriptions to classify rows. Hashes group identical wordings and are **discarded**; tokens are not collected at all (Round 53 measured vocabulary novelty and it does not work). What leaves is six numbers per category-month. |
| `site/src/lib/shapeFlags.ts` | **the rule**, the thresholds with their arithmetic, the near misses, the margin, and the reach. Pure, and imports no dataset — so it is testable without building the site. |
| `site/scripts/report-shape-flags.ts` | where a flag goes to be **read by a person**. Suppresses flags already accounted for by a recorded discontinuity, and says it did. |
| `site/scripts/replays/shapeflagunit.ts` | 57 checks: the rule, both margins, the three locks on condition 2, the measurement-not-sample guarantee, the reach, that it is **not a gate**, and the surface's de-duplication. |

The verdict is computed **at ingest**, where the whole thirteen-month window is in memory, and
stored on the observation beside the numbers. One rule, one implementation: the autoposter would
read a verdict rather than re-implement the rule in Python, which is the Round 45 and Round 52
lesson. `shapeflagunit.ts` §6 and the live verification both assert that a stored verdict equals a
fresh evaluation of the stored rows.

---

## Condition 1 — the threshold is visible as the weak point

**And the first thing that had to happen was a correction.**

Round 53's report said the separation was *"0.78 against 0.80 with HVAC at 0.79"*, and the owner's
condition was written on that number. **It compared two cells that were not competing on the same
test.** `hvac/2026-07`'s 0.793 diversity never threatened to become a flag, because its
concentration was 1.25× and nothing below 2× is flagged whatever its diversity.

The cell that actually competes on the diversity axis is the nearest one that *cleared*
concentration and then failed diversity — `roofing/2026-01` at 0.861. So there are two margins and
they are different numbers:

| | cell | value | margin |
|---|---|---|---|
| **Sensitivity** — closest to being missed | `v2_solar/2026-07` (the break as it was visible at the time) | diversity **0.784** | **0.016** inside the threshold |
| **Specificity** — closest to being flagged | `roofing/2026-01` | diversity **0.861** | **0.061** outside |
| separation on the axis that competed | | | **0.077** |

So the sensitivity margin is thinner than I said and the specificity margin is seven times wider.
Both are now reported on every run, per axis, each read only among the cells that could cross it.

**The first margin metric inherited the error, and the live run caught it in minutes:** it
reported `diversityGap: −0.221` and `tighterThanRound53: true` on a window containing no false
positive at all, because `energy_storage/2026-09` sits at 0.193 diversity and is declined on
concentration. A margin metric that cries wolf is how a real narrowing gets ignored, so it was
rebuilt rather than tuned.

**What is in the code:** `CONCENTRATION_RATIO`/`DIVERSITY_RATIO`/`MIN_PERMITS` carry a comment with
the full table — every declined cell by name with both its ratios and which test declined it — the
correction above, and four consequences: it is a conjunction or it is nothing; `MIN_PERMITS` must
stay at or below 29 because the break month held 29 permits and all 153 swept rules with an n floor
of 30 miss it; both margins are reported and neither is to be absorbed; and **a flag marks the
transition, not the state** (measured: by the third templated month the trailing baseline has
absorbed the template and `energy_storage/2026-09` reads 1.7× and is declined).

**What surfaces when it tightens:** `margin.tighterThanRound53` trips when either margin is thinner
than when it was measured. It appears in the ingest log, as a GitHub Actions `::warning`, and in
the report, with the note *"re-measure and say so — do not move the threshold until it reads
clean."* `shapeflagunit.ts` §1 reproduces a 0.005 sensitivity and a 0.03 specificity, watches each
trip it, and asserts a clean window does not.

---

## Condition 2 — a flag is a suspicion, never a discontinuity

Three independent locks, none of which depends on anyone remembering the rule.

**1 · The type.** `ShapeFlag` has no `datasetId`, `what`, `cause`, `discoveredAt` or `evidence`.
Returning one where a `Discontinuity` is expected does not compile:

```
src/lib/__flagproof.ts(4,3): error TS2740: Type 'ShapeFlag' is missing the following
properties from type 'Discontinuity': datasetId, location, series, fromMonth, and 4 more.
```

Written, run, read, deleted; the compiler's own words are in the replay. `evidence` is itself a
non-empty tuple, so even a hand-written record cannot have none (Round 52).

**2 · The dependency direction.** The detector does not import the record module and the record
module does not import the detector — asserted by reading both files' import lines. A suspicion
that knows about records is one refactor away from writing one. The *reporter* is allowed to know
both, because it is the human-facing layer; that is where flag suppression lives.

**3 · Admissibility.** `discontinuityunit.ts` §1 now refuses a record whose only evidence is
machine output — this detector's report, a live-path verification, or a generated dataset. A record
must cite something a human put in the repo. Proven non-vacuous against three evidence sets: the
detector's output alone is refused, a generated dataset alone is refused, an audit a human wrote is
admitted.

---

## In scope: the electrical leak, in the output

The rule declines the same break where it shows up in a second category, and Round 53 measured why
loosening it is worse. So the output carries it:

- **Every cell that passes one test and fails the other is reported as a near miss**, naming which
  half it passed and by how much. The electrical cells are exactly that.
- **`REACH.blindSpotMeasured`** carries the measured case with its numbers, in the flag report a
  reader meets: *the same break reached electrical at 5.24× concentration with diversity at 0.96×
  — declined on purpose, because a rule loose enough to catch it also fires on roofing 2026-01 and
  2026-06.* And the instruction that follows from it: **read a flag on one category as "at least
  here", never as "only here."**

---

## In scope: the reach, where a reader meets it

`REACH` is returned by every evaluation and printed in every report:

- **6 of 13 permit series, Austin only.**
- **San Antonio has no description column at all**, so nothing there is measured; its analogue is
  the permit-type mix, backlog item 36. *Absence of a flag there is absence of a measurement, not
  absence of a break.*
- **Only changes that template wording.** A source that re-words diversely, renames a permit type
  or stops publishing a field leaves shape concentration untouched.
- **Fires on the first complete month after a change** — the earliest anything can, under the
  completeness rule the readers already apply.

---

## In scope: where a flag surfaces

**A GitHub issue, once per newly flagged cell, raised by the ingestion workflow.**

Three candidates, and what is wrong with two of them:

| surface | verdict |
|---|---|
| the dataset (`shapeFlag` on the row) | it is the **record**, and the wrong surface: a number in a generated JSON that changes on a schedule is the file nobody opens |
| the weekly Slack cycle notice | the owner reads those, which is the argument for it — but the autoposter has no once-only state on the paths that do not publish, and **a flag stays flagged for the thirteen months it takes to age out of the window**. A line repeating for months is how a signal becomes furniture, which is exactly how `permitcountunit`'s red became normal |
| **a GitHub issue** | **the pick.** Addressed to a person, carries the investigation rather than a number, de-duplicated by its own marker across every issue ever raised so a flag is raised once *ever*, and closing it is a human saying "looked at" |

**The de-duplication is tested, the API call is not.** The glue lives in
`scripts/raise-shape-flag-issues.mjs` rather than inside the workflow's `run:` block, because
logic inside YAML can only be run on a runner — and the de-duplication is the part that decides
whether this is a surface or a nuisance. `shapeflagunit.ts` §7 exercises it with `--dry-run`: a
flag whose marker appears in any issue ever raised is not raised again, the one that does not
appear is, a tightened margin warns on the way past, and a missing or unreadable report exits 0.
What is **not** covered is the `gh api` call itself — the live window produces only explained
flags, so there was nothing to raise and nothing to prove. It is one command, behind
`continue-on-error`, and the first unexplained flag will prove or disprove it; that is the one
unverified link in this round and it is named here rather than left for someone to discover.

There is a measured argument for the issue beyond taste: **a flag goes quiet by itself.** By the
third templated month the trailing baseline has absorbed the template — `energy_storage/2026-09`
reads 1.7× and is declined — so a dashboard would show the flag appear and then vanish with nothing
recorded. An issue outlives the condition that raised it.

**And the first run raises nothing**, because the reporter suppresses flags already accounted for by
a recorded discontinuity and says so in its "Suppressed — already recorded" section. The storage
break Round 52 documented does not come back as a to-do item.

---

## Not a gate

The owner's line: *nothing about this changes what publishes.* Asserted, not asserted-ly claimed:

- `shapeflagunit.ts` §5 runs the same rows through `segmentsOf` — the layer that decides which
  months a figure may be computed from — with and without a flag present, and the output is
  **byte-identical**.
- `tradeActivity.ts` and `tradeSegments.ts` never mention a flag; `BelowHero.astro` and
  `/tools/roof-scan/` never read one. Asserted by reading the files.
- Every detector step in `data-ingestion.yml` is `continue-on-error`, and the reporter exits 0
  whatever it finds. The detector cannot stop an ingest.

---

## The live verification

The detector is wired into `permitTradeActivityAustin.fetchRaw`, which no agent session can reach.
So `scripts/audits/round-54-detector-live.ts` calls that fetcher — unchanged, by name — on an
Actions runner, and commits what came back. **It writes no dataset**; the workflow fails the run if
anything under `src/data/generated` moves, so a data refresh and a code round stay separate.

| | |
|---|---|
| observations | 98 — 84 category-months + 14 all-trades rows |
| carrying a shape | **84 of 84** |
| carrying a verdict | **84** |
| stored verdict vs a fresh evaluation | **0 mismatches** |
| cells evaluated | 56 (18 lack a trailing baseline, 6 are the incomplete month, 4 are under the permit floor) |
| **flags** | **2 — `energy_storage/2026-07` (4.12× / 0.414×) and `energy_storage/2026-08` (3.02× / 0.102×)**, both `explainedByRecord: recorded from 2026-07` → **no issue raised** |
| **false positives** | **none.** 6 near misses, every one passing exactly one test: `electrical/2026-08` (5.24× / 0.955×), `electrical/2026-09`, `roofing/2026-01` (2.55× / 0.861×), `roofing/2026-06`, `hvac/2026-07` (1.25× / 0.793×), `energy_storage/2026-09` (1.70× / 0.193×) |
| the margin, corrected | closest to being missed `energy_storage/2026-07`, **0.386** inside the diversity threshold; nearest declined on diversity `roofing/2026-01`, **0.061** outside — the same cell and the same number Round 53 measured; separation **0.447**; `tighterThanRound53` **false** |
| the free-text guard | `{"offenders": [], "guardCanFire": true}` |

The corrected metric reads `tighterThanRound53: false` on the window that the broken one called
tighter. The sensitivity margin is comfortable *today* (0.386) for the reason Round 53 found: on
these categories storage is its own series, so the template is undiluted. The 0.016 that the
condition is really about belongs to the diluted case, which is why it is frozen as a constant
rather than recomputed from a window that no longer contains it.

**One axis is reported but not watched.** The nearest cell to the concentration boundary is
`energy_storage/2026-09` at 1.70× — the break's own third month, aging out as its baseline absorbs
the template. It is not an innocent cell crowding a threshold, so tripping on it would repeat the
category error the metric was rebuilt to remove. The trip wire is on the diversity axis, which is
the one that separated the break from an ordinary month.

Every number matches Round 53's measurement, which is the point: the detector in the ingest and the
rule in the sweep are the same rule.

---

## Cost, measured

| | |
|---|---|
| extra requests | **none.** `description` is already in the ingest's `$select` |
| extra CPU | **315 ms** per ingest, measured on real descriptions |
| extra storage | 6 numbers + a verdict per Austin category-month |
| can it slow or break an ingest | no — `continue-on-error` on every detector step |

---

## Verification

| check | result |
|---|---|
| `shapeflagunit` | **57/57** |
| `discontinuityunit` | **50/50** — +5 for the admissibility rule and its three counter-examples |
| `permitcountunit` | 38/38 |
| `npm run check` | 0 errors, 0 warnings, 0 hints |
| `npm run build` | clean |
| `npm run sweep` | 35/35 steps (`shapeflagunit` registered) |
| the live path | 84/84 cells, 0 verdict mismatches, 2 explained flags, 0 false positives, margin not tighter |

### The guard was inverted, after it failed on the detector's own prose

The first live run failed its own free-text check: the earlier guard flagged any long, spacey
string outside `$.notes.*`, and the detector's output carries sentences by design — a flag's
`nextStep`, the near-miss explanations, the reach.

It now **allows a named set of prose paths**, each a literal in `shapeFlags.ts` with numbers
interpolated, and requires every other string in the file to be at most 64 plain characters. That
is the direction that cannot fail open: forgetting to list a path breaks the build, where
forgetting to exclude one would have published a description. The planted-string check now plants
at a *data* path, which is where a leak would actually happen.
