# Round 0c — What an isolated preview deployment would require

**Read-only assessment. Nothing was changed, enabled, or deployed.** No design is proposed;
this records what exists and what isolation would demand.

Date: 2026-08-30 · Branch: `claude/thi-governance-post-launch` · Baseline: `npm run build`,
`npm run check` (0/0/0) and `npm run verify-content` all pass, unchanged.

**Method and its limits.** Everything below is read from files in this repository. The
sandbox running this assessment cannot reach `api.cloudflare.com` or `*.workers.dev` (both
probe as HTTP `000`) and holds no Cloudflare credentials, so **no dashboard state was
observed**. Anything that lives only in the dashboard is marked
**unknown — requires dashboard access** with the specific thing to check. Config is not
treated as evidence of dashboard state.

---

## 1. Current deployment topology

### What the repo defines

| Question | Answer | Evidence |
|---|---|---|
| Workers defined | **One** | `site/wrangler.jsonc` → `"name": "texashomeintelligence"`. One name, one config file. |
| Environments | **None** | `site/dist/server/wrangler.json` → `"definedEnvironments": []`. No `[env.*]` blocks anywhere in `wrangler.jsonc`. |
| Routes / custom domains in config | **None** | The resolved config has no `routes`, `route`, or `workers_dev` key at all. |
| Cloudflare cron triggers | **None** | Resolved config → `"triggers": {}`. |
| Build output | Worker + static assets | `main: entry.mjs`, `assets: { binding: "ASSETS", directory: "../client" }`. |

`astro.config.mjs` contributes `output: "static"` with `adapter: cloudflare({ imageService:
"compile" })`, `site: "https://texashomeintelligence.com"`, `trailingSlash: "always"`. It
defines no environments or hostnames — the adapter emits the resolved
`dist/server/wrangler.json` at build time from `wrangler.jsonc`.

### Workers Builds configuration visible in the repo

Not a config file — only a comment in `site/wrangler.jsonc`, recording what the owner set
dashboard-side:

```
root dir `site` · build `npm run build`
deploy `npx wrangler deploy --config dist/server/wrangler.json`
```

`package.json` carries the same command as `npm run deploy`.

**This deploy command produces a production deployment.** `wrangler deploy` publishes to the
Worker's live version; it is not `wrangler versions upload`, which is what produces a
preview URL without promoting. So as configured, **any branch Workers Builds decides to
build would deploy to production** — the command carries no branch awareness.

### The `*.workers.dev` = custom domain finding

**Confirmed, as an inference from config, and it needs one dashboard check to be certain.**

The repo defines exactly one Worker with no environments, so there is only one deployment
target for `wrangler deploy` to write to. A `*.workers.dev` hostname and a custom domain
both attached to that one Worker necessarily serve the same code. That is the basis for the
claim in `SECURITY.md`.

**What I could not determine from the repo alone:**

- Whether the `workers.dev` route is enabled at all (it defaults on; `workers_dev` is not
  set either way in config). **unknown — requires dashboard access.**
- The exact `workers.dev` hostname. `HANDOFF.md` records the account subdomain as
  `julian-0ef`, giving `texashomeintelligence.julian-0ef.workers.dev`, but that came from
  the owner's notes, not from anything verifiable here. **unknown — requires dashboard
  access.**
- Whether `texashomeintelligence.com` is attached as a Custom Domain or a Route, and
  whether `www` and the apex both resolve. **unknown — requires dashboard access.**
- Whether any *other* Worker exists in the account that the repo does not describe.
  The `wrangler.jsonc` comment records that a second Worker was nearly created once by a
  name mismatch. **unknown — requires dashboard access.**

**Check:** Cloudflare → Workers & Pages → `texashomeintelligence` → **Settings → Domains &
Routes**. It lists every hostname bound to this Worker. Confirm the workers.dev entry and
the custom domain appear under the *same* Worker, and note whether a preview-URLs entry is
present.

---

## 2. Preview availability

**Available but unconfigured — and the configured deploy command would defeat it.**

What the repo shows:

- **No `preview_id` on either KV namespace.** `wrangler.jsonc` gives `PROJECTS_KV` and
  `SESSION` an `id` only. In Wrangler, `preview_id` is what a non-production context binds
  instead of `id`; without it, any preview context binds **production KV**.
- The adapter emits `"previews": { "kv_namespaces": [{ "binding": "SESSION" }] }` into the
  resolved config — a preview entry for the session binding **with no id**. I could not
  establish from the adapter's own source what Cloudflare does with an id-less preview
  entry; treat its effect as **unverified** rather than assuming it isolates anything.
- **No `preview_database_id` on the D1 binding.** Same consequence: a preview context binds
  the production database.
- **Nothing in the Astro adapter blocks previews.** `@astrojs/cloudflare` 14.2.3 emits a
  standard Worker with a fetch entry point; preview deployments are a Cloudflare-side
  feature and the adapter is indifferent to them. (The adapter *does* constrain scheduled
  handlers — see HANDOFF Seam 11 — but that is unrelated to previews.)
- **The deploy command is the real blocker.** `wrangler deploy` promotes to production.
  Preview deployments in Workers Builds come from non-production branches being uploaded as
  versions rather than deployed. As written, a branch build would publish over production.

**unknown — requires dashboard access:** whether Workers Builds is configured to build
non-production branches at all, and whether "Preview URLs" are enabled for this Worker.

**Check:** Cloudflare → Workers & Pages → `texashomeintelligence` → **Settings → Builds**.
Look for (a) whether non-production branch builds are enabled and what branch pattern they
match, (b) the deploy command configured there, and (c) **Settings → Domains & Routes →
Preview URLs**, which shows whether `*-<worker>.<subdomain>.workers.dev` version previews
are switched on.

---

## 3. Every binding in use

### Object bindings (from `wrangler.jsonc`)

| Binding | Type | Resource | Read by |
|---|---|---|---|
| `DB` | D1 | `texas-home-intelligence-db` (`0b1f11b2-…`) | `src/lib/db.ts` (intake), `src/lib/account/db.ts` (accounts, homes, reminders, alert prefs), `src/lib/account/deletion.ts`, `src/lib/email/weeklyRecipients.ts`, `src/lib/email/weeklyRun.ts`, `src/pages/api/dashboard/notify.ts`, `src/scripts/intake.ts` |
| `PROJECTS_KV` | KV | `d5c64f94…` | `src/lib/kv.ts` — QuoteReady intake project state, `project:` and `token:` keys |
| `SESSION` | KV | `cc7a5a1c…` | `src/lib/auth/session.ts` (sessions), `src/lib/auth/tokens.ts` (magic-link tokens), `src/lib/auth/rateLimit.ts` (link-request limits). Also claimed by the adapter for Astro Sessions. |
| `ASSETS` | Static assets | `dist/client` | `src/lib/account/readIndex.ts` (precomputed stress-index JSON), `src/lib/municipal/shards.ts` (per-ZIP ARR address tables) |

### Runtime secrets and vars (not in the repo; set as Worker secrets)

| Name | Read by | Effect when absent |
|---|---|---|
| `RESEND_API_KEY` | `src/lib/email/transport.ts:61` | Stub transport logs instead of sending |
| `EMAIL_FROM` | `src/lib/email/transport.ts:65` | Falls back to `accounts@texashomeintelligence.com` |
| `EMAIL_LINK_SIGNING_KEY` | `src/lib/email/unsubscribeToken.ts:28`, checked by `weeklyRun.ts` | Weekly send hard-stops, HTTP 409 |
| `WEEKLY_RUN_TOKEN` | `src/pages/api/email/weekly-run.ts:38` | Trigger endpoint returns 404 |
| `RESEND_WEBHOOK_SECRET` | `src/pages/api/email/resend-webhook.ts:94` | Webhook endpoint returns 404 |
| `SLACK_LEADS_WEBHOOK_URL` | `src/lib/ops/leadNotify.ts` (via `DESTINATIONS[].secretName`) | Lead notifier no-ops with a debug line |

### Build-time public vars

| Name | Read by | Note |
|---|---|---|
| `PUBLIC_GA4_MEASUREMENT_ID` | `src/layouts/Base.astro:55` | Vite-inlined at build; baked into every page |
| `PUBLIC_CF_BEACON_TOKEN` | `src/layouts/Base.astro:56` | Same |

### Referenced in `.github/workflows/`

| Name | Where | Kind |
|---|---|---|
| `SOCRATA_APP_TOKEN`, `EIA_API_KEY`, `AIRNOW_API_KEY`, `CENSUS_API_KEY`, `BLS_API_KEY` | `data-ingestion.yml` | Repo secrets, ingestion only — never reach the Worker |
| `WEEKLY_RUN_TOKEN` | `weekly-email.yml:52` | Repo secret; must equal the Worker secret |
| `WEEKLY_RUN_URL` | `weekly-email.yml:51` | Repo **variable** — a single value, so it points at exactly one deployment |
| `GITHUB_TOKEN` (implicit) | `data-ingestion.yml`, `permissions: contents: write` | Commits and pushes generated data |

---

## 4. Isolation requirements

| Binding | Preview needs | Sharing production would let a preview… |
|---|---|---|
| `DB` | **Separate instance** | **Read and write every homeowner record** — accounts, email addresses, street addresses, reminders, consent rows. A preview sign-up writes a real account. |
| `PROJECTS_KV` | **Separate instance** | Read and write real intake project state and resume tokens |
| `SESSION` | **Separate instance** | **Read live session keys and magic-link tokens.** A preview holding this binding can mint or read credentials for real accounts, and shares the rate-limit counters. |
| `ASSETS` | Per-deployment, automatic | Nothing — each deployment carries its own assets |
| `RESEND_API_KEY` | **Distinct value, or absent** | **Send real email from the verified THI domain** |
| `EMAIL_FROM` | Distinct value | Send as the production mailbox |
| `EMAIL_LINK_SIGNING_KEY` | **Distinct value** | Mint unsubscribe tokens valid against production, and vice versa |
| `WEEKLY_RUN_TOKEN` | **Distinct value, or absent** | Accept a production-token-authorised run against production recipients |
| `RESEND_WEBHOOK_SECRET` | Distinct value, or absent | Accept real bounce events and write suppressions to production |
| `SLACK_LEADS_WEBHOOK_URL` | **Distinct value, or absent** | Post test signups into the owner's real ops channel |
| `PUBLIC_GA4_MEASUREMENT_ID` | Distinct value, or absent | Pollute production analytics with preview traffic |
| `PUBLIC_CF_BEACON_TOKEN` | Distinct value, or absent | Same |

**Every binding except `ASSETS` is a data-exposure or data-transmission risk if shared.**
There is no binding for which "shared read-only" is available — D1 and KV bindings carry no
read-only mode in Wrangler config, so "shared" means "writable".

### The weekly-email path specifically

**Could a preview build sharing production bindings send real mail? YES — and not only via
the weekly path.**

The weekly path, first, as asked:

1. `WEEKLY_RUN_TOKEN` shared → `POST /api/email/weekly-run/` on the preview hostname
   authenticates. The endpoint's 404-when-unset guard does not help: the secret is set.
2. `DB` shared → `weeklyRecipients()` returns **production recipients**.
3. `EMAIL_LINK_SIGNING_KEY` shared → the hard stop that would otherwise refuse the run
   passes.
4. `RESEND_API_KEY` shared → `activeTransport()` returns `resend`, not `stub`, and
   `sendEmail` delivers.
5. `markSent()` writes to the **production** `weekly_email_sends` table, so the real Friday
   run would then skip those people — a preview could silently consume the production
   week's send.

The unsubscribe links in that mail would carry the preview origin (`weeklyRun` builds them
from the origin passed by the endpoint), so recipients would get links pointing at a
deployment that may not outlive the branch.

**The lower bar, which matters more.** Two routes send or write with **no authentication at
all**:

- `POST /api/auth/request-link/` (`src/pages/api/auth/request-link.ts:72`) calls `sendEmail`
  directly. Anyone reaching a preview URL and typing an address causes a **real sign-in
  email** to a real inbox, from the production domain. Verifying that link then writes a
  real `accounts` row to production D1.
- `POST /api/dashboard/notify/` (`notify.ts:74`) inserts into production
  `dashboard_launch_signups` and fires the Slack lead notification.

So the weekly cron is the *loudest* path, not the only one. A preview sharing production
bindings sends real mail the moment anyone loads its sign-in page — no token required.

**Two things reduce, but do not remove, the exposure as it stands today:** `RESEND_API_KEY`
is not yet set (the stub transport runs), and `WEEKLY_RUN_TOKEN` is not yet set (the trigger
404s). Both are on the owner's list to set. **The assessment above describes the state after
those secrets exist**, which is the state a preview would be built into.

Also observed while tracing this: `claimAlertDelivery` in `src/lib/account/db.ts` has **no
callers**. Condition alerts render on the dashboard but are not emailed by any code path.
Only two `sendEmail` call sites exist — the magic link and the weekly run.

---

## 5. Seeding a preview D1

**Migrations that apply:** all four, in order, against an empty database.

| Migration | Creates |
|---|---|
| `0001_init.sql` | `projects`, `intake_responses`, `generated_briefs`, `contractor_requests` + 2 indexes |
| `0002_dashboard_launch_signups.sql` | `dashboard_launch_signups` |
| `0003_accounts_home_reminders.sql` | `accounts`, `home_profiles`, `home_addresses`, `reminders`, `reminder_events`, `alert_preferences`, `alert_deliveries` + 2 indexes |
| `0004_weekly_email.sql` | `account_email_prefs`, `weekly_email_sends`, `email_suppressions` + 1 index |

**What `seed.sql` currently provides:** *(Round 13 note: the file moved from `migrations/seed.sql` to `site/fixtures/seed.sql`; the assessment below is unchanged and still describes its contents.)* two QuoteReady intake projects with responses, one
generated brief, one contractor request — all `example.com`, all `0001_init` tables only.
Its own header says local development only, and `wrangler.jsonc` records that it has never
been applied to production and must not be.

**It covers none of the dashboard.** Every table from `0003` and `0004` is empty after
seeding, which is exactly the surface a preview exists to review.

**What would have to be synthesized** (described, not written):

- An **account** with consent columns populated — `consent` is `CHECK (consent = 1)` and
  `status` is `CHECK (status IN ('pending','active'))`, so rows must satisfy both.
- A **home profile** per account with `zip`, `area_id`, `county_name`, `county_fips`
  matching a real row in `src/data/zip-area-crosswalk.csv`, or the dashboard redirects.
- Optionally a **home address** row, to exercise the Round 5b municipal match.
- **Reminders** spanning the due buckets — overdue, due-this-week, later, snoozed —
  otherwise the queue renders one state only.
- **`reminder_events`** if the "last done" line is to render.
- **Alert preferences**, to exercise the toggles.
- **`account_email_prefs`** rows both enabled and absent, to exercise the recipient gate.
- Rows in **`email_suppressions`** and **`weekly_email_sends`** to exercise the two
  exclusions that are otherwise unreachable without sending.

Fixture addresses must match the committed ARR shards (`public/data/arr-schedule/*.json`)
for the municipal card to show a matched state rather than the withheld one.

A precedent exists: this session's verification builds this exact fixture set over HTTP
against a local Miniflare D1 rather than via SQL. That approach is reusable and avoids a
second copy of the schema drifting from the migrations.

---

## 6. Generated-data behaviour under branch previews

**A preview branch gets whatever generated data that branch's commit carries — a frozen
snapshot, not live data.** Reasons, all from the repo:

- Generated JSON is **committed** (`site/src/data/generated/`, 20 files, 2.3 MB) and read at
  **build time** through `import.meta.glob` in `src/lib/datasets.ts:11`. It is baked into
  the build, not fetched.
- The ARR shards (`public/data/arr-schedule/`, 42 files, 5.4 MB) and the drought map are
  committed too, served through `ASSETS`.
- So a preview built from a branch cut a week ago serves week-old readings, and every
  "Updated"/"Data through" line will honestly say so — the freshness labelling does not
  break, it just shows an older date.

**Does a preview trigger its own ingest? No.** `data-ingestion.yml` runs on
`schedule: "17 9 * * *"` and `workflow_dispatch`. A scheduled run's `actions/checkout@v4`
resolves `github.ref` to the **default branch**, so the daily run always operates on and
pushes to `main`.

**Risk of a preview run writing to the production data path: one, and it is operator-driven
rather than automatic.** `workflow_dispatch` checks out the branch selected in the UI and
the final step runs a bare `git push` — so manually dispatching the ingestion workflow
*from a preview branch* commits generated data to that branch, not to `main`. That is not a
production write, but it does mean the workflow's behaviour depends on which ref it is
dispatched from, and a dispatch from `main` while a preview exists still lands on `main`.
The workflow has `permissions: contents: write` and no branch guard.

**A separate finding, worth the owner's attention.** The ingestion commit message ends with
`[skip ci]`. That suppresses **GitHub Actions**, not Cloudflare Workers Builds — a different
system with its own rules. The workflow's header comment asserts "the push IS the trigger",
which assumes Workers Builds *does* build that commit. If Workers Builds honours `[skip ci]`
(some CI integrations do), **the daily data commit never deploys**, and the live site would
serve progressively staler data than `main` contains, with no error anywhere.
**unknown — requires dashboard access.**

**Check:** Cloudflare → Workers & Pages → `texashomeintelligence` → **Deployments**.
Compare the timestamp of the most recent deployment against the most recent
`Data ingestion: update generated datasets [skip ci]` commit on `main`. If deployments stop
at a manual commit and skip the data commits, the assumption is wrong.

---

## 7. Backup posture

**Nothing is configured, and nothing is documented.** A search across all `.md`, `.jsonc`
and `.yml` files in the repository for `backup`, `point-in-time`, `PITR`, `time travel` and
`restore` returns **zero matches**.

- **D1:** no backup configuration in `wrangler.jsonc`, no export step in any workflow, no
  documented restore procedure. Cloudflare D1 provides Time Travel (a rolling
  point-in-time window) by default on the platform side, but **whether it is available on
  this account's plan, what its retention window is, and whether anyone has tested a
  restore are all unknown — requires dashboard access.** No repo evidence bears on it.
- **KV:** no export, no backup, nothing documented. `SESSION` holds only regenerable data
  (sessions, magic-link tokens, rate-limit counters). `PROJECTS_KV` holds intake project
  state that exists nowhere else.

This matters for the preview question in one direction specifically: **a preview sharing the
production `DB` binding could write or delete production rows, and there is no verified
restore path.** `deletion.ts` exists and performs real deletes.

**Check:** Cloudflare → Storage & Databases → D1 → `texas-home-intelligence-db` →
**Time Travel**, for whether it is available and its retention window.

---

## 8. Owner action list

### 🔴 Cloudflare dashboard — observation first, before anything is created

1. 🔴 **Workers & Pages → `texashomeintelligence` → Settings → Domains & Routes.** Record
   every hostname bound to this Worker; confirm the workers.dev URL and
   `texashomeintelligence.com` sit under the same Worker; note whether **Preview URLs** is
   enabled.
2. 🔴 **Settings → Builds.** Record the configured build and deploy commands, and whether
   non-production branch builds are enabled and for which branches.
3. 🔴 **Deployments.** Compare the latest deployment timestamp against the latest
   `Data ingestion … [skip ci]` commit on `main`, to settle §6's open question.
4. 🔴 **Workers & Pages list.** Confirm no second Worker exists from the historical
   name mismatch recorded in `wrangler.jsonc`.
5. 🔴 **Storage & Databases → D1 → `texas-home-intelligence-db` → Time Travel.** Record
   availability and retention.

### 🔴 Cloudflare dashboard — resources to create, only if isolation is pursued

Exact names, matching the existing convention:

6. 🔴 **D1 database:** `texas-home-intelligence-db-preview`
7. 🔴 **KV namespace:** `texas-home-intelligence-projects-preview`
8. 🔴 **KV namespace:** `texashomeintelligence-session-preview`
   (note the existing pair are inconsistently named — one hyphenated, one not; matching
   each one's existing style keeps them recognisable)
9. 🔴 **Worker secrets scoped to the preview context**, distinct values, not copies:
   `EMAIL_LINK_SIGNING_KEY`, `WEEKLY_RUN_TOKEN`. And for
   `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `SLACK_LEADS_WEBHOOK_URL` — **leave unset**,
   which makes the stub transport and the no-op notifier the preview's default behaviour.
   Whether Workers Builds supports per-context secrets for a single Worker is
   **unknown — requires dashboard access**; if it does not, isolation requires a second
   Worker rather than a preview context, which is a different decision.

### 🔴 GitHub settings

10. 🔴 Confirm `WEEKLY_RUN_URL` (repo **variable**) points at the production origin only.
    It is a single value; a preview must never be its target, or the Friday cron would run
    against the preview deployment.
11. 🔴 Decide whether the ingestion workflow should refuse to run on non-default branches.
    Today `workflow_dispatch` from a branch commits generated data to that branch.

### 🟢 Could be done in code on a branch (nothing here is authorised by this round)

- Add `preview_id` to both KV bindings and `preview_database_id` to the D1 binding in
  `site/wrangler.jsonc`, once the resources in (6)–(8) exist and their IDs are known.
- Change the Workers Builds deploy command so non-production branches upload a version
  rather than deploy — currently `wrangler deploy` promotes to production regardless.
- Extend `site/fixtures/seed.sql` (was `migrations/seed.sql` when this was written), or add a separate preview fixture path, to cover the
  `0003`/`0004` tables per §5.
- Add a branch guard to `data-ingestion.yml`.

**None of the above is a recommendation.** Whether to pursue an isolated preview, a second
Worker, or to keep reviewing diffs plus local verification is the owner's decision, and
`SECURITY.md` already carries it as a flagged open item.
