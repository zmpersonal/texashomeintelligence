/**
 * Alert types and the shape of a fired alert — pure data, no dataset access.
 *
 * Split from `alerts.ts` because that file reads the generated datasets, and
 * the server-rendered dashboard must not import anything that touches the
 * eager glob. The evaluation logic stays in `alerts.ts`, which only ever runs
 * at build time.
 */
export type AlertKey = "freeze" | "hail" | "heat" | "heavy-rain";

export interface AlertDefinition {
  key: AlertKey;
  label: string;
  description: string;
}

export const ALERT_CATALOGUE: AlertDefinition[] = [
  { key: "freeze", label: "Freeze", description: "When the forecast low for the area drops to freezing or below." },
  { key: "heat", label: "Extreme heat", description: "When forecast highs for the area run at or above 100°F." },
  { key: "hail", label: "Hail", description: "When hail is recorded in your county by NOAA." },
  { key: "heavy-rain", label: "Heavy rain and flooding", description: "When flooding is recorded in your county by NOAA." },
];


export interface FiredAlert {
  key: AlertKey;
  label: string;
  /** Stable per underlying reading, so one condition fires once. */
  conditionKey: string;
  headline: string;
  detail: string;
  source: string;
  observedAt: string;
  checklist: string[];
}
