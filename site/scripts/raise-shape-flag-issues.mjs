/*
 * Raise each newly flagged cell as a GitHub issue, exactly once ever.
 *
 * Out of the workflow YAML and into a file for one reason: logic inside a `run:` block cannot be
 * run anywhere but a runner, and the de-duplication is the part that decides whether this
 * surface becomes noise. `--dry-run` exercises all of it with no network and no issue created.
 *
 *   node scripts/raise-shape-flag-issues.mjs --report <report.json> --seen <bodies.txt> [--dry-run]
 *
 * `--report` is `report-shape-flags.ts --json` output. `--seen` is the concatenated bodies of
 * every issue ever raised with the `shape-flag` label, open or closed — a flag whose marker
 * appears there has already been raised and is never raised again. That is what makes an issue
 * the surface rather than a repeating notice: `permitcountunit`'s red became normal because it
 * came back every run.
 *
 * It never fails the caller. The ingest is not a gate's hostage: a detector that could break a
 * data refresh would be a worse defect than the one it finds.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const dryRun = process.argv.includes("--dry-run");
const reportPath = arg("report");
const seenPath = arg("seen");
const repo = process.env.GITHUB_REPOSITORY ?? "zmpersonal/texashomeintelligence";

if (!reportPath) {
  console.log("no --report given; nothing to do");
  process.exit(0);
}

let report;
try {
  report = JSON.parse(readFileSync(reportPath, "utf8"));
} catch (e) {
  console.log(`::warning::could not read the shape-flag report (${e.message}); the ingest is unaffected`);
  process.exit(0);
}

let seen = "";
if (seenPath) {
  try {
    seen = readFileSync(seenPath, "utf8");
  } catch {
    // An unreadable list means "nothing raised yet", which risks a duplicate issue rather than
    // a silent miss. That is the safer direction for a detector whose whole job is to be seen.
    seen = "";
  }
}

const unexplained = report.unexplained ?? [];
const fresh = unexplained.filter((f) => !seen.includes(f.marker));
console.log(
  `${unexplained.length} unexplained flag(s); ${fresh.length} not yet raised; ` +
    `${report.explainedCount ?? 0} already accounted for by a record`,
);
if (report.marginTighterThanRound53) {
  console.log(
    "::warning::the shape detector's margin is TIGHTER than when it was measured — re-measure " +
      "before trusting a flag, and do not move the threshold until it reads clean",
  );
}

for (const f of fresh) {
  const body = `${f.marker}\n\n${report.markdown}`;
  if (dryRun) {
    console.log(`--- would raise: ${f.title}`);
    console.log(`    marker: ${f.marker}`);
    console.log(`    body: ${body.length} chars`);
    continue;
  }
  try {
    writeFileSync("/tmp/shape-flag-body.md", body);
    execFileSync(
      "gh",
      [
        "api",
        "-X",
        "POST",
        `repos/${repo}/issues`,
        "-f",
        `title=${f.title}`,
        "-F",
        "body=@/tmp/shape-flag-body.md",
        "-f",
        "labels[]=shape-flag",
      ],
      { stdio: "inherit" },
    );
    console.log(`raised ${f.cell}`);
  } catch (e) {
    console.log(`::warning::could not raise the flag for ${f.cell}: ${e.message}`);
  }
}
process.exit(0);
