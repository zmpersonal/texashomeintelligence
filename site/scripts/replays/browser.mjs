/**
 * Round 9b — one place that decides which Chromium the render replays drive,
 * and one place that explains it when there isn't one.
 *
 * `playwright` is a pinned devDependency (Round 9b), but the BROWSER BINARY is
 * not: npm installs the driver, `npx playwright install chromium` installs the
 * browser, and nothing in `npm ci` does the second step. A missing browser used
 * to surface as playwright's own "Executable doesn't exist" wall of text; this
 * says the one command that fixes it.
 *
 * Resolution order:
 *   1. $THI_CHROMIUM_PATH        — explicit override, honoured verbatim.
 *   2. /opt/pw-browsers/chromium — the sandbox image ships Chromium here and it
 *      is a revision (1194) OLDER than the one playwright 1.62.1 asks for
 *      (1234), so playwright's own lookup would miss it. Passing the path
 *      directly is the documented way to use it.
 *   3. playwright's own resolution — what a clean checkout gets after
 *      `npx playwright install chromium`.
 */
import fs from 'node:fs';
import { chromium } from 'playwright';

const SANDBOX = '/opt/pw-browsers/chromium';

export function chromiumPath() {
  if (process.env.THI_CHROMIUM_PATH) return process.env.THI_CHROMIUM_PATH;
  if (fs.existsSync(SANDBOX)) return SANDBOX;
  return undefined; // let playwright find its own
}

export async function launchChromium(opts = {}) {
  const executablePath = chromiumPath();
  try {
    return await chromium.launch(executablePath ? { ...opts, executablePath } : opts);
  } catch (err) {
    const where = executablePath ?? "playwright's own browser directory";
    console.error(`
[x] could not start Chromium (looked in ${where})

    The render replays need a browser binary. 'npm ci' installs the playwright
    driver but NOT the browser. Run:

        npx playwright install chromium

    Or point at one you already have:

        THI_CHROMIUM_PATH=/path/to/chrome npx tsx scripts/replays/<replay>

    playwright said: ${err && err.message ? err.message.split('\n')[0] : err}
`);
    process.exit(2);
  }
}
