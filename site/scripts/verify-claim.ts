/**
 * verify-claim.ts — re-ask the SOURCE for one value a published claim cites (Round 49).
 *
 * WHAT THIS IS FOR. The ledger's `data` tier asserts a source string and an in-bounds date;
 * nothing has ever compared the figure to anything outside the article. Round 49 measured that
 * the four transcribed claims THI publishes — an EIA price, three NOAA cooling-degree-day
 * readings — are each addressable at their source for a few hundred milliseconds. This is the
 * thing that asks.
 *
 * ── IT CALLS THE REPO'S OWN FETCHER, PER REQUEST ──────────────────────────────
 * Not "per file". Round 49's probe imported `austinTradeWhere` for exactly this reason and then
 * rebuilt the NOAA request by hand in the same file, omitted `units=standard`, and reported a
 * correct 695 degF-days as a wrong 386.3. The rule the project takes from that is per-request:
 * every outbound request in a verifier is built by the code that built it for ingestion, or it
 * is not a verification of that code.
 *
 *   EIA   — calls `eiaElectricityPrice.fetchRaw` with a one-month window. The fetcher IS the
 *           request builder, so there is nothing to get wrong.
 *   NOAA  — calls `verifyMonthlyCdd`, exported from `noaaClimate.ts`, which reuses that
 *           module's own `getRows` and its `units: "standard"`.
 *
 * ── WHAT IT DOES NOT PROVE ────────────────────────────────────────────────────
 * Calling our own fetcher verifies nothing about our own fetcher. A match says the file agrees
 * with what the fetcher gets today — it catches a fabricated row, a stale capture, an upstream
 * revision, a period the source does not have. A unit error, a parse error or a wrong predicate
 * is invisible, because both sides share it. That is a deliberate trade: the alternative buys
 * those at the price of false alarms about correct figures, which have already happened twice.
 *
 * FAILS OPEN. An unreachable source exits 0 with `"status": "unreachable"`. A verification that
 * could not run is not a verification that failed, and refusing to publish a correct article
 * because a federal API is down is the wrong trade (owner, 2026-10-12). The caller records the
 * unverified state loudly; it never defaults to looking verified.
 *
 * Usage:
 *   npx tsx scripts/verify-claim.ts --metric energy_price_cents_kwh --period 2026-07
 *   npx tsx scripts/verify-claim.ts --metric cooling_degree_days --location austin --period 2026-09
 */
import { readFileSync } from "node:fs";
import { eiaElectricityPrice } from "../src/ingest/fetchers/eiaElectricityPrice.ts";
import { verifyMonthlyCdd } from "../src/ingest/fetchers/noaaClimate.ts";

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? "" : (process.argv[i + 1] ?? "");
}

type Verdict = {
  metric: string;
  location: string;
  period: string;
  status: "found" | "absent" | "unreachable" | "unsupported";
  value: number | null;
  detail: string;
};

function say(v: Verdict): never {
  console.log(JSON.stringify(v));
  process.exit(0);
}

const metric = arg("metric");
const location = arg("location") || "texas";
const period = arg("period");
const base: Omit<Verdict, "status" | "value" | "detail"> = { metric, location, period };

if (!/^\d{4}-\d{2}$/.test(period)) {
  say({ ...base, status: "unsupported", value: null, detail: "period must be YYYY-MM" });
}

try {
  if (metric === "energy_price_cents_kwh") {
    const rows = await eiaElectricityPrice.fetchRaw({
      env: { EIA_API_KEY: process.env.EIA_API_KEY },
      window: { since: `${period}-01T00:00:00.000Z`, until: `${period}-01T00:00:00.000Z` },
    });
    const hit = rows.find((r) => r.key === period);
    say(hit
      ? { ...base, status: "found", value: hit.value.pricePerKwhCents,
          detail: "EIA retail-sales, TX/RES monthly, via the project's own fetcher" }
      // ABSENT IS NOT UNREACHABLE. The source answered and has no such period — which is what a
      // fabricated future month looks like, and is the Round 43 case.
      : { ...base, status: "absent", value: null,
          detail: `EIA answered and holds no ${period} row for TX/RES monthly` });
  }

  if (metric === "cooling_degree_days") {
    // The station comes from the row we stored. See `verifyMonthlyCdd` on what that does and
    // does not prove.
    const file = new URL(`../src/data/generated/noaa-climate/${location}.json`, import.meta.url);
    const doc = JSON.parse(readFileSync(file, "utf8"));
    const row = (doc.observations ?? []).find(
      (o: any) => o.value?.kind === "monthly-actual" && o.key === `actual-${period}`);
    if (!row?.value?.sourceRef) {
      say({ ...base, status: "unsupported", value: null,
            detail: `no stored station id for ${location} ${period}; nothing to re-ask` });
    }
    const got = await verifyMonthlyCdd(row.value.sourceRef, period);
    say(got.found
      ? { ...base, status: "found", value: got.value,
          detail: `NOAA GSOM station ${row.value.sourceRef}, via the project's own request builder` }
      : { ...base, status: "absent", value: null,
          detail: `NOAA answered and holds no CLDD for ${row.value.sourceRef} in ${period}` });
  }

  say({ ...base, status: "unsupported", value: null,
        detail: `no source check exists for metric ${metric || "(none given)"}` });
} catch (error) {
  // FAIL OPEN, LOUDLY. The caller turns this into a visible "upstream unverified" on the claim.
  say({ ...base, status: "unreachable", value: null,
        // 400, not 160. The first live failure recorded
        // "HTTP 500 from https://api.eia.gov/...?api_key=%" — cut mid-token, so the record said
        // a check had failed and nothing about why. An unverified state whose reason is
        // unreadable is half a record. The URL is already redacted by the fetcher that threw.
        detail: `${(error as Error).name}: ${(error as Error).message.slice(0, 400)}` });
}
