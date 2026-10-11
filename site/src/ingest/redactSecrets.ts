/**
 * Keep credentials out of anything we write down.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 * Round 47. Four fetchers put an API key in a query string and then embedded
 * `url.toString()` in a thrown error:
 *
 *   airnow.ts · blsWages.ts · censusAcs.ts · eiaElectricityPrice.ts
 *
 * `runIngestion`'s `failAttempt` writes that error text into `lastError`, and
 * `lastError` is committed. AirNow's endpoint started answering **410 Gone**,
 * so every scheduled run re-committed the full 36-character AIRNOW_API_KEY into
 * `src/data/generated/airnow/{austin,san-antonio}.json` on a PUBLIC repository,
 * from 2026-09-04 until it was caught 37 days later. The same text went into the
 * Actions log of every failed run.
 *
 * The key has been rotated. This is what stops the next one.
 *
 * ── TWO LAYERS, DELIBERATELY ──────────────────────────────────────────────
 * `redactUrl` is what a fetcher calls, so its thrown message and the ingest log
 * are clean at the source. `redactSecretsInText` is applied by `failAttempt` to
 * whatever it is handed, so a fetcher that forgets — or a fifth one added later
 * by someone who never reads this file — still cannot write a key to disk.
 *
 * The owner asked for "one shared helper so a fifth can't reintroduce it". A
 * helper alone cannot promise that: it only works where it is called. The sink
 * is where the guarantee lives, and the helper is where the useful error text
 * lives. Hence both.
 *
 * ── HOW A VALUE IS JUDGED A SECRET ────────────────────────────────────────
 * By NAME first: the parameter names these APIs actually use for credentials.
 * That list is authoritative and exact.
 *
 * By SHAPE second, and this is the half that matters for the fifth fetcher: any
 * parameter value that looks like a token — 16+ characters of URL-safe alphabet
 * carrying both letters and digits — is redacted whatever it is called. A key
 * renamed `auth`, `t` or `id` is still a key.
 *
 * Over-redaction is the cheap direction here and it is chosen on purpose. A
 * hidden value in an error message costs one debugging round; a published one
 * costs a rotation and a public-repo incident. What the shape rule will NOT eat
 * is the diagnostic query text this project has already needed twice: Socrata's
 * `$where` and `$select` carry spaces, quotes and parentheses, so they fail the
 * URL-safe-alphabet test and survive intact. Round 44 lost a pass to a wrong
 * `$where` predicate reading as thirteen silent zeros — that clause has to stay
 * legible.
 */

/** Parameter names these feeds use for credentials. Matched case-insensitively. */
const SECRET_PARAM_NAMES = [
  "api_key",
  "apikey",
  "key",
  "registrationkey",
  "token",
  "app_token",
  "access_key",
  "access_token",
  "auth",
  "secret",
  "password",
  "signature",
  "sig",
];

export const SECRET_REDACTION = "[redacted]";

/** A token by shape rather than by name: URL-safe, 16+ long, letters AND digits. */
function looksLikeAToken(value: string): boolean {
  if (value.length < 16) return false;
  if (!/^[A-Za-z0-9_\-.]+$/.test(value)) return false;
  return /[A-Za-z]/.test(value) && /[0-9]/.test(value);
}

function isSecretParam(name: string, value: string): boolean {
  return SECRET_PARAM_NAMES.includes(name.toLowerCase()) || looksLikeAToken(value);
}

/**
 * A URL safe to put in an error, a log line or a committed field.
 *
 * Returns a string rather than a URL because that is the only thing anyone
 * should be interpolating into a message, and because a redacted URL is no
 * longer a working one — handing back a `URL` would invite someone to fetch it.
 */
export function redactUrl(input: URL | string): string {
  let url: URL;
  try {
    url = input instanceof URL ? new URL(input.toString()) : new URL(input);
  } catch {
    // Not a URL at all. Fall back to the text pass rather than returning
    // something unredacted on the grounds that it could not be parsed.
    return redactSecretsInText(String(input));
  }
  for (const [name, value] of [...url.searchParams.entries()]) {
    if (isSecretParam(name, value)) url.searchParams.set(name, SECRET_REDACTION);
  }
  // `searchParams.set` percent-encodes the brackets, which makes a redacted
  // Socrata URL harder to read than it needs to be. The value is the only part
  // that had to change.
  return url.toString().replace(/%5B%5D/g, "[]").replace(/%24/g, "$");
}

/**
 * Redact credential-shaped `name=value` pairs anywhere in free text.
 *
 * This is the sink-side pass. It works on the whole string because by the time
 * `failAttempt` sees it, a URL is just a substring of a sentence.
 */
export function redactSecretsInText(text: string): string {
  return text.replace(
    /([?&;])([A-Za-z0-9_\-.]+)=([^&\s"'<>]+)/g,
    (whole, sep: string, name: string, value: string) =>
      isSecretParam(name, value) ? `${sep}${name}=${SECRET_REDACTION}` : whole,
  );
}

/** True when a string still carries a credential-shaped parameter. Used by the
 * guard that asserts committed data is clean, so the test and the redaction
 * agree by construction rather than by two copies of a rule. */
export function hasSecretShape(text: string | null | undefined): boolean {
  const v = text ?? "";
  if (!v) return false;
  return redactSecretsInText(v) !== v;
}
