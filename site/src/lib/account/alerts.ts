/**
 * Condition alerts, driven by the Round 3 engine and the same committed
 * observations the dashboard renders. No new data source, no request-time
 * fetch: an alert is a reading of records we already hold.
 *
 * Every alert is a statement about an AREA. The copy says "in the Austin area",
 * never "at your address" — an address resolves a ZIP and personalises which
 * county's records we read, and buys no parcel-level precision, because we hold
 * none. That constraint is enforced here in the templates rather than left to
 * whoever writes the UI.
 *
 * And they are CONDITIONS, not predictions of damage — the same framing the
 * index carries. A freeze alert says a freeze is forecast, not that pipes will
 * burst.
 */
import { findDataset } from "../datasets";
import type { Observation } from "../../ingest/types";

export type { AlertKey, AlertDefinition, FiredAlert } from "./alertCatalogue";
import { ALERT_CATALOGUE, type FiredAlert } from "./alertCatalogue";
export { ALERT_CATALOGUE };

const measured = <T,>(obs: Observation<T>[]) => obs.filter((o) => !o.seed);

/**
 * Evaluates every alert for an area against the current records.
 * `referenceDate` anchors "recent" to the data, matching the engine, so an
 * alert cannot quietly age past its own evidence.
 */
export function evaluateAlerts(areaId: string, countyName: string, referenceDate: Date): FiredAlert[] {
  const fired: FiredAlert[] = [];

  // ── Freeze and heat, from the NWS forecast feed ──
  const nws = findDataset<{ forecastHighF?: number; forecastLowF?: number }>("nws-api", areaId);
  if (nws && nws.status !== "sample") {
    const rows = measured(nws.observations).sort((a, b) => b.observedAt.localeCompare(a.observedAt));
    const latest = rows[0];
    if (latest) {
      const low = latest.value.forecastLowF;
      const high = latest.value.forecastHighF;
      if (typeof low === "number" && low <= 32) {
        fired.push({
          key: "freeze", label: "Freeze",
          conditionKey: `freeze:${latest.observedAt}`,
          headline: `Freezing temperatures forecast in the ${areaLabel(areaId)} area`,
          detail:
            `The National Weather Service forecast low for the area is ${low}°F. This is a forecast ` +
            `for the area, not a measurement at your home.`,
          source: "National Weather Service",
          observedAt: latest.observedAt,
          checklist: [
            "Cover or drip outdoor faucets and exposed pipes",
            "Disconnect and drain garden hoses",
            "Open cabinet doors under sinks on exterior walls",
            "Know where your main shut-off is",
          ],
        });
      }
      if (typeof high === "number" && high >= 100) {
        fired.push({
          key: "heat", label: "Extreme heat",
          conditionKey: `heat:${latest.observedAt}`,
          headline: `Extreme heat holding in the ${areaLabel(areaId)} area`,
          detail:
            `The National Weather Service forecast high for the area is ${high}°F. Sustained heat is ` +
            `when marginal cooling systems tend to struggle.`,
          source: "National Weather Service",
          observedAt: latest.observedAt,
          checklist: [
            "Check the AC filter — a clogged one costs you cooling",
            "Clear leaves and debris from the outdoor condenser",
            "Check the condensate drain line for backup",
          ],
        });
      }
    }
  }

  // ── Hail and flooding, from the NOAA storm record for this county ──
  const storms = findDataset<{ county?: string; eventType?: string; magnitude?: string }>(
    "noaa-storm-events",
    areaId,
  );
  if (storms && storms.status !== "sample") {
    const recent = measured(storms.observations)
      .filter((o) => !o.value.county || o.value.county === countyName)
      .filter((o) => new Date(o.observedAt).getTime() >= referenceDate.getTime() - 30 * 86_400_000)
      .sort((a, b) => b.observedAt.localeCompare(a.observedAt));

    const hail = recent.find((o) => o.value.eventType === "Hail");
    if (hail) {
      fired.push({
        key: "hail", label: "Hail",
        conditionKey: `hail:${hail.key}`,
        headline: `Hail recorded in ${countyName} County`,
        detail:
          `NOAA recorded hail${hail.value.magnitude ? ` of ${hail.value.magnitude}` : ""} in ` +
          `${countyName} County. The report is for the county, not your street — it means worth ` +
          `checking, not that your roof was hit.`,
        source: "NOAA Storm Events Database",
        observedAt: hail.observedAt,
        checklist: [
          "Look for dents on gutters, downspouts and vents from the ground",
          "Photograph anything you find, with the date",
          "Check for granules collecting at downspout outlets",
        ],
      });
    }

    const flood = recent.find((o) => o.value.eventType === "Flood");
    if (flood) {
      fired.push({
        key: "heavy-rain", label: "Heavy rain and flooding",
        conditionKey: `heavy-rain:${flood.key}`,
        headline: `Flooding recorded in ${countyName} County`,
        detail:
          `NOAA recorded a flood event in ${countyName} County. This describes the county, not your ` +
          `property.`,
        source: "NOAA Storm Events Database",
        observedAt: flood.observedAt,
        checklist: [
          "Check that gutters and downspouts are running clear",
          "Look for pooling within a few feet of the foundation",
          "Check crawlspace or garage for water intrusion",
        ],
      });
    }
  }

  return fired;
}

function areaLabel(areaId: string): string {
  return areaId === "san-antonio" ? "San Antonio" : "Austin";
}
