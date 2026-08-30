/**
 * POST /api/auth/request-link/ — start a passwordless sign-in.
 *
 * Consent is required here, before anything exists: the token payload carries
 * it, and the account row cannot be written without it. Nothing durable is
 * created at this step — a request that is never verified leaves a KV entry
 * that expires in 15 minutes and no database row at all.
 *
 * The response is deliberately identical whether or not the address is known.
 * Saying "no account found" would turn this endpoint into a way to test which
 * addresses are registered.
 */
import type { APIRoute } from "astro";
import { allowLinkRequest } from "../../../lib/auth/rateLimit";
import { magicLinkEmail, sendEmail } from "../../../lib/email/transport";
import { newMagicToken, putMagicToken, safeNext } from "../../../lib/auth/tokens";
import { json } from "../../../lib/auth/guard";

export const prerender = false;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NEUTRAL = { message: "If that address can receive mail, a sign-in link is on its way." };

export const POST: APIRoute = async ({ request, url }) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Expected a form submission." }, 400);
  }

  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const consent = String(form.get("consent") ?? "");
  const consentSource = String(form.get("consent_source") ?? "").trim();
  const next = safeNext(String(form.get("next") ?? "") || null);
  // Separate from the consent box above and never required. Only a tick is
  // carried; see MagicTokenPayload.weeklyOptIn for why absence is not `false`.
  const weeklyOptIn = String(form.get("weekly") ?? "") === "yes";

  if (consent !== "yes") {
    return json({ error: "We can only create an account if you tick the consent box." }, 400);
  }
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return json({ error: "That doesn't look like an email address." }, 400);
  }
  if (!consentSource || consentSource.length > 64) {
    return json({ error: "Missing consent provenance." }, 400);
  }

  const ip = request.headers.get("cf-connecting-ip");
  const limit = await allowLinkRequest(email, ip);
  if (!limit.allowed) {
    return json(
      { error: "Too many sign-in links requested. Try again in an hour." },
      429,
      { "Retry-After": "3600" },
    );
  }

  const token = newMagicToken();
  await putMagicToken(token, {
    email,
    consent: true,
    consentSource,
    consentAt: new Date().toISOString(),
    ...(weeklyOptIn ? { weeklyOptIn: true as const } : {}),
    next,
    requestedAt: new Date().toISOString(),
  });

  const link = new URL(`/api/auth/verify/?token=${token}`, url.origin).toString();
  const sent = await sendEmail({ to: email, ...magicLinkEmail(link) });

  // Report the transport honestly. With the stub running, the caller is told
  // the mail was not really sent rather than being shown a success message for
  // an email that only exists in a log.
  return json({ ...NEUTRAL, transport: sent.transport, delivered: sent.ok }, 200);
};
