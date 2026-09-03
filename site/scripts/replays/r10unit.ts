import pathMod from "node:path";
import { fileURLToPath } from "node:url";
const SITE_DIR = pathMod.resolve(pathMod.dirname(fileURLToPath(import.meta.url)), "..", "..");
/* Round 10 — payload levels and the structural boundary. */
import { slackText, LEAD_DETAIL, type Lead } from "../../src/lib/ops/leadMessage";
import fs from "node:fs";
import path from "node:path";

let fails = 0;
const ok = (n: string, c: boolean, x = "") => { if (!c) fails++; console.log(`${c ? "PASS" : "**FAIL**"}  ${n}${x ? "  — " + x : ""}`); };

const lead: Lead = {
  event: "home-created", email: "someone@example.com", zip: "78704",
  address: "1001 W MILTON ST", at: "2026-08-30T17:00:00.000Z",
};

console.log("── payload levels ──");
const zip = slackText(lead, "zip");
ok("default ships as 'zip'", LEAD_DETAIL === "zip", LEAD_DETAIL);
ok("zip: no email", !zip.includes("someone@example.com"));
ok("zip: no address", !zip.includes("MILTON"));
ok("zip: has the ZIP and the event", zip.includes("78704") && zip.includes("Home dashboard set up"));
ok("zip: says details were withheld, so a reader is not misled", /withheld/.test(zip));

const em = slackText(lead, "email");
ok("email: includes the address line? no", !em.includes("MILTON"));
ok("email: includes the email", em.includes("someone@example.com"));
ok("email: drops the withheld note", !/withheld/.test(em));

const both = slackText(lead, "email+address");
ok("email+address: includes both", both.includes("someone@example.com") && both.includes("MILTON"));

// A homeowner who declined address storage has no address on the lead at all,
// so even the most permissive level cannot invent one.
const declined = slackText({ ...lead, address: undefined }, "email+address");
ok("no consented address → no Address line at any level", !/Address:/.test(declined));

console.log("\n── the boundary, structurally ──");
const SRC = pathMod.join(SITE_DIR, "src");
const read = (p: string) => fs.readFileSync(p, "utf8");
const walk = (d: string, acc: string[] = []): string[] => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    e.isDirectory() ? walk(p, acc) : acc.push(p);
  }
  return acc;
};
const files = walk(SRC).filter((f) => /\.(ts|astro)$/.test(f));

const ops = files.filter((f) => f.includes("/lib/ops/"));
ok("ops/ never imports the email transport",
  ops.every((f) => !/from ["'].*email\/(transport|weekly)/.test(read(f))), ops.length + " file(s)");

const email = files.filter((f) => f.includes("/lib/email/"));
ok("email/ never imports the ops notifier",
  email.every((f) => !/from ["'].*ops\//.test(read(f))), email.length + " file(s)");

const transport = read(`${SRC}/lib/email/transport.ts`);
// Comments stripped first: the file's own prose says "No bcc, no reply-to",
// and matching that would fail the assertion for saying the right thing.
const code = transport.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
ok("transport sends to exactly one recipient", /to: \[message\.to\]/.test(code));
ok("transport has no bcc / cc / reply_to in its code", !/\b(bcc|cc|reply_to|replyTo)\b/i.test(code));

// Who is allowed to call sendEmail, and who is allowed to call the notifier.
const senders = files.filter((f) => /\bsendEmail\(/.test(read(f))).map((f) => f.replace(SRC, "src"));
ok("sendEmail is called only from homeowner paths", senders.every((f) => !/\/ops\//.test(f)), senders.join(", "));
const notifiers = files.filter((f) => /notifyLeadInBackground\(/.test(read(f)) && !f.includes("/lib/ops/"))
  .map((f) => f.replace(SRC, "src"));
ok("the notifier fires from exactly the two capture routes",
  notifiers.length === 2 && notifiers.every((f) => /api\/(dashboard\/notify|home\/create)/.test(f)),
  notifiers.join(", "));

// The secret must not be reachable from the browser.
const publicPrefixed = files.filter((f) => /PUBLIC_SLACK|PUBLIC_.*WEBHOOK/.test(read(f)));
ok("the webhook secret is never PUBLIC_-prefixed", publicPrefixed.length === 0);
ok("the secret name appears only in the notifier and docs",
  files.filter((f) => /SLACK_LEADS_WEBHOOK_URL/.test(read(f))).length === 1);

console.log("\n── the regression that shipped once ──");
// `locals.runtime.ctx` is a getter the adapter defines to THROW. Reading it in
// a route handler 500'd the request after the row was already committed. The
// call sites must never touch it again, and the unwrapping must live behind
// the guard in leadNotify.ts.
// Comments stripped: both files DISCUSS `locals.runtime` at length, which is
// the point — the explanation must survive, the code must not.
const stripped = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const callSites = [`${SRC}/pages/api/dashboard/notify.ts`, `${SRC}/pages/api/home/create.ts`];
ok("no call site reads locals.runtime",
  callSites.every((f) => !/locals[\s\S]{0,40}\.runtime/.test(stripped(f))));
const notifier = stripped(`${SRC}/lib/ops/leadNotify.ts`);
ok("the notifier reads cfContext, not runtime.ctx",
  /cfContext/.test(notifier) && !/runtime\?\.ctx|runtime\.ctx/.test(notifier));
ok("the waitUntil unwrapping is inside a try/catch",
  /function waitUntilFrom[\s\S]*?try \{[\s\S]*?\} catch/.test(notifier));
ok("both call sites hand it locals and nothing else",
  callSites.every((f) => /notifyLeadInBackground\([\s\S]*?locals,?\s*\);/.test(read(f))));

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILURES`);
process.exit(fails ? 1 : 0);
