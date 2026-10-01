/**
 * Redact address and phone shapes from free text before it is written to disk.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 * Round 45. `austinPermits.ts` deliberately ingests no address field — and
 * 2,078 committed rows carry the city's free-text `description`, nine of which
 * contain a street-address shape, three of which reached the published CSV at
 * `/data/austin/roof-permits/roof-permits.csv`:
 *
 *   "5717 Louise Ln Austin TX" · "5520 Burnet Rd" · "14016 Tyburn Trl Austin TX 78717"
 *
 * One row also carried a phone number — `512-552-8540`, a city inspector's line
 * in "CONTACT INSPECTOR WITH QUESTIONS", not a homeowner's. It is caught by the
 * same pass anyway, because the question is what shape the text has rather than
 * whose number it turns out to be.
 *
 * These are already-public municipal records, so republishing them disclosed
 * nothing. What they did was make a statement the site relies on untrue: that it
 * does not publish addresses. The fix is here rather than at the render layer
 * because the generated JSON lives in a public repository — "not on the site" is
 * not "not public".
 *
 * ── THE PATTERN IS DELIBERATELY NARROW ────────────────────────────────────
 * It requires a house number AND a street-type token, so "replace 26 squares of
 * shingles" and "install 1,134sqft of carports" are untouched. Over-redaction is
 * the failure mode that matters — a mangled work description is a silent loss of
 * the evidence the roofing composition figures rest on — so every redaction is
 * returned to the caller to be counted and logged, never applied silently.
 *
 * The replacement keeps the sentence readable and says what happened, so a
 * reader meeting it on a page knows it is a redaction and not the city's own
 * wording.
 */

const STREET_TYPE =
  "st|street|rd|road|dr|drive|ln|lane|ave|avenue|blvd|boulevard|cir|circle|ct|court|way|trl|trail|" +
  "pkwy|parkway|cv|cove|ter|terrace|pass|bnd|bend|run|path|pl|place|hwy|highway|loop|row|walk|xing|crossing";

/** House number, up to four intervening words, then a street-type token —
 * optionally trailed by a city, state and ZIP. */
const ADDRESS = new RegExp(
  String.raw`\b\d{2,6}\s+(?:[A-Za-z0-9.'\-]+\s+){0,4}(?:${STREET_TYPE})\b\.?` +
    String.raw`(?:\s*,?\s*[A-Z][a-z]+)?(?:\s*,?\s*(?:TX|Texas))?(?:\s*,?\s*\d{5}(?:-\d{4})?)?`,
  "gi",
);

/** North-American phone shapes, with or without punctuation and area-code
 * parentheses. Deliberately not matching a bare seven-digit run, which in a
 * permit description is far more likely to be a parcel or plan number. */
const PHONE = /\b(?:\+?1[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]\d{3}[-.\s]\d{4}\b/g;

export const ADDRESS_REDACTION = "[address removed]";
export const PHONE_REDACTION = "[phone removed]";

export interface RedactionResult {
  text: string;
  /** What was removed, verbatim, so a run can log and a test can count. Empty
   * when nothing matched, which is the overwhelmingly common case. */
  removed: { kind: "address" | "phone"; matched: string }[];
}

/** Redact, and report. Returns the input unchanged when nothing matches. */
export function redactPersonalShapes(text: string | undefined): RedactionResult {
  const input = text ?? "";
  if (!input) return { text: input, removed: [] };
  const removed: RedactionResult["removed"] = [];
  let out = input.replace(ADDRESS, (m) => {
    removed.push({ kind: "address", matched: m.trim() });
    return ADDRESS_REDACTION;
  });
  out = out.replace(PHONE, (m) => {
    removed.push({ kind: "phone", matched: m.trim() });
    return PHONE_REDACTION;
  });
  return { text: out, removed };
}

/** True when a string still carries either shape. Used by the guard that
 * asserts committed data is clean, so the test and the fetcher agree by
 * construction rather than by two copies of a regex. */
export function hasPersonalShape(text: string | undefined): boolean {
  const v = text ?? "";
  // `lastIndex` is stateful on a /g/ regex, so test against fresh copies.
  return new RegExp(ADDRESS.source, "i").test(v) || new RegExp(PHONE.source).test(v);
}
