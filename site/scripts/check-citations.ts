/**
 * Weekly citation link check.
 *
 * ── WHAT THIS ANSWERS, AND WHAT IT DOES NOT ───────────────────────────────
 * It answers ONE question: does each URL this site cites still resolve? A pass
 * means the URL responded on that date. It does NOT mean the page still says
 * what we cite it for — TDLR could keep /licenses.htm alive and add roofing to
 * it tomorrow, and this check would stay green.
 *
 * That second question is `reviewEveryDays` in `src/data/serviceNotices.ts`,
 * which fails the BUILD when a dated claim ages past its review cadence. The
 * two mechanisms are deliberately separate and neither substitutes for the
 * other: one catches a link rotting, the other catches a fact rotting.
 *
 * ── WHY THIS IS NOT PART OF `npm run build` ───────────────────────────────
 * Because it would make the build depend on the internet, and COST.md rule 3
 * is about exactly that class of thing. A build that issues outbound requests
 * fails for reasons unrelated to the commit — a government site down for
 * maintenance would block a deploy — and Workers Builds runs on every push to
 * main, which would turn "check a few links" into polling on a cadence set by
 * how often anyone commits. It also cannot run in the agent sandbox at all,
 * where every one of these hosts is proxy-denied, so it would fail every local
 * build for a reason that has nothing to do with the code.
 *
 * ── THE COST, STATED ──────────────────────────────────────────────────────
 * One HEAD request per distinct cited URL — TEN today, after Round 15 added
 * Austin's Socrata dataset, the NWS API and Austin Water — once a week, on
 * GitHub Actions' free minutes. That is ~520 requests a year against public
 * government sites, or roughly one request per site per week. It reads no
 * response body, follows redirects, and stores nothing.
 *
 * Why that is not the "polling" COST.md rule 3 forbids: that rule governs the
 * INGESTION path, where the cost scales with data refresh and feeds the site's
 * numbers. This touches no dataset, runs on a fixed weekly schedule regardless
 * of traffic or commits, and its output is a GitHub issue for a human — not a
 * value on a page, not a build artifact, and not anything a pageview can
 * trigger. If it never ran, no number on the site would change.
 *
 * ── NO NEW DEPENDENCY ─────────────────────────────────────────────────────
 * Node's built-in fetch, and the URLs come from the content config that already
 * declares them. Nothing is installed and nothing is crawled.
 *
 * Run: npx tsx scripts/check-citations.ts        (from site/)
 *      npx tsx scripts/check-citations.ts --json  machine-readable summary
 */
import { BELOW_HERO } from "../src/data/belowHero";
import { SERVICE_NOTICES } from "../src/data/serviceNotices";
// Round 18: the tools cite sources too. `TOOL_CITATIONS` is the same shape and
// is read here so a tool's citation is covered by the weekly check exactly as a
// service page's is — one config, one checker.
import { TOOL_CITATIONS } from "../src/data/plumbingTriage";

interface Citation {
  url: string;
  /** Where it is cited from, for the issue body. */
  cited: string[];
  checkedByHumanOn?: string;
}

/** Every external URL the content layer declares, de-duplicated. */
export function citedUrls(): Citation[] {
  const byUrl = new Map<string, Citation>();
  const add = (url: string, where: string, human?: string) => {
    if (!/^https?:\/\//.test(url)) return; // internal links are not this check's job
    const hit = byUrl.get(url) ?? { url, cited: [], checkedByHumanOn: human };
    if (!hit.cited.includes(where)) hit.cited.push(where);
    if (human && !hit.checkedByHumanOn) hit.checkedByHumanOn = human;
    byUrl.set(url, hit);
  };
  for (const [key, spec] of Object.entries(BELOW_HERO)) {
    for (const s of spec.sources) add(s.url, `${key} #sources`, s.checkedByHumanOn);
  }
  for (const [key, list] of Object.entries(SERVICE_NOTICES)) {
    for (const n of list) add(n.sourceUrl, `${key} notice "${n.heading}"`, n.checkedByHumanOn);
  }
  for (const c of TOOL_CITATIONS) add(c.url, c.citedBy, c.checkedByHumanOn);
  return [...byUrl.values()].sort((a, b) => a.url.localeCompare(b.url));
}

export interface CheckResult extends Citation {
  status: number | null;
  ok: boolean;
  detail: string;
}

const TIMEOUT_MS = 20_000;

async function head(url: string): Promise<{ status: number | null; detail: string }> {
  const attempt = async (method: "HEAD" | "GET") => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method,
        redirect: "follow",
        signal: ac.signal,
        // Some government sites reject an unidentified client outright.
        headers: { "user-agent": "TexasHomeIntelligence-citation-check (+https://texashomeintelligence.com)" },
      });
      return { status: res.status, detail: `${method} ${res.status}` };
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    const h = await attempt("HEAD");
    // A surprising number of sites answer HEAD with 403/405 while serving GET
    // fine. Retrying once on GET keeps this from crying wolf; it still reads no
    // body — the response is discarded.
    if (h.status === 403 || h.status === 405 || h.status === 501) {
      try {
        const g = await attempt("GET");
        return { status: g.status, detail: `HEAD ${h.status}, GET ${g.status}` };
      } catch {
        return h;
      }
    }
    return h;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: null, detail: `request failed: ${msg}` };
  }
}

export async function checkAll(): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  for (const c of citedUrls()) {
    const { status, detail } = await head(c.url);
    out.push({ ...c, status, ok: status !== null && status < 400, detail });
  }
  return out;
}

/**
 * ── THE STATUS SENTINEL (Round 15b) ───────────────────────────────────────
 * The line that lets a caller tell "a URL is dead" apart from "the checker
 * never ran".
 *
 * Those two are completely different findings and until now they produced the
 * same signal: a non-zero exit, which the workflow read as "a citation is
 * dead" either way. That is not a hypothetical. Round 14b gave `belowHero.ts`
 * a Vite-only `?raw` import, this script imports `belowHero.ts`, and from that
 * commit it died on startup with a SyntaxError — so every Monday for a month
 * the workflow would have opened an issue announcing a dead citation and
 * pasted a stack trace as the evidence.
 *
 * The sentinel is the discriminator because A STARTUP CRASH CANNOT PRINT IT.
 * An exit code can be produced by anything, including a module that failed to
 * parse; this line only exists if the checker got far enough to have an
 * answer. Its absence IS the crash signal, and that is the whole design.
 *
 * Written to exactly ONE stream so a merged report never shows it twice:
 * stdout in human mode, where a person reading the report should see it, and
 * stderr in `--json` mode, where anything extra on stdout would break the
 * parse. Both the workflow and the replay merge the two streams, so either
 * way there is exactly one sentinel to grep for.
 */
type CheckStatus = "ok" | "dead" | "error";
export const STATUS_SENTINEL = "CITATION_CHECK_STATUS";

function emitStatus(status: CheckStatus, checked: number, dead: number, human: boolean): void {
  const line = `${STATUS_SENTINEL}=${status} checked=${checked} dead=${dead}`;
  if (human) console.log(line);
  else console.error(line);
}

/**
 * Exit codes, which the workflow reads ALONGSIDE the sentinel rather than
 * instead of it:
 *   0  every cited URL resolved
 *   1  at least one did not — the finding this check exists for
 *   2  the checker itself failed after starting (it caught its own error)
 *   anything else, or any exit with NO SENTINEL — the checker crashed
 */
const EXIT = { ok: 0, dead: 1, error: 2 } as const;

if (process.argv[1]?.endsWith("check-citations.ts")) {
  const json = process.argv.includes("--json");

  let results: CheckResult[];
  try {
    results = await checkAll();
  } catch (err) {
    // An error the checker reached and caught. Distinct from a crash, and
    // reported as its own status so the workflow does not call it a dead link.
    console.error(`\ncitation check FAILED to complete: ${err instanceof Error ? err.stack : String(err)}`);
    emitStatus("error", 0, 0, !json);
    process.exit(EXIT.error);
  }

  const failed = results.filter((r) => !r.ok);

  if (json) {
    console.log(JSON.stringify({
      checkedAt: new Date().toISOString(),
      status: failed.length === 0 ? "ok" : "dead",
      checked: results.length,
      dead: failed.length,
      results,
    }, null, 2));
  } else {
    console.log(`\nCitation link check — ${results.length} URL(s)\n`);
    for (const r of results) {
      console.log(`  ${r.ok ? "OK  " : "DEAD"}  ${String(r.status ?? "---").padEnd(4)} ${r.url}`);
      console.log(`        cited by: ${r.cited.join("; ")}`);
      if (r.checkedByHumanOn) console.log(`        last human check: ${r.checkedByHumanOn}`);
      if (!r.ok) console.log(`        ${r.detail}`);
    }
    console.log(
      `\n${results.length - failed.length} resolved, ${failed.length} failed.` +
        `\nA pass means the URL responded today. It does NOT mean the page still says what we cite` +
        `\nit for — that is what reviewEveryDays answers.\n`,
    );
  }

  emitStatus(failed.length === 0 ? "ok" : "dead", results.length, failed.length, !json);
  process.exit(failed.length === 0 ? EXIT.ok : EXIT.dead);
}
