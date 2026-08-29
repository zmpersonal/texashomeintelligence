/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** GA4 measurement ID (e.g. "G-XXXXXXX"). Unset locally — analytics
   * only renders once this is set as a real Cloudflare Pages build env
   * var. See HANDOFF.md "Analytics". */
  readonly PUBLIC_GA4_MEASUREMENT_ID?: string;
  /** Cloudflare Web Analytics beacon token. Same gating as above. */
  readonly PUBLIC_CF_BEACON_TOKEN?: string;
  /* Server-side only, and deliberately NOT PUBLIC_-prefixed so Vite cannot
   * expose them to the browser:
   *   RESEND_API_KEY — set with `wrangler secret put RESEND_API_KEY`. Never in
   *     the repo, never in wrangler.jsonc. Absent, the stub transport runs and
   *     says so.
   *   EMAIL_FROM — optional override for the From address; defaults to
   *     accounts@texashomeintelligence.com. Must be a THI domain with SPF and
   *     DKIM verified in Resend.
   * Both are read via `cloudflare:workers` env in src/lib/email/transport.ts. */
}

interface Window {
  /** Analytics event shim installed by Base.astro. Forwards to GA4 when a
   * measurement id is configured and is a no-op otherwise, so no page has to
   * branch on whether analytics exists. Never carries personal data. */
  __thiTrack?: (name: string, params?: Record<string, unknown>) => void;
}
