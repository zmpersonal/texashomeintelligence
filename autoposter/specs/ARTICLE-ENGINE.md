# ARTICLE-ENGINE.md — the shared article process skeleton (site-agnostic)

The article is the **spine** of the content system: a deep, sourced, myth-buster analysis that
becomes a citable, persistent page — the only output that serves the #1 KPI (AI answer-engine
citation + SEO). Social promotes the article, not the other way around.

> **This file is the SHARED PROCESS every network site follows.** It contains NO site topics, no
> site voice, no site URLs. Two things vary per site and are kept OUT of this file:
> 1. **Editorial identity** — topic universe, angles, data, voice, brand-safety lines → lives in
>    a per-site editorial spec: `ARTICLE-ENGINE.<site>.md` (e.g. `ARTICLE-ENGINE.thi.md`).
> 2. **Publish mechanics** — repo, URL, embed, deploy → lives in `PUBLISH-TARGET.<site>.md`.
>
> **The engine REQUIRES both a site editorial spec AND its named publish target, and HALTS without
> them.** No default site, no fallback, no inferring from context. This two-lock design (editorial
> spec names its target; target self-identifies its domain; both must agree) is what makes
> wrong-site publishing effectively impossible when the engine is reused. Keep the *process* here
> shared so it never drifts between sites; keep the *editorial* per-site so articles keep their soul.

---

## Invocation contract
```
run_article_engine(site="thi")
  → loads ARTICLE-ENGINE.thi.md    (editorial identity; HALT if missing)
  → which names PUBLISH-TARGET.thi.md (publish mechanics; HALT if missing)
  → asserts target self_id domain matches before any write (HALT on mismatch)
```

## Cadence & role (defaults; a site spec may override)
- One deep article every **1–2 weeks**. Quality over cadence — each must land as a durable,
  citable asset; some also break out on social. Honest model: a compounding library that spikes
  occasionally, not a viral slot machine.
- The **movers engine** (`MOVERS-ENGINE.md`) acts as a **topic-detector** feeding Stage 1.
- The **reels engine** (`REELS-ENGINE.md`) runs in parallel on its own clock (reach, not citation).
  Neither stream blocks the other.

---

## Stage 1 — Topic detection + scoring (deterministic where possible)
Sub-agents gather candidate topics; **code scores them** so the human approves a ranked shortlist
rather than the machine picking.

Inputs (the site editorial spec supplies the *topic universe* these draw from):
- **What's being discussed now** — sub-agent scan of local subreddits, local news, search trends,
  the site's own traffic/queries.
- **What the data can defend** — cross-reference candidates against the site's feeds: can we answer
  this rigorously from our own data?
- **Movers signal** — topics flagged as anomalous by the movers engine.

**Topic score** = weighted blend of: public interest (virality) · data strength (defensibility) ·
question-shape (citability) · **brand-safety (a high-weighted PENALTY term)** · money-bonus
(arousal). Exact weights and the topic universe come from the **site editorial spec**. The scorer
must SURFACE any virality-vs-brand-safety tension in the shortlist so the human decides consciously,
never by drift. **Human picks the angle (🟡).**

### Brand-safety gate (hard, at topic stage — site spec defines the specifics)
Every site editorial spec MUST declare its brand-safety lines (banned framings, gated topics,
launch-safe topics). The engine enforces whatever that spec declares, and additionally enforces the
global VALIDATOR G8 (no desirability/steering framing about who lives where) on ALL sites.

---

## Stage 2 — Research sub-agents (Manus + Perplexity as INPUTS, not authorities)
For the chosen topic: (1) collect the data from the site's feeds; (2) deterministic summary of what
the numbers say (the spine of truth); (3) generate research prompts for Manus + Perplexity anchored
to that data summary; (4) retrieve answers; (5) interesting-takes / copywriting pass.

**Discipline:** external research surfaces leads, context, framing, and others' claims — it is NOT
publishable authority. A claim earns its place only when it traces to the underlying data or an
official source with a date.

## Stage 3 — Claim-verification gate (the unit of verification is the CLAIM, not the article)
The dangerous failure is a **wrong article published with authority** that a journalist or AI engine
repeats. Before writing: every factual claim traces to source + date; claims sourced only to
Manus/Perplexity with no underlying data are cut or downgraded to hedged language; build a **claim
ledger** (`claim → source → as_of → confidence`). The human gate reviews the ledger, not just the
prose. Reuses VALIDATOR G1/G2/G5 at article scale.

## Stage 4 — Write (Claude — the model-heavy step)
From the verified ledger + data summary + approved angle, per the site editorial spec's voice:
SEO+AEO optimized (question-shaped H1, direct answer surfaced high for extraction, sourced
throughout, scannable), a social-tailored lead-in that doubles as the promo hook, and a live-data
embed spec. Every stat renders with source + `as_of` inline.

## Stage 5 — Publish to the CORRECT site (via PUBLISH-TARGET.<site>.md)
The engine hands the finished article + embed spec to the named publish target. It does not know or
hardcode where any site lives — the target file does, and self-identifies its domain (the engine
asserts a match, HALT on mismatch). Deploy honors each site's rules (THI = deploy-on-command, 🔴).

## Stage 6 — Hand off to social (the promotion layer)
On confirmed live URL, `social-autoposter` atomizes + promotes; **every piece links back to the
article URL.** Until the URL resolves, social scheduling for that article is HELD (no dead links).

## Where this plugs into the 21-step SOP
Stages 1–4 are a research-and-write phase in front of the social skill; Stage 5 publishes the
citable asset; Stage 6 IS the social-autoposter flow promoting an article. The back half
(validator, voice, atomization, Blotato scheduling, weekly session, autonomy gate) is unchanged.

## Adding a new network site later
Create `ARTICLE-ENGINE.<newsite>.md` (editorial identity) + `PUBLISH-TARGET.<newsite>.md` (mechanics).
Do NOT copy this process file — reference it. That's what keeps claim-verification and the guard
chain identical across sites while each site keeps its own editorial soul.
