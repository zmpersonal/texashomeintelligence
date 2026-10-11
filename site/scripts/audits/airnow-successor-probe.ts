/**
 * AQI round, step 0 · What does AirNow's replacement endpoint actually return?
 *
 * ── WHY THIS RUNS BEFORE ANYTHING IS WRITTEN ──────────────────────────────
 * `airnow/{austin,san-antonio}` have been `stale` since 2026-09-04. The old
 * path answers **HTTP 410 Gone**, which is permanent, and the committed AQI
 * readings are frozen. Third-party reports (GitHub issues and PRs, not AirNow's
 * own notice) say the replacement for current observations is
 * `/aq/observation/current/ziplatlong/`, that existing keys carry over, and
 * that the AQI field is now **`nowcastAQI`**.
 *
 * That last part is the whole reason this probe exists and is not a code
 * change. **NowCast is not obviously the same quantity as the current-hour
 * AQI.** If it is a different measurement, swapping the field in silently would
 * change what the site publishes under an unchanged label — the Round 45 shape
 * exactly, where `permitCount` kept its name while counting something else.
 * The owner decides that, not this script and not the person writing the
 * fetcher.
 *
 * ── WHY IT RUNS IN ACTIONS ────────────────────────────────────────────────
 * `airnowapi.org` does not resolve from a Claude Code session and neither does
 * `docs.airnowapi.org`, so nothing about this is checkable from one. The runner
 * has open egress, which is also why this probe fetches AIRNOW'S OWN
 * DOCUMENTATION as well as the data: the field definitions are the thing the
 * decision turns on, and taking them from a GitHub PR description rather than
 * from the publisher would be exactly the sourcing this project refuses.
 *
 * ── WHAT IT DOES NOT DO ───────────────────────────────────────────────────
 * One request per metro, read-only, writes no dataset file, changes no fetcher.
 * It prints the complete response for both metros so the field names, units and
 * any metadata are visible rather than summarised. Air-quality observations
 * carry no personal data, so printing them whole is safe — and summarising is
 * what would hide the answer.
 *
 * Run in Actions: npx tsx scripts/audits/airnow-successor-probe.ts
 */
import { redactUrl } from "../../src/ingest/redactSecrets";

const KEY = process.env.AIRNOW_API_KEY;

/** The same two ZIPs the committed files were built from, so the comparison is
 * against our own history rather than an arbitrary location. */
const METROS = [
  { location: "austin", zip: "78701" },
  { location: "san-antonio", zip: "78205" },
];

/** The retired path, recorded so the report states what it is replacing. */
const OLD_PATH = "/aq/observation/zipCode/current/";
const NEW_PATH = "/aq/observation/current/ziplatlong/";

/** Pages that should carry the definition of AQI and of NowCast. */
const DOC_URLS = [
  "https://docs.airnowapi.org/webservices",
  "https://docs.airnowapi.org/aq101",
  "https://www.airnow.gov/aqi/aqi-basics/",
  "https://document.airnow.gov/airnow-technical-documentation.pdf",
];

async function show(label: string, url: URL): Promise<void> {
  console.log(`\n── ${label}\n   GET ${redactUrl(url)}`);
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const body = await res.text();
    console.log(`   HTTP ${res.status} ${res.statusText}`);
    console.log(`   content-type: ${res.headers.get("content-type") ?? "(none)"}`);
    // Printed WHOLE and unparsed. The question is what fields come back and
    // what they are called; a JSON.parse plus a pick would answer a question
    // nobody asked. Observations carry no personal data.
    console.log(`   body (${body.length} bytes):`);
    console.log(body.length > 4000 ? `${body.slice(0, 4000)}\n   …truncated at 4000 bytes` : body);
  } catch (e) {
    // Redacted even here: the thrown message can carry the request URL, and
    // truncating a half-key defeats GitHub's masking (SECURITY.md).
    console.log(`   FETCH FAILED: ${redactUrl(e instanceof Error ? e.message : String(e))}`);
  }
}

async function main(): Promise<void> {
  console.log("AIRNOW SUCCESSOR PROBE");
  console.log(`key present: ${KEY ? "yes" : "NO — the 410 vs 401 distinction below is meaningless without it"}`);
  console.log(`retired path:     ${OLD_PATH}`);
  console.log(`replacement path: ${NEW_PATH}`);

  for (const m of METROS) {
    // 1 · The retired path, to confirm the 410 is still the 410 and that this
    //     is a retirement rather than a transient outage ten days on.
    const oldUrl = new URL(`https://www.airnowapi.org${OLD_PATH}`);
    oldUrl.searchParams.set("format", "application/json");
    oldUrl.searchParams.set("zipCode", m.zip);
    oldUrl.searchParams.set("distance", "25");
    if (KEY) oldUrl.searchParams.set("API_KEY", KEY);
    await show(`${m.location} · RETIRED path`, oldUrl);

    // 2 · The replacement, with the key the old path was using.
    const newUrl = new URL(`https://www.airnowapi.org${NEW_PATH}`);
    newUrl.searchParams.set("format", "application/json");
    newUrl.searchParams.set("zipCode", m.zip);
    newUrl.searchParams.set("distance", "25");
    if (KEY) newUrl.searchParams.set("API_KEY", KEY);
    await show(`${m.location} · REPLACEMENT path`, newUrl);
  }

  // 3 · The publisher's own definitions. This is the half the decision rests
  //     on, and it is the half no GitHub PR can settle.
  console.log("\n\n══ AIRNOW'S OWN DOCUMENTATION ══");
  for (const u of DOC_URLS) {
    console.log(`\n── ${u}`);
    try {
      const res = await fetch(u);
      const text = await res.text();
      console.log(`   HTTP ${res.status}, ${text.length} bytes, ${res.headers.get("content-type") ?? "?"}`);
      // Pull the sentences that mention the two quantities by name, so the
      // definitions arrive in the publisher's words rather than paraphrased.
      const plain = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      for (const term of ["NowCast", "nowcast", "nowcastAQI", "current AQI", "hourly"]) {
        const idx: number[] = [];
        let at = plain.indexOf(term);
        while (at > -1 && idx.length < 3) {
          idx.push(at);
          at = plain.indexOf(term, at + 1);
        }
        for (const i of idx) {
          console.log(`   [${term}] …${plain.slice(Math.max(0, i - 220), i + 320)}…`);
        }
      }
    } catch (e) {
      console.log(`   FETCH FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log("\nAIRNOW_PROBE_STATUS=ok");
  // Exits 0 whatever it finds: it is a measurement, and a 410 is an answer.
}

main().catch((e) => {
  console.log(`AIRNOW_PROBE_STATUS=error ${redactUrl(e instanceof Error ? e.message : String(e))}`);
  process.exit(2);
});
