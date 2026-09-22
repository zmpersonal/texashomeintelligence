# Round 35b — crime on THI: the brand-grammar and harm questions

Date: 2026-09-22 · Branch: `claude/thi-v3-round35-crime-probe`, from `main` at `e29c72a`.
Docs only. No code, no page, no data.

This answers sections **E** and **F** of the Round 35 probe, which stopped at reachability before
measuring anything. Neither section depends on the data: E is a question about whether a crime
reading can be phrased the way every other THI reading is phrased, and F is a question about what
publishing one would expose. Both are answerable from the rules the project already has.

**Verdict: NOT VIABLE. Recommend dropping backlog item 7.** The reasoning is in §1 and §2; the
decision list it produces is in §4.

---

## 1 · E — brand grammar

### The rule being tested

CLAUDE.md fixes the product as "situational awareness for your home … a calm, sourced
**instrument panel, not a weather-radar alarm**." BRAND.md's NEVER list forbids "a weather-radar
look" (#4) and "fearmongering" (#7); its ALWAYS list requires "one hero number **and one primary
action** per view" (#4) and that places be named specifically as "earned local authority" (#10).

The grammar that follows is enforced in code, not just in prose. `r7replay.mjs` carries a
banned-phrase guard over every rendered action — 26 words including *fix, repair, replace,
contractor, damage, claim, insurance* — so a THI action can say **look** or **check** and cannot
say **fix**. Conditions → check. Never damage → fix.

### The test that actually matters

"Can I write an action for this reading?" is the wrong question, because an action can always be
written. The right question, and the one every existing signal passes, is:

> **Does the number change the action?**

- **Drought category** changes what a homeowner should do with water *this week*.
- **A freeze forecast** changes what they should do *tonight* — the alert's checklist is
  different from the one they would follow in ordinary weather.
- **Recorded hail in their county** changes whether looking at the roof is worth doing *now*
  rather than at the next seasonal check.
- **Heat holding in the area** changes what they ask of a cooling system today.

In each case the reading's *value* moves the recommendation. That is what makes it a reading
rather than a reminder with a number stapled to it.

### The candidate framings, worked through

**(a) A property-crime-only reading** — burglaries and thefts only, on the argument that this is
about a home's exposure rather than an area's character.

This is the strongest candidate and it fails the test above. The actions available — check the
exterior lighting, check that locks and deadbolts work, test the alarm, do not leave deliveries
sitting out — are correct advice **whatever the number says**. A homeowner should check their
locks in a month with a low count and in a month with a high one. Nothing in the reading changes
what they should do, which means the data is not doing any work: it is decoration on advice that
stands without it.

It fails a second way. THI's readings are current conditions; reported-crime data is a record of
reports, published on a lag. A count for a period that closed weeks or months ago is not a
condition a homeowner is currently in.

**(b) A seasonal or timing reading** — the months or hours when a category of property crime is
most reported.

This is the only framing that produces something genuinely condition-shaped: seasonality is a
pattern, not a judgement, and it can end in a real action about timing. But it fails for a
different reason — **it does not need the data**. The seasonal shape of package theft or
warm-weather burglary is general knowledge, not local intelligence, and a THI reading built on it
would either restate something available anywhere (failing BRAND ALWAYS #10, earned local
authority) or dress a national pattern in a local number to make it look earned. THI would be
ingesting a feed to say something it could say without it.

**(c) Anything ending in an action the reminder engine already handles** — lighting, locks,
package timing, alarm tests.

The reminder catalogue already carries eight recurring tasks, including a smoke/CO alarm test. A
security-adjacent reminder — an exterior lighting check, a lock or alarm test — could be added to
that catalogue **today, with no crime data at all**, and would be just as useful. This candidate
does not argue for a crime feed; it argues for two more rows in a list THI already ships. If the
owner wants the homeowner benefit, that is where it is, and it is a small item rather than a data
domain.

**(d) A per-ZIP rate or score, or a trend** — for completeness, since the probe listed them.

A score attached to an area is a judgement about that area rather than a condition acting on a
building, which is the opposite end of the grammar from every existing signal. It is also the
shape that carries the whole of §2's exposure. It does not survive E and it is the worst case
under F.

### What the recommendation line would have to say

Following the grammar honestly, the best available line is something like *"Reported property
crime in your area was X last quarter. Check your exterior lighting and that your locks work."*
The second sentence is true, useful, and **entirely independent of the first**. That is the
finding: the only honest action a crime reading can produce is one that does not need the
reading.

**E's answer: no candidate survives.** The reading either does not move an action, or does not
need the data, or is not a condition acting on a home.

---

## 2 · F — harm and framing

Stated the way HANDOFF's lead-handoff seam states its open regulatory question: **I can name the
shape of these questions precisely. I cannot answer them and should not try.** Nothing below has
been checked against a statute, a regulator's guidance, or counsel. Treat it as the shape of the
question, not as findings.

### The fair-housing and steering question

THI is a housing-adjacent service. US fair-housing law and its Texas counterpart reach
housing-related services and advertising, and *steering* — directing people toward or away from
areas — is among the conduct they address. Whether a published per-area figure on a site like
this touches any of that is the question. **Three variables change the exposure, and they change
it independently:**

- **Framing.** A neutral record ("reports recorded, counted, sourced, with its lag stated") and a
  judgement ("area safety score: 62") are different artifacts built from the same rows. The
  second asserts a quality of a place; the first reports an administrative record.
- **Placement.** The same figure means different things in different slots. Inside a per-ZIP
  dashboard it reads as an attribute of that ZIP, sitting beside signals a homeowner is meant to
  act on. In an article about a metro it reads as reporting. The dashboard placement is the one
  THI would naturally want and the one that carries most of the question.
- **Grain.** Metro, county, ZIP and sub-ZIP are not the same exposure. The finer the geography,
  the more the figure functions as a statement about a specific set of addresses and the people
  at them.

**Two further properties of the data itself compound all three.** First, reported-crime figures
measure *reports and enforcement activity* as much as events — differences between areas can
reflect differences in reporting rates and policing, and a reading that presents them as a
property of a place carries that conflation forward. Second, area-level crime figures are known
to correlate with the demographics of an area, which means a score can function as a proxy for
protected characteristics **with no demographic input and no intent** — a well-documented concern
with area-level scoring generally, and one that intent does not answer.

And one forward-looking note: leads are deferred in the current build but not abandoned. If THI
readings ever feed a lead funnel, a per-area figure stops being only editorial and becomes part
of a housing-adjacent commercial flow, which is a different question again.

### The reader-harm question, stated separately

This is distinct from the legal one and, to my mind, the more decisive of the two.

**Every other THI reading either helps the reader act or is neutral to them. This is the only
reading with a mechanism by which the reader is worse off for THI having published it.** A
homeowner arriving at their own ZIP's page is the person THI exists to serve. A figure attached
to that ZIP can bear on how their own property is perceived — by a buyer, by an insurer, by a
neighbour reading the same page. THI would be publishing something about the reader's own asset
that the reader did not ask for and cannot correct.

The asymmetry is worth stating plainly: the upside is an action they should take anyway (§1), and
the downside lands on them and on people who never visited the site at all. No other signal on
the dashboard has that shape. A drought category says nothing about a homeowner's neighbours; a
crime count does.

**Who should answer these:** the fair-housing and steering question belongs with a lawyer
familiar with fair-housing and advertising law in Texas, before any build round, not after. The
reader-harm question is the owner's to weigh; it is a product judgement rather than a legal one,
and §3 is my recommendation on it.

---

## 3 · Verdict

**NOT VIABLE. Drop backlog item 7.**

- **E is decisive on its own.** No candidate framing produces a reading whose value changes what
  a homeowner does. The best honest line pairs a number with an action that does not need it. A
  signal that fails that test is not a THI signal, whatever the data turns out to look like.
- **F removes the case for gathering the data anyway.** It introduces a category of exposure THI
  takes nowhere else, with the downside falling partly on people who are not THI's readers — and
  it does so in exchange for the benefit E already showed to be independent of the data.
- **A–D were never the binding constraint.** Even if Austin and San Antonio both published clean,
  point-located, currently-updated, comparable incident data under permissive terms — the best
  case A–D could return — the answer here would not change. That is why this memo could be
  written without gathering a file, and why gathering the files is not the next step.

**The one thing worth keeping from the idea:** a homeowner benefit exists in the security-adjacent
actions (exterior lighting, lock and alarm checks). It lives in the reminder catalogue, needs no
crime data, and is a small item rather than a data domain. Noted as a candidate, not proposed.

---

## 4 · Decision list

- **D7 — answered by this memo, subject to the owner's agreement: crime does not belong on THI.**
  Item 7 to be closed rather than scheduled. If the owner disagrees with the reasoning rather than
  the conclusion, the thing to argue with is §1's test — *does the number change the action?* — and
  the counter would need a framing that passes it.
- **D7a — the security-adjacent reminders.** Whether to add an exterior-lighting check and an
  alarm/lock test to the reminder catalogue. Independent of everything above; needs no probe.
- **D7b — if the owner wants crime revisited despite this memo**, the sequence is the reverse of
  the one Round 35 attempted: the fair-housing question goes to counsel **first**, because a
  negative answer there ends it regardless of what the data shows, and gathering files before that
  is effort spent ahead of the gate.
