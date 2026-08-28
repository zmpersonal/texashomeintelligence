/**
 * Deterministic sparkline geometry, computed at build time.
 *
 * A sparkline is the right form here: one series, change-over-time, read as a
 * shape rather than as values. It carries no axes or gridlines by design — the
 * exact numbers live in the table on the data page it links to, which is also
 * where the accessible table view lives.
 *
 * No charting dependency: this returns a path string the caller renders as
 * inline SVG, so nothing ships to the browser.
 */

export interface Sparkline {
  /** `d` for the line path. */
  line: string;
  /** `d` for the filled area beneath it. */
  area: string;
  /** Endpoint, for the terminal dot. */
  last: { x: number; y: number };
  width: number;
  height: number;
}

export function sparkline(
  values: number[],
  { width = 260, height = 48, padding = 4 }: { width?: number; height?: number; padding?: number } = {},
): Sparkline | undefined {
  if (values.length < 2) return undefined;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const innerH = height - padding * 2;

  const points = values.map((v, i) => ({
    x: (i / (values.length - 1)) * width,
    // Higher value sits higher on screen.
    y: padding + innerH - ((v - min) / span) * innerH,
  }));

  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${width} ${height} L0 ${height} Z`;

  return { line, area, last: points[points.length - 1], width, height };
}
