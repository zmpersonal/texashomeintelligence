/**
 * Austin Water watering — Tier 1.
 *
 * The stage is a reading (ingested, sourced, dated). The watering day is not a
 * reading at all: it is Austin Water's published rule applied to the street
 * number's parity, computed here deterministically from `config.ts`.
 *
 * Tier 1 framing, which the whole module is built around: we do NOT assert that
 * a day applies to *this* home. Austin Water's service area is not the same as
 * the city, the county, or our ZIP set — plenty of 787xx addresses are served
 * by a MUD or another utility — and we have no service-area boundary to check
 * against. So the rule is always presented conditionally: *if* this home is an
 * Austin Water customer. Asserting the day outright is Tier 2, and stays
 * deferred until that boundary exists (HANDOFF seam 8).
 *
 * Staleness: past the config's window the card keeps showing the last known
 * stage, clearly marked stale with its as-of date — the same way every other
 * feed degrades — but stops publishing a day, because which day goes with which
 * parity changes between stages. We never infer that a stage is "probably still"
 * what it was.
 */
import {
  WATERING_RULES, WATER_STAGE_STALE_AFTER_DAYS, WATER_STAGES,
  type WaterStage, type WateringRule,
} from "./config";

export interface StageReading {
  stage: WaterStage;
  /** When Austin Water's page said this — the observation's date. */
  observedAt: string;
  sourceUrl: string;
}

export type WateringView =
  | { status: "unavailable"; reason: "no-reading" | "not-austin" }
  | {
      status: "current" | "stale";
      stage: WaterStage;
      observedAt: string;
      ageDays: number;
      /** Present only when the reading is current AND we hold the rule for this
       * stage. Stale or unknown-stage → no day, by design. */
      rule: WateringRule | null;
      /** The parity we read off the house number, or null when we could not
       * read one. Never guessed. */
      parity: "odd" | "even" | null;
      /** The day for this parity under this stage — still conditional on the
       * home being an Austin Water customer. */
      automaticDay: string | null;
      hoseEndDay: string | null;
    };

export function isWaterStage(value: string): value is WaterStage {
  return (WATER_STAGES as readonly string[]).includes(value);
}

/** Parity of the street number. Returns null when the address has no leading
 * house number we can read — we do not fall back to a default. */
export function houseNumberParity(addressLine: string | null): "odd" | "even" | null {
  if (!addressLine) return null;
  const m = addressLine.trim().match(/^(\d+)/);
  if (!m) return null;
  const last = m[1][m[1].length - 1];
  return Number(last) % 2 === 0 ? "even" : "odd";
}

export function buildWateringView(
  areaId: string,
  reading: StageReading | null,
  addressLine: string | null,
  now: Date,
): WateringView {
  if (areaId !== "austin") return { status: "unavailable", reason: "not-austin" };
  if (!reading) return { status: "unavailable", reason: "no-reading" };

  const ageDays = Math.max(
    0,
    Math.floor((now.getTime() - new Date(reading.observedAt).getTime()) / 86_400_000),
  );
  const stale = ageDays > WATER_STAGE_STALE_AFTER_DAYS;
  const parity = houseNumberParity(addressLine);
  const rule = stale ? null : (WATERING_RULES[reading.stage] ?? null);

  return {
    status: stale ? "stale" : "current",
    stage: reading.stage,
    observedAt: reading.observedAt,
    ageDays,
    rule,
    parity,
    automaticDay: rule && parity ? rule.automatic[parity] : null,
    hoseEndDay: rule?.hoseEnd && parity ? rule.hoseEnd[parity] : null,
  };
}
