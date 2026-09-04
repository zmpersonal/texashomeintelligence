# Round 17c — What landed, and what is now buildable

**Nothing was built.** The designs and specs are committed to
`docs/source/design/tools/`; this records what they contain, what they conflict with, and which
tools the repo can actually support today.

Date: 2026-09-04 · Branch: `claude/thi-governance-post-launch` · Source:
`THI__Tools_Hero_Section.zip` (183,358 bytes)

> The owner said the files were also at `assets/design`. **That directory does not exist in the
> repo and neither did `docs/source/design/tools/`** — the files arrived only through the upload.
> They are committed now.

---

## 1. Inventory — five designs, and FIVE specs, not ten

| Design | size | Design | size |
|---|---:|---|---:|
| `Plumbing Triage.dc.html` | 22,259 B | `Roof Scan.dc.html` | 19,887 B |
| `AC Lifespan.dc.html` | 160,466 B | `Roof Cost Calculator.dc.html` | 25,969 B |
| `Pipe Report.dc.html` | 19,939 B | | |

| Spec | present? |
|---|---|
| `page-brief.md` | ✅ 8,451 B |
| `copy-deck.md` | ✅ 7,838 B |
| `component-states.md` | ✅ 5,728 B |
| `data-labeling-spec.md` | ✅ 4,819 B |
| `motion-and-imagery.md` | ✅ 6,714 B |
| `thi-tools-hero-scope.md` | ❌ **ABSENT** |
| `cost-model-spec.md` | ❌ **ABSENT** |
| `caliza-architecture.md` | ❌ **ABSENT** |
| `photo-capture-spec.md` | ❌ **ABSENT** |
| `below-hero-content-spec.md` | ❌ **ABSENT** |

**Five of the ten named companion specs did not land.** Two of them are ones this round was asked
to check for conflicts — `cost-model-spec` and `thi-tools-hero-scope` — so those two checks
**could not be performed against the documents themselves**, only against what the other specs and
the designs imply. That is reported below rather than inferred over.

Also delivered and **deliberately not committed** — see `docs/source/design/tools/README.md`: the
`_ds/` design system (byte-identical to `site/src/styles/thi/` on 6 of 7 token files plus
`primitives.css` and `styles.css`) and the canvas runtime (`support.js`, `image-slot.js`).

---

## 2. Plumbing Triage copy — PARTIALLY resolved. The blocker is half-lifted.

Round 17 stopped because the safety-critical copy could not be read. **That specific reason is
resolved.** The rest is not.

### ✅ Authored, verbatim, reviewable — the copy that caused the stop

The **shutoff instruction**, which the brief calls the most important layout in the product,
exists in full in both the deck and the design:

> **Before anything else: shut off the water.** For a single fixture, the valve is usually under
> it — turn clockwise. For the whole house, the main is typically near the street or where the
> line enters. If you can't find it or it won't turn, shut off the water heater too and call a
> plumber now.

The **gas interrupt** and **sewage interrupt** likewise, with their actions:

> **Stop. If you smell gas, leave the house now.** Don't flip switches, don't use your phone
> inside. Call 911 and your gas utility from outside. Do not continue with this tool.
> — actions: `Call 911` · `I don't smell gas — go back`

> Raw sewage is a health hazard. Keep people and pets out of the affected area and don't run any
> more water into the system — no sinks, no laundry, no flushing.
> — action: `Understood — what now?`

The design adds material the deck lacks: a **gas pre-screen** ahead of everything
(*"Do you smell gas near the water heater?" / "We ask first because everything else can wait and
this can't."*), the shutoff screen's two exits (`Water is off — what now?` / `I can't shut it
off`), and — contrary to Round 17's expectation — **the three questions are authored**:

1. Is this a repair to one fixture or a symptom of the supply line?
2. What's the diagnostic fee, and does it come off the repair if I go ahead?
3. Does this work need a permit, and are you pulling it?

Plus the five symptom labels, the H1, and the disclaimer.

### ❌ Still placeholder or absent

| What | State |
|---|---|
| **Verdict copy** | **PLACEHOLDER.** The design carries `{{ verdictTitle }}` and `{{ verdictBody }}` as template variables. The deck gives only three verdict *labels* — "Call someone now · Today, not next week · This can wait, but don't forget it". **No verdict body text exists for any path.** |
| **"What to check" per verdict** | **ABSENT.** Round 17's item 4 requires it; nothing supplies it. |
| **Electrical + water interrupt** | **ABSENT.** `page-brief.md` names three interrupts — *"gas, sewage, electrical + water"* — and only two have copy. The one involving live current and standing water is the one with no words. |
| **Four of five symptom paths** | **ABSENT.** The design storyboards *water on the floor* only. No screens for no-hot-water, sewage, no-water, or bill-jumped. |
| **Cost strings** | `{{ costRange }}`, `{{ costNote }}` — placeholder, and see §3. |

**Verdict on the question this round asks:** the safety-critical copy **is authored and
reviewable, and Round 17's stated reason for stopping is resolved.** But the tool cannot be built
end-to-end from what landed: one whole safety interrupt, every verdict body, and four of five
symptom paths have no copy at all.

---

## 3. Spec-versus-repo conflicts

### 🔴 C1 — The cost block is built on permit valuation, which is proven unusable

The Plumbing Triage design renders a cost panel:

```
Typical cost in Austin   [Estimate]
{{ costRange }} · {{ costNote }}
Source: City of Austin plumbing permits · Data through Aug 28, 2026 · Escalated to Aug 2026
```

Round 6 measured that source and it does not support this. `docs/audits/round-6-permit-
measurement.md`: San Antonio's `DECLARED VALUATION` is **0.00% populated** on every residential and
trade permit type; Austin's coalesced valuation has a **median of 1**, and its trade-named
plumbing field has a median near $900k — a whole-project construction value, not a plumbing job.
**A plumbing cost range cannot be computed from Austin plumbing permits.**

This is not confined to one panel. The **sub-headline** promises it (*"…and what it usually
costs"*), `page-brief.md`'s Type C rule orders it (*"verdict first and large, **cost range
second**, three-questions block third"*), and `copy-deck.md`'s calculator section builds an entire
tool on it. The same conflict hits **Roof Cost Calculator**, whose whole premise is *"Built from
re-roof permit valuations filed in your area."*

Round 17b's national-average decision does not rescue this: a national average is not "typical
cost in Austin", and the design explicitly labels it local and sources it to city permits.

**`cost-model-spec.md` is one of the five specs that did not land**, so whatever reasoning it
offers is unavailable. Given the measurement, it is the document most worth reading before any
cost figure is built.

### 🔴 C2 — Four of five tools need address and parcel data that do not exist

Confirmed in Round 16c: `improvement_detail` carries **no situs address** (keys are `pID`,
`pImprovementID`, `pDetailID`), so `addressKey.ts` has nothing to join on, and whether any file in
the export family supplies `pID → address` is still unanswered. Bexar publishes no bulk export at
all.

Every Type A design opens with an address field and a CAD lookup — *"Enter your address and we'll
pull the permit history for your property"*, *"Source: [CAD], as of [date]"*, *"A real 78704
property · built 1974"*. **None of that is reachable today**, in either metro.

### 🟡 C3 — `/tools/` versus service pages

`copy-deck.md` writes a `/tools/` hub H1 and a nine-tool card table; `page-brief.md`'s scope line
is *"`/tools/` hub + nine tool pages."* The owner has since said heroes go on service pages.
**`thi-tools-hero-scope.md`, the document that would adjudicate this, is absent.**

Compounding it, Round 17 established that **`/tools/` is not in the nav** — `CLAUDE.md` supersedes
`THI-round-homepage-nav.md` with `Data · Locations` + My Dashboard, Services *"removed permanently
… do not re-add"*. So the specs assume a hub reachable from a nav item that no longer exists.
**An owner decision, not something to resolve by reading the specs.**

### ✅ C4 — The design-system tokens DO match. This conflict does not exist.

Compared file by file against `site/src/styles/thi/`:

| file | result |
|---|---|
| `tokens/colors.css` · `typography` · `spacing` · `shape` · `motion` · `semantic` | **byte-identical** |
| `base/primitives.css` · `styles.css` | **byte-identical** |
| `tokens/fonts.css` | **differs — and the repo's version is correct** |

The delivered `fonts.css` loads the families with a remote `@import` nested inside an imported
stylesheet, which the CSS bundler drops; the repo self-hosts them and documents why. **Syncing the
repo to this delivery would silently revert the site to system fallbacks.** Recorded in the
committed README so nobody "fixes" it later.

### 🟡 C5 — Six tools, nine tools, or five

The brief mentions a scope doc naming six; `copy-deck.md` and `page-brief.md` both say **nine**
(AC lifespan, Roof scan, Pipe report, Storm check, Roof cost calculator, AC cost calculator, Water
heater calculator, Plumbing triage, AC triage); **five designs** exist. Four named tools — Storm
check, AC cost calculator, Water heater calculator, AC triage — **have copy but no design.**

---

## 4. Buildable today, per tool

| Tool | State | The specific blocker |
|---|---|---|
| **Plumbing Triage** | 🟢 **Buildable — with the cost block removed and the missing copy supplied** | Needs **no feed, no address, no parcel data**. The only data dependency in the design is the cost panel, and removing it is required by Round 6 regardless. Remaining work is copy, not capability. |
| **Roof Cost Calculator** | 🔴 Blocked | Its premise — permit valuations — is falsified (Round 6). Needs a **different cost source**. Round 17b permits a *national* figure under five conditions; this design is explicitly local. |
| **AC Lifespan** | 🔴 Blocked, needs **cooling degree days** | Copy requires *"[Metro] cooling load runs about [n]× the national average"*. The repo has **no CDD series**: `noaa-climate/austin.json` is a one-observation **SAMPLE** carrying only normal high/low, and there is no San Antonio file. Also needs address + CAD (C2). |
| **Pipe Report** | 🔴 Blocked, needs **water hardness** | The design reads *"grains hardness"* from *"Austin Water quality reports"*. **No hardness feed exists** — `austin-water-stage` carries the drought-response stage only, and there is no San Antonio equivalent. Also needs address + CAD year built (C2). |
| **Roof Scan** | 🔴 Blocked, needs **point-level hail** | The design promises *"hail events within one mile"* and *"7 recorded hail events"* for a property. `noaa-storm-events` is **county-level** — Round 15 recorded that a per-ZIP hail score "would be invented, not measured", and per-property is finer still. Also needs roof area (footprints/CAD) and address (C2). |

---

## 5. What remains unresolved for Plumbing Triage

Round 17's blocker is half-lifted. To build:

1. **Verdict copy** for each path — title and body. Currently `{{ verdictTitle }}` / `{{ verdictBody }}`.
2. **The "what to check" list** per verdict.
3. **The electrical + water interrupt**, which `page-brief.md` requires and nothing supplies.
4. **Screens for the four unstoryboarded symptoms**, and the routing from each symptom to its
   shutoff instruction, interrupt and verdict.
5. **A decision on the cost block.** Recommended: **remove it** — the sub-headline's promise, the
   `Typical cost in Austin` panel, and `page-brief.md`'s "cost range second" ordering. Round 6
   forbids the figure and Round 17b's national average is not a triage-screen number.

Items 1–4 are copy. Item 5 is an owner decision, and it changes the copy deck and the page brief,
not just the build.
