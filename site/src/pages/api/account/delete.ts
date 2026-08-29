/**
 * POST /api/account/delete/ — remove everything.
 *
 * Built in the same round that starts collecting the data, because a deletion
 * path that does not exist yet is indistinguishable from one that does not
 * work. Requires an explicit confirmation field so a stray POST cannot destroy
 * an account, and returns what it deleted plus a count of anything left over,
 * which the round's test asserts is zero.
 */
import type { APIRoute } from "astro";
import { authenticate, json, UNAUTHORIZED } from "../../../lib/auth/guard";
import { deleteAccountData } from "../../../lib/account/deletion";
import { clearedMarkerCookie, clearedSessionCookie } from "../../../lib/auth/session";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const auth = await authenticate(request);
  if (!auth) return UNAUTHORIZED();

  const form = await request.formData().catch(() => null);
  if (String(form?.get("confirm") ?? "") !== "DELETE") {
    return json({ error: 'Send confirm=DELETE to remove your account.' }, 400);
  }

  const report = await deleteAccountData(auth.account.id, auth.sessionId);
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8" });
  headers.append("Set-Cookie", clearedSessionCookie());
  headers.append("Set-Cookie", clearedMarkerCookie());
  return new Response(JSON.stringify(report), { status: 200, headers });
};
