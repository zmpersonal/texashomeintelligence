/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** GA4 measurement ID (e.g. "G-XXXXXXX"). Unset locally — analytics
   * only renders once this is set as a real Cloudflare Pages build env
   * var. See HANDOFF.md "Analytics". */
  readonly PUBLIC_GA4_MEASUREMENT_ID?: string;
  /** Cloudflare Web Analytics beacon token. Same gating as above. */
  readonly PUBLIC_CF_BEACON_TOKEN?: string;
}
