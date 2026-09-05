/*
 * Round 24 — /privacy/ says what the code does, and promises nothing it cannot keep.
 *
 * WHY A REPLAY AND NOT A READ-THROUGH. Four statements on this page were true
 * when written and went stale as the site grew: it denied collecting a name and
 * a phone number while /start/ collected both, claimed analytics that were
 * switched off, never named two processors, and called account deletion total
 * when three records outlive it. A page nobody re-reads drifts; assertions do
 * not.
 *
 * Run: npx tsx scripts/replays/privacyunit.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
/**
 * THE RENDERED PAGE, NOT THE SOURCE. The first version of this file asserted
 * against the .astro and produced seven false failures: copy is line-wrapped in
 * source so any phrase spanning a line break never matched, `&mdash;` is not
 * `—`, and — worst — the file's own header comment QUOTES the old wording it
 * replaced, so "no longer says X" failed because X appeared in the note
 * explaining that it no longer says X. A reader sees rendered HTML. So does this.
 */
function rendered(): string {
  const html = readFileSync(path.join(SITE, "dist", "client", "privacy", "index.html"), "utf8");
  const main = /<main[\s\S]*?<\/main>/.exec(html)?.[0] ?? html;
  return main
    .replace(/<[^>]+>/g, " ")
    .replace(/&mdash;/g, "—").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}
const page = rendered();
/** Structural checks still read the source: an id is markup, not copy. */
const source = readFileSync(path.join(SITE, "src", "pages", "privacy", "index.astro"), "utf8");
const schema = ["0001_init", "0002_dashboard_launch_signups",
                "0003_accounts_home_reminders", "0004_weekly_email"]
  .map((f) => readFileSync(path.join(SITE, "migrations", `${f}.sql`), "utf8")).join("\n");
const leadMsg = readFileSync(path.join(SITE, "src", "lib", "ops", "leadMessage.ts"), "utf8");

let failures = 0, checks = 0;
function assert(label: string, cond: boolean, detail = "") {
  checks += 1;
  if (cond) console.log(`  ok   ${label}${detail ? `  — ${detail}` : ""}`);
  else { failures += 1; console.log(`  FAIL ${label}${detail ? `\n         ${detail}` : ""}`); }
}
const says = (re: RegExp) => re.test(page);

console.log("\n1. the page no longer contradicts the schema");
// `projects.first_name` and `contractor_requests.phone` both exist.
assert("the schema does store a first name", /first_name/.test(schema));
assert("the schema does store a phone number", /phone TEXT/.test(schema));
assert("the page no longer denies collecting a name or phone",
  !/We do not collect your name, street address, or phone number/.test(page));
assert("and it names where each is asked for",
  says(/first name and an email address/i) && says(/phone number/i) && says(/\/start\//));

console.log("\n2. every processor the code reaches is disclosed");
assert("Resend is named", says(/\bResend\b/));
assert("Slack is named", says(/\bSlack\b/));
assert("Cloudflare is named", says(/\bCloudflare\b/));
// LEAD_DETAIL = "zip": the notification carries ZIP and time, nothing else.
assert("leadMessage still withholds identifying detail", /LEAD_DETAIL: LeadDetail = "zip"/.test(leadMsg));
assert("and the page describes exactly that",
  says(/ZIP code and the time and nothing else/i), "not the email, not the address");

console.log("\n3. analytics are described as they actually are");
assert("the page says analytics are switched off", says(/analytics are currently switched off/i));
assert("it names GA4 rather than characterising it", says(/Google Analytics 4/));
assert("it no longer calls them 'privacy-respecting'", !/privacy-respecting/.test(page));

console.log("\n4. deletion is described with its exceptions");
assert("the page names what outlives an account delete", says(/outlive that delete/i));
assert("the launch signup is named", says(/signup is a separate record/i));
assert("the do-not-send list is named", says(/do-not-send list/i));
assert("the project brief is named", says(/project brief you started/i));

console.log("\n5. the lead path — required disclosures");
assert("a service-providers section exists", /id="service-providers"/.test(source));
assert("WHAT is shared, by field",
  says(/your first name, your email address, the job you described, and the area you are in/i));
assert("and what is NOT shared", says(/not send your dashboard, your reminders/i));
assert("opt-in is a distinct act, not a consequence",
  says(/separate step with its own\s+button/i) && says(/never triggers it/i));
assert("companies are sourced after the request",
  says(/do not have a network of companies waiting/i) && says(/we go and look for companies/i));
assert("no inspection, diagnosis or endorsement",
  says(/do not inspect your home, diagnose the problem/i)
  && says(/not a recommendation and not an endorsement/i));
assert("how to opt out is stated", says(/and we will stop/i));
assert("and what happens to what is already shared",
  says(/we can ask, not compel/i) && says(/out of ours/i));
assert("retention is a number, not a vibe", says(/two years/i));

console.log("\n6. it promises nothing it has not done");
const PROMISE = /\b(vetted|vetting|pre-?screened|background[- ]check\w*|licen[cs]e[- ]?verif\w+|verified licen\w+|insurance[- ]verif\w+|bonded and insured|we guarantee|satisfaction guarantee|certified partner\w*|approved (contractor|provider)\w*|trusted network|our network of)\b/i;
// The page's own DENIAL sentence is the one place these words may appear.
const denial = /We do not check licences, insurance, bonding, or complaint history/;
assert("the page states plainly that it checks none of these", denial.test(page));
const withoutDenial = page.replace(denial, "");
assert("and makes no vetting or verification claim anywhere else",
  !PROMISE.test(withoutDenial), withoutDenial.match(PROMISE)?.[0] ?? "clean");

console.log("\n7. an unbuilt mechanism is not described as built");
assert("the section opens by saying it does not exist yet",
  says(/Nothing on this site does this yet/i));
assert("and says nothing has been shared", says(/nothing has been shared with any company/i));
assert("the sharing is written in the conditional, not the present",
  says(/we would send a company/i) && !/we send a company your first name/i.test(page));
assert("the corrected page carries no leftover of the four stale statements",
  !/We do not collect your name, street address, or phone number/.test(page)
  && !/privacy-respecting/.test(page),
  "checked against rendered copy — the source header quotes them deliberately");

console.log(`\nPRIVACY_UNIT_STATUS=${failures === 0 ? "ok" : "fail"} checks=${checks} failures=${failures}`);
process.exit(failures === 0 ? 0 : 1);
