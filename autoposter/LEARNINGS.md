# LEARNINGS.md — THI Autoposter

Candidate patterns distilled from `RUNLOG.md`. Status ladder: `candidate` → `validated`
(seen 2–3 times, or confirmed by the owner) → `promoted` (folded into a skill/SOP via an
approved retro proposal). Nothing here edits a skill on its own.

---

## L1 — A spec written without repo access will be right about process and wrong about grain
**Status:** `candidate` · **Affects:** build-loop 2.1, social-autoposter step 8 (prove the
data source) · **Evidence:** RUNLOG 2026-09-06 §4.

The strategy package correctly predicted the *shape* of every dependency and correctly
identified history retention as the critical path. It was wrong about the one thing it could
not check: the granularity of the data. Six of eight decisions survived contact; the schema's
core `areas[]` grain did not, and that single fact re-scoped two whole phases.

**Proposed rule:** a data prove-gate must assert **grain and cardinality**, not just presence
and depth. "≥4 weeks of history" passed here while "≥3 comparable areas" — never asked —
failed. Any scoring weight that compares entities across a dimension is a claim about that
dimension's cardinality, and should be checked as one.

## L2 — Verify the destination, not just the credential
**Status:** `candidate` · **Affects:** social-autoposter step 7 (credential preflight) ·
**Evidence:** RUNLOG 2026-09-06 §5F, §10.

Step 7 asks whether a credential is PRESENT / ABSENT / INVALID. Here every credential was
valid and the account was correctly connected — and posting would still have been wrong,
because the workspace holds nine Facebook Pages under one account and the API reports a
*default* pageId that is only coincidentally the right one. A valid key pointed at the wrong
mouth is not a credential failure; it is an addressing failure, and step 7 does not look for
it.

**Proposed rule:** preflight asserts the resolved **destination identity** (id + name, pinned
by a human, re-checked against the live listing), not only that auth works. Absence of a pin
means do-not-post. This is the same two-lock idea the article engine already uses for
domains, applied to social targets.

## L3 — A gate flag set to the convenient value defeats the gate
**Status:** `candidate` · **Affects:** social-autoposter step 11b, VALIDATOR G6 ·
**Evidence:** RUNLOG 2026-09-06 §5E.

`gated_metrics.insurance_trend.available` shipped as `true` with a comment citing a
third-party calculator as justification. No insurance feed exists in THI's generated data.
The gate would have passed and an insurance angle would have generated with nothing behind
it — the exact failure G6 exists to prevent, defeated by its own config.

**Proposed rule:** an availability flag must be *derived from the feed*, not hand-set. Until
that is wired, every hand-set `available: true` needs a named dataset path next to it that a
reader can go look at.

## L4 — Dropping a signal is a reweighting decision, not a deletion
**Status:** `candidate` · **Affects:** MOVERS-ENGINE tuning · **Evidence:** RUNLOG
2026-09-06 §12.

Removing `rank_extremity` and `neighbor_divergence` freed 0.35 of the score. Redistributing
it proportionally would have been the reflex and would have been wrong: with cross-area
comparison gone, the *only* remaining way to say "surprising" is comparison to an area's own
past, so `self_deviation` and `magnitude` should absorb more than their old share. Worth
recording because the same choice recurs whenever a signal is gated off.

**Also:** changing weights invalidates any threshold calibrated against the old distribution.
`quiet_week_threshold` is now flagged `calibrated: false` rather than silently carried over.

## L5 — Repo visibility is a content decision, not only a secrets decision
**Status:** `validated` (owner-confirmed 2026-09-06, rule adopted) · **Affects:** agent-harness
Meta-Rule 4 and File Conventions · **Evidence:** RUNLOG 2026-09-06 §11, §17.

Meta-Rule 4 covers secrets in a public repo, and that part is easy. What it does not cover:
`RUNLOG.md` is a candid, sourced, well-structured account of what a project's data *cannot* do —
and on a project whose #1 KPI is being cited by AI answer engines, a public runlog is *more*
extractable than most of the product. The harness asks for candid logs and is silent on who
reads them. The failure is not a leak; it is publishing your own weaknesses in the most
citable format you produce.

**Rule adopted (now in `autoposter/CLAUDE.md`):** *candor about state and timing, never a public
inventory of exploitable weaknesses.* Status, timing, direction and decisions are published;
per-feed inventories, enumerated join failures and field-level gaps go to a gitignored
`private/` directory and an in-session report.

**Sub-finding worth carrying separately:** "put it on an unmerged branch" is not a privacy
control in a public repo — a branch is readable through the UI and API. Obscure is not private,
and a rule that relies on the difference will be wrong the first time someone looks.

**Retro candidate:** this is the first learning at `validated`, which by the harness's Learning
Loop triggers a retro. Proposed promotion — one line in agent-harness File Conventions: *"State
the repo's visibility at Phase 0. In a public repo, `RUNLOG.md` is a published artifact: log
status and timing candidly, keep exploitable specifics in an ignored path."* Not applied; a
skill edit needs an approved retro proposal (🟡).

## L6 — Read the arrays, not the schema: derived series hide category errors
**Status:** `candidate` · **Affects:** build-loop 3.1, social-autoposter step 8 ·
**Evidence:** RUNLOG 2026-09-06 §21.

Four separate traps in one afternoon of wiring one feed, none visible from the schema or the
dataset metadata, each capable of publishing a confident wrong number: a partial trailing
period read as a collapse; a mid-series composition change read as a jump; two record types
(30-year normals and monthly actuals) interleaved in one array; and a two-point series scored
as if it had a baseline. `status: "live"` was true for every one of them.

**Proposed rule:** before a series is scored, assert four properties explicitly — the trailing
period is complete, the entity set is constant across the window, only one record type is
present, and the depth clears the configured minimum. A feed that passes "is live and has N
observations" has not been checked.
