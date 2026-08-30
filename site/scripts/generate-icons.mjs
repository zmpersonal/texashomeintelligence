/**
 * Generates the favicon / app-icon set from the brand mark.
 *
 * Single source: `public/images/logo.png`. The mark is still not final
 * (BRAND.md), so nothing here hardcodes its shape, size or colours — swapping
 * that one file and re-running `npm run icons` regenerates the whole set.
 * Run it whenever the mark changes; the outputs are committed so the build
 * itself stays free of an image-processing step.
 *
 * NOTE: `sharp` is resolved transitively (astro depends on it for image
 * optimisation), not declared here. That is deliberate — adding a dependency is
 * ask-first per SECURITY.md — but it means this script, and only this script,
 * would break if Astro ever dropped it. The committed icons are unaffected;
 * only regeneration would need `npm i -D sharp` at that point.
 *
 * Outputs (all into public/, which Astro copies verbatim):
 *   favicon.ico            16 + 32 + 48, PNG-in-ICO
 *   favicon-16x16.png      classic tab icon
 *   favicon-32x32.png      retina tab / bookmark
 *   apple-touch-icon.png   180, opaque — iOS composites transparency onto black
 *   icon-192.png           PWA "any"
 *   icon-512-maskable.png  PWA "maskable": art inside the centre 80% safe zone
 *   site.webmanifest       so the maskable icon is actually used
 */
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, "..", "public");

/**
 * Icons are generated from the highest-resolution mark available.
 *
 * `src/assets/brand/logo-source.png` is the original artwork, trimmed of its
 * border the same way the header asset is and stored at 640px — ample, since
 * the largest output is a 512px icon whose art sits at 80% of that. It lives
 * outside public/ deliberately: Astro copies public/ verbatim, so keeping a
 * 1 MB source there would ship it to every visitor for nothing. Only the
 * generated icons below are served.
 *
 * The header mark (public/images/logo.png, 98px) is the fallback. It works,
 * but a 512px maskable upscaled from 98px is visibly soft, which is the whole
 * reason the high-resolution source is preferred. Either file can be swapped;
 * re-run `npm run icons` after.
 */
const HI_RES = path.join(here, "..", "src", "assets", "brand", "logo-source.png");
const HEADER_MARK = path.join(PUBLIC, "images", "logo.png");
const SOURCE = fs.existsSync(HI_RES) ? HI_RES : HEADER_MARK;

/**
 * The mark's own background, sampled from its top-left pixel rather than
 * assumed, so a future mark on a different ground still produces icons whose
 * padding matches the artwork instead of a hardcoded white.
 */
async function backgroundColour() {
  const { data } = await sharp(SOURCE).raw().toBuffer({ resolveWithObject: true });
  return { r: data[0], g: data[1], b: data[2], alpha: 1 };
}

/** Square icon: contain the mark, pad with its own background. */
async function square(size, inset = 1) {
  const background = await backgroundColour();
  const art = Math.round(size * inset);
  const mark = await sharp(SOURCE)
    .resize(art, art, { fit: "contain", background })
    .toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background },
  })
    .composite([{ input: mark, gravity: "center" }])
    // Palette PNG: the mark is flat brand colour, so this is visually
    // identical and several times smaller than truecolour at these sizes.
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();
}

/**
 * Minimal ICO container. Each entry points at a complete PNG — the format has
 * allowed PNG payloads since Vista, and every browser we care about reads them,
 * which avoids hand-rolling BMP encoding for three sizes.
 */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = [];
  for (const { size, data } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // width  (0 means 256)
    e.writeUInt8(size >= 256 ? 0 : size, 1); // height
    e.writeUInt8(0, 2); // palette size — 0 for truecolour
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

const MANIFEST = {
  name: "Texas Home Intelligence",
  short_name: "THI",
  description:
    "Weekly conditions for Texas homes — hail, drought and heat, from public records.",
  start_url: "/",
  display: "standalone",
  background_color: "#ffffff",
  theme_color: "#0C2340",
  icons: [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

const write = (name, buf) => {
  fs.writeFileSync(path.join(PUBLIC, name), buf);
  console.log(`  ${name.padEnd(24)} ${String(buf.length).padStart(7)} B`);
};

if (!fs.existsSync(SOURCE)) {
  throw new Error(`No brand mark at ${HI_RES} or ${HEADER_MARK} — icons are generated from one of them.`);
}

const meta = await sharp(SOURCE).metadata();
console.log(
  `generating icons from ${path.relative(path.join(here, ".."), SOURCE)} (${meta.width}x${meta.height})` +
    (SOURCE === HEADER_MARK ? " — fallback; large icons will be upscaled" : ""),
);

const [i16, i32, i48, i180, i192] = await Promise.all(
  [16, 32, 48, 180, 192].map((s) => square(s)),
);
// Maskable: platforms crop to a circle/squircle, so the art must sit inside the
// centre 80% or its edges get shaved off.
const i512 = await square(512, 0.8);

write("favicon.ico", ico([
  { size: 16, data: i16 },
  { size: 32, data: i32 },
  { size: 48, data: i48 },
]));
write("favicon-16x16.png", i16);
write("favicon-32x32.png", i32);
write("apple-touch-icon.png", i180);
write("icon-192.png", i192);
write("icon-512-maskable.png", i512);
write("site.webmanifest", Buffer.from(JSON.stringify(MANIFEST, null, 2)));
