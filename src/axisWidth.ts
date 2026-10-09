// ── axisWidth — room for a chart axis's longest label ──────────────────────
//
// The Year chart gave both value axes a fixed 38 px, sized for "40k". At the
// money ceiling the labels read "750md" in Swedish and "750 mil M" in Spanish,
// and the axis cut them to "50md" (full sweep 2026-10-08). The width now
// follows the labels the axis will actually print.
//
// Recharts picks about five "nice" ticks from 0 to just past the largest
// value; the same steps are worked out here, each formatted the way the chart
// formats it, and the longest decides. Pure, so it is tested without a chart.

import { formatAxisTick, type Lang } from './i18n';

/** Narrowest axis: what every ordinary budget has always had. */
export const MIN_AXIS_WIDTH = 38;
/** An 11 px label: a generous average glyph width, plus the gap to the plot. */
const PX_PER_CHAR = 7;
const PADDING = 8;

/** A tick label on one line: the chart breaks a label at its spaces, so
 *  "750 mil M" stood on two lines. A no-break space keeps it whole. */
export function axisLabel(value: number, lang: Lang): string {
  return formatAxisTick(value, lang).replace(/ /g, '\u00a0');
}

/** A step of 1, 2, 2.5 or 5 times a power of ten — the kind an axis uses. */
function niceStep(raw: number): number {
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / power;
  const nice = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10;
  return nice * power;
}

/** The tick labels a 0-based axis up to `max` prints. */
export function axisTickLabels(max: number, lang: Lang, ticks = 5): string[] {
  if (!(max > 0) || !Number.isFinite(max)) return [axisLabel(0, lang)];
  const step = niceStep(max / (ticks - 1));
  const top = Math.ceil(max / step) * step;
  const out: string[] = [];
  for (let v = 0; v <= top + step / 2; v += step) out.push(axisLabel(v, lang));
  return out;
}

/** Width in px for an axis showing `values` (null = no value). */
export function axisWidth(values: Array<number | null>, lang: Lang): number {
  let max = 0;
  for (const v of values) if (v !== null && Number.isFinite(v)) max = Math.max(max, Math.abs(v));
  const longest = Math.max(...axisTickLabels(max, lang).map(l => l.length));
  return Math.max(MIN_AXIS_WIDTH, Math.ceil(longest * PX_PER_CHAR + PADDING));
}
