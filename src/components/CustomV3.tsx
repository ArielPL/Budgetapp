import { useState, useEffect, useRef, useCallback, useMemo, type CSSProperties } from 'react';
import { useLang } from '../i18n';
import { ExpenseChart, type ExpenseChartStyle } from './Charts';

// ── Schema ──────────────────────────────────────────────────────────
// Custom v3 is a generic, build-from-scratch block budget with its OWN data,
// fully separate from the shared Classic/Combined budget.
//  • Structure (cross-month): block list + config + row NAMES → budget_custom_v3
//  • Amounts (per month): rowId → amount → budget_custom_v3_values_${y}_${m}

export type BlockTag = 'in' | 'out' | 'save';
export type BlockWidth = 'full' | 'half' | 'third';
export type ChartPosition = 'top' | 'bottom' | 'left' | 'right' | 'between';
export type ChartSize = 'S' | 'M' | 'L';
export type BlockKind = 'block' | 'summary' | 'note';

export interface BlockChart {
  show: boolean;
  type: ExpenseChartStyle;
  size: ChartSize;
  position: ChartPosition;
}

export interface BlockRow { id: string; name: string; color: string; }

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
}

// Common emoji palette for the per-block icon picker.
export const BLOCK_EMOJIS = ['🏠','🍔','🚗','🎉','💰','🏦','📈','🎯','✈️','🛒','🏥','📚','🎁','💡','☕','🐾','👶','🎮'];

const LS_STRUCT = 'budget_custom_v3';
const valuesKey = (y: number, m: number) => `budget_custom_v3_values_${y}_${m}`;

function uid(): string {
  try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); }
  catch { /* ignore */ }
  return `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function defaultChart(): BlockChart {
  return { show: false, type: 'donut', size: 'M', position: 'bottom' };
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
    const raw = localStorage.getItem(LS_STRUCT);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.map((b: Partial<CustomBlock>): CustomBlock => ({
      id: typeof b.id === 'string' && b.id ? b.id : uid(),
      kind: b.kind === 'summary' ? 'summary' : b.kind === 'note' ? 'note' : 'block',
      name: typeof b.name === 'string' ? b.name : 'Block',
      tag: b.tag === 'out' || b.tag === 'save' ? b.tag : 'in',
      width: b.width === 'half' || b.width === 'third' ? b.width : 'full',
      bg: typeof b.bg === 'string' ? b.bg : null,
      chart: { ...defaultChart(), ...(b.chart ?? {}) },
      rows: Array.isArray(b.rows)
        ? b.rows.map((r, i) => ({
            id: r?.id ?? uid(),
            name: typeof r?.name === 'string' ? r.name : '',
            color: typeof r?.color === 'string' && r.color ? r.color : paletteColor(i),
          }))
        : [],
      icon: typeof b.icon === 'string' && b.icon ? b.icon : undefined,
      target: typeof b.target === 'number' && b.target > 0 ? b.target : undefined,
      text: typeof b.text === 'string' ? b.text : undefined,
    }));
  } catch { return null; }
}

function loadValues(y: number, m: number): Record<string, number> {
  try {
    const raw = localStorage.getItem(valuesKey(y, m));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
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

interface Props { year: number; month: number; }

export const CustomV3 = ({ year, month }: Props) => {
  const { t, money, currency } = useLang();
  const isPhone = useIsPhone();

  const [blocks, setBlocks] = useState<CustomBlock[]>(() => loadStructure() ?? []);
  const [started, setStarted] = useState<boolean>(() => loadStructure() !== null);
  const [values, setValues] = useState<Record<string, number>>(() => loadValues(year, month));

  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [configFor, setConfigFor] = useState<string | null>(null);
  const [expandedFor, setExpandedFor] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);

  // Persist structure whenever it changes (after the user has started).
  useEffect(() => {
    if (started) localStorage.setItem(LS_STRUCT, JSON.stringify(blocks));
  }, [blocks, started]);

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
    if (Object.keys(values).length === 0 && localStorage.getItem(key) === null) return;
    localStorage.setItem(key, JSON.stringify(values));
  }, [values, year, month]);

  const setAmount = useCallback((rowId: string, amount: number) => {
    setValues(v => ({ ...v, [rowId]: amount }));
  }, []);

  // ── How-it-works intro — auto-opens once, re-openable from the ❔ button ──
  const [helpOpen, setHelpOpen] = useState(false);
  useEffect(() => {
    if (!localStorage.getItem('budget_custom_help_seen')) {
      setHelpOpen(true);
      localStorage.setItem('budget_custom_help_seen', '1');
    }
  }, []);

  // ── Copy last month: pull the previous month's amounts into this month ──
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyLastMonth = () => {
    const py = month === 0 ? year - 1 : year;
    const pm = month === 0 ? 11 : month - 1;
    setValues(loadValues(py, pm)); // the save effect persists it to this month's key
    setToast(t.copiedLastMonth);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2200);
  };
  // Wipe every month's Custom amounts (keeps the block layout) — a clean-up for
  // data left over from the old month-bleed bug. Confirmed before running.
  const clearAllAmounts = () => {
    if (!window.confirm(t.clearAmountsConfirm)) return;
    Object.keys(localStorage)
      .filter(k => k.startsWith('budget_custom_v3_values'))
      .forEach(k => localStorage.removeItem(k));
    setValues({});
    setToast(t.clearedAmounts);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2200);
  };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // ── Block ops ──
  const addBlock = (tag: BlockTag) => {
    const b = newBlock(t.newBlockName, tag);
    setBlocks(prev => [...prev, b]);
    setStarted(true);
    setPicking(false);
    setConfigFor(b.id);
  };
  const addSummary = () => {
    const b = newSummary(t.summaryBlock);
    setBlocks(prev => [...prev, b]);
    setStarted(true);
    setPicking(false);
  };
  const addNoteBlock = () => {
    const b = newNote(t.newNoteName);
    setBlocks(prev => [...prev, b]);
    setStarted(true);
    setPicking(false);
  };
  const quickStart = () => {
    const row = () => [{ id: uid(), name: t.newRowName, color: paletteColor(0) }];
    setBlocks([
      { ...newBlock(t.summaryIncome, 'in'), rows: row() },
      { ...newBlock(t.summaryExpenses, 'out'), width: 'half', rows: row() },
      { ...newBlock(t.summarySaved, 'save'), width: 'half', rows: row() },
      { ...newSummary(t.summaryBlock), chart: { show: true, type: 'bars', size: 'M', position: 'bottom' } },
    ]);
    setStarted(true);
  };
  const removeBlock = (id: string) => setBlocks(prev => prev.filter(b => b.id !== id));
  const patchBlock = (id: string, patch: Partial<CustomBlock>) =>
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b));

  const renameBlock = (id: string, name: string) => patchBlock(id, { name });
  const setNoteText = (id: string, text: string) => patchBlock(id, { text });
  const addRow = (id: string) =>
    setBlocks(prev => prev.map(b => b.id === id
      ? { ...b, rows: [...b.rows, { id: uid(), name: t.newRowName, color: paletteColor(b.rows.length) }] } : b));
  const renameRow = (id: string, rowId: string, name: string) =>
    setBlocks(prev => prev.map(b => b.id === id
      ? { ...b, rows: b.rows.map(r => r.id === rowId ? { ...r, name } : r) } : b));
  const recolorRow = (id: string, rowId: string, color: string) =>
    setBlocks(prev => prev.map(b => b.id === id
      ? { ...b, rows: b.rows.map(r => r.id === rowId ? { ...r, color } : r) } : b));
  const deleteRow = (id: string, rowId: string) =>
    setBlocks(prev => prev.map(b => b.id === id
      ? { ...b, rows: b.rows.filter(r => r.id !== rowId) } : b));

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
        {picking && <AddPicker onAddBlock={addBlock} onAddSummary={addSummary} onAddNote={addNoteBlock} onClose={() => setPicking(false)} />}
        {helpOpen && <CustomHelp t={t} onClose={() => setHelpOpen(false)} />}
      </div>
    );
  }

  const cfgBlock = configFor ? blocks.find(b => b.id === configFor) : null;
  const expandedBlock = expandedFor ? blocks.find(b => b.id === expandedFor) : null;

  return (
    <div className="custom-canvas">
      <div className="custom-page">
        <div className="custom-toolbar">
          {toast && <span className="custom-toast">{toast}</span>}
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
        </div>

        {blocks.map((b, index) => {
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
                  <button className="custom-icon-btn" onClick={() => setConfigFor(b.id)}
                    title={t.sectionSettings} aria-label={t.sectionSettings}>⚙</button>
                  <button className="custom-icon-btn custom-remove-btn" onClick={() => removeBlock(b.id)}
                    title={t.removeSection} aria-label={t.removeSection}>✕</button>
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

        {editing && (
          <button className="custom-add-card" onClick={() => setPicking(true)}>
            <span className="custom-add-plus">＋</span>
            <span>{t.addBlock}</span>
          </button>
        )}
      </div>

      {picking && <AddPicker onAddBlock={addBlock} onAddSummary={addSummary} onAddNote={addNoteBlock} onClose={() => setPicking(false)} />}

      {cfgBlock && (
        <ConfigPanel block={cfgBlock}
          onChange={(patch) => patchBlock(cfgBlock.id, patch)}
          onClose={() => setConfigFor(null)} t={t} />
      )}

      {/* Phone tap-to-expand: full editable block in a centered modal. */}
      {expandedBlock && (
        <div className="custom-modal-backdrop" onClick={() => setExpandedFor(null)}>
          <div className="custom-modal custom-expand" onClick={e => e.stopPropagation()} role="dialog">
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

// ── How-it-works help: one row per feature with an icon, title and blurb ──
const HELP_ICONS = ['🧱', '🏷️', '➕', '📐', '🎨', '📊', '🎯', '📝', '📈', '📋', '✎'];
const CustomHelp = ({ t, onClose }: { t: ReturnType<typeof useLang>['t']; onClose: () => void }) => (
  <div className="custom-modal-backdrop" onClick={onClose}>
    <div className="custom-modal custom-help" onClick={e => e.stopPropagation()} role="dialog">
      <div className="custom-help-head">
        <div className="custom-modal-title">❔ {t.customHelpTitle}</div>
        <button className="custom-icon-btn" onClick={onClose} aria-label={t.cfgDone}>✕</button>
      </div>
      <p className="custom-help-intro">{t.customHelpIntro}</p>
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
      <button className="custom-primary-btn custom-help-done" onClick={onClose}>{t.gotIt}</button>
    </div>
  </div>
);

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
        <BlockTitle block={block} editing={editing} onRename={onRename} placeholder={t.newNoteName} />
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
      const style: ExpenseChartStyle = block.chart.type === 'trend' ? 'bars' : block.chart.type;
      return (
        <div className="cv3-chart-slot"><div className="charts-container"><div className="chart-block">
          <ExpenseChart data={sumData} totalIncome={0} totalExpenses={totalV}
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
        <BlockTitle block={block} editing={editing} onRename={onRename} placeholder={t.summaryBlock} />
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

  // The chart (if enabled) — composition of this block's rows, or a trend.
  const chartNode = block.chart.show ? (() => {
    const data = block.rows
      .map(r => ({ name: r.name || '—', value: values[r.id] || 0, color: r.color, icon: '' }))
      .filter(d => d.value > 0);
    const height = chartHeightPx(block.chart.size);
    if (block.chart.type === 'trend') {
      // A single-block trend isn't meaningful per-row; show the year income/expense
      // trend of the SHARED structure isn't right either — use a bar fallback.
      if (data.length === 0) return null;
      const totalV = data.reduce((s, d) => s + d.value, 0);
      return (
        <div className="charts-container"><div className="chart-block">
          <ExpenseChart data={data} totalIncome={0} totalExpenses={totalV}
            style="bars" height={data.length * 44 + 20}
            money={money} currency={currency} totalLabel={t.blockTotal} />
        </div></div>
      );
    }
    if (data.length === 0) return null;
    const totalV = data.reduce((s, d) => s + d.value, 0);
    return (
      <div className="charts-container"><div className="chart-block">
        <ExpenseChart data={data} totalIncome={0} totalExpenses={totalV}
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
            <input type="color" value={r.color}
              onChange={e => onRecolorRow(block.id, r.id, e.target.value)} />
          </label>
          <InlineName className="cv3-row-name" value={r.name} editable
            placeholder={t.newRowName} onChange={(v) => onRenameRow(block.id, r.id, v)} />
          <AmountInput value={values[r.id] || 0} onChange={(v) => onSetAmount(r.id, v)} />
          {editing && (
            <button className="cv3-row-del" onClick={() => onDeleteRow(block.id, r.id)}
              title={t.removeSection} aria-label={t.removeSection}>✕</button>
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
      <BlockTitle block={block} editing={editing} onRename={onRename} placeholder={t.newBlockName} />
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
const BlockTitle = ({ block, editing, onRename, placeholder }: {
  block: CustomBlock; editing: boolean; onRename: (id: string, name: string) => void; placeholder: string;
}) => (
  <div className="cv3-title-row">
    <span className="cv3-title-icon" aria-hidden="true">{displayIcon(block)}</span>
    <InlineName className="custom-block-title" value={block.name}
      editable={editing} onChange={(v) => onRename(block.id, v)} placeholder={placeholder} />
  </div>
);

// Inline-editable text (block names AND row names are all renameable).
const InlineName = ({ value, editable, onChange, className, placeholder }: {
  value: string; editable: boolean; onChange: (v: string) => void; className?: string; placeholder?: string;
}) => {
  if (!editable) return <div className={className}>{value || placeholder}</div>;
  return (
    <input className={`cv3-name-input ${className ?? ''}`} value={value} placeholder={placeholder}
      onChange={e => onChange(e.target.value)} />
  );
};

// Amount entry — numeric, blank when zero, like the rest of the app.
const AmountInput = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => {
  const [draft, setDraft] = useState<string>(value ? String(value) : '');
  useEffect(() => { setDraft(value ? String(value) : ''); }, [value]);
  return (
    <input
      className="cv3-amount-input"
      inputMode="numeric"
      value={draft}
      placeholder="0"
      onChange={e => {
        const raw = e.target.value.replace(/[^\d]/g, '');
        setDraft(raw);
        onChange(raw ? parseInt(raw, 10) : 0);
      }}
    />
  );
};

// ── Add-block picker ──
const AddPicker = ({ onAddBlock, onAddSummary, onAddNote, onClose }: {
  onAddBlock: (tag: BlockTag) => void;
  onAddSummary: () => void;
  onAddNote: () => void;
  onClose: () => void;
}) => {
  const { t } = useLang();
  return (
    <div className="custom-modal-backdrop" onClick={onClose}>
      <div className="custom-modal" onClick={e => e.stopPropagation()} role="dialog">
        <div className="custom-modal-title">{t.addBlock}</div>
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
        <button className="custom-modal-close" onClick={onClose}>{t.cfgDone}</button>
      </div>
    </div>
  );
};

// ── Per-block settings panel ──
const CHART_TYPES: ExpenseChartStyle[] = ['donut', 'pie', 'bars', 'list', 'stacked', 'treemap', 'radial', 'trend'];

const ConfigPanel = ({ block, onChange, onClose, t }: {
  block: CustomBlock;
  onChange: (patch: Partial<CustomBlock>) => void;
  onClose: () => void;
  t: ReturnType<typeof useLang>['t'];
}) => {
  const isPhone = useIsPhone();
  const isNote = block.kind === 'note';
  const isRegular = block.kind === 'block';
  const chartTypeLabel: Record<ExpenseChartStyle, string> = {
    donut: t.chartStyleDonut, pie: t.chartStylePie, bars: t.chartStyleBars,
    list: t.chartStyleList, stacked: t.chartStyleStacked, treemap: t.chartStyleTreemap,
    radial: t.chartStyleRadial, trend: t.chartStyleTrend,
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
      <div className="custom-modal custom-config" onClick={e => e.stopPropagation()} role="dialog">
        <div className="custom-modal-title">{tagEmoji(block)} {block.name} — {t.sectionSettings}</div>

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
            <input className="cv3-amount-input cfg-target-input" inputMode="numeric"
              value={block.target ? String(block.target) : ''} placeholder="0"
              onChange={e => {
                const raw = e.target.value.replace(/[^\d]/g, '');
                onChange({ target: raw ? parseInt(raw, 10) : undefined });
              }} />
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
