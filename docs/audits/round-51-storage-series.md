# Round 51 — what the Austin battery-storage series says

**Measurement only.** No builder, no article, no copy. Measured 2026-10-15 against both cities'
live feeds in GitHub Actions; the raw measurement is committed at
`docs/audits/round-51-storage.json`. Every request is built by the ingestion fetcher's own code;
no permit description is written down anywhere (Round 50's standing line), and a workflow step
asserts that rather than trusting it.

---

## 0 · The short version

> **Resolved in §7.** The one decisive check was reachable. Austin Energy's permitting manual
> required an Auxiliary Power EP for battery work in its **January 2026** revision too, so the
> requirement did not change — but the live revision adds an instruction that solar, batteries,
> pre-wire and generators **"should all be separated into their own Auxiliary Power EPs."** One
> project that filed one permit now files several. That single change predicts every measurement
> below, including the ones that looked like a market. **The July step is a permitting-process
> change, and there is no storage story to publish.**

**It is a step, not a curve, and the step is in the vocabulary as much as in the count.** Before
July the permits read like engineering descriptions of solar-plus-storage installs, with system
sizes. From August, 90% of them share one description that names no size, no solar and no product.
The count rose inside a feed that did not, across 33 ZIPs and 188 separate projects, 99%
residential — so it is not one development and not one batch. But the thing that would tell us
whether more batteries are going in is exactly the thing that disappeared.

**So the two readings the brief asks to separate cannot be fully separated from this feed, and the
honest statement is narrower than either: the series is not comparable across July.** Austin's
upstream permitting manual, published May 2026, confirms `Auxiliary Power` is the city's class for
battery work — which is a fact about the class, not about how many batteries exist.

**And it is Austin-only, necessarily.** San Antonio's permit file has **no description column at
all**. Storage there is not absent; it is invisible.

---

## 1 · The series, and the vocabulary inside it

| month | storage permits | distinct description shapes | top shape's share |
|---|--:|--:|--:|
| 2025-09 | 34 | 23 | 11.8% |
| 2025-10 | 36 | 20 | 19.4% |
| 2025-11 | 32 | 20 | 21.9% |
| 2025-12 | 18 | 16 | 16.7% |
| 2026-01 | 6 | 6 | 16.7% |
| 2026-02 | 9 | 8 | 22.2% |
| 2026-03 | 5 | 5 | 20.0% |
| 2026-04 | 10 | 10 | 10.0% |
| 2026-05 | **4** | 4 | 25.0% |
| 2026-06 | 13 | 13 | 7.7% |
| 2026-07 | 29 | 12 | **58.6%** |
| **2026-08** | **146** | 12 | **91.8%** |
| **2026-09** | **188** | 18 | **89.4%** |
| 2026-10† | 59 | 8 | 84.7% |

† incomplete month, excluded from publication by `tradeActivity()`.

**A step at July–August, with July as the shoulder.** Not a curve. Ten months averaging **16.7**
(range 4–36), then 29, then 146, then 188.

**The templating is the finding.** Before July the busiest single description shape accounts for
8–25% of a month — many permits, many descriptions, which is what dispersed work looks like. From
August one shape accounts for **nine permits in ten**, and the number of distinct shapes does not
grow with volume: 12 shapes across 146 permits, 18 across 188.

### The vocabulary does not shift. It inverts.

Count of permits whose description mentions each term:

| month | battery | backup | meter socket | storage | solar | kW rating | kWh rating |
|---|--:|--:|--:|--:|--:|--:|--:|
| 2025-09 | 7 | 4 | **0** | 24 | 30 | 25 | 9 |
| 2025-10 | 9 | 6 | **0** | 24 | 33 | 31 | 11 |
| 2025-11 | 10 | 6 | 1 | 20 | 28 | 26 | 10 |
| 2026-06 | 6 | 1 | **0** | 7 | 9 | 8 | 3 |
| 2026-07 | 23 | 20 | 18 | 6 | 8 | 8 | 5 |
| **2026-08** | **141** | **138** | **137** | 4 | 3 | **1** | **0** |
| **2026-09** | **181** | **178** | **175** | 7 | 9 | **6** | 2 |

Before July, a storage permit typically says *solar*, says *storage*, and carries a **kW rating**
(25 of 34 in September 2025) and often a **kWh rating**. From August, it says *battery*, *backup*
and *meter socket*, and carries **no system size at all** — 1 of 146 in August.

A real battery installation description carries a capacity. These do not. Whatever changed, the
post-July population is described in a way the pre-July population was not, so **our storage count
measures a different thing on either side of July.**

No product concentration: Tesla appears 1–4 times a month throughout, Enphase/Franklin/Sonnen/
Generac essentially never. So it is not one manufacturer's paperwork.

---

## 2 · Filing mix, or homes? What the feed can and cannot settle

### The volume rise is real, and it is specific to this class

| | 2025-09 | 2026-05 | 2026-09 |
|---|--:|--:|--:|
| all Austin permits that month | 4,272 | 4,642 | 5,130 |
| `Auxiliary Power` permits | 100 | 24 | 219 |
| as a share of all permits | 2.34% | 0.52% | **4.27%** |

The whole feed drifts up ~20% across the window with no step. The class moves from 0.52% of it to
4.27%. **This is not "Austin is issuing more permits".**

### It is dispersed, residential, and individually projected — not one job

Measured over the storage permits, 2026-09:

| | value |
|---|---|
| distinct `project_id` | **188 for 188 permits** |
| distinct council districts | 11, busiest holds 23.9% |
| distinct ZIPs | 33, busiest holds 12.2% |
| `permit_class_mapped` | **Residential 186, Commercial 2** |
| `masterpermitnum` | blank on 187 of 188 — read, not inferred |
| `issue_method` | Permit Center on all 188 |

So the earlier suspicion that one filer or one development explains it is **wrong**. Every permit
is its own project, spread across the city, almost entirely residential.

### A mechanism was proposed, predicted, and falsified

Austin Energy's Solar Permitting Manual says a separate **Upgrade** permit may be needed for work
on the **utility side of the meter** — which is what "additional meter socket" describes. Stated
before reading the answer: *if the step is each battery job now filing an Auxiliary Power EP plus
an Upgrade EP, the Upgrade class moves with it.*

| month | Auxiliary Power | Upgrade |
|---|--:|--:|
| 2026-05 | 24 | 169 |
| 2026-06 | 39 | 179 |
| 2026-07 | 64 | 173 |
| 2026-08 | **194** | 174 |
| 2026-09 | **219** | 198 |

**Upgrade is flat.** The prediction fails, so that is not the mechanism. The step is confined to
one class.

Also checked and ruled out: **no permit type appeared mid-window**, and the only work classes that
did are irrelevant to this (Relocation, Awning, Grease Interceptor, Demo, Plumbing Utility
Connection — and `Roof`, see §5).

### What the feed cannot settle, and why

There is **no applicant or contractor field** in the Austin dataset. Measured, not assumed — the
full field list is in the measurement. So "who filed these" is unanswerable from here, and the one
signal that would distinguish a filing convention from an adoption wave — the descriptive detail
of what was installed — is the signal that vanished in July.

**The defensible statement is therefore:** dispersed residential filings for battery work rose
roughly tenfold against their own ten-month baseline, inside a flat feed, at the same moment their
descriptions became a template that omits system size. One of those facts is about homes and the
other is about paperwork, and this feed cannot apportion between them.

---

## 3 · San Antonio: storage is invisible, not absent

| | |
|---|---|
| columns in the city's permit file | `PERMIT TYPE`, `PERMIT #`, `PROJECT NAME`, `WORK TYPE`, `ADDRESS`, `LOCATION`, `X_COORD`, `Y_COORD`, `DATE SUBMITTED`, `DATE ISSUED`, `DECLARED VALUATION`, `AREA (SF)`, `PRIMARY CONTACT`, `CD`, `NCD`, `HD` |
| a description column | **none** |
| permit types in the window | 67 |
| types whose name mentions energy | **one**: `Solar - Photovoltaic Permit` (749 permits) |
| types new since our enumeration | none |

**There is no text to match and no type that names storage.** A battery installed in San Antonio
is filed under something that does not say so — most plausibly an electrical permit or the solar
type — and nothing in the file distinguishes it. This also independently confirms Round 50's
finding that all 5,666 committed San Antonio descriptions are empty: there is no column to fill
them from.

**Consequence for any future piece:** a storage finding is Austin-only and has to say so. "San
Antonio shows no storage" would be false; "San Antonio does not record it" is the true statement.

---

## 4 · Upstream: one candidate with a date, and what it would take

Checked, not speculated. Two external sources are relevant and **neither establishes causation**.

**Austin Energy, Solar Permitting Manual, published May 2026.** Any solar, battery or
interconnected generator project in Austin Energy territory requires an **Auxiliary Power
Electrical Permit**; residential grid-interconnected projects require a *Residential Auxiliary
Power EP*, explicitly including pre-wire-only and solar-plus-battery work. **This confirms from the
upstream document that `Auxiliary Power` is the city's class for battery work** — which is the
clearest possible statement that Round 50's mapping misread the class's meaning rather than
misreading the data. It does not say anything about how many batteries exist, and a manual being
*published* in May is not evidence that its content *changed* in May.

**Austin Energy, Power Partner Battery pilot.** A $500 rebate per system granted Permission to
Operate after final inspection, with an annual performance payment, capped at **1,500 approved
systems**, third-party-owned batteries excluded. Eligibility runs from PTO dates on or after
2026-02-18 — **so the programme predates the July step** and cannot by itself explain its timing.
For scale: our whole window holds 589 storage permits, 363 of them in the three complete months
from July.

**The single most decisive external check, which I have not done:** retrieve an **earlier revision
of that permitting manual** and compare what it required for battery-only work. If battery-only
projects newly required an Auxiliary Power EP around mid-2026, the step is a filing-rule change and
the series is not a homeowner trend. Austin Energy publishes the manual with a revision parameter
in its URL, so prior versions are likely retrievable from the utility or from an archive. That is a
document read, not a data question.

**What is not obtainable from any permit feed:** how many batteries were actually installed. Austin
Energy holds PTO counts and the pilot's enrolment numbers. Getting them means asking the utility.

**Searched for and not found:** any 2026 change to Austin's electrical-code adoption, and any
meter-socket requirement for batteries. Absence of a search hit is not evidence of absence.

---

## 5 · Two things noticed in passing

**`work_class = "Roof"` first appears 2026-08.** Round 6 measured it as **one row in 54,798** and
concluded Austin has no roofing class worth the name — which is why Austin roofing is a
description-text match with everything that implies. The city has now started using it (under 200
permits across the window, so still small). If that continues, Austin roofing could eventually be
read from a real class instead of a text match. Worth a watch item, not a round.

**We have no mechanism for the SOURCE changing its behaviour.** `CATEGORY_MAPPING_VERSION` exists
so our own methodology change cannot be silently compared across. Nothing expresses "the city
changed how it describes this work in July, so these two halves are not the same measurement" —
and that is exactly what happened here. A `sourceBehaviourVersion`, or simply a documented break
in the series, would be the instrument. Round 50's item 36 (a composition check on `sourceValues`)
would have *detected* this; it would not have *recorded* it.

---

## 5b · Item 42, measured now rather than in a few months

The owner's instruction: *"that one worries me more than it reads… don't wait a few months —
measure it now."* Fair, and the worry does not materialise.

| | |
|---|---|
| `work_class = "Roof"` across the whole feed | **1 permit, 2026-08.** None in September |
| roofing assignment mechanism, every month | **100% description-text** |
| roofing count, 2025-09 → 2026-09 | 210, 199, 168, 157, 121, 137, 129, 148, 114, 191, 150, 144, 167 — no break |

The vocabulary is stable too, which is the test storage failed. Term shares across
roofing-classified permits move month to month the way a text match over varied free text does:
*re-roof* 6–32%, *replace* 14–50%, *shingle* 7–23%, *repair* 2–12%. **No month collapses onto one
shape**, against storage's 8–25% → 92%.

One real trend fell out of it: the share of roofing permits that also mention solar falls from
**~50% in late 2025 to ~20–26% through 2026**, which independently corroborates the solar decline
Round 50's re-base found from the other direction.

The instrument now exists; re-measure if that class's volume ever leaves single digits.

## 6 · Verification

| check | result |
|---|---|
| every request built by the ingestion fetcher | `fetchAustinTradeRows` + `recountWindow` + `sanAntonioCsvUrl`; `extraSelect` added so there is still one Austin request path |
| no permit description in the measurement | asserted by a workflow step that reports the JSON **path** of any offender, never its text; **0 offenders** |
| probe wrote no dataset file | asserted; `site/src/data/generated` unchanged |
| `masterpermitnum` blank | **read** from the feed, not inferred from its distinct count |
| the Upgrade mechanism | prediction stated before the measurement, and **falsified** |
| `npm run check` | 0 errors, 0 warnings, 0 hints |
| `verify-trade-mapping` | 19/19 |

---

## 7 · The manual revision, retrieved — and it settles it

§4 named this as the one decisive external check. It was reachable, and it was run in Actions
because this session cannot reach the documents: the proxy answers **403 to CONNECT** for
`archive.org` and `web.archive.org`, and `austinenergy.com` and `services.austintexas.gov` do not
resolve. Measured, not assumed.

The archive holds **one** capture of the manual before May 2026: **2026-01-30**. Both it and the
live copy were downloaded and their full extracted text searched for named phrases — not the
filtered match list, because inferring absence from a filtered view is the mistake this round
already made twice.

| phrase | 2026-01-30 | live (published May 2026) |
|---|:--:|:--:|
| all DG — including energy storage — requires an Auxiliary Power EP | **yes** | **yes** |
| battery storage named explicitly | **yes** | **yes** |
| the 25 kW threshold | **yes** | **yes** |
| *"separated into their own"* Auxiliary Power EPs | **no** | **yes** |
| *"can be included together"* (solar and batteries) | **no** | **yes** |
| a trigger condition for *"project includes an Energy Storage System"* | **no** | **yes** |
| a published-version marker | no | yes |

**The permit requirement did not change. The filing instruction did.** January already read:

> "ALL Solar Distributed Generation (DG) Systems, Energy Storage Systems (ESS), and/or
> Interconnected Spinning Generators in Austin Energy (AE) territory will require an Auxiliary
> Power Electrical Permit" · "Residential Auxiliary Power Permit: required for any/all distributed
> generation interconnected to the Austin Energy grid (including solar, wind, **battery storage**,
> or grid-tied spinning…)" · "ESS = Energy Storage System, also known as Battery back-up"

The live revision adds the instruction that the types

> "…**should all be separated into their own Auxiliary Power EPs**"

### Why this explains everything the data showed, at once

One project that previously filed **one** Auxiliary Power EP covering solar-plus-battery now files
**separate** EPs. That single change accounts for every measurement in this audit:

| measurement | what the split predicts |
|---|---|
| count steps ~10× without the feed moving | same jobs, more permits each |
| kW and kWh ratings vanish (25 of 34 → 1 of 146) | a battery-only EP states the battery's scope, not the solar system's size |
| "additional meter socket" appears from zero | the battery-side scope described on its own |
| 90% share one description shape | a narrow standardised scope produces a narrow standardised description |
| `Upgrade` class stays flat | no new utility-side work — the same work, split differently |
| dispersion stays high (188 projects, 33 ZIPs) | the same dispersed residential jobs throughout |

**So the July step is a permitting-process change, not a battery-adoption wave** — and that is the
answer that says there is no story here to publish.

### What this does not establish

- **Only one pre-May capture exists.** The wording changed somewhere between 2026-01-30 and the
  May publication; the permit step lands in July–August. A lag of a few months between a manual
  revision and filing behaviour is plausible and is **not demonstrated here**.
- The instruction reads *"should"*. Nothing retrieved says when it began to be enforced.
- **It does not rule out real growth underneath.** Both can be true at once, and this feed still
  cannot apportion between them — §2 stands.

What would close the remaining gap is Austin Energy's own Permission-to-Operate count by month,
which no permit feed holds. That is now a much narrower question to ask them than the one in §4.
