/**
 * POST /api/email/weekly-run/ — the internal trigger.
 *
 * There is no Cron Trigger to run this (see weeklyRun.ts for why the adapter
 * version cannot register one), so the schedule is a GitHub Actions cron that
 * calls this endpoint. That makes it a URL on the public internet which can
 * send mail to every subscriber — so it is gated three ways:
 *
 *   1. A shared secret, `WEEKLY_RUN_TOKEN`, compared in constant time.
 *   2. If that secret is not set, the route returns 404. An unconfigured
 *      deployment does not expose an open trigger; it exposes nothing.
 *   3. POST only. A GET cannot send mail, so a crawler, a link scanner, or a
 *      pasted URL cannot start a run.
 *
 * A wrong token gets 404, not 401, for the same reason the unsubscribe page
 * gives one answer to every bad token: a 401 confirms the endpoint exists.
 *
 * `dryRun=1` builds every message and returns them without sending or writing
 * anything — the review path for the recipient gate and the rendered copy.
 */
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { runWeekly, DEFAULT_BATCH } from "../../../lib/email/weeklyRun";
import { origin as siteOrigin } from "../../../lib/urls";

export const prerender = false;

const NOT_FOUND = () => new Response("Not found", { status: 404 });

function equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const POST: APIRoute = async ({ request, url, site }) => {
  const secret = (env as unknown as Record<string, string | undefined>).WEEKLY_RUN_TOKEN;
  if (!secret) return NOT_FOUND();

  const presented = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!presented || !equal(secret, presented)) return NOT_FOUND();

  const params = url.searchParams;
  const dryRun = params.get("dryRun") === "1" || params.get("dry_run") === "1";
  const limitRaw = Number(params.get("limit"));
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : DEFAULT_BATCH;

  // Links must be absolute and must point at the canonical site, not at
  // whatever hostname the trigger happened to arrive on — an unsubscribe link
  // pointing at a preview deployment stops working when that deployment does.
  const canonical = siteOrigin(site) || url.origin;

  const report = await runWeekly({ dryRun, limit, origin: canonical, weekKey: params.get("week") ?? undefined });

  // 409 when the run refused to start, so the Action fails loudly rather than
  // logging a green run that sent nothing.
  return new Response(JSON.stringify(report, null, 2), {
    status: report.halted ? 409 : 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
};
