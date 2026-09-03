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
- ~~**DNS cutover** (old GitHub-Pages Jekyll → the Cloudflare Worker)~~ — **done.** The
  owner cut DNS over; `texashomeintelligence.com` is served by the Worker and the Jekyll
  root no longer serves. Kept here as a record, not a pending task.
- **Billing / plan changes / provisioning paid infra.**
- **Real secrets / API keys / real Cloudflare KV+D1 IDs** — owner sets these; you reference
  env/secret names only.
- **Production data & PII decisions** — what's stored, shared, retained, deleted.
- **Merge-to-main / deploy-to-live.** See the deploy boundary below.

---

## The push → deploy boundary (read carefully — the site is live)

**`main` auto-deploys to `texashomeintelligence.com`.** Cloudflare Workers Builds is
connected to this repo and builds + deploys on every push to `main`. There is no separate
"promote to production" step and no approval gate on the Cloudflare side.

**So the branch is the only thing standing between a commit and production.** Merging to
`main` IS deploying to the live domain — treat the two as the same action, because they
are.

- **Default: work on a feature branch.** Show the diff + a change summary. **Request
  approval** to merge. Do **not** merge to `main` on your own initiative, ever.
- **Merging IS allowed — but only on the owner's explicit command** ("merge it" / "push it
  live" / "deploy"). Approval of a *branch* is not approval to merge it.
- "Done" = the owner approves. The merge is a **separate, explicit** step after that.
- The `*.workers.dev` hostname still resolves to the **same** Worker as the live domain —
  it is not an independent staging environment. Anything deployed is deployed for both.
  Pre-merge verification therefore happens on a branch, locally, not on a staging deploy.

### 🟡 Open item — there is no review surface. Needs an owner decision.

**Recorded, not solved.** Removing the staging claim above leaves a real gap rather than
just a wording fix, and it should be decided deliberately.

`wrangler.jsonc` defines one Worker with no environments (`definedEnvironments: []`), so
**no deployed pre-production surface exists.** Under the old model "done" meant the owner
reviewed a running deployment before it reached the public. Today it cannot mean that.

What "the owner approves before merge" actually means right now:

- the **diff** on a branch, and
- a **report of local verification** — `build`, `check`, `verify-content`, the Playwright
  render checks and assertion replays run against a local Miniflare worker.

Nobody looks at the change on a real deployment before it becomes production. Local
verification has caught things a green build could not (a dropped `@import`, a missing
`h1`, a 308 on a POST, a throwing adapter getter), so this is not nothing — but it is a
narrower gate than reviewing a deployed artifact, and it is worth naming as such rather
than letting "approves before merge" quietly carry its old meaning.

**This needs an owner decision before any structurally significant round** — the county
data model and the San Antonio parity work both change the serving path. No option is
proposed here on purpose; the decision is the owner's to frame.

---

## Secrets

- **Never** commit a secret, API key, or real binding ID to the repo. **Never** ship one in
  client JS.
- All keyed calls and all tool/scoring logic run **server-side** (Astro server routes on the
  Worker). The browser gets outputs, never keys or proprietary constants.
- `wrangler.jsonc` KV/D1 IDs in the repo are the **real** ones, verified against the
  owner's Cloudflare account (that file's own comment records the check). They are resource
  identifiers, not credentials — useless without account authentication — which is why they
  are committed. The older "local placeholders" note was stale.
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
