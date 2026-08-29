/** POST /api/auth/sign-out/ — revoke the session server-side, then clear the
 * cookie. Deleting the KV record matters more than clearing the cookie: a
 * copied cookie stops working either way. */
import type { APIRoute } from "astro";
import { clearedMarkerCookie, clearedSessionCookie, destroySession, sessionIdFromRequest } from "../../../lib/auth/session";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  await destroySession(sessionIdFromRequest(request));
  const headers = new Headers({ Location: "/" });
  headers.append("Set-Cookie", clearedSessionCookie());
  headers.append("Set-Cookie", clearedMarkerCookie());
  return new Response(null, { status: 302, headers });
};
