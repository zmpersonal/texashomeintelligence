/**
 * The Home Stress Index as machine-readable JSON, one file per area.
 *
 * Generated at BUILD time and served as a static file, so the serving path
 * never computes a score, queries a database, or calls a government API
 * (COST.md). Round 4's dashboard imports `computeStressIndex` directly at
 * build time; this endpoint exists for the share-card generator, for external
 * citation, and so the arithmetic behind a published number is inspectable
 * without reading TypeScript.
 *
 * Note on where this lives: the round brief asked for the scores to be
 * precomputed "into the generated data tree". They are precomputed, but into
 * the build output rather than committed under `src/data/generated/**`. A
 * committed derivative would be a second copy of a number the build already
 * derives, and the two would disagree the first time someone changed a weight
 * without re-running the emitter. Deriving it in the build makes that class of
 * drift impossible instead of guarding against it.
 */
import type { APIRoute, GetStaticPaths } from "astro";
import { computeStressIndex, explainComposite } from "../../../lib/stressIndex";
import { buildDashboard } from "../../../lib/dashboard";
import { evaluateAlerts } from "../../../lib/account/alerts";
import { ZIP_AREAS } from "../../../lib/zipAreas";
import { EXCLUDED_INPUTS, SIGNAL_WEIGHTS, STORM_DECAY_HALF_LIFE_DAYS } from "../../../lib/stressIndex";
import { areaDefinitions } from "../../../lib/zipAreas";

export const getStaticPaths: GetStaticPaths = () =>
  areaDefinitions().map((area) => ({ params: { area: area.areaId }, props: { area } }));

export const GET: APIRoute = ({ props }) => {
  const result = computeStressIndex(props.area);
  const area = ZIP_AREAS.find((a) => a.areaId === props.area.areaId)!;
  // A representative ZIP for this area, only to reuse the dashboard view
  // builder — the reading is per-metro, so any covered ZIP yields the same one.
  const sampleZip = props.area.areaId === "austin" ? "78704" : "78205";
  const view = buildDashboard(sampleZip);

  const body = {
    ...result,
    compositeExplanation: explainComposite(result),
    // Precomputed here so the logged-in dashboard can render from this file
    // instead of importing the engine. Importing it into the Worker pulls the
    // eager dataset glob — every permit JSON included — and took the bundle
    // from 0.8 MB to 2.8 MB. The serving path reads this artifact instead.
    dashboard: view
      ? {
          delta: view.delta,
          signalOrder: view.signals.map((s) => s.id),
          series: view.series,
          weightCoverage: view.weightCoverage,
          compositeHeadline: view.composite.headline,
        }
      : null,
    alerts: evaluateAlerts(
      props.area.areaId,
      area.primaryCounty.name,
      new Date(result.referenceDate),
    ),
    parameters: {
      weights: SIGNAL_WEIGHTS,
      stormDecayHalfLifeDays: STORM_DECAY_HALF_LIFE_DAYS,
      excludedInputs: EXCLUDED_INPUTS,
    },
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};
