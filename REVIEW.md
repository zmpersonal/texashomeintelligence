# REVIEW.md — Pre-ship checklist

Run this before declaring any round "done" (i.e. before asking the owner to approve on
staging). Treat every failure as a **Rule 1** moment: fix it, or surface it and let the
owner decide. Don't quietly ship a fail.

Use your eyes: build it, open it in a browser preview, click through it, check mobile, read
the console. "Review is management" — a different view catches what the build view misses.

---

## 0. Build integrity
- [ ] `npm run build` succeeds from `site/` (no errors).
- [ ] `npm run check` (astro check / typecheck) is clean, or every remaining item is
      understood and surfaced.
- [ ] `npm run verify-content` passes (if the round touched content).
- [ ] No dead links; nav and CTAs are real crawlable `<a href>`; Locations dropdown works by
      keyboard and touch (not hover-only).

## 1. Facts, sourcing, freshness (trust)
- [ ] Every data reading shows its **source + "as of / updated"** line.
- [ ] Every score/index shows a **"how this is calculated" methodology link** — no score
      without it.
- [ ] Estimates are labeled **"Est."** with a **range** and confidence — never false precision.
- [ ] No `SAMPLE` data anywhere on an **indexed** page. Placeholder/stale states are visibly
      marked; failed feeds show a clear unavailable/stale state, never silent zero/null.
- [ ] Facts render in **server HTML** (view-source shows the numbers; tables are real
      `<table>`). Charts are enhancement on top of present HTML, not the only copy of the data.

## 2. AI-optimization (indexed pages only — NOT the dashboard)
- [ ] Exact AI-prompt phrasing as an H2, answer in the first 1–2 sentences.
- [ ] Extractable formats present (tables, key-findings blocks, ranges).
- [ ] Schema present and valid (FAQPage / Article / Dataset / Organization / WebSite /
      BreadcrumbList as applicable). Test in a validator.
- [ ] Canonical set; trailing-slash policy consistent; OG/Twitter present.
- [ ] `robots.txt` + `llms.txt` still allow citation crawlers; **Cloudflare Bot Fight Mode /
      WAF is not blocking them at the edge**.
- [ ] Copy does **not** lead with "AI" as the pitch.

## 3. Dashboard (stickiness · usability · value — NOT AI-extraction)
- [ ] ZIP layer works with **no capture** and no account.
- [ ] Home-unlock captures **address + email to D1 with explicit consent** (see `SECURITY.md`);
      consent text present; nothing stored before consent.
- [ ] Instrument-panel feel holds: information ladder legible (Data → Analysis → Estimate →
      Recommendation → Sponsored), one hero number + one primary action per view, status
      color used as **small signal only** (no radar-red wash).
- [ ] "What changed this week" / return hook present and correct.

## 4. Brand (see `BRAND.md` / `THI-Brand-Kit.md`)
- [ ] Palette: navy + mineral neutrals carry the surface; amber is a sparing accent; status
      colors only as dots/chips/borders/sparklines.
- [ ] Type: Newsreader headings · IBM Plex Sans UI/body · IBM Plex Mono numbers (tabular).
- [ ] Any sponsored/commercial block is quarantined in **Sponsor Sand** with its hairline +
      "Sponsored" label — never borrows status colors, Signal Blue, amber, or the score ring.
- [ ] No Texas kitsch; no generic-SaaS/generic-AI defaults; header at locked height with the
      crawlable wordmark beside the mark.
- [ ] **Frozen copy** rendered exactly as supplied; only AI-phrase content pages are
      Claude-authored, and they follow brand voice + the AI-optimization rules.

## 5. Accessibility & mobile
- [ ] Real mobile pass (test at phone widths, not just a desktop collapse). Tap targets,
      readable numbers, no horizontal scroll.
- [ ] Visible, consistent keyboard focus style on tabs, dropdowns, expandables, buttons.
- [ ] Status never relies on color alone (icon + label + position).
- [ ] `prefers-reduced-motion` respected; no ambient looping animation.

## 6. Security & cost (see `SECURITY.md`, `COST.md`)
- [ ] No secret in client JS or committed to the repo; keyed calls + tool logic server-side.
- [ ] No LLM call in the runtime or ingestion path; no per-request DB query on the public
      serving path; no new per-request paid dependency introduced.
- [ ] PII (address/email) only captured server-side, post-consent, into D1; the two data
      domains (home-intelligence vs. market/query intelligence) stay conceptually separate.

## 7. Ship discipline
- [ ] Work is on a **branch**; diff + change summary ready for the owner.
- [ ] Any owner seam left is stubbed with a documented TODO in `HANDOFF.md`.
- [ ] **Deploy to live only on the owner's explicit command.** Staging approval ≠ auto-deploy.
