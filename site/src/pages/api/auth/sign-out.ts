/** POST /api/auth/sign-out/ — revoke the session server-side, then clear the
 * cookie. Deleting the KV record matters more than clearing the cookie: a
 * copied cookie stops working either way. */
import type { APIRoute } from "astro";
import { clearedSessionCookie, destroySession, sessionIdFromRequest } from "../../../lib/auth/session";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  await destroySession(sessionIdFromRequest(request));
  return new Response(null, {
    status: 302,
    headers: { Location: "/", "Set-Cookie": clearedSessionCookie() },
  });
};
