import { useState, useEffect, useRef, useCallback, useMemo, useId, type CSSProperties } from 'react';
import { safeSetItem } from '../storageWrite';
import { useLang, MONTHS } from '../i18n';
import { ExpenseChart } from './Charts';
import { useModalFocus } from '../useModalFocus';
import { parseMoneyOrZero, coerceStoredMoney } from '../money';
import {
  EXPENSE_CHART_STYLES, defaultChart, normalizeBlockChart,
  type ExpenseChartStyle, type BlockChart, type ChartSize, type ChartPosition,
} from '../blockChart';
import { customValuesKey, customSnapshotKey, snapshotToWrite, loadSnapshot, migrateLegacySnapshots, monthsHoldingRows } from '../customYear';
import { CustomYear } from './CustomYear';
import { appStorage } from '../storage';

// ── Schema ──────────────────────────────────────────────────────────
// Custom v3 is a generic, build-from-scratch block budget with its OWN data,
// fully separate from the shared Classic/Combined budget.
//  • Structure (cross-month): block list + config + row NAMES → budget_custom_v3
//  • Amounts (per month): rowId → amount → budget_custom_v3_values_${y}_${m}

export type BlockTag = 'in' | 'out' | 'save';
export type BlockWidth = 'full' | 'half' | 'third';
export type BlockKind = 'block' | 'summary' | 'note';

// Chart shape + allowed values now live in blockChart.ts so the loader and the
// backup validator can share them. Re-exported for existing importers.
export type { BlockChart, ChartSize, ChartPosition };

// ── Language-safe default names (stress test §9) ──
// Quick-start used to bake the CURRENT language's strings ("Inkomster", "Ny
// rad") into the stored structure, so switching language left Swedish block
// names inside a Spanish app. Built-in names are now stored as a KEY and
// resolved through t at render time; only names the user typed are literal.
// One list, from which BOTH the type and the runtime guard are derived. They
// used to be written out twice; adding a name in one place and forgetting the
// other would have compiled fine and then silently refused to migrate.
const DEFAULT_NAME_KEYS = [
  'summaryIncome', 'summaryExpenses', 'summarySaved', 'summaryBlock',
  'newBlockName', 'newRowName', 'newNoteName',
  // Ready-made blocks offered in the add-picker.
  'tplHousing', 'tplRent', 'tplUtilities',
  'tplFood', 'tplGroceries',
  'tplTransport', 'tplCommute',
  'tplSavings', 'tplBuffer',
] as const;

export type CustomDefaultNameKey = typeof DEFAULT_NAME_KEYS[number];

/** Every language's spelling of every default name → its key. Used to migrate
 *  structures saved before nameKey existed. Only EXACT matches migrate —
 *  anything else is assumed to be the user's own name and is never touched. */
const DEFAULT_NAME_TO_KEY = new Map<string, CustomDefaultNameKey>([
  ['Inkomster', 'summaryIncome'], ['Income', 'summaryIncome'], ['Ingresos', 'summaryIncome'],
  ['Utgifter', 'summaryExpenses'], ['Expenses', 'summaryExpenses'], ['Gastos', 'summaryExpenses'],
  ['Sparat', 'summarySaved'], ['Saved', 'summarySaved'], ['Ahorrado', 'summarySaved'],
  ['Sammanfattning', 'summaryBlock'], ['Summary', 'summaryBlock'], ['Resumen', 'summaryBlock'],
  ['Nytt block', 'newBlockName'], ['New block', 'newBlockName'], ['Bloque nuevo', 'newBlockName'],
  ['Ny rad', 'newRowName'], ['New row', 'newRowName'], ['Fila nueva', 'newRowName'],
  ['Anteckning', 'newNoteName'], ['Note', 'newNoteName'], ['Nota', 'newNoteName'],
]);

function isDefaultNameKey(v: unknown): v is CustomDefaultNameKey {
  return typeof v === 'string' && (DEFAULT_NAME_KEYS as readonly string[]).includes(v);
}

/** A ready-made block offered in the add-picker. */
export interface BlockTemplate {
  key: CustomDefaultNameKey;
  tag: BlockTag;
  emoji: string;
  rows: CustomDefaultNameKey[];
}

export const BLOCK_TEMPLATES: BlockTemplate[] = [
  { key: 'tplHousing', tag: 'out', emoji: '🏠', rows: ['tplRent', 'tplUtilities'] },
  { key: 'tplFood', tag: 'out', emoji: '🛒', rows: ['tplGroceries'] },
  { key: 'tplTransport', tag: 'out', emoji: '🚌', rows: ['tplCommute'] },
  { key: 'tplSavings', tag: 'save', emoji: '🏦', rows: ['tplBuffer'] },
];

/** Exact-match migration for pre-nameKey data; undefined = user's own name. */
export function inferDefaultNameKey(name: string): CustomDefaultNameKey | undefined {
  return DEFAULT_NAME_TO_KEY.get(name);
}

interface NamedEntity { name: string; nameKey?: CustomDefaultNameKey; userNamed?: boolean; }

/** The name to SHOW (and to use in every aria-label): the current language's
 *  string for un-renamed defaults, the user's exact text otherwise. */
export function resolveDisplayName(x: NamedEntity, t: Record<CustomDefaultNameKey, string>): string {
  return x.userNamed !== true && x.nameKey ? t[x.nameKey] : x.name;
}

export interface BlockRow {
  id: string;
  name: string;
  color: string;
  /** Set for built-in names; display resolves through t until userNamed. */
  nameKey?: CustomDefaultNameKey;
  /** true the moment the user renames — their text is then never translated. */
  userNamed?: boolean;
}

// Distinct per-category palette — each row defaults to the next colour so a
// block's chart wedges/bars (and legend dots) aren't all one hue.
const ROW_COLORS = ['#8b5cf6', '#22c55e', '#f59e0b', '#22d3ee', '#ec4899', '#ef4444', '#14b8a6', '#a78bfa', '#fb923c', '#38bdf8'];
function paletteColor(i: number): string { return ROW_COLORS[i % ROW_COLORS.length]; }

export interface CustomBlock {
  id: string;
  kind: BlockKind;
  name: string;
  tag: BlockTag;            // ignored for summary / note
  width: BlockWidth;
  bg: string | null;        // preset tint key (bg-*) OR custom hex (#rrggbb)
  chart: BlockChart;
  rows: BlockRow[];         // empty for summary / note
  icon?: string;            // optional display emoji (title/tile); undefined → kind emoji
  target?: number;          // optional goal; >0 shows a progress bar (regular blocks only)
  text?: string;            // note-block body (stored cross-month in the structure)
  nameKey?: CustomDefaultNameKey; // built-in name → translated at render
  userNamed?: boolean;            // user renamed → name is literal, never translated
}

// Common emoji palette for the per-block icon picker.
const BLOCK_EMOJIS = ['🏠','🍔','🚗','🎉','💰','🏦','📈','🎯','✈️','🛒','🏥','📚','🎁','💡','☕','🐾','👶','🎮'];

const LS_STRUCT = 'budget_custom_v3';
// Key formula lives in customYear.ts so the year aggregation and this component
// can never drift apart on where a month's amounts are stored.
const valuesKey = customValuesKey;

function uid(): string {
  try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); }
  catch { /* ignore */ }
  return `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function newBlock(name: string, tag: BlockTag): CustomBlock {
  return {
    id: uid(), kind: 'block', name, tag, width: 'full', bg: null,
    chart: defaultChart(), rows: [],
  };
}

function newSummary(name: string): CustomBlock {
  return {
    id: uid(), kind: 'summary', name, tag: 'in', width: 'full', bg: null,
    chart: defaultChart(), rows: [],
  };
}

function newNote(name: string): CustomBlock {
  return {
    id: uid(), kind: 'note', name, tag: 'in', width: 'full', bg: null,
    chart: defaultChart(), rows: [], text: '',
  };
}

// Preset background tints — theme-aware CSS vars (never hardcoded for presets).
export const BG_PRESETS: { key: string; varName: string }[] = [
  { key: 'bg-brand',   varName: 'var(--accent-brand)' },
  { key: 'bg-income',  varName: 'var(--tint-income-bg)' },
  { key: 'bg-expense', varName: 'var(--tint-expense-bg)' },
  { key: 'bg-savings', varName: 'var(--tint-savings-bg)' },
  { key: 'bg-remain',  varName: 'var(--tint-remaining-bg)' },
];

// Relative luminance (sRGB, WCAG) of a #rrggbb hex → 0 (black) … 1 (white).
function hexLuminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const toLin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const r = toLin((n >> 16) & 255), g = toLin((n >> 8) & 255), b = toLin(n & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Resolve a block's background to an inline style, including an auto-contrast
// `--cv3-ink` when the background is a known/light colour. For `bg: null` we
// return nothing so the block keeps normal theme text/surface behaviour.
function bgStyle(bg: string | null): CSSProperties | undefined {
  if (!bg) return undefined;

  if (bg.startsWith('#')) {
    const lum = hexLuminance(bg);
    // Light bg → dark ink; dark bg → light ink. Threshold ~0.55 reads well.
    const ink = lum !== null && lum > 0.55 ? '#1a1a22' : '#ffffff';
    return { background: bg, borderColor: 'transparent', ['--cv3-ink' as string]: ink };
  }

  const preset = BG_PRESETS.find(p => p.key === bg);
  if (!preset) return undefined;
  // The tint-* presets are theme-paired soft surfaces (light tint + dark theme
  // text in light mode, dark tint + light text in dark mode), so they already
  // contrast correctly with the theme `--text` — no ink override needed. Brand
  // is a soft wash over the surface, likewise fine on theme text.
  const bgVal = bg === 'bg-brand'
    ? `color-mix(in srgb, ${preset.varName} 12%, var(--surface))`
    : preset.varName;
  return { background: bgVal };
}

function chartHeightPx(size: ChartSize): number {
  return size === 'S' ? 140 : size === 'L' ? 280 : 200;
}

// ── Persistence ─────────────────────────────────────────────────────
export function loadStructure(): CustomBlock[] | null {
  try {
    const raw = appStorage.getItem(LS_STRUCT);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.map((b: Partial<CustomBlock>): CustomBlock => {
      const name = typeof b.name === 'string' ? b.name : 'Block';
      // Migration for pre-nameKey data: an exact known default name gets its
      // key (so it starts translating); anything else is the user's own name
      // and keeps no key. Stored userNamed always wins over inference. The
      // stored blob itself isn't rewritten here — the save effect only runs
      // once the user actually changes something.
      const nameKey = isDefaultNameKey(b.nameKey) ? b.nameKey : inferDefaultNameKey(name);
      return {
        id: typeof b.id === 'string' && b.id ? b.id : uid(),
        kind: b.kind === 'summary' ? 'summary' : b.kind === 'note' ? 'note' : 'block',
        name,
        tag: b.tag === 'out' || b.tag === 'save' ? b.tag : 'in',
        width: b.width === 'half' || b.width === 'third' ? b.width : 'full',
        bg: typeof b.bg === 'string' ? b.bg : null,
        // Spreading the stored chart over the defaults PRESERVED junk instead of
        // normalizing it: a stored type of "felaktig" survived into the config
        // panel, leaving no option selected while the block drew something else.
        chart: normalizeBlockChart(b.chart),
        rows: Array.isArray(b.rows)
          ? b.rows.map((r, i) => {
              const rowName = typeof r?.name === 'string' ? r.name : '';
              return {
                id: r?.id ?? uid(),
                name: rowName,
                color: typeof r?.color === 'string' && r.color ? r.color : paletteColor(i),
                nameKey: isDefaultNameKey(r?.nameKey) ? r.nameKey : inferDefaultNameKey(rowName),
                userNamed: typeof r?.userNamed === 'boolean' ? r.userNamed : undefined,
              };
            })
          : [],
        icon: typeof b.icon === 'string' && b.icon ? b.icon : undefined,
        target: typeof b.target === 'number' && b.target > 0 ? b.target : undefined,
        text: typeof b.text === 'string' ? b.text : undefined,
        nameKey,
        userNamed: typeof b.userNamed === 'boolean' ? b.userNamed : undefined,
      };
    });
  } catch { return null; }
}

function loadValues(y: number, m: number): Record<string, number> {
  try {
    const raw = appStorage.getItem(valuesKey(y, m));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    // Defensive read: an older build could store `null` here (that is what
    // JSON.stringify does with Infinity/NaN), and a null amount would poison
    // every total it touched. Unusable entries read as 0; storage is left as
    // it is until the user actually edits the month.
    const out: Record<string, number> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      out[id] = coerceStoredMoney(value);
    }
    return out;
  } catch { return {}; }
}

// ── matchMedia hook: phone vs desktop is a genuinely different UI ──
function useIsPhone(): boolean {
  const [phone, setPhone] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const handler = (e: MediaQueryListEvent) => setPhone(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return phone;
}

interface Props {
  year: number;
  month: number;
  /** Called when a write to localStorage was refused, so the app can tell the
   *  user the edit is still only on screen (review 2026-09-05, F4). Must be
   *  stable — it sits in the save effect's dependencies. */
  onSaveFailed: () => void;
}

export const CustomV3 = ({ year, month, onSaveFailed }: Props) => {
  const { t, lang, money, currency } = useLang();
  const isPhone = useIsPhone();

  const [blocks, setBlocks] = useState<CustomBlock[]>(() => loadStructure() ?? []);
  const [started, setStarted] = useState<boolean>(() => loadStructure() !== null);
  const [values, setValues] = useState<Record<string, number>>(() => loadValues(year, month));

  // Budget canvas or the year overview. Deliberately NOT persisted: the month
  // selector still drives the app, and coming back to a saved "year" view would
  // hide the blocks the user came to edit.
  const [view, setView] = useState<'budget' | 'year'>('budget');
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [configFor, setConfigFor] = useState<string | null>(null);
  const [expandedFor, setExpandedFor] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);
  // Real-modal behavior for the phone tap-to-expand overlay.
  const expandRef = useRef<HTMLDivElement>(null);
  useModalFocus(expandRef, expandedFor !== null, () => setExpandedFor(null));

  // Persist structure whenever it changes (after the user has started).
  //
  // The first run is skipped on purpose. `blocks` starts out as the NORMALIZED
  // read of storage, so saving on mount would rewrite the stored structure just
  // because the page was opened — quietly turning a legacy `trend` into `bars`
  // and flattening junk fields on a device the user hadn't touched. That went
  // unnoticed while the loader preserved unknown values (the blob it wrote back
  // was identical); normalizing made it a real write. Normalization stays in
  // memory until the user actually changes something, matching the app's
  // existing "only persist real edits" pattern.
  // Identity, not a "skip the first run" flag: StrictMode double-invokes effects
  // in dev, so a one-shot flag is spent on the first invocation and the second
  // writes anyway. Every real edit goes through setBlocks and produces a NEW
  // array, so "same array we started with" is exactly "the user changed nothing".
  const loadedBlocks = useRef(blocks);
  useEffect(() => {
    if (blocks === loadedBlocks.current) return;
    if (started && !safeSetItem(appStorage, LS_STRUCT, JSON.stringify(blocks))) onSaveFailed();
  }, [blocks, started, onSaveFailed]);

  // Give months recorded before snapshots existed the structure record they
  // never got, BEFORE the user can delete or retag anything — from this mount
  // on, editing today's layout cannot change what an older month says. Runs on
  // mount only, reading the structure as it was loaded; it is idempotent, so
  // StrictMode's second invocation is a no-op rather than a second write.
  useEffect(() => {
    migrateLegacySnapshots(appStorage, loadedBlocks.current);
  }, []);

  // Guard so the save effect doesn't immediately rewrite freshly loaded values
  // into the NEW month's key on a month switch (data-bleed). Declared before the
  // load effect so it's armed before the save effect runs on the same commit.
  const skipSave = useRef(true);

  // Load this month's amounts when the month changes — arm the guard FIRST so
  // the save effect below (which also re-runs on this commit) skips this load
  // instead of writing the previous month's values into the new month's key.
  useEffect(() => {
    skipSave.current = true;
    setValues(loadValues(year, month));
  }, [year, month]);

  // Persist amounts for the active month. Don't CREATE a key for an untouched
  // (empty) month — avoids littering blank entries while navigating. An existing
  // month is still updated (so clearing its amounts persists).
  useEffect(() => {
    if (skipSave.current) { skipSave.current = false; return; }
    const key = valuesKey(year, month);
    if (Object.keys(values).length === 0 && appStorage.getItem(key) === null) return;
    // Two writes, one meaning. If the amounts land but the snapshot does not,
    // the month's money is recorded with no record of how it was filed — so the
    // failure is reported even when the first half succeeded (F4).
    let ok = safeSetItem(appStorage, key, JSON.stringify(values));
    // Record WHICH block each row belonged to when these amounts were written.
    // Without it the year view had to classify every month with today's layout,
    // so deleting a block rewrote history. Written next to the amounts, never
    // on its own — a month with no amounts has no history to protect.
    ok = safeSetItem(
      appStorage,
      customSnapshotKey(year, month),
      JSON.stringify(snapshotToWrite(blocks, values, loadSnapshot(appStorage, year, month))),
    ) && ok;
    if (!ok) onSaveFailed();
  }, [values, year, month, blocks, onSaveFailed]);

  const setAmount = useCallback((rowId: string, amount: number) => {
    setValues(v => ({ ...v, [rowId]: amount }));
  }, []);

  // ── How-it-works intro — auto-opens once, re-openable from the ❔ button ──
  const [helpOpen, setHelpOpen] = useState(false);
  useEffect(() => {
    if (!appStorage.getItem('budget_custom_help_seen')) {
      setHelpOpen(true);
      appStorage.setItem('budget_custom_help_seen', '1');
    }
  }, []);

  // ── Copy last month: pull the previous month's amounts into this month ──
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyLastMonth = () => {
    const py = month === 0 ? year - 1 : year;
    const pm = month === 0 ? 11 : month - 1;
    // This month's amounts are about to be replaced wholesale. Ask first when
    // there is something there — an explicitly recorded 0 included, since the
    // user typed that too.
    const hasOwn = appStorage.getItem(valuesKey(year, month)) !== null
      && Object.keys(values).length > 0;
    if (hasOwn && !window.confirm(
      t.copyOverwriteOne(`${MONTHS[lang][month]} ${year}`, MONTHS[lang][pm]),
    )) return;
    setValues(loadValues(py, pm)); // the save effect persists it to this month's key
    setToast(t.copiedLastMonth);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2200);
  };
  // Wipe every month's Custom amounts (keeps the block layout) — a clean-up for
  // data left over from the old month-bleed bug. Confirmed before running.
  const clearAllAmounts = () => {
    if (!window.confirm(t.clearAmountsConfirm)) return;
    // Snapshots go with the amounts they describe. A snapshot exists to say how
    // a month's MONEY was filed, so once every amount is gone it documents
    // nothing — and leaving it behind would let a stale filing outlive the
    // figures it belonged to. Both keys are removed together, under the one
    // confirmation the user already gave for the amounts themselves.
    // Collected by index BEFORE removing: Object.keys() only works on the
    // browser's own Storage object, and walking while deleting skips entries.
    const doomed: string[] = [];
    for (let i = 0; i < appStorage.length; i++) {
      const k = appStorage.key(i);
      if (k && (k.startsWith('budget_custom_v3_values') || k.startsWith('budget_custom_v3_meta_'))) doomed.push(k);
    }
    doomed.forEach(k => appStorage.removeItem(k));
    setValues({});
    setToast(t.clearedAmounts);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2200);
  };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // ── Block ops ──
  // Every built-in name is created WITH its nameKey (the literal `name` string
  // is only a fallback for older app versions reading newer data). Renaming
  // flips userNamed — from then on the user's text is law.
  const addBlock = (tag: BlockTag) => {
    const b = { ...newBlock(t.newBlockName, tag), nameKey: 'newBlockName' as const, userNamed: false };
    setBlocks(prev => [...prev, b]);
    setStarted(true);
    setPicking(false);
    setConfigFor(b.id);
  };
  const addSummary = () => {
    const b = { ...newSummary(t.summaryBlock), nameKey: 'summaryBlock' as const, userNamed: false };
    setBlocks(prev => [...prev, b]);
    setStarted(true);
    setPicking(false);
  };
  const addNoteBlock = () => {
    const b = { ...newNote(t.newNoteName), nameKey: 'newNoteName' as const, userNamed: false };
    setBlocks(prev => [...prev, b]);
    setStarted(true);
    setPicking(false);
  };
  const defaultRow = (i: number): BlockRow => ({
    id: uid(), name: t.newRowName, nameKey: 'newRowName', userNamed: false, color: paletteColor(i),
  });
  // A ready-made block: correct name, tag and emoji, plus a starter row — instead
  // of a "New block" the user has to rename and re-tag every time. Names are
  // stored as KEYS, so a template added in Swedish reads correctly in Spanish.
  const addTemplate = (tpl: BlockTemplate) => {
    const b: CustomBlock = {
      ...newBlock(t[tpl.key], tpl.tag),
      nameKey: tpl.key,
      userNamed: false,
      icon: tpl.emoji,
      rows: tpl.rows.map((rowKey, i) => ({
        id: uid(), name: t[rowKey], nameKey: rowKey, userNamed: false, color: paletteColor(i),
      })),
    };
    setBlocks(prev => [...prev, b]);
    setStarted(true);
    setPicking(false);
  };
  const quickStart = () => {
    setBlocks([
      { ...newBlock(t.summaryIncome, 'in'), nameKey: 'summaryIncome', userNamed: false, rows: [defaultRow(0)] },
      { ...newBlock(t.summaryExpenses, 'out'), nameKey: 'summaryExpenses', userNamed: false, width: 'half', rows: [defaultRow(0)] },
      { ...newBlock(t.summarySaved, 'save'), nameKey: 'summarySaved', userNamed: false, width: 'half', rows: [defaultRow(0)] },
      { ...newSummary(t.summaryBlock), nameKey: 'summaryBlock', userNamed: false, chart: { show: true, type: 'bars', size: 'M', position: 'bottom' } },
    ]);
    setStarted(true);
  };
  /** Months (other than the one on screen) that hold an amount for these rows. */
  // Lives in customYear.ts so the rule is unit-testable without a DOM — the
  // active month and the recorded-0 decisions are documented there.
  const monthsHolding = (rowIds: string[]): number =>
    monthsHoldingRows(appStorage, rowIds);

  const removeBlock = (id: string) => {
    // Deleting a block is instant and has no undo. Amounts recorded against its
    // rows in OTHER months stay on disk but stop being reachable, which reads to
    // the user as history quietly changing. Say so before it happens.
    const block = blocks.find(b => b.id === id);
    const affected = monthsHolding(block?.rows.map(r => r.id) ?? []);
    if (affected > 0 && !window.confirm(t.deleteBlockHistoryConfirm(affected))) return;
    setBlocks(prev => prev.filter(b => b.id !== id));
  };

  // Copy a block's STRUCTURE — rows, colors, chart config, width, background —
  // and drop it right after the original. Every row gets a fresh id, so the copy
  // starts with no amounts: values are keyed by row id, and duplicating "Housing"
  // to build a second one should not drag this month's rent along with it.
  const duplicateBlock = (id: string) => setBlocks(prev => {
    const i = prev.findIndex(b => b.id === id);
    if (i === -1) return prev;
    const src = prev[i];
    const copy: CustomBlock = {
      ...src,
      id: uid(),
      // The copy is named, so it must never be reverse-translated back to the
      // original's built-in name on a language switch — hence userNamed + no key.
      name: t.copyOfName(resolveDisplayName(src, t)),
      nameKey: undefined,
      userNamed: true,
      chart: { ...src.chart },
      rows: src.rows.map(r => ({ ...r, id: uid() })),
    };
    return [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)];
  });
  const patchBlock = (id: string, patch: Partial<CustomBlock>) =>
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b));

  const renameBlock = (id: string, name: string) => patchBlock(id, { name, userNamed: true });
  const setNoteText = (id: string, text: string) => patchBlock(id, { text });
  const addRow = (id: string) =>
    setBlocks(prev => prev.map(b => b.id === id
      ? { ...b, rows: [...b.rows, defaultRow(b.rows.length)] } : b));
  const renameRow = (id: string, rowId: string, name: string) =>
    setBlocks(prev => prev.map(b => b.id === id
      ? { ...b, rows: b.rows.map(r => r.id === rowId ? { ...r, name, userNamed: true } : r) } : b));
  const recolorRow = (id: string, rowId: string, color: string) =>
    setBlocks(prev => prev.map(b => b.id === id
      ? { ...b, rows: b.rows.map(r => r.id === rowId ? { ...r, color } : r) } : b));
  // Same protection as removeBlock, one row wide. A single row carried a whole
  // month's rent as easily as a block did, and deleting it asked nothing.
  const deleteRow = (id: string, rowId: string) => {
    const affected = monthsHolding([rowId]);
    if (affected > 0 && !window.confirm(t.deleteRowHistoryConfirm(affected))) return;
    setBlocks(prev => prev.map(b => b.id === id
      ? { ...b, rows: b.rows.filter(r => r.id !== rowId) } : b));
  };

  const move = (id: string, dir: -1 | 1) => setBlocks(prev => {
    const i = prev.findIndex(b => b.id === id);
    const j = i + dir;
    if (i === -1 || j < 0 || j >= prev.length) return prev;
    const next = [...prev];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const reorderTo = (src: string, dst: string) => {
    if (src === dst) return;
    setBlocks(prev => {
      const from = prev.findIndex(b => b.id === src);
      const to = prev.findIndex(b => b.id === dst);
      if (from === -1 || to === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  // ── Render view: names resolved for the ACTIVE language ──
  // One mapping point covers every consumer — titles, tiles, aria-labels,
  // chart legends, dialog headings — so the UI can't mix languages while the
  // stored structure keeps the raw name + nameKey. Ids are untouched, so all
  // ops and amount lookups work on the view copies too.
  const viewBlocks = useMemo(() => blocks.map(b => ({
    ...b,
    name: resolveDisplayName(b, t),
    rows: b.rows.map(r => ({ ...r, name: resolveDisplayName(r, t) })),
  })), [blocks, t]);

  // ── Money math ──
  const blockTotal = (b: CustomBlock) => b.rows.reduce((s, r) => s + (values[r.id] || 0), 0);
  const sumTag = (tag: BlockTag) =>
    blocks.filter(b => b.kind === 'block' && b.tag === tag).reduce((s, b) => s + blockTotal(b), 0);
  const summary = {
    income: sumTag('in'),
    expenses: sumTag('out'),
    saved: sumTag('save'),
    get remaining() { return this.income - this.expenses; },
  };

  // ── Previous-month comparison (the +/− "vs prev" delta, like Classic) ──
  const prevYear = month === 0 ? year - 1 : year;
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevValues = useMemo(() => loadValues(prevYear, prevMonth), [prevYear, prevMonth]);
  const blockPrev = (b: CustomBlock) => b.rows.reduce((s, r) => s + (prevValues[r.id] || 0), 0);
  const prevSumTag = (tag: BlockTag) =>
    blocks.filter(b => b.kind === 'block' && b.tag === tag).reduce((s, b) => s + blockPrev(b), 0);
  const prevRemaining = prevSumTag('in') - prevSumTag('out');

  // ── Empty state ──
  if (!started || blocks.length === 0) {
    return (
      <div className="custom-canvas">
        <div className="custom-empty">
          <div className="custom-empty-emoji">🧱</div>
          <h2 className="custom-empty-title">{t.customEmptyTitle}</h2>
          <p className="custom-empty-body">{t.customEmptyBody}</p>
          <div className="custom-empty-actions">
            <button className="custom-primary-btn" onClick={() => { setStarted(true); setPicking(true); }}>
              ＋ {t.addBlock}
            </button>
            <button className="custom-secondary-btn" onClick={quickStart}>
              ⚡ {t.quickStartCustom}
            </button>
          </div>
          <button className="custom-help-link" onClick={() => setHelpOpen(true)}>
            ❔ {t.howItWorks}
          </button>
        </div>
        {picking && <AddPicker onAddBlock={addBlock} onAddSummary={addSummary} onAddNote={addNoteBlock}
          onAddTemplate={addTemplate} onClose={() => setPicking(false)} />}
        {helpOpen && <CustomHelp t={t} onClose={() => setHelpOpen(false)} />}
      </div>
    );
  }

  const cfgBlock = configFor ? viewBlocks.find(b => b.id === configFor) : null;
  const expandedBlock = expandedFor ? viewBlocks.find(b => b.id === expandedFor) : null;

  return (
    <div className="custom-canvas">
      <div className="custom-page">
        {/* Page-level heading for screen-reader structure; block titles below are h3. */}
        <h2 className="sr-only">{t.layoutCustom}</h2>
        <div className="custom-toolbar">
          {toast && <span className="custom-toast">{toast}</span>}
          {/* Custom hides the app's tab bar, so this is the only route to a view
              spanning more than the selected month. */}
          <div className="utils-seg custom-view-seg" role="group" aria-label={t.layoutCustom}>
            <button className={`seg-btn${view === 'budget' ? ' seg-active' : ''}`}
              onClick={() => setView('budget')} aria-pressed={view === 'budget'}>
              📋 {t.tabBudget}
            </button>
            <button className={`seg-btn${view === 'year' ? ' seg-active' : ''}`}
              onClick={() => setView('year')} aria-pressed={view === 'year'}>
              📅 {t.tabYear}
            </button>
          </div>
          {view === 'budget' && <>
            <button className="custom-edit-btn" onClick={() => setHelpOpen(true)} title={t.howItWorks}>
              ❔ {t.howItWorks}
            </button>
            <button className="custom-edit-btn" onClick={copyLastMonth} title={t.copyLastMonth}>
              📋 {t.copyLastMonth}
            </button>
            <button className={`custom-edit-btn${editing ? ' custom-edit-active' : ''}`}
              onClick={() => setEditing(e => !e)}>
              {editing ? `✓ ${t.cfgDone}` : `✎ ${t.editLayout}`}
            </button>
            {editing && (
              <button className="custom-edit-btn custom-reset-btn" onClick={clearAllAmounts}
                title={t.clearAmounts}>
                🧹 {t.clearAmounts}
              </button>
            )}
          </>}
        </div>

        {view === 'year' && <CustomYear blocks={blocks} year={year} />}

        {view === 'budget' && viewBlocks.map((b, index) => {
          const isSummary = b.kind === 'summary';
          const total = blockTotal(b);
          // Phone: every block is a compact tile (tap → modal). Desktop: full inline.
          const asTile = isPhone && !editing;
          const headline = isSummary
            ? `${summary.remaining >= 0 ? '+' : ''}${money(summary.remaining)}`
            : money(total);
          const tone = isSummary ? (summary.remaining >= 0 ? 'positive' : 'negative') : 'neutral';
          // +/− change vs the same block last month (shown only if last month had data).
          const curVal = isSummary ? summary.remaining : total;
          const prevVal = isSummary ? prevRemaining : blockPrev(b);
          const delta = curVal - prevVal;
          const showDelta = prevVal !== 0;

          return (
            <section
              key={b.id}
              className={`custom-section w-${b.width}${editing ? ' custom-section-editing' : ''}${asTile ? ' custom-section-tile' : ''}`}
              style={bgStyle(b.bg)}
              draggable={editing && !isPhone}
              onDragStart={editing && !isPhone ? () => { dragId.current = b.id; } : undefined}
              onDragOver={editing && !isPhone ? (e) => e.preventDefault() : undefined}
              onDrop={editing && !isPhone ? (e) => {
                e.preventDefault();
                if (dragId.current) reorderTo(dragId.current, b.id);
                dragId.current = null;
              } : undefined}
            >
              {editing && (
                <div className="custom-section-controls">
                  {!isPhone && <span className="custom-grip" title={t.dragToReorder} aria-hidden="true">⠿</span>}
                  {/* The kind tag is rendered once inside the block body (below);
                      no need to repeat it here in the controls row. */}
                  <div className="custom-width-toggle" role="group" title={t.cfgWidth}>
                    {/* On phone ⅓ and Half render identically (both 2-up), so
                        only offer Full / Half there. A ⅓ block shows Half active. */}
                    {((isPhone ? ['full', 'half'] : ['full', 'half', 'third']) as BlockWidth[]).map(w => (
                      <button key={w}
                        className={`width-seg${(b.width === w || (isPhone && w === 'half' && b.width === 'third')) ? ' width-active' : ''}`}
                        onClick={() => patchBlock(b.id, { width: w })}
                        title={widthLabel(w, t)} aria-label={widthLabel(w, t)}>
                        {w === 'full' ? '▭' : w === 'half' ? '◧' : '⅓'}
                      </button>
                    ))}
                  </div>
                  {isPhone && <>
                    <button className="custom-icon-btn" onClick={() => move(b.id, -1)} disabled={index === 0}
                      title={t.moveUp} aria-label={t.moveUp}>↑</button>
                    <button className="custom-icon-btn" onClick={() => move(b.id, 1)} disabled={index === blocks.length - 1}
                      title={t.moveDown} aria-label={t.moveDown}>↓</button>
                  </>}
                  <button className="custom-icon-btn" onClick={() => duplicateBlock(b.id)}
                    title={t.duplicateBlock}
                    aria-label={`${t.duplicateBlock}: ${resolveDisplayName(b, t)}`}>⧉</button>
                  <button className="custom-icon-btn" onClick={() => setConfigFor(b.id)}
                    title={t.sectionSettings} aria-label={t.sectionSettings}>⚙</button>
                  <button className="custom-icon-btn custom-remove-btn" onClick={() => removeBlock(b.id)}
                    title={t.removeSection} aria-label={t.ariaRemoveSection(b.name || t.newBlockName)}>✕</button>
                </div>
              )}

              {asTile ? (
                <button className="custom-tile-btn" onClick={() => setExpandedFor(b.id)} title={b.name}>
                  <span className="custom-tile-head">
                    <span className="custom-tile-icon">{displayIcon(b)}</span>
                    <span className="custom-tile-title">{b.name}</span>
                  </span>
                  {b.kind === 'note' ? (
                    <span className="custom-tile-preview">{(b.text || '').split('\n')[0] || '—'}</span>
                  ) : (
                    <>
                      <span className={`custom-tile-headline tone-${tone}`}>{headline}</span>
                      {isSummary && <span className="custom-tile-sub">{t.summaryRemaining}</span>}
                      {showDelta && (
                        <span className={`custom-tile-delta tone-${delta >= 0 ? 'positive' : 'negative'}`}>
                          {delta >= 0 ? '+' : ''}{money(delta)} {t.vsPrev}
                        </span>
                      )}
                      {b.kind === 'block' && b.target && b.target > 0 && (
                        <TargetBar total={total} target={b.target} money={money} />
                      )}
                    </>
                  )}
                </button>
              ) : (
                <BlockContent
                  block={b} total={total} prevTotal={prevVal} prevRemaining={prevRemaining}
                  summary={summary} values={values}
                  editing={editing}
                  onRename={renameBlock} onRenameRow={renameRow} onDeleteRow={deleteRow}
                  onRecolorRow={recolorRow}
                  onAddRow={addRow} onSetAmount={setAmount} onSetNote={setNoteText}
                  money={money} currency={currency} t={t}
                />
              )}
            </section>
          );
        })}

        {view === 'budget' && editing && (
          <button className="custom-add-card" onClick={() => setPicking(true)}>
            <span className="custom-add-plus">＋</span>
            <span>{t.addBlock}</span>
          </button>
        )}
      </div>

      {picking && <AddPicker onAddBlock={addBlock} onAddSummary={addSummary} onAddNote={addNoteBlock}
          onAddTemplate={addTemplate} onClose={() => setPicking(false)} />}

      {cfgBlock && (
        <ConfigPanel block={cfgBlock}
          onChange={(patch) => patchBlock(cfgBlock.id, patch)}
          onClose={() => setConfigFor(null)} t={t} />
      )}

      {/* Phone tap-to-expand: full editable block in a centered modal. */}
      {expandedBlock && (
        <div className="custom-modal-backdrop" onClick={() => setExpandedFor(null)}>
          <div className="custom-modal custom-expand" onClick={e => e.stopPropagation()} role="dialog"
            aria-modal="true" aria-label={expandedBlock.name} ref={expandRef}>
            {/* Header is just the close button — the block's kind tag + editable
                title are rendered once inside BlockContent below (no duplicate). */}
            <div className="custom-expand-head" style={{ justifyContent: 'flex-end' }}>
              <button className="custom-icon-btn" onClick={() => setExpandedFor(null)}
                title={t.cfgDone} aria-label={t.cfgDone}>✕</button>
            </div>
            <div className="custom-expand-body">
              <BlockContent
                block={expandedBlock} total={blockTotal(expandedBlock)}
                prevTotal={blockPrev(expandedBlock)} prevRemaining={prevRemaining}
                summary={summary} values={values}
                editing
                onRename={renameBlock} onRenameRow={renameRow} onDeleteRow={deleteRow}
                onRecolorRow={recolorRow}
                onAddRow={addRow} onSetAmount={setAmount} onSetNote={setNoteText}
                money={money} currency={currency} t={t}
              />
            </div>
          </div>
        </div>
      )}

      {helpOpen && <CustomHelp t={t} onClose={() => setHelpOpen(false)} />}
    </div>
  );
};

// ── How-it-works help ──
// First meeting is a SHORT welcome (title + one line + Got it); the full
// feature-by-feature guide sits behind a "Show guide" link so it never blocks
// the user from just starting.
const HELP_ICONS = ['🧱', '🏷️', '➕', '📐', '🎨', '📊', '🎯', '📝', '📈', '📋', '✎'];
const CustomHelp = ({ t, onClose }: { t: ReturnType<typeof useLang>['t']; onClose: () => void }) => {
  const [showGuide, setShowGuide] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  useModalFocus(panelRef, true, onClose);
  return (
    <div className="custom-modal-backdrop" onClick={onClose}>
      <div className="custom-modal custom-help" onClick={e => e.stopPropagation()} role="dialog"
        aria-modal="true" aria-labelledby="custom-help-title" ref={panelRef}>
        <div className="custom-help-head">
          <div className="custom-modal-title" id="custom-help-title">❔ {t.customHelpTitle}</div>
          <button className="custom-icon-btn" onClick={onClose} aria-label={t.cfgDone}>✕</button>
        </div>
        <p className="custom-help-intro">{t.customHelpIntro}</p>
        {showGuide ? (
          <div className="custom-help-list">
            {t.customHelp.map((item, i) => (
              <div className="custom-help-item" key={i}>
                <span className="custom-help-icon" aria-hidden="true">{HELP_ICONS[i] ?? '•'}</span>
                <div>
                  <div className="custom-help-item-title">{item.title}</div>
                  <div className="custom-help-item-body">{item.body}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <button className="custom-help-link" onClick={() => setShowGuide(true)}>
            📖 {t.showGuide}
          </button>
        )}
        <button className="custom-primary-btn custom-help-done" onClick={onClose}>{t.gotIt}</button>
      </div>
    </div>
  );
};

// ── Helpers ──
// The fixed KIND emoji (money-type), used in the kind-tag pill.
function tagEmoji(b: CustomBlock): string {
  if (b.kind === 'summary') return '📊';
  if (b.kind === 'note') return '📝';
  return b.tag === 'in' ? '💵' : b.tag === 'out' ? '💸' : '🏦';
}
// The block's DISPLAY icon for the title/tile — user-chosen emoji, or the kind
// emoji as a fallback. (The kind-tag pill always uses the kind emoji.)
function displayIcon(b: CustomBlock): string {
  return b.icon ?? tagEmoji(b);
}
// Fixed, non-editable KIND tag (what kind of money the block is). Distinct from
// the user's editable block name.
function kindLabel(b: CustomBlock, t: ReturnType<typeof useLang>['t']): string {
  if (b.kind === 'summary') return t.kindSummary;
  if (b.kind === 'note') return t.kindNote;
  return b.tag === 'in' ? t.kindIn : b.tag === 'out' ? t.kindOut : t.kindSave;
}
function widthLabel(w: BlockWidth, t: ReturnType<typeof useLang>['t']): string {
  return w === 'full' ? t.cfgWidthFull : w === 'half' ? t.cfgWidthHalf : t.cfgWidthThird;
}

// ── Block content (full editable view; desktop inline + phone modal) ──
interface BlockContentProps {
  block: CustomBlock;
  total: number;
  prevTotal: number;
  prevRemaining: number;
  summary: { income: number; expenses: number; saved: number; remaining: number };
  values: Record<string, number>;
  editing: boolean;
  onRename: (id: string, name: string) => void;
  onRenameRow: (id: string, rowId: string, name: string) => void;
  onDeleteRow: (id: string, rowId: string) => void;
  onRecolorRow: (id: string, rowId: string, color: string) => void;
  onAddRow: (id: string) => void;
  onSetAmount: (rowId: string, amount: number) => void;
  onSetNote: (id: string, text: string) => void;
  money: (n: number) => string;
  currency: ReturnType<typeof useLang>['currency'];
  t: ReturnType<typeof useLang>['t'];
}

const BlockContent = ({
  block, total, prevTotal, prevRemaining, summary, values, editing,
  onRename, onRenameRow, onDeleteRow, onRecolorRow, onAddRow, onSetAmount, onSetNote, money, currency, t,
}: BlockContentProps) => {
  // Note block: a free-text block that contributes nothing to the money math.
  if (block.kind === 'note') {
    return (
      <>
        <div className="cv3-kind-tag">{tagEmoji(block)} {kindLabel(block, t)}</div>
        <BlockTitle block={block} editing={editing} onRename={onRename} placeholder={t.newNoteName}
          ariaLabel={t.ariaNameField(block.name || t.newNoteName)} />
        <textarea className="cv3-note-text" value={block.text ?? ''}
          placeholder={t.notePlaceholder} rows={5}
          onChange={(e) => onSetNote(block.id, e.target.value)} />
      </>
    );
  }
  // +/− vs the same block last month, shown by the total (only if last month had data).
  const cur = block.kind === 'summary' ? summary.remaining : total;
  const prev = block.kind === 'summary' ? prevRemaining : prevTotal;
  const delta = cur - prev;
  const deltaNode = prev !== 0 ? (
    <span className={`cv3-delta tone-${delta >= 0 ? 'positive' : 'negative'}`}>
      {delta >= 0 ? '+' : ''}{money(delta)} {t.vsPrev}
    </span>
  ) : null;
  if (block.kind === 'summary') {
    // Summary chart visualises the three totals (Income / Expenses / Saved).
    const sumData = [
      { name: t.summaryIncome, value: summary.income, color: '#22c55e', icon: '' },
      { name: t.summaryExpenses, value: summary.expenses, color: '#f87171', icon: '' },
      { name: t.summarySaved, value: summary.saved, color: '#22d3ee', icon: '' },
    ].filter(d => d.value > 0);
    const sumChart = block.chart.show && sumData.length > 0 ? (() => {
      const totalV = sumData.reduce((s, d) => s + d.value, 0);
      const style: ExpenseChartStyle = block.chart.type;
      return (
        <div className="cv3-chart-slot"><div className="charts-container"><div className="chart-block">
          <ExpenseChart data={sumData} totalExpenses={totalV}
            style={style} height={style === 'bars' ? sumData.length * 44 + 20 : chartHeightPx(block.chart.size)}
            money={money} currency={currency} totalLabel={t.summaryBlock} />
        </div></div></div>
      );
    })() : null;
    const summaryRows = (
      <div className="cv3-summary">
        <SummaryRow label={t.summaryIncome} value={money(summary.income)} cls="tone-positive" />
        <SummaryRow label={t.summaryExpenses} value={money(summary.expenses)} cls="tone-negative" />
        <SummaryRow label={t.summarySaved} value={money(summary.saved)} cls="" />
        <SummaryRow label={t.summaryRemaining}
          value={`${summary.remaining >= 0 ? '+' : ''}${money(summary.remaining)}`}
          cls={summary.remaining >= 0 ? 'tone-positive' : 'tone-negative'} big />
        {deltaNode && <div className="cv3-block-delta">{deltaNode}</div>}
      </div>
    );
    const narrow = block.width === 'third';
    const pos = block.chart.position;
    const sideBySide = sumChart && !narrow && (pos === 'left' || pos === 'right');
    const stackedPos = narrow && (pos === 'left' || pos === 'right') ? 'bottom' : pos;
    return (
      <>
        <div className="cv3-kind-tag">{tagEmoji(block)} {kindLabel(block, t)}</div>
        <BlockTitle block={block} editing={editing} onRename={onRename} placeholder={t.summaryBlock}
          ariaLabel={t.ariaNameField(block.name || t.summaryBlock)} />
        {sideBySide ? (
          <div className={`cv3-split ${pos === 'left' ? 'chart-left' : 'chart-right'}`}>
            {sumChart}
            {summaryRows}
          </div>
        ) : (
          <>
            {sumChart && stackedPos === 'top' && sumChart}
            {summaryRows}
            {sumChart && stackedPos !== 'top' && sumChart}
          </>
        )}
      </>
    );
  }

  // The chart (if enabled) — composition of this block's own rows.
  const chartNode = block.chart.show ? (() => {
    const data = block.rows
      .map(r => ({ name: r.name || '—', value: values[r.id] || 0, color: r.color, icon: '' }))
      .filter(d => d.value > 0);
    const height = chartHeightPx(block.chart.size);
    if (data.length === 0) return null;
    const totalV = data.reduce((s, d) => s + d.value, 0);
    return (
      <div className="charts-container"><div className="chart-block">
        <ExpenseChart data={data} totalExpenses={totalV}
          style={block.chart.type} height={block.chart.type === 'bars' ? data.length * 44 + 20 : height}
          money={money} currency={currency} totalLabel={t.blockTotal} />
      </div></div>
    );
  })() : null;

  // Row entries (top) and the total/delta/target footer (bottom) are split so a
  // 'between' chart can sit between them.
  const rowsListNode = (
    <>
      {block.rows.map(r => (
        <div className="cv3-row" key={r.id}>
          {/* Per-category colour swatch (also a picker to override). */}
          <label className="cv3-row-color" style={{ background: r.color }} title={t.cfgCustomColor}>
            <input type="color" value={r.color} aria-label={t.ariaRowColor(r.name || t.newRowName)}
              onChange={e => onRecolorRow(block.id, r.id, e.target.value)} />
          </label>
          <InlineName className="cv3-row-name" value={r.name} editable
            placeholder={t.newRowName} ariaLabel={t.ariaNameField(`${block.name} – ${r.name || t.newRowName}`)}
            onChange={(v) => onRenameRow(block.id, r.id, v)} />
          <AmountInput value={values[r.id] || 0} ariaLabel={t.ariaAmountInput(`${block.name} – ${r.name || t.newRowName}`)}
            onChange={(v) => onSetAmount(r.id, v)} />
          {editing && (
            <button className="cv3-row-del" onClick={() => onDeleteRow(block.id, r.id)}
              title={t.deleteRow} aria-label={t.ariaDeleteRow(r.name || t.newRowName)}>✕</button>
          )}
        </div>
      ))}
      <button className="add-category-btn cv3-add-row" onClick={() => onAddRow(block.id)}>
        {t.addRow}
      </button>
    </>
  );
  const footerNode = (
    <>
      <div className="cv3-block-total">
        <span>{t.blockTotal}</span>
        <span>{money(total)}</span>
      </div>
      {deltaNode && <div className="cv3-block-delta">{deltaNode}</div>}
      {block.target && block.target > 0 && (
        <TargetBar total={total} target={block.target} money={money} />
      )}
    </>
  );
  const chartSlot = chartNode ? <div className="cv3-chart-slot">{chartNode}</div> : null;

  // Chart position relative to the rows. Narrow (⅓) blocks never go side-by-side
  // — a left/right chart would be squashed/chopped, so fall back to stacked.
  const narrow = block.width === 'third';
  const pos = block.chart.position;
  const sideBySide = chartNode && !narrow && (pos === 'left' || pos === 'right');
  const stackedPos = narrow && (pos === 'left' || pos === 'right') ? 'bottom' : pos;
  return (
    <>
      <div className="cv3-kind-tag">{tagEmoji(block)} {kindLabel(block, t)}</div>
      <BlockTitle block={block} editing={editing} onRename={onRename} placeholder={t.newBlockName}
        ariaLabel={t.ariaNameField(block.name || t.newBlockName)} />
      {sideBySide ? (
        <div className={`cv3-split ${pos === 'left' ? 'chart-left' : 'chart-right'}`}>
          {chartSlot}
          <div className="cv3-rows">{rowsListNode}{footerNode}</div>
        </div>
      ) : (
        <>
          {stackedPos === 'top' && chartSlot}
          <div className="cv3-rows">
            {rowsListNode}
            {stackedPos === 'between' && chartSlot}
            {footerNode}
          </div>
          {stackedPos === 'bottom' && chartSlot}
        </>
      )}
    </>
  );
};

// Thin progress bar toward a block's target. Fill uses the block accent
// (--cv3-ink), label uses ink so it reads on any background.
const TargetBar = ({ total, target, money }: { total: number; target: number; money: (n: number) => string }) => {
  const pct = Math.min(100, Math.round((total / target) * 100));
  return (
    <div className="cv3-target">
      <div className="cv3-target-track">
        <div className="cv3-target-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="cv3-target-label">
        <span>{money(total)} / {money(target)}</span>
        <span>{pct}%</span>
      </div>
    </div>
  );
};

const SummaryRow = ({ label, value, cls, big }: { label: string; value: string; cls: string; big?: boolean }) => (
  <div className={`cv3-summary-row${big ? ' cv3-summary-big' : ''}`}>
    <span className="cv3-summary-label">{label}</span>
    <span className={`cv3-summary-value ${cls}`}>{value}</span>
  </div>
);

// Centered block title: the block's display icon (custom emoji or kind emoji)
// prefixed to the editable name.
const BlockTitle = ({ block, editing, onRename, placeholder, ariaLabel }: {
  block: CustomBlock; editing: boolean; onRename: (id: string, name: string) => void; placeholder: string; ariaLabel: string;
}) => (
  <div className="cv3-title-row">
    <span className="cv3-title-icon" aria-hidden="true">{displayIcon(block)}</span>
    {/* Real heading when not editing (screen-reader block structure); becomes an
        input while editing. */}
    <InlineName className="custom-block-title" value={block.name} readAs="h3" ariaLabel={ariaLabel}
      editable={editing} onChange={(v) => onRename(block.id, v)} placeholder={placeholder} />
  </div>
);

// Inline-editable text (block names AND row names are all renameable). When not
// editable it renders as `readAs` (a div, or an h3 for block titles); when
// editable it's an <input> that carries `ariaLabel` as its accessible name.
const InlineName = ({ value, editable, onChange, className, placeholder, ariaLabel, readAs = 'div' }: {
  value: string; editable: boolean; onChange: (v: string) => void; className?: string; placeholder?: string;
  ariaLabel?: string; readAs?: 'div' | 'h3';
}) => {
  if (!editable) {
    const Tag = readAs;
    return <Tag className={className}>{value || placeholder}</Tag>;
  }
  return (
    <input className={`cv3-name-input ${className ?? ''}`} value={value} placeholder={placeholder}
      aria-label={ariaLabel} onChange={e => onChange(e.target.value)} />
  );
};

// Amount entry — blank when zero, accepts decimals like Classic's
// EditableAmount ("970,5" or "970.5" → 970.5). Previously this stripped the
// separator, so "970,5" silently became 9705 — a 10× footgun.
//
// ⚠️ What the user typed goes to the parser UNTOUCHED. Stripping the characters
// the parser is supposed to reject turns a rejection into a silent edit: this
// field used to run `.replace(/[^\d.,]/g, '')` first, so `1e309` arrived as
// "1309" — a perfectly valid amount — and 1 309 kr was saved and reloaded as
// though the user had asked for it (main review 2026-07-30 §4). `123abc`
// became 123 the same way. A budget app may refuse a number; it may never
// quietly substitute a different one.
const AmountInput = ({ value, onChange, ariaLabel }: { value: number; onChange: (v: number) => void; ariaLabel?: string }) => {
  const [draft, setDraft] = useState<string>(value ? String(value) : '');
  const [invalid, setInvalid] = useState(false);
  const errorId = useId();
  const { t } = useLang();
  useEffect(() => {
    // Sync from external changes (copy-last-month, clear) without clobbering
    // the user's in-progress typing ("970," would otherwise snap to "970").
    const current = parseMoneyOrZero(draft);
    if (!current.ok || current.value !== value) { setDraft(value ? String(value) : ''); setInvalid(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <span className="cv3-amount-wrap">
      <input
        className={`cv3-amount-input${invalid ? ' cv3-amount-invalid' : ''}`}
        inputMode="decimal"
        value={draft}
        placeholder="0"
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        onChange={e => {
          const raw = e.target.value;
          setDraft(raw); // the draft always shows exactly what was typed
          const parsed = parseMoneyOrZero(raw);
          setInvalid(!parsed.ok);
          // An invalid draft leaves the stored amount — and every total built
          // from it — on the last value the user actually confirmed.
          if (parsed.ok) onChange(parsed.value);
        }}
      />
      {invalid && (
        <span className="cv3-amount-error" id={errorId} role="alert">{t.invalidAmount}</span>
      )}
    </span>
  );
};

// The block's optional goal amount. Same contract as AmountInput — the typed
// text reaches the parser untouched — because this field had the identical bug:
// it stripped every non-digit and then parseInt'd the remains, so `1e309`
// became a saved target of 1 309, and a few hundred digits became `Infinity`,
// which JSON.stringify writes as null (found while building the guard for the
// 2026-07-30 §4 fix, in a field that review had not looked at).
// Blank or 0 means "no target" — that is a real choice, not an error.
const TargetInput = ({ value, onChange }: { value?: number; onChange: (v: number | undefined) => void }) => {
  const [draft, setDraft] = useState<string>(value ? String(value) : '');
  const [invalid, setInvalid] = useState(false);
  const errorId = useId();
  const { t } = useLang();
  useEffect(() => {
    const current = parseMoneyOrZero(draft);
    const shown = current.ok ? current.value : NaN;
    if (shown !== (value ?? 0)) { setDraft(value ? String(value) : ''); setInvalid(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <span className="cv3-amount-wrap">
      <input
        className={`cv3-amount-input cfg-target-input${invalid ? ' cv3-amount-invalid' : ''}`}
        inputMode="decimal"
        value={draft}
        placeholder="0"
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        onChange={e => {
          const raw = e.target.value;
          setDraft(raw);
          const parsed = parseMoneyOrZero(raw);
          setInvalid(!parsed.ok);
          if (parsed.ok) onChange(parsed.value > 0 ? parsed.value : undefined);
        }}
      />
      {invalid && (
        <span className="cv3-amount-error" id={errorId} role="alert">{t.invalidAmount}</span>
      )}
    </span>
  );
};

// ── Add-block picker ──
const AddPicker = ({ onAddBlock, onAddSummary, onAddNote, onAddTemplate, onClose }: {
  onAddBlock: (tag: BlockTag) => void;
  onAddSummary: () => void;
  onAddNote: () => void;
  onAddTemplate: (tpl: BlockTemplate) => void;
  onClose: () => void;
}) => {
  const { t } = useLang();
  const panelRef = useRef<HTMLDivElement>(null);
  useModalFocus(panelRef, true, onClose);
  return (
    <div className="custom-modal-backdrop" onClick={onClose}>
      <div className="custom-modal" onClick={e => e.stopPropagation()} role="dialog"
        aria-modal="true" aria-labelledby="custom-picker-title" ref={panelRef}>
        <div className="custom-modal-title" id="custom-picker-title">{t.addBlock}</div>
        <div className="custom-picker-grid">
          <button className="custom-picker-btn" onClick={() => onAddBlock('in')}>
            <span className="custom-picker-emoji">💵</span><span>{t.tagIn}</span>
          </button>
          <button className="custom-picker-btn" onClick={() => onAddBlock('out')}>
            <span className="custom-picker-emoji">💸</span><span>{t.tagOut}</span>
          </button>
          <button className="custom-picker-btn" onClick={() => onAddBlock('save')}>
            <span className="custom-picker-emoji">🏦</span><span>{t.tagSave}</span>
          </button>
          <button className="custom-picker-btn" onClick={onAddSummary}>
            <span className="custom-picker-emoji">📊</span><span>{t.summaryBlock}</span>
          </button>
          <button className="custom-picker-btn" onClick={onAddNote}>
            <span className="custom-picker-emoji">📝</span><span>{t.addNote}</span>
          </button>
        </div>

        <div className="custom-picker-sep" role="separator" />
        <div className="custom-picker-grid">
          {BLOCK_TEMPLATES.map(tpl => (
            <button className="custom-picker-btn" key={tpl.key} onClick={() => onAddTemplate(tpl)}>
              <span className="custom-picker-emoji">{tpl.emoji}</span><span>{t[tpl.key]}</span>
            </button>
          ))}
        </div>

        <button className="custom-modal-close" onClick={onClose}>{t.cfgDone}</button>
      </div>
    </div>
  );
};

// ── Per-block settings panel ──
// The picker renders the shared list itself — no second copy to drift — so it
// can never offer a style the renderer, loader or backup validator rejects.
const CHART_TYPES: readonly ExpenseChartStyle[] = EXPENSE_CHART_STYLES;

const ConfigPanel = ({ block, onChange, onClose, t }: {
  block: CustomBlock;
  onChange: (patch: Partial<CustomBlock>) => void;
  onClose: () => void;
  t: ReturnType<typeof useLang>['t'];
}) => {
  const isPhone = useIsPhone();
  const panelRef = useRef<HTMLDivElement>(null);
  useModalFocus(panelRef, true, onClose);
  const isNote = block.kind === 'note';
  const isRegular = block.kind === 'block';
  const chartTypeLabel: Record<ExpenseChartStyle, string> = {
    donut: t.chartStyleDonut, pie: t.chartStylePie, bars: t.chartStyleBars,
    list: t.chartStyleList, stacked: t.chartStyleStacked, treemap: t.chartStyleTreemap,
    radial: t.chartStyleRadial,
  };
  const setChart = (patch: Partial<BlockChart>) => onChange({ chart: { ...block.chart, ...patch } });
  // On a phone, blocks are full-width so left/right/between all collapse to a
  // stacked chart — only Top/Bottom are visibly different there.
  const positions: { p: ChartPosition; label: string }[] = isPhone
    ? [{ p: 'top', label: t.posTop }, { p: 'bottom', label: t.posBottom }]
    : [
        { p: 'top', label: t.posTop }, { p: 'bottom', label: t.posBottom },
        { p: 'left', label: t.posLeft }, { p: 'right', label: t.posRight },
        { p: 'between', label: t.posBetween },
      ];

  return (
    <div className="custom-modal-backdrop" onClick={onClose}>
      <div className="custom-modal custom-config" onClick={e => e.stopPropagation()} role="dialog"
        aria-modal="true" aria-labelledby="custom-config-title" ref={panelRef}>
        <div className="custom-modal-title" id="custom-config-title">{tagEmoji(block)} {block.name} — {t.sectionSettings}</div>

        {/* Width — bigger icons with a gap before the label */}
        <div className="cfg-row">
          <span className="cfg-label">{t.cfgWidth}</span>
          <div className="utils-seg">
            {((isPhone ? ['full', 'half'] : ['full', 'half', 'third']) as BlockWidth[]).map(w => (
              <button key={w}
                className={`seg-btn cfg-width-seg${(block.width === w || (isPhone && w === 'half' && block.width === 'third')) ? ' seg-active' : ''}`}
                onClick={() => onChange({ width: w })}>
                <span className="cfg-width-icon">{w === 'full' ? '▭' : w === 'half' ? '◧' : '⅓'}</span>
                <span>{widthLabel(w, t)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Emoji — block display icon (title/tile); kind tag keeps its kind emoji. */}
        <div className="cfg-row cfg-row-stack">
          <span className="cfg-label">{t.cfgEmoji}</span>
          <div className="cfg-emoji-grid">
            <button className={`cfg-emoji-btn${!block.icon ? ' cfg-emoji-active' : ''}`}
              onClick={() => onChange({ icon: undefined })} title={t.cfgEmojiDefault}>∅</button>
            {BLOCK_EMOJIS.map(em => (
              <button key={em} className={`cfg-emoji-btn${block.icon === em ? ' cfg-emoji-active' : ''}`}
                onClick={() => onChange({ icon: em })}>{em}</button>
            ))}
          </div>
        </div>

        {/* Tag (regular blocks only — not summary/note) */}
        {isRegular && (
          <div className="cfg-row">
            <span className="cfg-label">{t.cfgTag}</span>
            <div className="utils-seg">
              <button className={`seg-btn${block.tag === 'in' ? ' seg-active' : ''}`}
                onClick={() => onChange({ tag: 'in' })}>💵 {t.tagIn}</button>
              <button className={`seg-btn${block.tag === 'out' ? ' seg-active' : ''}`}
                onClick={() => onChange({ tag: 'out' })}>💸 {t.tagOut}</button>
              <button className={`seg-btn${block.tag === 'save' ? ' seg-active' : ''}`}
                onClick={() => onChange({ tag: 'save' })}>🏦 {t.tagSave}</button>
            </div>
          </div>
        )}

        {/* Target (regular blocks only). 0/empty → no target. */}
        {isRegular && (
          <div className="cfg-row">
            <span className="cfg-label">{t.cfgTarget}</span>
            <TargetInput value={block.target} onChange={target => onChange({ target })} />
          </div>
        )}

        {/* Background — presets + custom color */}
        <div className="cfg-row">
          <span className="cfg-label">{t.cfgBackground}</span>
          <div className="cfg-bg-swatches">
            <button className={`cfg-swatch bg-none${block.bg === null ? ' cfg-swatch-active' : ''}`}
              onClick={() => onChange({ bg: null })} title={t.cfgBgNone} aria-label={t.cfgBgNone}>∅</button>
            {BG_PRESETS.map(p => (
              <button key={p.key}
                className={`cfg-swatch ${p.key}${block.bg === p.key ? ' cfg-swatch-active' : ''}`}
                onClick={() => onChange({ bg: p.key })} title={p.key} aria-label={p.key} />
            ))}
            <label className="cfg-swatch cfg-swatch-custom" title={t.cfgCustomColor}>
              <span aria-hidden="true">🎨</span>
              <input type="color"
                value={block.bg && block.bg.startsWith('#') ? block.bg : '#8b5cf6'}
                onChange={e => onChange({ bg: e.target.value })} />
            </label>
          </div>
        </div>

        {/* Chart settings — for regular + summary blocks (notes have no chart). */}
        {!isNote && (
          <>
            <div className="cfg-row">
              <span className="cfg-label">{t.cfgShowChart}</span>
              <button className={`custom-icon-btn custom-toggle-btn${block.chart.show ? ' custom-toggle-on' : ''}`}
                onClick={() => setChart({ show: !block.chart.show })}
                aria-pressed={block.chart.show} title={t.cfgShowChart}>
                {block.chart.show ? '👁' : '🚫'}
              </button>
            </div>

            {block.chart.show && (
              <>
                <div className="cfg-row cfg-row-stack">
                  <span className="cfg-label">{t.cfgChartType}</span>
                  <div className="cfg-chart-gallery">
                    {CHART_TYPES.map(ct => (
                      <button key={ct} className={`cfg-chart-btn${block.chart.type === ct ? ' cfg-chart-active' : ''}`}
                        onClick={() => setChart({ type: ct })}>{chartTypeLabel[ct]}</button>
                    ))}
                  </div>
                </div>

                <div className="cfg-row">
                  <span className="cfg-label">{t.cfgChartSize}</span>
                  <div className="utils-seg">
                    {(['S', 'M', 'L'] as ChartSize[]).map(sz => (
                      <button key={sz} className={`seg-btn${block.chart.size === sz ? ' seg-active' : ''}`}
                        onClick={() => setChart({ size: sz })}>
                        {sz === 'S' ? t.cfgSizeS : sz === 'M' ? t.cfgSizeM : t.cfgSizeL}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="cfg-row cfg-row-stack">
                  <span className="cfg-label">{t.cfgChartPosition}</span>
                  <div className="cfg-chart-gallery">
                    {positions.map(({ p, label }) => (
                      <button key={p} className={`cfg-chart-btn${block.chart.position === p ? ' cfg-chart-active' : ''}`}
                        onClick={() => setChart({ position: p })}>{label}</button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}

        <button className="custom-modal-close" onClick={onClose}>{t.cfgDone}</button>
      </div>
    </div>
  );
};
