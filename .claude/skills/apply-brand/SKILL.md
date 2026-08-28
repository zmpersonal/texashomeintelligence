---
name: apply-brand
description: Apply the Texas Home Intelligence brand system when building or restyling ANY THI user interface — the dashboard, cards, pages, buttons, charts, share cards, or components. Use this whenever you are writing or editing UI, HTML, Astro/Tailwind markup, CSS, or design tokens for THI, or reviewing UI for brand compliance, even if the user doesn't say the word "brand." It enforces the instrument-panel look, the navy+amber palette, the Newsreader/IBM Plex type system, the information ladder, and the ALWAYS/NEVER rules from the brand kit.
---

# Apply Brand — Texas Home Intelligence

Turn the THI brand system into a repeatable build routine so every surface comes out
on-brand the first time. The **canonical** sources are `THI-Brand-Kit.md` (full system) and
`site/src/styles/thi-tokens.css` (tokens); `BRAND.md` is the operational summary. This skill
tells you how to use them.

## Step 1 — Load the tokens, don't hardcode
- Confirm `site/src/styles/thi-tokens.css` exists and is imported. **Use its CSS variables /
  Tailwind tokens** for every color, type size, radius, and spacing value. Do not paste raw
  hex values into components.
- If the tokens file is missing, generate it from `THI-Brand-Kit.md` §5 (color), §6
  (type), §8 (shape/space), and say you did so (Rule 1). Never invent values that contradict
  the kit.

## Step 2 — Pick the surface, apply the right rules
- **Indexed content/authority page?** Brand + the AI-optimization rules in `ROADMAP.md` both
  apply. Facts in server HTML, source+freshness lines, schema.
- **Dashboard / tool?** Brand + usability/stickiness. This is an **instrument panel**: one
  hero number + one primary action per view; dense but calm; status color as small signal.
  Do NOT apply the AI-extraction ruleset to the dashboard.
- **Sponsored/commercial block?** Quarantine it (Step 4).

## Step 3 — Build to the signature rhythm
Every data card follows: **eyebrow label → Newsreader heading → IBM Plex Mono number**, with
a plain-language Plex Sans sentence under the number, and a mono `Source · as of …` line.
Follow the information ladder — users must always know which rung they're reading:

`Data → Analysis → Estimate → Recommendation → Sponsored`

- **Data:** Plex Mono value (tabular), neutral color, source+freshness line.
- **Analysis:** one Plex Sans sentence — what the number means.
- **Estimate:** amber **"Est."** tag + a **range** + a confidence chip. Never false precision.
- **Recommendation:** action card (verb + why), navy CTA, **below a divider** — never blended
  into the reading.
- **Score:** the Home Stress Index headline sits on a dark navy panel with a status-color
  ring, a one-line read, a sparkline, and a **"how this is calculated" link — never omit it.**

## Step 4 — The quarantine rule (protects the whole brand)
Sponsored/commercial content uses **only** Sponsor Sand `#F4F2EC` bg + Sponsor Line `#E3DFD3`
+ Ink/Slate/Navy text + a navy CTA, with a mono "Sponsored" label. It **never** uses status
colors, Signal Blue, Caliche Amber, or the score ring. Objective intelligence and commercial
recommendation must never share a visual language.

## Step 5 — Color discipline
- Navy + mineral neutrals carry ~90% of the surface. **Amber is a sparing accent (~3%)** —
  one deliberate use per view.
- **Status colors are indicators only** — dots, chips, left-borders, sparklines. The moment a
  status color fills a large region (outside the left-border alert pattern), it reads like a
  weather alarm — stop.
- Small text: never amber/Watch/Elevated on white (use dark variants); never amber small-text
  on navy. Status never relies on color alone — always icon + label + position.

## Step 6 — Type, shape, motion
- Newsreader headings · IBM Plex Sans UI/body · IBM Plex Mono numbers (tabular, aligned).
  Never Inter.
- Cards 8px radius, 1px Line border, restrained shadow (elevation from borders, not heavy
  shadows). Buttons 6px, chips 4px, 4px spacing base.
- Motion purposeful and quick (150–250ms, ease-out); numbers count up once; respect
  `prefers-reduced-motion`. No ambient looping animation.

## Step 7 — Logo caution
The logo is **not finalized**. Treat the mark as a **swappable asset**; never hard-commit
downstream code to a specific logo. Always keep the crawlable "Texas Home Intelligence"
wordmark beside it. Header stays at its locked height.

## Step 8 — Self-check against the kit's ALWAYS/NEVER
Before finishing, run the ALWAYS/NEVER list in `BRAND.md` (mirrors kit §18) and the Brand
section of `REVIEW.md`. Any conflict between a request and these rules is a **Rule 1** moment
— surface it and let the owner decide.

## Reference map (open as needed)
- `THI-Brand-Kit.md` §5 color · §6 type · §8 visual language · §9 dashboard system ·
  §10 share cards · §17 component tokens · §18 ALWAYS/NEVER · §19 final board.
- `BRAND.md` — the operational summary.
- `THI-brand-board.html` — rendered visual reference.
