/* Round 9 unit checks: content assembly + the banned-phrase guard. */
import { buildWeeklyContent, weeklySubject, weeklyText, bannedPhrasesIn } from "../../src/lib/email/weekly";
import { SIGNAL_ACTIONS } from "../../src/lib/signalActions";
import fs from "node:fs";

let fails = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (!cond) fails++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
};

// 1. Every action in the table, every band, through the guard.
let checked = 0;
for (const [sig, bands] of Object.entries(SIGNAL_ACTIONS)) {
  for (const [band, action] of Object.entries(bands)) {
    checked++;
    const hits = bannedPhrasesIn(action!.text);
    ok(`action clean: ${sig}/${band}`, hits.length === 0, hits.join(","));
  }
}
ok(`action table covered (${checked} entries)`, checked > 0);

// 2. The guard actually catches something — a guard that never fires is not a guard.
ok("guard catches a damage claim", bannedPhrasesIn("Call a contractor about the damage").length > 0);
ok("guard catches 'replace'", bannedPhrasesIn("Replace the shingles").includes("replace"));
ok("guard ignores clean copy", bannedPhrasesIn("Walk the perimeter and look at the gutters.").length === 0);

// 3. Normal band carries no action anywhere.
for (const [sig, bands] of Object.entries(SIGNAL_ACTIONS)) {
  ok(`no action on Normal: ${sig}`, !("normal" in bands));
}

// 4. Content assembly against the real artifact.
const artifact = JSON.parse(fs.readFileSync("/tmp/austin.bak.json", "utf8"));
const home = { zip: "78704", countyName: "Travis" };
const now = new Date(artifact.referenceDate);

const fresh = buildWeeklyContent(artifact, home, [], now);
ok("fresh: not stale", fresh.stale === null);
ok("fresh: delta present", fresh.delta !== null);
ok("fresh: score is the artifact's", fresh.score === artifact.composite.score);
ok("fresh: driver is the top-scoring signal", fresh.driver?.label === "Roof & Storm");
ok("fresh: check comes from the action table", bannedPhrasesIn(fresh.check?.text ?? "").length === 0);
ok("fresh: subject carries score + band", weeklySubject(fresh).includes("50 of 100, Elevated"));

const stale = buildWeeklyContent(artifact, home, [], new Date(now.getTime() + 41 * 86400000));
ok("stale: flagged", stale.stale?.ageDays === 41);
ok("stale: delta withheld", stale.delta === null);
ok("stale: subject says last confirmed", weeklySubject(stale).includes("last confirmed"));

// 5. A calm area gets no check rather than invented busywork.
const calm = JSON.parse(JSON.stringify(artifact));
for (const s of calm.signals) { s.layerB.band = "normal"; s.layerB.score = 5; }
const calmContent = buildWeeklyContent(calm, home, [], now);
ok("all-normal: no check offered", calmContent.check === null);
ok("all-normal: body says nothing to look at",
   weeklyText(calmContent, { dashboard: "d", preferences: "p", unsubscribe: "u" })
     .includes("nothing we'd ask you to look at"));

// 6. Top driver Normal but another signal Elevated -> the check comes from the
//    signal that actually has one, and names it.
const mixed = JSON.parse(JSON.stringify(artifact));
mixed.signals.find((s: any) => s.id === "roof-storm").layerB.band = "normal";
const mixedContent = buildWeeklyContent(mixed, home, [], now);
ok("mixed: driver still the top score", mixedContent.driver?.label === "Roof & Storm");
ok("mixed: check falls through to an actionable signal",
   mixedContent.check !== null && mixedContent.check.signalLabel !== "Roof & Storm",
   mixedContent.check?.signalLabel ?? "none");

// 7. No dollar figure, no percentile, anywhere in a rendered body.
const body = weeklyText(fresh, { dashboard: "d", preferences: "p", unsubscribe: "u" });
ok("no dollar figures", !/\$\s?\d/.test(body));
ok("no percentile language", !/percentile|top \d+%|better than \d+%/i.test(body));
ok("area framing present", body.includes("conditions across Travis County, not a measurement at your address"));

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
