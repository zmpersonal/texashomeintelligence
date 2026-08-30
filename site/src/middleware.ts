/**
 * Cross-origin write protection — ours, not Astro's, and for one reason.
 *
 * Astro's built-in `security.checkOrigin` rejects any on-demand POST carrying
 * a form content type whose `Origin` header does not match the request's own
 * origin. It runs BEFORE user middleware, so a route cannot opt out of it.
 *
 * RFC 8058 one-click unsubscribe is exactly such a POST: a mail client posts
 * `List-Unsubscribe=One-Click` as `application/x-www-form-urlencoded` with no
 * Origin header at all. Measured against the built-in check: 403. The header
 * we advertise in every weekly email would be dead on arrival, which turns the
 * unsubscribe button in someone's mail client into a button that does nothing.
 *
 * So the built-in check is off in astro.config.mjs and reimplemented here with
 * the same rule and one allowlisted path. This is not a relaxation: every
 * route that was protected before is protected by the code below, by the same
 * test, and a route added tomorrow is protected by default.
 *
 * ── Why exempting the unsubscribe path is safe ────────────────────────────
 * CSRF matters when a request is authorised by something the browser attaches
 * automatically — a session cookie. The unsubscribe endpoint is authorised by
 * an HMAC-signed token in the URL and nothing else: no session is read, and a
 * POST without a valid token changes nothing (see unsubscribe.astro). An
 * attacker who could forge that request would have to already hold the token,
 * which means already holding the email it was sent in. There is nothing for a
 * cross-site POST to steal here.
 */
import { defineMiddleware } from "astro:middleware";

/** The content types a browser form can produce without a CORS preflight — the
 * same three Astro's own check looks at. Anything else (JSON, for instance)
 * already requires a preflight an attacker's page cannot pass. */
const FORM_TYPES = ["application/x-www-form-urlencoded", "multipart/form-data", "text/plain"];

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Paths authorised by a signed token rather than a session cookie. See above. */
const TOKEN_AUTHORISED = ["/email/unsubscribe/"];

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, url } = context;

  if (SAFE_METHODS.has(request.method)) return next();
  if (TOKEN_AUTHORISED.includes(url.pathname)) return next();

  const contentType = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!FORM_TYPES.includes(contentType)) return next();

  if (request.headers.get("origin") !== url.origin) {
    return new Response("Cross-site POST form submissions are forbidden", { status: 403 });
  }
  return next();
});
