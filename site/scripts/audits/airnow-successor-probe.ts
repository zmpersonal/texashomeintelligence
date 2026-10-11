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

/** The metro points every other fetcher in this repo measures from, so a
 * distance here is comparable with New Braunfels' "5.2 mi" station label. */
const METRO_POINTS: Record<string, { lat: number; lon: number }> = {
  austin: { lat: 30.2672, lon: -97.7431 },
  "san-antonio": { lat: 29.4241, lon: -98.4936 },
};

/** AirNow's own monitoring-site table, pipe-delimited, carrying site coords.
 * The observation response names a site but gives no position, so the distance
 * the owner asked for has to be joined from here. */
const SITE_TABLE = "https://files.airnowtech.org/airnow/today/monitoring_site_locations.dat";

/** Candidate parameters that might constrain the lookup radius. The response
 * reports `lookupBoundary: "50 Miles"` while our request sent `distance=25`, so
 * the question is whether ANY parameter moves it — if none does, we do not
 * control the geography and a reading can come from 50 miles away. */
const RADIUS_PARAMS = ["distance", "radius", "maxDistance", "lookupBoundary", "miles"];

function haversineMiles(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 3958.7613 * Math.asin(Math.sqrt(h));
}

/** Pages that should carry the definition of AQI and of NowCast. */
const DOC_URLS = [
  "https://docs.airnowapi.org/webservices",
  "https://docs.airnowapi.org/aq101",
  "https://www.airnow.gov/aqi/aqi-basics/",
  "https://document.airnow.gov/airnow-technical-documentation.pdf",
  // LAST ON PURPOSE. The retired service's own page — named by the 410 body —
  // is the call that settles whether the old `AQI` field was already a NowCast
  // value. It was first in the list and its output sat too far up a 250-line
  // log to retrieve: three attempts to page back to it timed out or returned
  // the wrong window. Printing the thing the decision rests on LAST, where the
  // tail always reaches, is cheaper than fighting the log API.
  "https://docs.airnowapi.org/webservices/retired",
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
      // The retired service's own page is the one that settles what the OLD
      // `AQI` field was, so its opening is printed whether or not a search term
      // matched — a page that says nothing about NowCast is itself an answer.
      if (u.endsWith("/retired")) console.log(`   OPENS: ${plain.slice(0, 1200)}`);
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

  // ── 4 · Does ANY parameter constrain the radius? ────────────────────────
  console.log("\n\n══ CAN THE LOOKUP RADIUS BE CONSTRAINED? ══");
  console.log("   Each request sends one candidate parameter at 5 miles and reports the");
  console.log("   lookupBoundary that comes back. A boundary that stays at 50 Miles means");
  console.log("   that parameter does not control it.");
  for (const param of RADIUS_PARAMS) {
    const u = new URL(`https://www.airnowapi.org${NEW_PATH}`);
    u.searchParams.set("format", "application/json");
    u.searchParams.set("zipCode", METROS[0].zip);
    u.searchParams.set(param, "5");
    if (KEY) u.searchParams.set("API_KEY", KEY);
    try {
      const res = await fetch(u, { headers: { Accept: "application/json" } });
      const text = await res.text();
      const boundary = [...text.matchAll(/"lookupBoundary":"([^"]+)"/g)].map((m) => m[1]);
      console.log(`   ${param}=5 → HTTP ${res.status}, lookupBoundary ${[...new Set(boundary)].join("/") || "(absent)"}`);
    } catch (e) {
      console.log(`   ${param}=5 → FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ── 5 · How far away is each reading, really? ───────────────────────────
  console.log("\n\n══ MEASURED DISTANCE FROM THE METRO POINT TO EACH REPORTING SITE ══");
  let sites = "";
  try {
    const res = await fetch(SITE_TABLE);
    sites = await res.text();
    console.log(`   site table: HTTP ${res.status}, ${sites.length} bytes`);
  } catch (e) {
    console.log(`   site table FAILED: ${e instanceof Error ? e.message : String(e)}`);
  }

  /** siteID → {lat, lon, name} from the pipe-delimited table. The column order
   * is discovered from the data rather than assumed: find the field that equals
   * the site id, then the first plausible lat/lon pair in the row. */
  // MATCHED ON A WHOLE FIELD, not a substring. Pass 1 used
  // `line.includes(siteId)` and reported "San Antonio Northwest C23" — a Bexar
  // County monitor — as 178.1 miles from downtown San Antonio. A nine-digit AQS
  // id occurs inside other fields of a 3.2 MB table, so the first matching LINE
  // was not the right site's line. The figure was absurd on its face, which is
  // the only reason it was caught; a wrong-but-plausible distance would have
  // been reported as fact.
  function locate(siteId: string): { lat: number; lon: number; name: string } | undefined {
    for (const line of sites.split("\n")) {
      const f = line.split("|").map((x) => x.trim());
      if (!f.some((field) => field === siteId)) continue;
      // Latitude and longitude are adjacent, in that order, and Texas pins
      // them tightly enough to identify the pair unambiguously.
      for (let i = 0; i < f.length - 1; i += 1) {
        const lat = Number(f[i]);
        const lon = Number(f[i + 1]);
        if (Number.isFinite(lat) && Number.isFinite(lon) &&
            lat > 25 && lat < 37 && lon < -93 && lon > -107) {
          return { lat, lon, name: f.find((x) => /[A-Za-z]{4}/.test(x)) ?? "" };
        }
      }
    }
    return undefined;
  }

  for (const m of METROS) {
    const u = new URL(`https://www.airnowapi.org${NEW_PATH}`);
    u.searchParams.set("format", "application/json");
    u.searchParams.set("zipCode", m.zip);
    if (KEY) u.searchParams.set("API_KEY", KEY);
    try {
      const rows = (await (await fetch(u)).json()) as {
        parameterName: string; siteID: string; siteName: string; nowcastAQI: number;
      }[];
      console.log(`\n   ${m.location} (from ${METRO_POINTS[m.location].lat}, ${METRO_POINTS[m.location].lon}):`);
      for (const r of rows) {
        const at = locate(r.siteID);
        const d = at ? `${haversineMiles(METRO_POINTS[m.location], at).toFixed(1)} mi` : "NOT FOUND in site table";
        console.log(`     ${r.parameterName.padEnd(6)} AQI ${String(r.nowcastAQI).padStart(3)}  ${d.padStart(22)}  ${r.siteName} (${r.siteID})`);
      }
    } catch (e) {
      console.log(`   ${m.location} FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log("\nAIRNOW_PROBE_STATUS=ok");
  // Exits 0 whatever it finds: it is a measurement, and a 410 is an answer.
}

main().catch((e) => {
  console.log(`AIRNOW_PROBE_STATUS=error ${redactUrl(e instanceof Error ? e.message : String(e))}`);
  process.exit(2);
});
