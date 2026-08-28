# SECURITY.md — Permissions, secrets, and data safety

Governed by `CLAUDE.md` Rule 1. This project is **lead-gen-grade secure now** and must be
**subscription-sales-grade later** (accounts, auth, recurring billing add real surface area
— plan for it, don't build it yet). When any action is ambiguous against these tiers,
**surface it and ask** rather than act.

---

## Permission tiers

### 🟢 Safe — do freely (on a branch)
- Read any file; inspect the repo; map the architecture.
- Run `npm run dev / build / preview / check / verify-content`.
- Create and work on a **feature branch**; edit anything under `site/` on that branch.
- Trigger the **data-ingestion GitHub Action** — it hits **free, read-only public feeds**
  (NOAA, EIA, AirNow, Census, BLS) on free Action minutes. Free + read-only = no permission
  needed.
- Edit read-only reference/staging material where nothing risky runs.

### 🟡 Ask first — stop and get an explicit OK
- Adding/upgrading **dependencies**; changing the build/deploy config.
- **Database migrations** or schema changes; touching `wrangler.jsonc` bindings.
- **Auth**, session, or anything touching **PII handling** beyond the agreed capture flow.
- **Any paid API** or any call that could **incur cost** or hit an external paid service.
- **Deleting files**; large refactors; a full rebuild of the `site/` app.
- Anything that could call other sites/services or "rack up bills."

### 🔴 Human-owns — never do without the owner performing/commanding it
- **DNS cutover** (old GitHub-Pages Jekyll → the Cloudflare Worker) — owner does this.
- **Billing / plan changes / provisioning paid infra.**
- **Real secrets / API keys / real Cloudflare KV+D1 IDs** — owner sets these; you reference
  env/secret names only.
- **Production data & PII decisions** — what's stored, shared, retained, deleted.
- **Merge-to-main / deploy-to-live.** See the deploy boundary below.

---

## The push → deploy boundary (read carefully)

Committing to a deploy-tracked branch triggers a rebuild, so "editing repo files that get
merged" can equal "deploying." Therefore:

- **Staging** (the `*.workers.dev` URL) is the **freely testable** surface. Iterate there.
- The **DNS-live domain** is the **protected** surface.
- **Default: work on a feature branch.** Show the diff + a change summary. **Request
  approval** to merge/deploy. Do **not** merge to `main` or deploy on your own initiative.
- **Deploying to live IS allowed — but only on the owner's explicit command** ("push it
  live" / "deploy to production"). Staging approval alone is **not** a deploy command.
- "Done" = owner approves on staging. Live push is a **separate, explicit** step after that.

---

## Secrets

- **Never** commit a secret, API key, or real binding ID to the repo. **Never** ship one in
  client JS.
- All keyed calls and all tool/scoring logic run **server-side** (Astro server routes on the
  Worker). The browser gets outputs, never keys or proprietary constants.
- `wrangler.jsonc` KV/D1 IDs in the repo are **local placeholders**; real IDs are the
  owner's to set in the Cloudflare environment.
- If a task seems to require a secret you don't have, **stop and stub** with a documented
  TODO in `HANDOFF.md` — never hardcode or fake it.

---

## PII & consent (the dashboard capture flow)

This build **does** capture PII, so handle it correctly from day one:

- **ZIP layer = no capture.** ZIP-level reads store nothing and need no account or consent.
- **Home unlock = address + email → PII.** Only at the explicit "unlock my home" step:
  - Capture **server-side only**, into **D1** (the existing `DB` binding). Never write PII
    from client JS.
  - Record **consent + consent_source + timestamp** alongside the record; **store nothing
    before consent** is given.
  - Keep **homeowner-facing PII separate from any contractor-facing data** (schema/boundary).
  - **No lead resale / sharing** before the owner's legal review (TDPSA / TCPA / privacy
    policy). Leads are deferred this build anyway.
- Keep the **two data domains** separate (see `CLAUDE.md`): home/location intelligence + PII
  vs. the future market/query-intelligence (SEMrush) ops store. PII lives only in the former.

---

## Crawler / edge safety (protects KPI #1, so it's a security item too)

- `robots.txt` + `llms.txt` must keep citation crawlers allowed.
- **Verify Cloudflare Bot Fight Mode / WAF / rate-limiting is not blocking citation crawlers
  at the edge** before/after any go-live. This is the most common self-inflicted way to lose
  AI citations.

---

## When the future subscription tier lands

Not now, but don't box it out: it will add user accounts, authentication, session hardening,
and recurring billing (e.g. Stripe). Keep today's choices compatible — don't design the PII
store or the Worker routes in a way that would have to be torn out to add auth + billing.
Surface it (Rule 1) if a current decision would make that harder.
