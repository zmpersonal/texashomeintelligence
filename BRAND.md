# BRAND.md — Brand guardrails (operational)

The **canonical** brand system is **`THI-Brand-Kit.md`** (v1.0, 19 sections) and the
implementation tokens in **`site/src/styles/thi-tokens.css`** — which imports the delivered
Claude Design token set committed verbatim under **`site/src/styles/thi/`**
(`tokens/*.css` + `base/primitives.css`). Those `thi/` files are the canonical
implementation source of truth; never re-derive values by hand. This file is the quick,
enforceable summary you apply while building; when in doubt, open the kit.

**Canonical layout reference** (dashboard, ZIP view, share cards): the delivered design
screens in **`docs/source/design/`** — `THI Home Dashboard.dc.html`,
`THI Public ZIP Dashboard.dc.html`, `THI Share Card.dc.html` (plus the AHI weekly variant
and the earlier mockup for historical context). Superseded and no longer referenced:
`THI-brand-board.html`, `MOCKHUP-Dashboard-V1.html`, `logo-d1.png`.

Never invent palette/type values that contradict the kit or the `thi/` token files.

> **Logo is NOT finalized.** The uploaded marks (house-radar `logo-d1.png`, and the kit's
> "Meridian Mark") are candidates only. Wire the header/favicon so the **mark is a swappable
> asset**; never hard-commit downstream code to one logo. The crawlable **"Texas Home
> Intelligence" wordmark** stays beside the mark regardless.

---

## The one idea

*Situational awareness for your home.* Calm, sourced, local intelligence — a well-made
**instrument panel, not a weather-radar alarm.** Authoritative, transparent, precise, calm,
local, restrained.

## Core tokens (summary — kit is canonical)

- **Navy base:** Meridian Navy `#0C2340`, Depth Navy `#081A31`. Carry ~90% of the surface
  with mineral neutrals (Ink `#0E1726`, Slate 700/500/400, Line `#D9DEE6`, Mist `#EEF1F5`,
  Paper `#F7F8FA`, white Surface).
- **Accent:** Caliche Amber `#C4772E` — **sparing (~3%)**, one deliberate accent per view
  (active indicator, underline, logo node). Small amber text uses Amber Deep `#9E5E22`.
- **Interactive/data:** Signal Blue `#2A6FB0` (links, selected, chart series 1); hover
  `#1E5488`.
- **Status ramp (indicators only):** Safe `#1F7A54` · Watch `#B4831F` · Elevated `#CE5A1B` ·
  Severe `#A82E22` · Unknown `#8A94A3`, each with its pale tint bg. Use as **dots, chips,
  left-borders, sparklines** — never as a large fill.
- **Commercial (quarantined):** Sponsor Sand `#F4F2EC` bg + Sponsor Line `#E3DFD3`. Sponsored
  blocks use ONLY these + Ink/Slate/Navy text + a navy CTA. **Never** status colors, Signal
  Blue, amber, or the score ring.
- **Type:** **Newsreader** (editorial headings) · **IBM Plex Sans** (UI/body) · **IBM Plex
  Mono** (numbers, tabular figures). Never Inter. The signature rhythm is
  eyebrow-label → Newsreader heading → Plex-Mono number on every data card.
- **Shape/space:** cards 8px radius + 1px Line border + restrained shadow; buttons 6px; chips
  4px; 4px spacing base. Elevation from borders/hairlines, not heavy shadows.

## The information ladder (fixed visual signature per rung)

Users must always know which rung they're reading:

`Data → Analysis → Estimate → Recommendation → Sponsored/Commercial`

- **Data** — Plex Mono value + mono `Source · as of` line, neutral color.
- **Analysis** — plain-language Plex Sans sentence under the number.
- **Estimate** — value with an amber **"Est."** tag + a **range** + a **confidence** chip.
- **Recommendation** — action card with a verb + a "why," navy accent / navy CTA, below a
  divider (never blended into the reading).
- **Sponsored** — the quarantined Sponsor Sand box only.

**Score rule:** the Home Stress Index (0–100) headline number appears on a dark navy panel
with a status-color ring, a one-line plain read, a sparkline, and a **"how this is
calculated" link — never without that methodology link.**

## ALWAYS
1. Show **source + freshness** on every reading (the mono `Source · as of …` line).
2. Label **estimates as estimates** — range + amber "Est." tag; measured values for measured
   data only.
3. Keep **objective intelligence and commercial content visually quarantined**.
4. **One hero number + one primary action** per view.
5. Numbers in **IBM Plex Mono, tabular, column-aligned**.
6. Communicate urgency through **specificity + sourcing, calmly** — never caps/exclamation/fear.
7. Keep the interface **cool and quiet**; spend amber sparingly.
8. **Status color = small signal only**, always paired with icon + label (never color alone).
9. Maintain **one entity family** (same mark, palette, type, status meanings) — no per-city fork.
10. Name places **specifically** (ZIP, neighborhood, city, climate) — earned local authority.

## NEVER
1. A **number without its source/freshness**, or a **score without its methodology link**.
2. A **derived value presented as measured** (no false precision, no unlabeled estimates).
3. **Commercial blocks borrowing** the look of objective intelligence.
4. A **weather-radar look** — no field of saturated risk color, no red-alert wash, no flashing.
5. **Texas kitsch** (cowboy hats, boots, longhorns, Alamo, tourist stars).
6. **Generic-SaaS / generic-AI defaults** (Inter, gradient-mesh hero, "AI analyzes millions
   of data points," cream+terracotta template).
7. **Fearmongering or over-punctuation** — if it reads like a scam text, it's wrong.
8. **Amber/Watch/Elevated as small body text** on white (use the dark text variants); no amber
   small-text on navy.
9. Let the **header grow** past its locked height, or ship the mark **without** the crawlable
   wordmark.
10. **Fork the visual system per city** or add a second logo/palette/type for a metro edition.

---

Dashboard specifics live in kit §9; share-card system in §10; full color/type/component
detail in §5–§8 and §17. The `apply-brand` skill turns this into a build routine.
