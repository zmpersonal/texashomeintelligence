/**
 * GET /api/auth/verify/?token=… — complete sign-in.
 *
 * The token is consumed (read-and-deleted) before the account is touched, so a
 * replayed link cannot create a second session even if two requests arrive at
 * once. Unknown, expired and already-used tokens are all answered the same way.
 */
import type { APIRoute } from "astro";
import { consumeMagicToken, safeNext } from "../../../lib/auth/tokens";
import { createSession, sessionCookie } from "../../../lib/auth/session";
import { upsertAccount } from "../../../lib/account/db";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const token = url.searchParams.get("token") ?? "";
  const payload = await consumeMagicToken(token);

  if (!payload) {
    return new Response(null, {
      status: 302,
      headers: { Location: "/home/sign-in/?error=link" },
    });
  }

  const account = await upsertAccount({
    email: payload.email,
    consentSource: payload.consentSource,
    consentAt: payload.consentAt,
  });
  const sid = await createSession(account.id);

  return new Response(null, {
    status: 302,
    headers: { Location: safeNext(payload.next), "Set-Cookie": sessionCookie(sid) },
  });
};
