# Round 0d — Data-freshness and alert-copy audit

**Read-only. Nothing changed, enabled, or disabled. No fixes proposed.**

Date: 2026-08-30 · Branch: `claude/thi-governance-post-launch` · Baseline: `npm run build`,
`npm run check` (0/0/0), `npm run verify-content` all pass, unchanged.

Everything below is read from files in this repository. This sandbox cannot reach
`api.cloudflare.com` or `*.workers.dev` and holds no Cloudflare credentials, so **no
dashboard state was observed**. Dashboard-dependent facts are marked
**unknown — requires dashboard access** with the exact page and field to check.

---

## Headline answers

1. **Does a missed deploy cause stale data?** Yes. Every number is baked into the build from
   committed JSON. A commit that never deploys is a dataset that never reaches the public.
2. **Would a stale deploy overstate freshness?** **Every date says no. One badge says yes.**
   All dates derive from the data's own vintage and stay honest at any deploy age. The
   `LIVE` badge is an unbounded currency claim that survives the data going stale — a live
   honesty-rule violation against `REVIEW.md` §1.
3. **Does shipped copy promise alert emails that are never sent?** **Yes.** Three separate
   surfaces, including the account-creation consent checkbox.

---

# Part 1 — Does data reach the deployed site at all?

## 1. The data path

**Committed JSON, read at build time.** Not fetched at build, not fetched at request.

`site/src/lib/datasets.ts:11`

```ts
const generatedFiles = import.meta.glob<{ default: DatasetFile<unknown> }>(
  "../data/generated/*/*.json",
  { eager: true },
);
```

An eager `import.meta.glob` is resolved by Vite during the build and inlined into the
bundle. The file's own header states the rule: *"Every page reads its numbers from
`src/data/generated/**` at build time — never from a live DB or API on the serving path
(COST.md)."*

The two runtime asset reads (`src/lib/account/readIndex.ts`,
`src/lib/municipal/shards.ts`) go through the `ASSETS` binding, which serves
`dist/client` — also produced by the build. There is no request-time fetch of ingested data
anywhere.

**Consequence:** a missed deploy is **not** harmless. The deployed bundle contains whatever
JSON the deployed commit carried. New ingestion commits sitting on `main` are invisible to
the public until a build runs.

## 2. Build-trigger inventory

| Trigger | Where | What it does |
|---|---|---|
| `schedule: "17 9 * * *"` | `.github/workflows/data-ingestion.yml` | Daily ingest; commits + pushes generated data. **Does not build or deploy the site.** |
| `workflow_dispatch` | `.github/workflows/data-ingestion.yml` | Manual ingest from a chosen ref |
| `schedule: "0 13 * * 5"` | `.github/workflows/weekly-email.yml` | POSTs the weekly-send endpoint. **No build.** |
| `workflow_dispatch` | `.github/workflows/weekly-email.yml` | Manual weekly run, `dryRun` default `true` |
| `build` block in `wrangler.jsonc` | — | **Absent.** No `build`, `minify`, or `upload_source_maps` key exists. |
| Workers Builds | Cloudflare dashboard | **Not in the repo.** |

**Determinable from the repo:** there are exactly two workflows, neither builds or deploys
the site, and `wrangler.jsonc` contains no build configuration. The only repo record of
Workers Builds is a comment in `site/wrangler.jsonc` describing settings the owner entered
dashboard-side (root dir `site`, build `npm run build`, deploy
`npx wrangler deploy --config dist/server/wrangler.json`).

**Not determinable from the repo:** whether Workers Builds is connected at all, which branch
patterns it builds, and whether it is currently succeeding.
**unknown — requires dashboard access.**

**Check:** Cloudflare → Workers & Pages → `texashomeintelligence` → **Settings → Builds**
(connection, branch config, commands) and → **Deployments** (recent history and outcomes).

## 3. `[skip ci]` — the exact line

`.github/workflows/data-ingestion.yml:85`

```yaml
            git commit -m "Data ingestion: update generated datasets [skip ci]"
```

**What `[skip ci]` does:** GitHub Actions reads it and skips workflow runs that would be
triggered by that push. It is a GitHub Actions convention.

**What it does not do:** it has no defined meaning outside the CI system that implements it.
It is not a git feature and not a Cloudflare feature.

**Does Workers Builds honour it?** **unknown — requires dashboard access.** No file in this
repository establishes it either way, and I will not infer it from config.

The stake is concrete. If Workers Builds honours `[skip ci]`, **no ingestion commit has ever
deployed**, and the live site serves data from the last hand-pushed commit while `main`
accumulates newer readings. That failure is silent: no error, no failed build, no alert —
the site simply shows older dates that are individually honest.

**Check:** Cloudflare → Workers & Pages → `texashomeintelligence` → **Deployments**. Compare
the newest deployment's commit against the newest
`Data ingestion: update generated datasets [skip ci]` commit on `main`. If deployments only
ever correspond to hand-authored commits, the answer is that it is honoured.

## 4. The workflow's own assertion

`.github/workflows/data-ingestion.yml:5–7`

```
# Cloudflare Pages is configured to auto-deploy on push to `main` — this
# workflow doesn't (and shouldn't) trigger a separate rebuild itself; the
# push IS the trigger. See HANDOFF.md "Seam 1" for what's still stubbed.
```

**Nothing in the repo substantiates it.** Three separate problems with this comment:

1. It asserts dashboard state ("is configured to auto-deploy") that no repo file records.
2. It says **Cloudflare Pages**. The project does not use Pages — `CLAUDE.md` and
   `HANDOFF.md` both carry an explicit correction that the ground truth is a **Worker via
   Wrangler**. The comment predates that correction and was never updated.
3. It sits in the same file as the `[skip ci]` that may prevent the very trigger it
   assumes. The comment and line 85 have never been reconciled with each other.

---

# Part 2 — What would a stale deploy actually show?

## 5. Dataset vintages

Read from the committed files at the branch head. `newest observedAt` is the newest record
in the file; `lastSuccessAt` is when ingestion last confirmed the feed.

| dataset/location | status | newest `observedAt` | `lastSuccessAt` | obs |
|---|---|---|---|---|
| `airnow/austin` | live | 2026-08-30 | 2026-08-30 | 11 |
| `airnow/san-antonio` | live | 2026-08-30 | 2026-08-30 | 11 |
| `arr-collection-schedule/austin` | live | 2026-08-30 | 2026-08-30 | 1 |
| `austin-water-stage/austin` | live | 2026-08-30 | 2026-08-30 | 1 |
| `bls/austin` | live | **2025-01-01** | 2026-08-30 | 1 |
| `census-acs/austin` | live | 2026-07-01 | 2026-08-30 | 2 |
| `eia-electricity/texas` | live | 2026-08-01 | 2026-08-30 | 13 |
| `ercot/texas` | **sample** | 2026-07-01 | — | 1 |
| `fema-nfhl/austin` | **sample** | 2026-07-01 | — | 1 |
| `municipal-permits/austin` | live | 2026-08-28 | 2026-08-30 | 1923 |
| `municipal-permits/san-antonio` | live | 2026-08-28 | 2026-08-30 | 5148 |
| `noaa-climate/austin` | **sample** | 2026-07-01 | — | 1 |
| `noaa-storm-events/austin` | live | 2026-05-26 | 2026-08-30 | 65 |
| `noaa-storm-events/san-antonio` | live | 2026-05-26 | 2026-08-30 | 63 |
| `nws-api/austin` | live | 2026-08-30 | 2026-08-30 | 13 |
| `tdi-losses/austin` | **sample** | 2026-07-01 | — | 1 |
| `tx-forest-service/texas` | **sample** | 2026-07-01 | — | 1 |
| `usda-soil/austin` | live | 2026-08-30 | 2026-08-30 | 1 |
| `usdm-drought/austin` | live | 2026-08-25 | 2026-08-30 | 56 |
| `usdm-drought/san-antonio` | live | 2026-08-25 | 2026-08-30 | 56 |

Note the spread `asOf` and `dataThrough` exist to express: `bls/austin` was confirmed today
but its newest record is **20 months old**. The two-field design already handles source lag
correctly. Five datasets are `sample` and, by `freshnessOf`, publish no dates at all.

## 6. How each user-visible freshness value is computed

| Surface | Rendered by | Derives from | Build-time or data-vintage |
|---|---|---|---|
| "Data through" (data cards, hubs) | `DataStatus.astro:56` ← `freshnessOf().dataThrough` ← `latestObservedAt(observations)` | Newest `observedAt` in the file | **Data vintage** |
| "Updated:" / "Last known value:" | `DataStatus.astro:62` ← `freshnessOf().asOf` ← `dataset.lastSuccessAt` | Ingest time, recorded in the file | **Ingest time, stored** |
| Status badge `LIVE`/`STALE`/`SAMPLE`/`UNAVAILABLE` | `DataStatus.astro:45` ← `dataset.status` | Set by ingestion: `live` on success, `stale` when a previously-live fetch fails (`runIngestion.ts:101,133`) | **Ingest outcome, frozen at build** |
| Signal freshness line (both dashboards) | `SignalRow.astro:58–62`, `SignalCard.astro:111–115` ← `signal.freshness` | Same two fields, per signal; `dataThrough` is the **oldest** across inputs | **Data vintage** |
| Home Stress Index `referenceDate` | `compute.ts:42 referenceDateFor()` | Newest `dataThrough` across `INDEX_DATASETS` — explicitly *not* wall clock | **Data vintage** |
| Delta "since {date}" | `dashboard.ts` → `deltaLabel()` + `comparedTo` | A real prior date from the archive | **Data vintage** |
| Sitemap `lastmod` | `astro.config.mjs:22–23, 93` `newestDataUpdate()` | Newest `lastSuccessAt` across all generated files, read at build | **Ingest time, stored** |
| Weekly email staleness | `weekly.ts` `buildWeeklyContent()` compares `referenceDate` to real `now` | Runtime clock vs data vintage | **Runtime — correctly detects staleness** |
| Footer copyright year | `Footer.astro:60` `new Date().getFullYear()` | **Build clock** | **Build time** |

**Not a freshness value, but build-clock-dependent:** `datasets.ts:81`
`trailingWindow(observations, days, now = new Date())` defaults to the build clock, so any
trailing window on a static page is anchored to build date. No current caller was found
(`grep` for `trailingWindow(` returns only the definition), so this is latent, not active.

## 7. Would a stale deploy overstate freshness? Per surface

| Surface | Overstates? | Why |
|---|---|---|
| "Data through" | **No** | Prints the newest record actually in the served bundle. Old data → old date. |
| "Updated:" / "Last known value:" | **No** | Prints the `lastSuccessAt` baked into the served file. |
| Signal freshness line | **No** | Same fields; and `dataThrough` takes the **oldest** input, which understates rather than overstates. |
| Home Stress Index `referenceDate` | **No** | Anchored to data, by design. `compute.ts:39–40`: *"Anchoring to the data means a stale feed produces a stale score that the freshness fields then declare."* |
| Delta "since {date}" | **No** | A real archive date. |
| Sitemap `lastmod` | **No** | Derived from the served files' own `lastSuccessAt`. |
| Weekly email | **No** | Compares to the runtime clock and labels staleness explicitly. |
| **Status badge `LIVE`** | **YES** | 🚩 |
| Footer copyright year | Not a freshness claim | Would silently freeze at the build year. Cosmetic. |

### 🚩 The `LIVE` badge — a live honesty-rule violation

`DataStatus.astro:11` documents the badge's meaning:

```
 *  - "live"    → a real, currently-fresh value
```

`status` is a field in the committed JSON, set at **ingest**, then frozen into the build.
It records *"the last fetch succeeded"* — it carries no notion of how long ago the build
was, and there is no expiry check anywhere in the render path.

So a deployment three weeks behind `main` renders **`LIVE`** beside a correct
three-week-old "Updated" date. The word makes an unbounded currency claim; the date beside
it quietly contradicts that claim. A reader who trusts the badge is misled; a reader who
reads the date is not.

This is measured against the project's own rules, not an outside standard:

- `REVIEW.md` §1: *"Placeholder/stale states are visibly marked; failed feeds show a clear
  unavailable/stale state, never silent zero/null."*
- `CLAUDE.md`: *"Sample data is never presented as fact… Never silently substitute
  zero/null for a failed feed."*
- `DataStatus.astro:17–18`: *"Collapsing the two would overstate how current the data is."*
  The file already names this exact failure mode for `asOf`/`dataThrough` — the badge is the
  case it did not cover.

**Important scope limit.** The `stale` status exists and works, but it detects a different
thing: **ingest** failure (`runIngestion.ts:133` — `status: wasLive ? "stale" : …`). No
mechanism anywhere detects **deploy** staleness. The two are independent, and only the first
is handled.

Whether this violation is currently *active* depends on §3: if Workers Builds honours
`[skip ci]`, the live site is showing `LIVE` badges on data that stopped updating whenever
the last hand-pushed commit deployed. **unknown — requires dashboard access.**

---

# Part 3 — Condition alerts

## 8. Delivery machinery

**`claimAlertDelivery` has no callers. Confirmed.**

```
src/lib/account/db.ts:272   export async function claimAlertDelivery(
```

That is the only occurrence in `src/`. The `alert_deliveries` table it writes
(`db.ts:280`) is otherwise touched only by `deletion.ts:39,59`, which deletes from it —
so the table is created, deleted from, and never populated.

**Every `sendEmail` call site — there are two:**

| Call site | Trigger | Sends |
|---|---|---|
| `src/pages/api/auth/request-link.ts:72` | `POST /api/auth/request-link/`, unauthenticated, a person submitting the sign-in form | Magic sign-in link |
| `src/lib/email/weeklyRun.ts:174` | `POST /api/email/weekly-run/`, `WEEKLY_RUN_TOKEN` required, driven by the Friday Action | Weekly summary, opt-in only |

**Neither is an alert.** No third channel exists either — no push, no SMS, no user-facing
webhook. `notifyLeadInBackground` (`home/create.ts:80`, `dashboard/notify.ts:98`) posts to
the owner's **internal Slack**, not to the homeowner.

Alerts *are* computed and *are* rendered: `home/index.astro:103` filters
`index.alerts` by preference and `:164` renders them on the signed-in dashboard. **They are
a screen feature only.** Switching a toggle changes what that page shows on the user's next
visit, and nothing else.

## 9. Copy that states or implies alerts are sent

| # | File:line | Quote | Reading |
|---|---|---|---|
| 1 | `src/pages/home/sign-in.astro:46` | *"Create my account and email me **sign-in links plus the home alerts I choose**. Unsubscribe anytime."* | **Explicit.** The account-creation consent checkbox states alerts will be emailed. |
| 2 | `src/pages/home/index.astro:314` | *"**We'll tell you when something changes**"* — `<h2>` over the alert toggles | **Explicit.** "Tell you" reads as outbound contact, not "show you on this page next time". |
| 3 | `src/pages/home/index.astro:327–329` | *"Alerts describe conditions in your area, never your individual house, and **they are sent only while a condition holds**."* | **Explicit.** "Sent" is a delivery verb. |
| 4 | `src/pages/privacy/index.astro:87` | *"Your email address — how you sign in, and **how alerts reach you**."* | **Explicit**, and in the privacy policy — the document a reader trusts most for what happens to their address. |
| 5 | `src/lib/account/alertCatalogue.ts:18–21` | *"**When** the forecast low… drops to freezing", "When hail is recorded in your county by NOAA"* | **Implied.** Event-triggered phrasing, natural beside a toggle promising notification. |
| 6 | `src/pages/api/dashboard/notify.ts:100` | *"Thanks — we'll email you when your home dashboard is ready."* | **Different feature, and also unbuilt.** The launch-announcement mail has no sender either (`HANDOFF.md` Seam 11 records it as deliberately not built). |

**Surfaces checked and clean:** service and location YAML under `src/content/` and root
`_data/` (no alert or notification copy), `src/pages/llms.txt.ts` (no matches), the weekly
email template (`weekly.ts` mentions alerts only in code comments, never in rendered
copy), `home/setup.astro` (form labels only), `email/unsubscribe.astro`, and the ZIP
dashboard (`dashboard/[zip]/index.astro:236` says *"Get notified when per-ZIP scores
launch"* — a launch-notification promise, same unbuilt sender as #6).

One place gets it right: `src/pages/privacy/index.astro:116` — *"alerts tied to an address
— this page will be rewritten before those ship, not after."* The page anticipates future
alert work while line 87 already asserts alerts reach the user today.

## 10. Plain statement

**Yes. Shipped copy promises a capability that is not built.**

Four explicit statements and one implication tell a signed-in homeowner that condition
alerts will be emailed. No code sends them. The gap is not a stub, a feature flag, or a
disabled path — `claimAlertDelivery` is the only machinery that exists, it has no callers,
and no `sendEmail` call site carries an alert.

The most consequential instance is **#1**, because it is not marketing copy: it is the
**consent checkbox**, and a person must tick it to create an account at all. It is also the
text quoted verbatim in `migrations/0004_weekly_email.sql` as the basis for deciding what the
account consent does and does not cover — that migration reasons that the consent covers
*"sign-in links, and the four condition alerts they toggle"*, treating the alert emails as an
existing capability.

The second most consequential is **#4**, since a privacy policy describing a data flow that
does not occur is a different class of inaccuracy from a marketing overclaim.

Against `CLAUDE.md`'s honesty rules and `REVIEW.md` §1, this is the same family of defect as
the `LIVE` badge in Part 2: **the copy asserts a present-tense capability the system does not
have.** No fix is proposed here.

---

## Summary of open questions requiring dashboard access

| Question | Where to look | What it decides |
|---|---|---|
| Does Workers Builds honour `[skip ci]`? | Workers & Pages → `texashomeintelligence` → **Deployments**; compare newest deployment's commit against newest `Data ingestion …` commit on `main` | Whether ingested data has ever reached the public, and whether the `LIVE`-badge violation is currently active |
| Is Workers Builds connected, and to which branches? | → **Settings → Builds** | Whether any automatic deploy exists at all |
| Has any build failed silently? | → **Deployments** history | Whether deploys are running but erroring |
