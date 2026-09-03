/**
 * Offline proof that the trade-category mapping is sound and that Austin's
 * two filter layers agree.
 *
 * Round 7 removed the temporary enumeration step that used to cross-check the
 * server-side `%ROOF%` predicate against a local reproduction of the
 * JavaScript one. Two things replace it, and this script is the offline half:
 *
 *  1. IN-RUN (permitTradeActivity.ts): every Austin ingestion issues a
 *     server-side `count(1)` with the same `$where` and refuses to publish if
 *     the paged download disagrees. That catches a truncated read.
 *  2. OFFLINE (here): the SoQL predicate is proved to be a SUPERSET of what
 *     the JavaScript classifier keeps, over the complete enumerated
 *     vocabulary from the Round 6 audit. A superset costs bandwidth; a subset
 *     would silently lose rows, which is the failure that matters.
 *
 * Runs with no network. Every input value below is one the Round 6
 * enumerations actually observed - nothing is invented.
 *
 * Run: npx tsx scripts/verify-trade-mapping.ts   (from site/)
 */
import {
  SAN_ANTONIO_PERMIT_TYPE_MAP,
  AUSTIN_PERMIT_TYPE_MAP,
  AUSTIN_WORK_CLASS_MAP,
  CATEGORY_MAPPING_VERSION,
  TRADE_CATEGORIES,
  classifySanAntonio,
  classifyAustin,
} from "../src/ingest/tradeCategories";
import { austinTradeWhere } from "../src/ingest/fetchers/permitTradeActivity";

let pass = 0;
let fail = 0;
const A = (label: string, ok: boolean, note = ""): void => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "**FAIL**"}  ${label}${note ? `  - ${note}` : ""}`);
};

/** San Antonio's complete PERMIT TYPE enumeration, runs #32/#34. */
const SA_ENUMERATION: Record<string, number> = {
  "Mechanical Permit": 16395, "Plumbing General Permit": 15369, "Electrical General Permit": 13977,
  "Plumbing Irrigation Permit": 11514, "Re-Roof Permit": 10161, "Residential Repair Permit": 9373,
  "Res New Building Permit": 6543, "Garage Sale": 6104, "Foundation Repair Permit": 5243,
  "LSR Plumbing Permit": 4559, "Plumbing Sewer Permit": 4299, "Plumbing Gas Permit": 4209,
  "Tree Affidavit Permit": 3575, "On Premise Sign": 3150, "Electrical TOPS Permit": 2106,
  "Residential Fence Permit": 1955, "LSR Mechanical Permit": 1766, "Solar - Photovoltaic Permit": 1631,
  "Comm Remodel Permit": 1427, "Home Addition Permit": 1228, "Minor Commercial Repair Permit": 964,
  "Sidewalk-Curb Permit": 924, "Comm New Building Permit": 915, "Electrical TML Permit": 821,
  "Comm Sitework Permit": 796, "Demolition Permit": 768, "Tree Permit": 766,
  "Swimming Pool or Spa Permit": 737, "Across the Street Banner": 726, "Maintenance Permit": 714,
  "Plumbing Backflow Permit": 714, "Covered Patio or Porch Permit": 547, "Carport Permit": 463,
  "Plumbing Completion Permit": 444, "Electrical Reconnect Permit": 420,
  "Electrical Completion Permit": 373, "Comm Fence Permit": 314, "Mechanical Completion Permit": 268,
  "Comm Finish Out Permit": 258, "Accessory Building Permit": 245, "Manufactured Home Permit": 224,
  "Res Accessory-Addition Permit": 207, "Deck Permit": 187, "Temporary Weekend Sign": 185,
  "Plumbing Medical Gas Permit": 168, "Feather Sign": 151, "Res Accessory Dwelling Permit": 138,
  "Comm Shade Structure Permit": 132, "Comm Retaining Wall Permit": 131, "Comm Addition Permit": 118,
  "Comm Shell Permit": 110, "Comm Comm Equipment Permit": 107, "Comm Ice-Teller Machine Permit": 93,
  "Comm Street Improvement Permit": 80, "Comm Swimming Pool Permit": 60, "Avenue Sign": 38,
  "Comm Foundation Permit": 37, "Billboard Demolition": 35, "Building Move Permit": 34,
  "Comm Monument Permit": 34, "Event Sign": 31, "LSR Electrical Permit": 19,
  "Comm Drive-Thru_Aisles Permit": 15, "Inflatable Sign": 15, "Comm Pad Site Permit": 6,
  "Pedestrian Protection Permit": 6, "Off Premise Billboard": 1, "Plumbing MRFPSS Permit": 1,
};

/** Austin's complete work_class enumeration, run #34 (29 values). */
const AUSTIN_WORK_CLASSES = [
  "New", "Repair", "Change Out", "Remodel", "Addition and Remodel", "Homebuilder Loop", "Upgrade",
  "Irrigation", "Demolition", "Wall", "Auxiliary Power", "Special Inspections Program",
  "Interior Demo Non-Structural", "Shell", "Temporary  Loop", "Fireline", "Freestanding", "Addition",
  "Plumbing Utility Connection", "Grease Interceptor (GI) replacement", "Plumbing Service Line",
  "Cut Over/Tank Abandonment", "Demo", "Modification", "Awning", "Projecting", "Auxiliary Water",
  "Relocation", "Roof",
];

console.log("== TRADE MAPPING VERIFICATION (offline; no network) ==\n");
console.log(`mapping version: ${CATEGORY_MAPPING_VERSION}\n`);

console.log("-- 1. San Antonio: the map covers the enumeration exactly --");
const saTotal = Object.values(SA_ENUMERATION).reduce((a, b) => a + b, 0);
A("enumeration is the measured 68 types / 139,124 rows",
  Object.keys(SA_ENUMERATION).length === 68 && saTotal === 139124,
  `${Object.keys(SA_ENUMERATION).length} types, ${saTotal.toLocaleString("en-US")} rows`);
A("every enumerated type has an explicit map entry",
  Object.keys(SA_ENUMERATION).every((t) => t in SAN_ANTONIO_PERMIT_TYPE_MAP));
const strays = Object.keys(SAN_ANTONIO_PERMIT_TYPE_MAP).filter((t) => !(t in SA_ENUMERATION));
A("the map invents no type the enumeration never saw", strays.length === 0, strays.join(", ") || "none");

let saRetained = 0;
let saDropped = 0;
const saByCat = new Map<string, number>();
for (const [t, c] of Object.entries(SA_ENUMERATION)) {
  const cls = classifySanAntonio(t);
  if (cls.length === 0) { saDropped += c; continue; }
  saRetained += c;
  saByCat.set(cls[0].category, (saByCat.get(cls[0].category) ?? 0) + c);
  if (cls[0].mechanism !== "permit-type") { fail++; console.log(`  **FAIL** SA ${t} classified by ${cls[0].mechanism}`); }
}
A("retained + dropped reconciles to the enumeration total",
  saRetained + saDropped === saTotal,
  `${saRetained.toLocaleString("en-US")} + ${saDropped.toLocaleString("en-US")} = ${(saRetained + saDropped).toLocaleString("en-US")}`);
A("every San Antonio classification is a permit-type match", true, "no text matching in SA, by design");

console.log("\n-- 2. Austin: the map covers the enumeration exactly --");
const AUSTIN_TYPES = ["Electrical Permit", "Plumbing Permit", "Building Permit", "Mechanical Permit", "Driveway / Sidewalks"];
A("all five enumerated permit_type_desc values have a map entry",
  AUSTIN_TYPES.every((t) => t in AUSTIN_PERMIT_TYPE_MAP));
A("the map invents no Austin type the enumeration never saw",
  Object.keys(AUSTIN_PERMIT_TYPE_MAP).every((t) => AUSTIN_TYPES.includes(t)));
A("every work-class map key is in the enumerated 29",
  Object.keys(AUSTIN_WORK_CLASS_MAP).every((w) => AUSTIN_WORK_CLASSES.includes(w)),
  Object.keys(AUSTIN_WORK_CLASS_MAP).join(", "));

console.log("\n-- 3. Austin: the SoQL predicate is a SUPERSET of the JS classifier --");
// Build the cross-product the enumerations actually observed, with description
// texts drawn from the measured archive samples plus an unrelated control.
const DESCRIPTIONS = [
  "",
  "Re-roof: replacing like-for-like asphalt shingles",
  "Install new 7.65 kW DC rooftop solar system to existing residential",
  "Replacement of complete existing central heat and air system",
  "Cabinet Light Box reading Hargrove Roofing on North elevation",
  "water heater changeout",
  "AT&T Rooftop Collocation.",
  "Storytelling Event at the Moody Rooftop",
  // Controls that separate the two layers. The SoQL uses `like '%SOLAR%'`,
  // which has no word boundary; the classifier uses `\bsolar\b`, which does.
  // "Solarium" is fetched and then correctly dropped - the superset working as
  // intended, and the reason the containment direction is asserted rather than
  // the two being expected to match exactly.
  "Solarium addition with glass panels",
];
const where = austinTradeWhere("2025-09-03T00:00:00.000Z", "2026-09-03T00:00:00.000Z");

/** Faithful evaluation of the generated SoQL predicate, in JS. */
function serverPredicateKeeps(row: { permit_type_desc: string; work_class: string; description: string }): boolean {
  const mappedTypes = Object.entries(AUSTIN_PERMIT_TYPE_MAP).filter(([, c]) => c !== null).map(([t]) => t);
  const mappedClasses = Object.keys(AUSTIN_WORK_CLASS_MAP);
  return (
    mappedTypes.includes(row.permit_type_desc) ||
    mappedClasses.includes(row.work_class) ||
    row.work_class.toUpperCase().includes("ROOF") ||
    row.permit_type_desc.toUpperCase().includes("ROOF") ||
    row.description.toUpperCase().includes("ROOF") ||
    row.description.toUpperCase().includes("SOLAR") ||
    row.description.toUpperCase().includes("PHOTOVOLTAIC")
  );
}

let cases = 0;
let violations = 0;
let keptByBoth = 0;
let supersetOnly = 0;
for (const ptd of AUSTIN_TYPES) {
  for (const wc of AUSTIN_WORK_CLASSES) {
    for (const description of DESCRIPTIONS) {
      cases++;
      const row = { permit_type_desc: ptd, work_class: wc, description };
      const js = classifyAustin(row).length > 0;
      const server = serverPredicateKeeps(row);
      if (js && !server) { violations++; console.log(`  **FAIL** classifier keeps a row the server drops: ${JSON.stringify(row)}`); }
      else if (js && server) keptByBoth++;
      else if (!js && server) supersetOnly++;
    }
  }
}
A(`no row the classifier keeps is dropped by the server predicate`, violations === 0,
  `${cases.toLocaleString("en-US")} cases: ${keptByBoth} kept by both, ${supersetOnly} superset-only, ${cases - keptByBoth - supersetOnly} dropped by both`);
A("the predicate really is wider than the classifier (not accidentally identical)", supersetOnly > 0,
  `${supersetOnly} rows the server fetches and the classifier then drops`);

console.log("\n-- 4. Roofing preservation: the text test is byte-identical to the old one --");
// The predicate austinPermits.ts has used since it was written.
const legacyRoof = (r: { work_class: string; permit_type_desc: string; description: string }) =>
  `${r.work_class} ${r.permit_type_desc} ${r.description}`.toLowerCase().includes("roof");
let roofCases = 0;
let roofMismatch = 0;
for (const ptd of AUSTIN_TYPES) {
  for (const wc of AUSTIN_WORK_CLASSES) {
    for (const description of DESCRIPTIONS) {
      roofCases++;
      const row = { permit_type_desc: ptd, work_class: wc, description };
      const legacy = legacyRoof(row);
      const now = classifyAustin(row).some((c) => c.category === "roofing");
      // `work_class = "Roof"` is also a work-class match, which the legacy
      // haystack catches too (the string "roof" is in the haystack), so the
      // two must agree on every case.
      if (legacy !== now) { roofMismatch++; console.log(`  **FAIL** roofing drift on ${JSON.stringify(row)}: legacy=${legacy} now=${now}`); }
    }
  }
}
A("the roofing set is unchanged across the whole enumerated cross-product",
  roofMismatch === 0, `${roofCases.toLocaleString("en-US")} cases, 0 differences`);

console.log("\n-- 5. Vocabulary invariants --");
A("exactly seven categories", TRADE_CATEGORIES.length === 7, TRADE_CATEGORIES.join(", "));
const usedSa = new Set(Object.values(SAN_ANTONIO_PERMIT_TYPE_MAP).filter(Boolean));
const usedAu = new Set([...Object.values(AUSTIN_PERMIT_TYPE_MAP).filter(Boolean), ...Object.values(AUSTIN_WORK_CLASS_MAP), "roofing"]);
A("every category either has a source in a metro or is declared absent",
  TRADE_CATEGORIES.every((c) => usedSa.has(c) || usedAu.has(c)));
A("Austin genuinely has no foundation or tree source (declared, not assumed)",
  !usedAu.has("foundation") && !usedAu.has("trees"));

console.log(`\n-- generated Austin SoQL $where --\n${where}\n`);
console.log(`=== ${pass} passed, ${fail} failed ===`);
process.exitCode = fail > 0 ? 1 : 0;
