# REVIEW.md — Pre-ship checklist

Run this before declaring any round "done" (i.e. before asking the owner to approve on
staging). Treat every failure as a **Rule 1** moment: fix it, or surface it and let the
owner decide. Don't quietly ship a fail.

Use your eyes: build it, open it in a browser preview, click through it, check mobile, read
the console. "Review is management" — a different view catches what the build view misses.

---

## 0. Build integrity

> `npm run sweep` runs everything in this section plus the replays, in an order that cannot be
> got wrong (it re-seeds the local fixture after the build, which is the step that kept being
> missed). Prefer it over running the steps by hand.

- [ ] `npm run build` succeeds from `site/` (no errors).
- [ ] `npm run check` (astro check / typecheck) is clean, or every remaining item is
      understood and surfaced.
- [ ] `npm run verify-content` passes (if the round touched content).
- [ ] `npm run check-links` passes — **0 broken internal links. This one fails the round.**
      It exits 1 on any href nothing serves. Round 32 added it after `/data/austin/storms/`
      shipped on two indexed pages: a link to a page that does not exist builds green, and
      nothing else asks the question. A new cross-link into a generated section resolves
      through that section's registry rather than being assembled from a slug.
- [ ] `npm run check-orphans` passes — no indexed page that nothing links to.
- [ ] Nav and CTAs are real crawlable `<a href>`; Locations dropdown works by keyboard and
      touch (not hover-only).

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

## 8. Verifying a round — who checks what

**The division of labour, set by the owner after Round 34.** A round is verified on the
**branch**: the build, `npm run sweep`, and render-side screenshots at the widths the round
cares about. **The live domain is the owner's check, not Claude Code's.**

- [ ] Branch verification is complete and quoted — the sweep's step count, the replay totals,
      and screenshots of what changed.
- [ ] **Do not block a round on reaching `texashomeintelligence.com`.** This sandbox's egress
      policy refuses CONNECT to it (`connect_rejected`, a 403 from the gateway) and has through
      every round so far. Note it in one line and move on; it is not a failure of the round and
      it is not something to retry at length.
- [ ] After a merge, **hand the owner a short list of exactly what to look at live** — the
      routes, the widths, and the specific thing that should be different on each. That list is
      the deliverable in place of a live screenshot.
- [ ] Never present a branch screenshot as a live one, and never describe the live site as
      confirmed on the strength of a branch render.
