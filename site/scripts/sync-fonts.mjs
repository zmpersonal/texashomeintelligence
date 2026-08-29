/**
 * Copies the brand webfonts from the @fontsource devDependencies into
 * `public/fonts/`, which is what the deployed site actually serves.
 *
 * The files are committed rather than copied at build time on purpose: a build
 * must not depend on node_modules layout to produce the fonts, and a reviewer
 * should be able to see exactly which faces ship. Run this only when the
 * weight budget in `src/styles/thi/tokens/fonts.css` changes — and keep the two
 * in step, because a face declared there with no file here fails silently back
 * to a system font, which is the failure this whole change exists to fix.
 */
import { copyFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "..", "public", "fonts");

/** family package → weights. Latin subset, normal style only. */
const FACES = [
  ["newsreader", [500]],
  ["ibm-plex-sans", [400, 600, 700]],
  ["ibm-plex-mono", [400, 700]],
];

mkdirSync(out, { recursive: true });
let total = 0;
for (const [family, weights] of FACES) {
  for (const weight of weights) {
    const src = path.join(
      here, "..", "node_modules", "@fontsource", family, "files",
      `${family}-latin-${weight}-normal.woff2`,
    );
    if (!existsSync(src)) {
      console.error(`missing ${src} — run: npm install`);
      process.exit(1);
    }
    const dest = path.join(out, `${family}-${weight}.woff2`);
    copyFileSync(src, dest);
    const kb = statSync(dest).size / 1024;
    total += kb;
    console.log(`  ${family}-${weight}.woff2  ${kb.toFixed(1)} KB`);
  }
}
console.log(`${FACES.reduce((n, [, w]) => n + w.length, 0)} faces, ${total.toFixed(1)} KB total`);
