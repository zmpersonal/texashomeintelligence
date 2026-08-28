/**
 * One way to build an absolute URL.
 *
 * Three idioms had grown up side by side — `new URL(path, Astro.site)`,
 * `Astro.site.toString().replace(/\/$/, "") + path`, and raw
 * `` `${siteURL}${path}` `` where `siteURL` already ended in a slash. The last
 * one emitted `https://texashomeintelligence.com//start/` into the sitewide
 * JSON-LD. These helpers are the only sanctioned way to do it.
 */

/** Origin with no trailing slash: "https://texashomeintelligence.com". */
export function origin(site: URL | undefined): string {
  return (site?.toString() ?? "").replace(/\/+$/, "");
}

/** Absolute URL for a site-root-relative path. Trailing slash preserved as
 * given, so callers stay in charge of the site's trailing-slash policy. */
export function absolute(path: string, site: URL | undefined): string {
  return `${origin(site)}/${path.replace(/^\/+/, "")}`;
}

/** The stable @id every schema node points at for the publishing entity. */
export function organizationId(site: URL | undefined): string {
  return `${origin(site)}/#organization`;
}

/** The stable @id for the site itself. */
export function websiteId(site: URL | undefined): string {
  return `${origin(site)}/#website`;
}
