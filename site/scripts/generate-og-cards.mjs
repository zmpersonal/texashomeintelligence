/**
 * Generates the per-article social card from the article's own frontmatter.
 *
 * WHY A SCRIPT AND NOT A ROUTE
 * The repo's stated convention for generated images: produce them here, commit the output,
 * keep the build free of an image-processing step (`generate-icons.mjs`, and the drought map
 * into public/images/drought/). A `/og.png` endpoint would put rendering on the serving path
 * instead, which COST.md rules out. So: same convention, one more generator.
 *
 * WHY CHROMIUM
 * The brand faces are self-hosted woff2. An SVG rasteriser reaches them through fontconfig and
 * silently substitutes when it can't — a card set in the wrong typeface looks fine in a build
 * log and wrong to every reader. Chromium loads the real files, and this script REFUSES to
 * screenshot until it has confirmed each face actually loaded. The browser resolution is
 * `scripts/replays/browser.mjs`, the same one the render replays use, so there is exactly one
 * place that knows where Chromium lives.
 *
 * WHERE THE NUMBERS COME FROM
 * The article's `card:` frontmatter, which traces to the claim ledger that verified the
 * article. NOTHING HERE COMPUTES A FIGURE. A percentage re-derived at render time would be a
 * second implementation of the article's own arithmetic, and the first time the two disagreed
 * the card would contradict the page it links to.
 *
 * FAIL CLOSED
 * Every failure exits non-zero having written nothing. A missing field, a font that did not
 * load, content that overflows the card: no PNG, no sidecar, no half-written file. The site
 * then has no sidecar for that article and falls back to the sitewide card — which is exactly
 * today's behaviour, so the worst case of this whole feature is the status quo.
 *
 * Run: npm run og-cards
 * Outputs (both committed):
 *   public/images/og/<slug>.png        the card, 1200x630
 *   src/data/og-cards/<slug>.json      what was rendered, for the page and for verification
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { launchChromium } from "./replays/browser.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(here, "..");
const ARTICLES = path.join(SITE, "src", "data", "analysis");
const FONTS = path.join(SITE, "public", "fonts");
const PNG_DIR = path.join(SITE, "public", "images", "og");
const SIDECAR_DIR = path.join(SITE, "src", "data", "og-cards");

const WIDTH = 1200;
const HEIGHT = 630;

/**
 * Brand kit §5–6, "dark intelligence surface". The hex values are duplicated from the token
 * layer on purpose: this template renders in a browser that never loads the site's CSS, so it
 * cannot read a custom property. Keep them in step with src/styles/ by hand.
 */
const C = {
  bg: "#081A31",          // Depth Navy — the kit's share-card background
  text: "#E8EDF4",        // primary on dark
  muted: "#9FB0C4",       // secondary on dark
  amber: "#C4772E",       // Caliche Amber — a shape, never text on navy (§5 accessibility)
  hairline: "rgba(255,255,255,0.10)",
};

/**
 * THE HERO NUMERAL IS SET IN PLEX SANS, NOT PLEX MONO.
 *
 * The kit puts numerals in mono, and on a dashboard that is right: fixed advances make columns
 * align and readings comparable. A card has no column. It has one number, seen once, often at
 * thumbnail size, and mono's fixed advance gives the decimal point a full character cell — so
 * "13.88" renders visibly gapped at display size. Instrument grammar loses to legibility on
 * the one element the card exists to deliver. Owner's call, 2026-09-11; recorded with the
 * reasoning in autoposter/specs/OG-CARD-PROPOSAL.md.
 *
 * Sans over the display serif for the figure: the question above it is already Newsreader, and
 * setting both in the serif flattens the hierarchy the card depends on. Plex Sans 600 is the
 * kit's own weight for engineered headings, and `tnum` keeps the figures tabular.
 */
const HERO_WEIGHT = 600;

/** Every face the template uses, and the exact string used to verify it loaded. */
const FACES = [
  { family: "Newsreader", weight: 500, file: "newsreader-500.woff2" },
  { family: "IBM Plex Sans", weight: 600, file: "ibm-plex-sans-600.woff2" },
  { family: "IBM Plex Sans", weight: 400, file: "ibm-plex-sans-400.woff2" },
  // Mono survives for the source stamp only — a small dated label is exactly what it is for.
  { family: "IBM Plex Mono", weight: 400, file: "ibm-plex-mono-400.woff2" },
];

const REQUIRED = ["question", "headline", "subhead", "source", "asOf"];

/** Short source labels allowed on the card face. The full name goes in the alt text. */
const SOURCE_FULL = {
  EIA: "U.S. Energy Information Administration",
  NOAA: "NOAA National Centers for Environmental Information",
};

function die(message) {
  console.error(`[x] ${message}`);
  process.exit(1);
}

function dataUri(file, mime) {
  if (!fs.existsSync(file)) die(`missing asset: ${file}`);
  return `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
}

/** Frontmatter only. The body is irrelevant to the card and parsing it would invite drift. */
function frontmatter(markdown) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
  return match ? parseYaml(match[1]) : null;
}

function html(card, fonts) {
  const faceRules = FACES.map(
    (f, i) => `@font-face{font-family:"${f.family}";font-weight:${f.weight};font-display:block;
      src:url("${fonts[i]}") format("woff2");}`,
  ).join("\n");

  // The layout: a wordmark, then the question, then the figure given all the room that is
  // left. The mark itself is deliberately absent — at the size it would occupy here it reads
  // as a dark smudge in a feed, and the source line already carries attribution (on record in
  // autoposter/specs/OG-CARD-PROPOSAL.md).
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${faceRules}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden}
body{background:${C.bg};color:${C.text};display:flex;flex-direction:column;
  padding:56px 64px;-webkit-font-smoothing:antialiased}
.lockup{font-family:"IBM Plex Sans";font-weight:600;font-size:24px;letter-spacing:.005em}
.lockup .accent{color:${C.amber}}
.question{font-family:"Newsreader";font-weight:500;font-size:52px;line-height:1.08;
  margin-top:36px;max-width:17ch;letter-spacing:-.005em}
.figure{margin-top:auto}
.hero{font-family:"IBM Plex Sans";font-weight:${HERO_WEIGHT};font-size:150px;line-height:1;
  font-feature-settings:"tnum" 1;letter-spacing:-.03em}
.rule{width:88px;height:5px;background:${C.amber};margin:26px 0 20px}
.sub{font-family:"IBM Plex Sans";font-weight:400;font-size:32px;line-height:1.25;
  font-feature-settings:"tnum" 1}
.source{margin-top:30px;padding-top:20px;border-top:1px solid ${C.hairline};
  font-family:"IBM Plex Mono";font-weight:400;font-size:22px;color:${C.muted};
  letter-spacing:.01em}
</style></head><body>
  <div class="lockup">Texas Home<span class="accent">Intelligence</span></div>
  <h1 class="question">${escapeHtml(card.question)}</h1>
  <div class="figure">
    <div class="hero">${escapeHtml(card.headline)}</div>
    <div class="rule"></div>
    <div class="sub">${escapeHtml(card.subhead)}</div>
    <div class="source">${escapeHtml(card.source)} &middot; ${escapeHtml(card.asOf)}</div>
  </div>
</body></html>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

async function main() {
  if (!fs.existsSync(ARTICLES)) die(`no article collection at ${ARTICLES}`);

  const articles = fs
    .readdirSync(ARTICLES)
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({ slug: f.replace(/\.md$/, ""), data: frontmatter(fs.readFileSync(path.join(ARTICLES, f), "utf8")) }))
    .filter((a) => a.data?.card);

  if (articles.length === 0) {
    console.log("[ ] no article declares a `card:` block — nothing to render");
    return;
  }

  for (const { slug, data } of articles) {
    const missing = REQUIRED.filter((k) => !String(data.card[k] ?? "").trim());
    if (missing.length) die(`${slug}: card is missing ${missing.join(", ")} — refusing to render a partial card`);
    if (!SOURCE_FULL[data.card.source]) {
      die(`${slug}: card source "${data.card.source}" has no full name in SOURCE_FULL — ` +
          `an abbreviation on the card must resolve to the source the article declares`);
    }
  }

  const fonts = FACES.map((f) => dataUri(path.join(FONTS, f.file), "font/woff2"));

  const browser = await launchChromium();
  try {
    for (const { slug, data } of articles) {
      const card = data.card;
      const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
      await page.setContent(html(card, fonts), { waitUntil: "load" });

      // The check that makes this worth doing at all. A face that failed to decode leaves the
      // text set in a fallback — a silently wrong card that renders, uploads and posts fine.
      const fontReport = await page.evaluate(async (faces) => {
        // A face that cannot decode makes document.fonts.load() REJECT. Swallowing the
        // rejection here is not leniency — it is what lets the checks below report WHICH face
        // failed. Left unhandled it surfaces as a bare "NetworkError" stack, which is still
        // fail-closed but tells whoever is on the other end nothing about what to fix.
        await Promise.all(
          faces.map((f) => document.fonts.load(`${f.weight} 100px "${f.family}"`).catch(() => null)),
        );
        await document.fonts.ready.catch(() => null);
        const loaded = [...document.fonts].map((f) => ({ family: f.family, status: f.status }));
        return {
          loaded,
          failures: faces
            .filter((f) => !document.fonts.check(`${f.weight} 100px "${f.family}"`))
            .map((f) => `${f.family} ${f.weight}`),
          overflowX: document.body.scrollWidth > window.innerWidth,
          overflowY: document.body.scrollHeight > window.innerHeight,
        };
      }, FACES);

      if (fontReport.failures.length) {
        die(`${slug}: these faces did not load — ${fontReport.failures.join(", ")}. ` +
            `Refusing to screenshot a card set in a fallback typeface. ` +
            `(font status: ${JSON.stringify(fontReport.loaded)})`);
      }
      if (fontReport.loaded.some((f) => f.status !== "loaded")) {
        die(`${slug}: a font face reported status != loaded — ${JSON.stringify(fontReport.loaded)}`);
      }
      if (fontReport.overflowX || fontReport.overflowY) {
        die(`${slug}: content overflows the ${WIDTH}x${HEIGHT} card — shorten the question or the ` +
            `figure rather than letting it crop`);
      }

      // Rendered to a buffer FIRST. Nothing touches the filesystem until every check above has
      // passed and the bytes exist, so a crash cannot leave a partial card behind.
      const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
      await page.close();

      const sidecar = {
        path: `/images/og/${slug}.png`,
        width: WIDTH,
        height: HEIGHT,
        // Full source name, not the card's short label: the alt text serves crawlers and
        // screen readers, where there is room to be precise and every reason to be.
        alt: `${card.question} ${card.headline}, ${card.subhead}. Source: ${SOURCE_FULL[card.source]}, ${card.asOf}.`,
        rendered: { ...card },
        generator: "scripts/generate-og-cards.mjs",
      };

      fs.mkdirSync(PNG_DIR, { recursive: true });
      fs.mkdirSync(SIDECAR_DIR, { recursive: true });
      fs.writeFileSync(path.join(PNG_DIR, `${slug}.png`), png);
      fs.writeFileSync(path.join(SIDECAR_DIR, `${slug}.json`), JSON.stringify(sidecar, null, 2) + "\n");
      console.log(`[ok] ${slug}.png  ${(png.length / 1024).toFixed(1)} KB`);
    }
  } finally {
    await browser.close();
  }
}

await main();
