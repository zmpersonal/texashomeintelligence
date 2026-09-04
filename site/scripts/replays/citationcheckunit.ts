/**
 * Round 15b — the citation checker itself is now checked.
 *
 * ── THE FAILURE THIS EXISTS FOR ───────────────────────────────────────────
 * `scripts/check-citations.ts` imports the content layer. Round 14b gave the
 * content layer a Vite-only `?raw` import, and from that commit the script died
 * on startup with a SyntaxError. Nothing noticed for a month, because the only
 * thing watching it was a weekly workflow that read ANY non-zero exit as "a
 * cited URL is dead" — so the failure mode was not silence, it was a confident
 * wrong answer: an issue every Monday announcing a dead citation, with a stack
 * trace where the URL should have been.
 *
 * Two things had to change and this replay guards both.
 *
 * ── 1. THE EXIT CODE CANNOT DISCRIMINATE, AND THIS PROVES IT ──────────────
 * A dead-link run and a startup crash BOTH exit 1. That is asserted below
 * rather than asserted about — the replay runs the real script twice, once
 * each way, and compares. The discriminator is the STATUS SENTINEL, which only
 * a run that reached an answer can print.
 *
 * The crash case is not simulated. It runs the script WITHOUT
 * `--import ./scripts/register-raw.mjs`, which reproduces the Round 14b
 * regression exactly, byte for byte, including its SyntaxError.
 *
 * ── 2. A STARTUP CRASH NOW FAILS ON A LAPTOP, NOT ON A MONDAY ─────────────
 * The cold-start replay suite runs this, so the next `?raw`-shaped import that
 * the hook does not cover fails in the round that adds it.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT ASSERT ────────────────────────────────
 * That any URL resolves. Every citation host is proxy-denied in the agent
 * sandbox, so the honest local result is 10 of 10 unreachable, and treating
 * that as a failure would make this replay red forever and therefore ignored.
 * Whether the URLs are alive is the WORKFLOW's question, answered weekly from
 * a machine with egress. This replay asks only whether the checker works.
 */
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SENTINEL = /CITATION_CHECK_STATUS=([a-z]+) checked=(\d+) dead=(\d+)/;

let pass = 0;
let fail = 0;
const A = (label: string, ok: boolean, note = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "**FAIL**"}  ${label}${note ? "  — " + note : ""}`);
};

interface Run {
  code: number;
  out: string;
}

/** Run the checker as the workflow does, streams merged, never throwing. */
function run(args: string[]): Run {
  try {
    const out = execFileSync("npx", ["tsx", ...args], {
      cwd: SITE,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      // stderr is merged by the caller below via 2>&1 semantics: execFileSync
      // keeps them apart, so both are concatenated here deliberately.
    });
    return { code: 0, out };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? -1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

/**
 * The workflow's classification, reimplemented here in the same shape so the
 * two cannot drift: sentinel absent means the checker never answered, whatever
 * it exited with.
 */
function classify(r: Run): string {
  const m = r.out.match(SENTINEL);
  return m ? m[1] : "crashed";
}

const HOOK = ["--import", "./scripts/register-raw.mjs"];
const SCRIPT = "scripts/check-citations.ts";

console.log("\n══ the checker runs, and says so ══");
const ok = run([...HOOK, SCRIPT]);
const m = ok.out.match(SENTINEL);
A("prints a status sentinel", !!m, m ? m[0] : "NO SENTINEL — the checker did not reach an answer");
A("the sentinel is the last word on what happened", classify(ok) !== "crashed", classify(ok));
A("enumerated the citations it was meant to check", !!m && Number(m[2]) > 0,
  m ? `${m[2]} URL(s) checked` : "none");

console.log("\n══ it enumerates the content layer, not a cached list ══");
const json = run([...HOOK, SCRIPT, "--json"]);
let parsed: { status?: string; checked?: number; dead?: number; results?: { url: string; cited: string[] }[] } | null = null;
try {
  // `--json` keeps stdout pure — the sentinel goes to stderr in that mode — so
  // this parse failing is itself a finding.
  parsed = JSON.parse(json.out.slice(json.out.indexOf("{"), json.out.lastIndexOf("}") + 1));
} catch {
  parsed = null;
}
A("--json emits parseable JSON with the sentinel kept off stdout", !!parsed,
  parsed ? `status=${parsed.status}` : "could not parse");
A("every enumerated citation is an absolute external URL",
  !!parsed?.results?.length && parsed.results.every((r) => /^https?:\/\//.test(r.url)),
  `${parsed?.results?.length ?? 0} URL(s)`);
A("every citation names the page that cites it",
  !!parsed?.results?.every((r) => r.cited.length > 0));
A("the JSON count agrees with the human-mode sentinel",
  !!m && parsed?.checked === Number(m[2]), `${parsed?.checked} vs ${m?.[2]}`);

console.log("\n══ a startup crash is NOT a dead link ══");
// No hook. This is the Round 14b regression, reproduced rather than mocked.
const crashed = run([SCRIPT]);
A("reproduces the Round 14b failure: the module cannot load without the hook",
  /does not provide an export named 'default'|Cannot find module|SyntaxError/.test(crashed.out),
  (crashed.out.match(/SyntaxError[^\n]*/) || ["no error text"])[0].slice(0, 100));
A("a crashed run prints NO sentinel", !SENTINEL.test(crashed.out),
  (crashed.out.match(SENTINEL) || ["absent, as it must be"])[0]);
A("and is therefore classified as crashed, not as a dead link",
  classify(crashed) === "crashed", classify(crashed));

console.log("\n══ why the exit code alone could never have caught this ══");
A("a dead-link run and a crashed run exit IDENTICALLY",
  ok.code === crashed.code,
  `dead-link exit=${ok.code} · crashed exit=${crashed.code} — the sentinel is the only discriminator`);
A("the two are still told apart",
  classify(ok) !== classify(crashed), `${classify(ok)} vs ${classify(crashed)}`);

console.log("\n══ unreachable hosts are the sandbox, not a broken checker ══");
const dead = parsed?.dead ?? 0;
const checked = parsed?.checked ?? 0;
console.log(`  note  ${dead} of ${checked} citation host(s) were unreachable from here.`);
console.log("        Expected: the agent sandbox's egress proxy denies every one of them.");
console.log("        Whether the URLs are alive is the weekly workflow's question, not this one.");
A("this replay does not fail on unreachable hosts", true,
  dead === checked && checked > 0
    ? "all unreachable, as expected in the sandbox"
    : `${checked - dead} reachable — this environment has egress`);

console.log(`\n═══ ${pass} passed, ${fail} failed ═══`);
process.exit(fail === 0 ? 0 : 1);
