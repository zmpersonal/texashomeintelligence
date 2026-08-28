/**
 * Display formatting for dataset freshness.
 *
 * Generated dataset files carry raw ISO timestamps (`lastSuccessAt`,
 * `observedAt`), while the location YAML carries already-human strings like
 * "August 2026". Both flow into the same `DataStatus` props, so these helpers
 * format an ISO string and pass anything else through untouched.
 */

const ISO_LIKE = /^\d{4}-\d{2}-\d{2}(?:[T ]|$)/;

export function isIsoLike(value: string): boolean {
  return ISO_LIKE.test(value) && !Number.isNaN(Date.parse(value));
}

/** "2026-08-27T19:49:47.967Z" -> "Aug 27, 2026". Non-ISO input is returned as-is. */
export function formatDate(value: string): string {
  if (!isIsoLike(value)) return value;
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "2026-05-26T00:00:00Z" -> "May 2026". Non-ISO input is returned as-is. */
export function formatMonth(value: string): string {
  if (!isIsoLike(value)) return value;
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/** The `datetime` attribute for a `<time>` element, or undefined when the
 * value isn't a real timestamp (so we never emit an invalid machine date). */
export function machineDate(value: string): string | undefined {
  return isIsoLike(value) ? new Date(value).toISOString() : undefined;
}
