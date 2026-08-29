/**
 * The strict match-or-withhold rule.
 *
 * Owner's constraint, carried literally: exact match → publish; any ambiguity,
 * near-miss, ZIP conflict, or absent row → withhold and send the reader to the
 * city's own lookup. A home Austin Resource Recovery does not serve — a
 * Pflugerville address, a MUD, anything in San Antonio — is never shown
 * Austin's collection day.
 *
 * There is no scoring, no threshold, and no second-best candidate anywhere in
 * this file. That is the design, not an omission: a wrong collection day costs
 * the reader a missed pickup, which is strictly worse than telling them we
 * don't know.
 */
import { AMBIGUOUS, type ArrShard } from "./shards";
import { parseAddressLine } from "./addressKey";

export type WithheldReason =
  | "not-austin"          // outside the one metro this round covers
  | "no-address"          // home has no stored address to match on
  | "zip-not-served"      // no shard: ARR does not collect in this ZIP
  | "address-not-found"   // shard exists, this address is not in it
  | "ambiguous"           // rows disagree for this address
  | "unparsed"            // we could not read the stored address confidently
  | "malformed";          // shard row was not in the expected form

export interface CollectionFound {
  status: "found";
  /** e.g. "Tuesday" — the address's collection day. */
  day: string;
  /** "A" or "B" — which recycling week this address is on. Deliberately NOT
   * turned into a date: the dataset says which letter an address is on, not
   * which letter the current calendar week is. Computing a date would need an
   * anchor we have not sourced, and a wrong week is a missed pickup. */
  week: string;
  sourceUpdatedAt: string | null;
  ingestedAt: string;
}
export interface CollectionWithheld {
  status: "withheld";
  reason: WithheldReason;
}
export type CollectionResult = CollectionFound | CollectionWithheld;

const DAY_NAMES: Record<string, string> = {
  MON: "Monday", TUE: "Tuesday", WED: "Wednesday", THU: "Thursday",
  FRI: "Friday", SAT: "Saturday", SUN: "Sunday",
  MONDAY: "Monday", TUESDAY: "Tuesday", WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday", FRIDAY: "Friday", SATURDAY: "Saturday", SUNDAY: "Sunday",
};

export function matchCollection(
  areaId: string,
  zip: string,
  addressLine: string | null,
  shard: ArrShard | null,
): CollectionResult {
  if (areaId !== "austin") return { status: "withheld", reason: "not-austin" };
  if (!addressLine || !addressLine.trim()) return { status: "withheld", reason: "no-address" };
  if (!shard) return { status: "withheld", reason: "zip-not-served" };

  const parsed = parseAddressLine(addressLine, zip);
  if (!parsed.ok) return { status: "withheld", reason: "unparsed" };

  const value = shard.rows[parsed.key];
  if (value === undefined) return { status: "withheld", reason: "address-not-found" };
  if (value === AMBIGUOUS) return { status: "withheld", reason: "ambiguous" };

  const [rawDay, rawWeek] = value.split("|");
  const day = DAY_NAMES[(rawDay ?? "").toUpperCase()];
  const week = (rawWeek ?? "").toUpperCase();
  // An unrecognised day or week is a shard we don't understand. Withhold rather
  // than render a raw code at someone.
  if (!day || !/^[AB]$/.test(week)) return { status: "withheld", reason: "malformed" };

  return {
    status: "found",
    day,
    week,
    sourceUpdatedAt: shard.sourceUpdatedAt,
    ingestedAt: shard.ingestedAt,
  };
}
