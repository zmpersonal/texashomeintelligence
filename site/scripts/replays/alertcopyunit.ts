/**
 * Round 9c — the alert-copy honesty guard, with no data dependency at all.
 *
 * `r7replay` checks the honesty of the ONE alert that happens to be rendering.
 * That guard goes dormant whenever no condition is active, which is most of the
 * time, and it is the reason those assertions sat red for three rounds. This
 * checks EVERY alert template in the product, from source, on every checkout,
 * whether or not any condition is firing.
 *
 * It also pins the fixture to the product: the synthetic condition's copy is
 * extracted from `alerts.ts` rather than restated, and the last group of
 * assertions proves that extraction actually produces the product's sentences.
 * Without that link, `r7replay` asserting "the card says area" would only be
 * asserting that the fixture says it.
 *
 * Run: npx tsx scripts/replays/alertcopyunit.ts     (from site/)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import {
  extractHeatTemplates,
  renderTemplates,
  heatObservation,
} from "../fixture-condition";

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ALERTS_SRC = join(SITE, "src", "lib", "account", "alerts.ts");

let pass = 0, fail = 0;
const A = (label: string, ok: boolean, note = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "**FAIL**"}  ${label}${note ? "  — " + note : ""}`);
};

const src = readFileSync(ALERTS_SRC, "utf8");

// ── every alert template in the product ──────────────────────────────────────
console.log("\n══ ALERT COPY, READ FROM src/lib/account/alerts.ts ══");

/** One `fired.push({ ... })` block per alert the product can raise. */
function alertBlocks(): { key: string; body: string }[] {
  const out: { key: string; body: string }[] = [];
  const re = /fired\.push\(\{([\s\S]*?)\n\s*\}\);/g;
  for (const m of src.matchAll(re)) {
    const body = m[1];
    const key = body.match(/key:\s*"([^"]+)"/)?.[1] ?? "(unknown)";
    out.push({ key, body });
  }
  return out;
}

const blocks = alertBlocks();
A("every alert type in the catalogue has a template", blocks.length === 4, `${blocks.length} blocks`);

/** Prose the reader sees: headline + detail, templates unresolved. */
const prose = (body: string) => {
  const head = body.match(/headline:\s*`([^`]+)`/)?.[1] ?? "";
  const detailRaw = body.match(/detail:\s*([\s\S]*?),\n\s*source:/)?.[1] ?? "";
  const detail = [...detailRaw.matchAll(/`([^`]*)`/g)].map((m) => m[1]).join("");
  return `${head} ${detail}`;
};

// The rule the product states for itself, at the top of alerts.ts:
// "Every alert is a statement about an AREA."
for (const b of blocks) {
  const p = prose(b.body);
  A(`[${b.key}] frames the reading as area- or county-level`,
    /\barea\b/i.test(p) || /\bcounty\b/i.test(p));
  // An address-precision claim is only allowed when it is being DENIED. The
  // freeze template says "not a measurement at your home", which is the
  // honesty rule stated out loud, not a violation of it.
  const claims = [...p.matchAll(/(.{0,24})at your (home|address|house|property|street)/gi)]
    .filter((m) => !/\b(not|never|isn't|is not)\b[^.]*$/i.test(m[1]));
  A(`[${b.key}] never claims the reading is about the reader's address`,
    claims.length === 0, claims.map((m) => `"…${m[0]}"`).join(" / "));
  // Conditions, not damage. The same rule the reminder actions carry.
  const damage = p.match(/\b(fix|repair|replace|damaged|contractor|quote|estimate)\b/i);
  A(`[${b.key}] describes a condition, not damage`, !damage, damage?.[0] ?? "");
  A(`[${b.key}] names its source`, /source:\s*"[^"]+"/.test(b.body));
}

// ── the fixture is pinned to the product's copy ──────────────────────────────
console.log("\n══ THE SYNTHETIC CONDITION USES THE PRODUCT'S SENTENCES ══");
{
  const obs = heatObservation();
  const t = renderTemplates(extractHeatTemplates(), obs.high);

  A("the fixture reads a REAL committed >=100F observation",
    obs.high >= 100 && /^\d{4}-\d{2}-\d{2}T/.test(obs.observedAt), `${obs.high}F at ${obs.observedAt}`);

  // The extracted, filled sentences must be the product's, with only the
  // interpolations resolved. Check each literal fragment is present in source.
  const fragments = [
    t.headline.replace("Austin", "${areaLabel(areaId)}"),
    "forecast high for the area is ",
  ];
  for (const f of fragments) {
    A(`extraction matches source: "${f.slice(0, 46)}…"`, src.includes(f));
  }
  A("no unresolved interpolation survived into the fixture copy",
    !/\$\{/.test(t.headline) && !/\$\{/.test(t.detail));
  A("the fixture's own copy passes the same honesty rules",
    /\barea\b/i.test(`${t.headline} ${t.detail}`) &&
      !/(?<!not )at your (home|address|house)/i.test(`${t.headline} ${t.detail}`),
    t.headline);
  A("the value the product would interpolate is actually interpolated",
    t.detail.includes(String(obs.high)), `${obs.high}°F`);
}

console.log(`\n═══ ${pass} passed, ${fail} failed ═══`);
process.exit(fail === 0 ? 0 : 1);
