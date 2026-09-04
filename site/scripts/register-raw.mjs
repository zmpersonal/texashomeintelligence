/**
 * Registers `raw-hooks.mjs` so a plain Node/tsx run can import a module that
 * uses Vite's `?raw` suffix. Used by the citation check only — see the header
 * of `raw-hooks.mjs` for the regression this repairs.
 *
 *   npx tsx --import ./scripts/register-raw.mjs scripts/check-citations.ts
 */
import { register } from "node:module";
register("./raw-hooks.mjs", import.meta.url);
