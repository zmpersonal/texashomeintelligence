/**
 * CLI entrypoint the ingestion cron (.github/workflows/data-ingestion.yml)
 * runs. Idempotently seeds any dataset file that doesn't exist yet, then
 * runs every registered fetcher. Run locally with:
 *   npm run ingest
 */
import { REGISTRY } from "../src/ingest/registry";
import { seedIfMissing } from "../src/ingest/seed";
import { runIngestion } from "../src/ingest/runIngestion";

async function main() {
  const rows: string[] = [];
  let liveCount = 0;
  let staleCount = 0;
  let errorCount = 0;

  for (const entry of REGISTRY) {
    const seedResult = seedIfMissing(entry);
    const result = await runIngestion(entry.fetcher, entry.filePath);

    if (result.outcome === "live") liveCount++;
    else if (result.outcome === "stale") staleCount++;
    else if (result.outcome === "error") errorCount++;

    rows.push(
      `[${entry.tier}] ${result.datasetId}/${result.location} — ${result.outcome} ` +
        `(${result.observationCount} observation(s)${seedResult === "seeded" ? ", freshly seeded" : ""}): ${result.message}`,
    );
  }

  console.log(rows.join("\n"));
  console.log(
    `\n${REGISTRY.length} dataset(s) processed — ${liveCount} live, ${staleCount} stale, ${errorCount} error.`,
  );
  console.log(
    "Every 'live' outcome above is a stubbed fetchRaw() throwing as designed — expected until Seam 1 fetchers are implemented (see HANDOFF.md).",
  );

  // Non-fatal by design: an unimplemented fetcher isn't a CI failure, it's
  // the expected state until Seam 1 is wired up. A real regression (e.g. a
  // seed generator throwing) already surfaces as an uncaught rejection
  // below, which does fail the job.
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
