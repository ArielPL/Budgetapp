// ── The one source of truth for a Custom block's chart settings ────────────
// UI (the config panel), the localStorage loader and the backup validator all
// read the allowed values from here. They used to disagree: the panel offered a
// fixed list, the loader did `{ ...defaultChart(), ...storedChart }` — which
// PRESERVES unknown values rather than normalizing them, despite a comment
// claiming otherwise — and the backup check only asserted "is an object with an
// optional string name". A backup holding
// `{"show":"ja","type":"felaktig","size":"XXL","position":"mitt-i"}` imported as
// a success and then rendered a chart that contradicted its own setting.
//
// Deliberately free of React so backup.ts and its node-side tests can use it.

// Listed in the order the config panel offers them, so the picker can render
// this array directly instead of keeping a second copy that could drift.
export const EXPENSE_CHART_STYLES = [
  'donut', 'pie', 'bars', 'list', 'stacked', 'treemap', 'radial',
] as const;
export type ExpenseChartStyle = typeof EXPENSE_CHART_STYLES[number];

export const CHART_SIZES = ['S', 'M', 'L'] as const;
export type ChartSize = typeof CHART_SIZES[number];

export const CHART_POSITIONS = ['top', 'bottom', 'left', 'right', 'between'] as const;
export type ChartPosition = typeof CHART_POSITIONS[number];

export interface BlockChart {
  show: boolean;
  type: ExpenseChartStyle;
  size: ChartSize;
  position: ChartPosition;
}

/** 'trend' was offered in the picker but BOTH render paths remapped it to bars,
 *  so the user picked a name and got a different chart. The option is gone, but
 *  structures saved while it existed are still on real devices — it is accepted
 *  on read and normalized to what it always actually drew. */
export const LEGACY_CHART_STYLE = 'trend';

export function defaultChart(): BlockChart {
  return { show: false, type: 'donut', size: 'M', position: 'bottom' };
}

export function isExpenseChartStyle(v: unknown): v is ExpenseChartStyle {
  return typeof v === 'string' && (EXPENSE_CHART_STYLES as readonly string[]).includes(v);
}
export function isChartSize(v: unknown): v is ChartSize {
  return typeof v === 'string' && (CHART_SIZES as readonly string[]).includes(v);
}
export function isChartPosition(v: unknown): v is ChartPosition {
  return typeof v === 'string' && (CHART_POSITIONS as readonly string[]).includes(v);
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * DEFENSIVE — for reading localStorage, which may hold anything a past build or
 * a hand-edit left behind. Never throws and never rejects: every unusable field
 * falls back to its default so the layout still renders. Legacy 'trend' becomes
 * 'bars' (what it always drew); any other unknown type becomes the default.
 *
 * This does NOT write back — the normalized value only reaches storage once the
 * user actually edits the structure, per the app's existing save pattern.
 */
export function normalizeBlockChart(v: unknown): BlockChart {
  const d = defaultChart();
  if (!isPlainObject(v)) return d;
  const rawType = v.type;
  return {
    show: typeof v.show === 'boolean' ? v.show : d.show,
    type: rawType === LEGACY_CHART_STYLE ? 'bars'
      : isExpenseChartStyle(rawType) ? rawType
      : d.type,
    size: isChartSize(v.size) ? v.size : d.size,
    position: isChartPosition(v.position) ? v.position : d.position,
  };
}

/**
 * STRICT — for backup import, where the file is new data we are about to write
 * over what the user already has. A field that is ABSENT is fine (older backups
 * predate it and get a default); a field that is PRESENT but unrepresentable in
 * the UI is a reject, because importing it would produce a settings panel with
 * nothing selected and a chart that disagrees with storage.
 */
export function isValidBlockChart(v: unknown): boolean {
  if (v === undefined || v === null) return true; // older format: no chart block
  if (!isPlainObject(v)) return false;
  if (v.show !== undefined && typeof v.show !== 'boolean') return false;
  if (v.type !== undefined && !isExpenseChartStyle(v.type) && v.type !== LEGACY_CHART_STYLE) return false;
  if (v.size !== undefined && !isChartSize(v.size)) return false;
  if (v.position !== undefined && !isChartPosition(v.position)) return false;
  return true;
}
