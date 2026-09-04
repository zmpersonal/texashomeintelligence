# Round 17 — Plumbing Triage: the design and specs are not reachable

**No tool was built.** Round 17's own first instruction is *"First, read the design and specs and
report what you find before building"*, and its standing rule is *"if the design assumes data or
a capability that does not exist, report it rather than approximating."* The design and all five
companion specs are absent. What follows is the search, the parts of the round that could be
answered without them, and exactly what is needed to build.

Date: 2026-09-04 · Branch: `claude/thi-governance-post-launch`

---

## 1. What was searched, and what is actually there

The brief describes *"five hero tool designs … as `.dc.html` files from Claude Design, with
companion specs (`page-brief.md`, `copy-deck.md`, `component-states.md`,
`data-labeling-spec.md`, `motion-and-imagery.md`)."*

| Location searched | Result |
|---|---|
| Whole working tree, any path | 4 `.dc.html` files, none of them a hero tool |
| `git log --all --diff-filter=A` for `*.dc.html`, `*copy-deck*`, `*page-brief*` | one commit, `c3840a8`, the Round 0 design system |
| Every branch | nothing further |
| `git stash list`, untracked files | empty |
| Published artifacts (`mine` and `shared`) | **one** artifact — "Round 1 Review Packet" |
| Full-text grep for "plumbing triage", "triage", "copy-deck", "page-brief", "component-states", "data-labeling" | 3 hits, all false positives — the phrase "hero tool" in `COST.md`, `HANDOFF.md` and `belowHero.ts` |

What `docs/source/design/` actually contains:

```
AHI Weekly Dashboard v3.dc.html      <- AHI, a separate project (CLAUDE.md: not this repo)
THI Home Dashboard.dc.html
THI Public ZIP Dashboard.dc.html
THI Share Card.dc.html
thi-dashboard-mockup.html
```

These are the Round 0 reference screens. **There is no Plumbing Triage design, and none of the
five companion spec files exists anywhere.** This is the same shape as Round 0, whose plan
recorded the design system as *"not yet reachable in this session (not in the upload, repo, or
artifacts)"* — resolved then by the owner supplying the files.

---

## 2. Why this is a stop rather than something to approximate

The brief does specify a great deal inline — Type C layout, the five symptoms, the shutoff
screen's primacy, safety interrupts as full-screen states, verdict structure, the honesty
constraint, the labelling rule, the no-JS requirement. That is enough to build a *structure*.

**It is not enough to build this particular tool, because the missing piece is the copy, and this
tool's copy is safety-critical.**

- The one screen the brief calls *"the most important layout in the product"* is a **shutoff
  instruction** read by someone standing in water. Its exact words matter more than its layout.
- Three paths are **safety interrupts** — gas, sewage, electrical plus water — where the flow
  stops and the only content is a safety action. Improvising that text is not a design choice.
- `CLAUDE.md`'s copy discipline is explicit: *"once copy is provided in a copy document, it is
  frozen — render it exactly."* The single authored-by-Claude exception is **AI-phrase content
  pages**. A hero tool is not that exception.

Writing safety copy myself, to be read in an emergency, from a copy deck I cannot open, is
precisely the approximation the round forbids. **The structure without the reviewed words would
also be the wrong thing to review** — it would invite sign-off on a layout whose most important
element is placeholder text.

---

## 3. What *was* answerable, and is answered

### 3a. Route and indexation — decided, and it is not a placeholder replacement

**`/tools/` today holds three placeholders**, and Plumbing Triage is none of them:

| route | tool | state |
|---|---|---|
| `/tools/cost-calculators/` | Cost Calculators | `ToolPlaceholder`, noindexed |
| `/tools/home-risk-report/` | Home Risk Report | `ToolPlaceholder`, noindexed |
| `/tools/quickconnect/` | QuickConnect | `ToolPlaceholder`, noindexed |

**Recommendation: `/tools/plumbing-triage/`, a new indexed route, replacing nothing.** Reasoning:

- It is a **new** tool. Presenting it as a replacement for Cost Calculators or QuickConnect would
  misdescribe both.
- It should be **indexed**, unlike the placeholders. Those are noindexed because they have no
  functionality — the honest state for an empty shell and the wrong state for a working tool. A
  question-shaped, answer-first triage flow is exactly what KPI #1 wants crawled, and it is
  genuinely useful to someone arriving from a search.
- It needs **no metro segment**. The tool reads no local data (see 3c), so `/austin/…` and
  `/san-antonio/…` variants would be two URLs serving identical content — a duplicate-content
  problem for no gain.

### 3b. The nav rules the brief asks me to confirm DO NOT still hold

The brief says *"confirm the nav rules in `THI-round-homepage-nav.md` still hold."* They do not,
and this should be corrected rather than confirmed. That document specifies:

> New nav: **Tools · Services · Data · Locations(dropdown)** + [My Dashboard button]

`CLAUDE.md` supersedes it: the nav is **`Data · Locations` + a persistent "My Dashboard"**, with
**no Tools item**, and *"Services (removed permanently from nav; do not re-add)"*. The live
`Nav.astro` matches CLAUDE.md, not the older document.

**Consequence for this tool: `/tools/` is reachable only from the footer and from in-body links.**
A new tool placed there inherits that. If Plumbing Triage is meant to be a hero surface, its
discoverability is a real question — and a **Rule 1 decision for the owner**, not something to
settle by quietly re-adding a nav item the governance says is permanently removed.

### 3c. Labelling — how I would decide, per item 5

The four-bucket label attaches to a **reading**: something measured, from a named feed, with a
date. It does not attach to instruction.

- **No label, no source line:** "Turn the valve clockwise until it stops." "Look for water
  staining at the base of the tank." General plumbing guidance — true in Travis County and in
  Ohio, not measured, not dated. A freshness badge on it would imply a provenance it does not
  have and cannot go stale in the way the badge implies.
- **Label required, with source and date:** anything drawn from a feed. On the flow as specified
  **there is nothing in this category** — the tool reads no dataset. That is a design property
  worth stating rather than a gap: it is exactly why the tool ships in both metros with no local
  data and no gate.
- **The test I would apply:** *could this sentence become false because a feed changed?* If yes,
  it is a reading and it carries a label. If it could only become false because plumbing changed,
  it is guidance.

### 3d. No-JS behaviour — how I would build it

- **With JavaScript:** one page, screens as sibling sections, `hidden` toggled on selection. No
  navigation, no reload — a person standing in water does not wait for a page load. History
  entries pushed so Back is the phone's Back.
- **Without JavaScript:** the same content, server-rendered, **every screen present in the HTML**
  and reachable by ordinary `<a href="#screen-id">` links. Nothing hidden behind a script. The
  flow becomes a linked document rather than a state machine — longer, but complete and correct.
- This follows `CLAUDE.md`'s existing rule (*facts render in static/server HTML; JS is
  progressive enhancement*) and the `<details>` / `nav-toggle` pattern already in the codebase,
  which is CSS-driven and keyboard-reachable with scripting off.

### 3e. The cost constraint — confirmed, and it binds

Item 4 says to omit any cost range in the copy deck. I cannot read the copy deck, but the
constraint is confirmed independently and holds regardless of what it contains:
`docs/audits/round-6-permit-measurement.md` establishes that **no cost figure is publishable from
permit data in either metro**. Round 17b separately unblocks *national averages* under stated
conditions — and a national average is not a triage-screen figure. **Plumbing Triage should carry
no cost figure at all.**

---

## 4. What is needed to build it

1. `Plumbing Triage.dc.html` — the design reference.
2. `copy-deck.md` — **the blocker**. Specifically: the five symptom labels as they should read;
   the shutoff instruction for each path, verbatim; the three safety-interrupt screens verbatim,
   including the acknowledgment wording; each verdict's headline, "what to check" list, and the
   three questions to ask.
3. `page-brief.md`, `component-states.md`, `data-labeling-spec.md`, `motion-and-imagery.md`.

Supplied as files in the repo (`docs/source/design/`) or as artifacts this session can read.

**If the copy deck does not exist yet**, that is worth knowing plainly: the round is then a *copy*
round before it is a build round, and the honest sequence is to write and review the safety copy
first. I can draft it for review — but drafting it and shipping it inside a working tool in the
same round removes the review step from the one screen that most needs it.
