# Round 24 — Privacy: service providers and the lead handoff

**Disclosure only.** No tool, no gate, no handoff mechanism, no third-party integration. One page
changed.

---

## 1. What is collected today, where it goes — and four things the page got wrong

### Every field stored

| Table | Fields about a person | Written by |
|---|---|---|
| `projects` | **first_name**, **email**, service, location | `/api/intake/start` — the `/start/` project brief |
| `intake_responses` | free-text answers | `/api/intake/[id]` |
| `contractor_requests` | **phone**, requested_count | `/api/intake/[id]/contractor-request` |
| `dashboard_launch_signups` | **email**, zip, consent + source + timestamp | launch signup |
| `accounts` | **email**, status, consent + source + timestamp, last_seen | sign-in |
| `home_profiles` | zip, area, county name + FIPS | dashboard setup |
| `home_addresses` | **address_line**, its own consent record | optional, separate table |
| `reminders` / `reminder_events` | task, cadence, due/done/snooze dates | dashboard |
| `alert_preferences` / `alert_deliveries` | which alerts, what fired when | dashboard |
| `account_email_prefs` / `weekly_email_sends` | opt-in state, send log | weekly email |
| `email_suppressions` | **email**, bounce/complaint reason | Resend webhook |

### Every third party it reaches

| Party | What it receives | Where |
|---|---|---|
| **Cloudflare** | everything above — it is the host and the database | Workers + D1 |
| **Resend** | **one email address + the message**, single-recipient | `lib/email/transport.ts` → `api.resend.com` |
| **Slack** | **ZIP + timestamp + event type. Nothing else.** | `lib/ops/leadNotify.ts` |
| **Google Analytics 4** | nothing — **not currently enabled** | `Base.astro`, gated on `PUBLIC_GA4_MEASUREMENT_ID` |

`lib/ops/leadMessage.ts` sets `LEAD_DETAIL = "zip"`, so the Slack notification carries no email
and no address by construction, and prints *"Identifying details withheld"* in its own body. That
is a good decision that was working and undisclosed.

### ⚠️ Four things the page said that the code contradicted

Each was true when written and went stale as the site grew — which is the failure mode a
deliberately short page is meant to prevent, and did not.

1. **"We do not collect your name, street address, or phone number. We do not ask for them
   anywhere on this site today."** `projects.first_name` has existed since Round 1,
   `contractor_requests.phone` since the same round, and `/start/` is built and served. The page
   also **contradicted itself**: two screens below, its own account section described storing a
   street address.
2. **"We use privacy-respecting page analytics to see which pages get read."** Nothing
   analytics-related renders unless `PUBLIC_GA4_MEASUREMENT_ID` is set. It is not set — the
   homepage carries **zero** analytics script tags. The page claimed a practice that was not
   happening; and when it does happen the tool is Google Analytics 4, worth naming rather than
   characterising.
3. **Two processors were never disclosed at all.** Resend receives an email address for every
   message sent. A Slack webhook receives a ZIP and a timestamp on every signup. Neither appeared
   on the page.
4. **"It is not a flag on a row we keep; the records are deleted."** True of everything
   `deletion.ts` touches — and three records outlive it by design: the launch signup (keyed by
   email, no account link), the do-not-send suppression (deliberate — the alternative is emailing
   someone who bounced or complained), and a `/start/` project brief (a separate identity space
   entirely). `account_email_prefs` and `weekly_email_sends` *do* go, by `ON DELETE CASCADE`.

**All four are corrected.** Each correction is recorded in the page's own header comment so the
next person can see what changed and why, rather than finding a quietly different page.

---

## 2. The service-providers section

Rendered under **"Companies we introduce you to"**, and **written in the future tense throughout**
because the mechanism does not exist. It opens:

> **Nothing on this site does this yet.** No tool asks for a job today, nothing has been shared
> with any company, and there is no list of companies. This section is here because we are
> building it, and a description of what will happen to your information belongs on this page
> before it happens rather than after.

It then covers each required point:

- **What is shared:** first name, email, the job as described, the area — phone only if given.
  Explicitly **not** the dashboard, the reminders, what has been marked done, or anything entered
  elsewhere.
- **Opt-in is a distinct act:** *"That question is a separate step with its own button. Using a
  tool, reading its result, or having an account never triggers it."*
- **Sourced after the request:** *"We do not have a network of companies waiting… we go and look
  for companies that do that particular job in your area… That takes time — it is people making
  enquiries, not a form hitting a database."*
- **Not a recommendation:** *"We do not inspect your home, diagnose the problem, or supervise the
  work. We do not check licences, insurance, bonding, or complaint history… An introduction is not
  a recommendation and not an endorsement."*
- **Opting out, and what is already gone:** *"we will tell you which companies received them and
  ask each of them to delete what we sent — and we will say plainly that we can ask, not compel.
  Information already in someone else's hands is out of ours, and anyone who tells you otherwise
  is overpromising."*
- **Retention:** **two years**, then deleted; sooner on request; and account deletion does **not**
  cascade to a lead record, because the two are separate.

**Nothing promises vetting, licence verification, insurance checks, or quality guarantees.** The
only place those words appear is the sentence saying THI does none of them.

---

## 3. HANDOFF constraints

A new 🔴 seam records what the lead path must honour: the copy must not imply the companies
already exist (with ✅/❌ examples); timing must be honest because sourcing is people making
enquiries; **licensing** — TSBPE for plumbing, TDLR for HVAC/electrical/mold, **roofing has no
state licence** (Round 12 measured it) and THI checks **none** today; the **four-bucket labelling
applies to a lead's report exactly as to a page** — *a gated report is not exempt from the honesty
rules because someone paid for it with an email*; and retention must match what the page now
commits to.

---

## 4. The regulatory question — stated, not answered

**Does introducing companies in a licensed trade carry any obligation on THI itself under Texas
law?**

**What I can name:** Texas regulates the *trades* (TSBPE; TDLR), and those regimes govern the
people doing the work — whether any reaches a party that merely *introduces* a homeowner is a
separate question I have not researched. Adjacent regimes that plainly exist and may or may not
apply: the Texas DTPA; any advertising or referral rules attached to those licensing statutes;
and, if THI is ever paid per lead or per job, whatever governs that consideration.

**What I cannot determine:** whether a licence, registration or disclosure obligation attaches to
the introducer; whether taking a fee changes it; and whether "sourcing companies for a specific
job" is characterised differently from "operating a directory".

**Nothing above has been checked against a statute** — no reading of the Occupations Code, no
measurement. It is *the shape of the question*, not findings.

**Recommendation: take this to a Texas attorney before the first handoff, not before the first
line of code.** The build can proceed, because the constraints in §3 are honesty constraints and
hold regardless of the legal answer — but **no homeowner's details should reach any company until
someone qualified has answered it.**

---

## 5. Verification

**Exactly one artefact changes: `/privacy/index.html`.**

**10 files byte-identical** vs HEAD — the six service pages, `/tools/plumbing-triage/`, and both
`stress-index/*.json`.

**No page claims vetting or licence verification.** A sweep of all 267 rendered pages for
vetting / pre-screening / licence-verification / guarantee / "our network of" language, negation-
aware, finds **0 unnegated claims**.

> The first version of that sweep flagged **22** — every one the word *warranty* in advice **to**
> the homeowner (*"What warranty applies?"*, *"is it under warranty?"*), never THI offering one.
> The pattern was too broad, not the copy. Narrowed to claims THI would itself be making.

- **New:** `scripts/replays/privacyunit.ts` — **31 assertions**: the schema really does store a
  name and a phone, the page no longer denies it, every processor is named, `LEAD_DETAIL` is still
  `"zip"` and the page describes exactly that, analytics are described as off, deletion's three
  exceptions are named, all six lead-path disclosures are present, no vetting claim survives
  outside the denial sentence, and the mechanism is described in the conditional.

  > It asserts against **rendered HTML, not the `.astro`**. The first version read source and
  > produced seven false failures: copy is line-wrapped so any phrase spanning a break never
  > matched, `&mdash;` is not `—`, and the file's own header comment *quotes* the old wording — so
  > "no longer says X" failed because X appeared in the note explaining that it no longer says X.

- `npm run check` 187 files **0/0/0** · `npx tsc --noEmit` clean · `build` clean ·
  `verify-content` passes.
- Full cold-start replay suite green.

---

## 6. Open items

1. **The regulatory question (§4) goes to a Texas attorney before the first handoff.**
2. **No tool ships gated until this page is live** — it is the precondition the owner set.
3. `BANNED_ACTION_PATTERNS` is untouched, as instructed; it belongs to the round that builds the
   first gated tool.
4. The page still says analytics are off. **If `PUBLIC_GA4_MEASUREMENT_ID` is ever set, this page
   must change in the same commit** — `privacyunit.ts` will not catch that, because it asserts the
   page matches the current state, not that someone remembered.
5. Retention is now a promise: **two years** for a lead record, deletable sooner. Whatever stores
   leads has to honour it.
