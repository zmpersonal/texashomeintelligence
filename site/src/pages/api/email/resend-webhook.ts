/**
 * POST /api/email/resend-webhook/ — bounce and complaint intake.
 *
 * Continuing to mail an address that hard-bounced, or that reported us as
 * spam, is how a sending domain's reputation dies — and in the complaint case
 * it is simply ignoring someone who said stop. So the provider tells us, and
 * we write it into `email_suppressions`, which the recipient query LEFT JOINs.
 *
 * ── Verification, because this is an unauthenticated public URL ────────────
 * Anyone can POST here. If we trusted the body, anyone could suppress anyone's
 * address by naming it — a denial-of-service against a homeowner's own email.
 * So every request must carry a valid Svix signature (Resend's scheme) over
 * the exact bytes we received, computed with `RESEND_WEBHOOK_SECRET`:
 *
 *   signed content = `${svix-id}.${svix-timestamp}.${raw body}`
 *
 * Unsigned, mis-signed, or replayed-outside-the-window requests are rejected
 * before the body is parsed. With no secret set the route is 404 — an
 * unconfigured deployment exposes no suppression endpoint at all.
 *
 * ── What it does NOT do ───────────────────────────────────────────────────
 * A suppression stops MARKETING mail. It does not block a sign-in link: that
 * is transactional, the person asked for it seconds earlier, and a bounce
 * recorded months ago (or an incorrect one) must not be able to lock someone
 * out of their own account. Flagged for the owner rather than decided here.
 */
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { suppress } from "../../../lib/email/weeklyRecipients";

export const prerender = false;

const TOLERANCE_SECONDS = 300;

const NOT_FOUND = () => new Response("Not found", { status: 404 });

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function signatureValid(secret: string, headers: Headers, body: string): Promise<boolean> {
  const id = headers.get("svix-id") ?? headers.get("webhook-id");
  const timestamp = headers.get("svix-timestamp") ?? headers.get("webhook-timestamp");
  const presented = headers.get("svix-signature") ?? headers.get("webhook-signature");
  if (!id || !timestamp || !presented) return false;

  // Replay window. A signature stays valid forever otherwise, so a captured
  // request could be replayed indefinitely.
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) return false;

  const raw = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let keyBytes: Uint8Array;
  try {
    keyBytes = b64ToBytes(raw);
  } catch {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = bytesToB64(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)),
  );

  // The header carries a space-separated list of `version,signature` pairs so
  // a secret can be rotated without downtime; any v1 entry matching is enough.
  return presented
    .split(" ")
    .filter((part) => part.startsWith("v1,"))
    .some((part) => equal(expected, part.slice(3)));
}

export const POST: APIRoute = async ({ request }) => {
  const secret = (env as unknown as Record<string, string | undefined>).RESEND_WEBHOOK_SECRET;
  if (!secret) return NOT_FOUND();

  // Read as text, not JSON: the signature is over the exact bytes, and
  // re-serialising a parsed object would not reproduce them.
  const body = await request.text();
  if (!(await signatureValid(secret, request.headers, body))) {
    return new Response("Bad signature", { status: 401 });
  }

  let event: { type?: string; data?: { to?: string[] | string } };
  try {
    event = JSON.parse(body);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const reason =
    event.type === "email.bounced" ? "bounce" : event.type === "email.complained" ? "complaint" : null;
  // Deliveries, opens and clicks arrive on the same hook. Acknowledged and
  // ignored — we do not record who opened what.
  if (!reason) return new Response(JSON.stringify({ ok: true, ignored: event.type ?? null }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

  const to = event.data?.to;
  const addresses = (Array.isArray(to) ? to : to ? [to] : []).filter(Boolean);
  for (const address of addresses) await suppress(address, reason, event.type);

  return new Response(JSON.stringify({ ok: true, suppressed: addresses.length }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
