/**
 * GET /api/auth/verify/?token=… — complete sign-in.
 *
 * The token is consumed (read-and-deleted) before the account is touched, so a
 * replayed link cannot create a second session even if two requests arrive at
 * once. Unknown, expired and already-used tokens are all answered the same way.
 */
import type { APIRoute } from "astro";
import { consumeMagicToken, safeNext } from "../../../lib/auth/tokens";
import { createSession, sessionCookie, signedInMarkerCookie } from "../../../lib/auth/session";
import { upsertAccount } from "../../../lib/account/db";
import { setWeeklyPref } from "../../../lib/email/weeklyRecipients";

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
  // Round 9. Written only when the person ticked the weekly box on the form
  // that produced THIS token, so nobody is enrolled by a link they were sent
  // for another reason, and nobody is enrolled retroactively.
  //
  // Only ever a write of `true`. An unticked box means the request did not
  // mention the weekly email, not that it asked to stop one — so a subscriber
  // signing in again keeps what they chose.
  //
  // In its own try/catch, and after the session is NOT yet created only in the
  // sense that order does not matter here: what matters is that a preference
  // write can never cost someone their sign-in. If the Round 9 migration has
  // not been applied to this database the table does not exist, and a thrown
  // query would otherwise turn a working magic link into a 500.
  if (payload.weeklyOptIn) {
    try {
      await setWeeklyPref(account.id, true, "signup");
    } catch (error) {
      console.error("[weekly] could not record the signup opt-in:", error);
    }
  }

  const sid = await createSession(account.id);

  // Two Set-Cookie headers: the real session (HttpOnly) and the header marker
  // (readable). Headers, not an object, because a plain object cannot carry
  // two values under the same name.
  const headers = new Headers({ Location: safeNext(payload.next) });
  headers.append("Set-Cookie", sessionCookie(sid));
  headers.append("Set-Cookie", signedInMarkerCookie());
  return new Response(null, { status: 302, headers });
};
