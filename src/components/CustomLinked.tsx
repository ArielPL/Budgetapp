import { useState, useEffect, useRef, useMemo, type ReactNode } from 'react';
import type { BudgetCategory, BudgetRow, MonthData, SavingsGoal } from '../types';
import { useLang, MONTHS } from '../i18n';
import { useIsPhone } from '../useIsPhone';
import { useModalFocus } from '../useModalFocus';
import { appStorage } from '../storage';
import { safeSetItem } from '../storageWrite';
import { captureKeys, type UndoEntry } from '../undo';
import { shownName, loadMonthData, generateId, createCategory, CATEGORY_PALETTE, CATEGORY_ICONS } from '../defaults';
import { loadActuals, INCOME_ACTUAL_ID } from '../actuals';
import type { PeriodLocks } from '../periodLabel';
import { hasBudgetContent } from '../monthContent';
import { sumRows } from '../metrics';
import { CUSTOM_LINKED_KEY } from '../customMode';
import {
  defaultLinkedLayout, loadLinkedLayout, linkedSummary, newLinkedBlock, sameSource, isInsight, SAVINGS_CATEGORY,
  type LinkedBlock, type LinkedSource, type InsightSource,
} from '../customLinked';
import {
  BlockContent, ConfigPanel, bgStyle, displayIcon, widthLabel, inSentence, paletteColor,
  noteTextFor, withNoteText, withNoteScope, CustomHelp,
  type CustomBlock, type BlockWidth,
} from './CustomV3';
import { InsightContent } from './LinkedInsights';
import { QuickEntry } from './QuickEntry';

// ── Custom, linked to the regular budget ────────────────────────────────────
//
// A layout, not a budget. Each block POINTS at a part of the regular budget —
// its income, one of its categories — and every amount shown or typed here is
// that budget's own, in budget_<year>_<month>. Nothing is copied, so there is
// never a second figure that could disagree with the first, and Follow-up,
// Savings, Plan and Year describe exactly what these blocks show.
//
// Every change to a row goes through the SAME handlers the regular budget tab
// uses (setIncome / setExpenseCategory in App.tsx). Those carry the undo for a
// deleted row and the goal ↔ savings-row link; a second path here would have
// had to repeat both, and would one day have forgotten one.
//
// What the panel owns is only presentation: which parts are shown, in what
// order, width, colour, emoji, chart, target, and its notes.

interface Props {
  year: number;
  month: number;
  /** The regular budget's month on screen — App's own state, not a copy. */
  data: MonthData;
  onSetIncome: (rows: BudgetRow[]) => void;
  onSetCategory: (category: BudgetCategory) => void;
  /** A new category in this month's budget — the regular budget tab is not on
   *  screen in linked mode, so this is the only place one can be created. */
  onAddCategory: (category: BudgetCategory) => void;
  /** Plan's goals, and the pay period — for the goal and per-day blocks. */
  goals: SavingsGoal[];
  periodStartDay: number | null;
  periodLocks: PeriodLocks;
  /** The regular budget's "pull last month", with its own confirm and undo. */
  onCopyPrev: () => void;
  onStartOver: () => void;
  onSaveFailed: () => void;
  onRecordUndo: (entry: UndoEntry) => void;
}

export const CustomLinked = ({
  year, month, data, onSetIncome, onSetCategory, onAddCategory, goals, periodStartDay, periodLocks,
  onCopyPrev, onStartOver, onSaveFailed, onRecordUndo,
}: Props) => {
  const { t, lang, money, currency } = useLang();
  const isPhone = useIsPhone();

  const [layout, setLayout] = useState<LinkedBlock[]>(() => loadLinkedLayout() ?? defaultLinkedLayout(data));
  // Same identity rule as the standalone structure: the layout as loaded is not
  // written back just because the page was opened.
  const loadedLayout = useRef(layout);
  useEffect(() => {
    if (layout === loadedLayout.current && appStorage.getItem(CUSTOM_LINKED_KEY) !== null) return;
    if (!safeSetItem(appStorage, CUSTOM_LINKED_KEY, JSON.stringify(layout))) onSaveFailed();
  }, [layout, onSaveFailed]);

  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [configFor, setConfigFor] = useState<string | null>(null);
  const [expandedFor, setExpandedFor] = useState<string | null>(null);
  const expandRef = useRef<HTMLDivElement>(null);
  useModalFocus(expandRef, expandedFor !== null, () => setExpandedFor(null));
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useModalFocus(menuRef, menuOpen, () => setMenuOpen(false));
  const [quickOpen, setQuickOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // This budget month's transactions, for outcome blocks. Read once per month:
  // they change only in Follow-up, and leaving this tab remounts the panel.
  const entries = useMemo(() => loadActuals(appStorage, year, month), [year, month]);

  const prevYear = month === 0 ? year - 1 : year;
  const prevMonth = month === 0 ? 11 : month - 1;
  // Read-only: comparing against last month must never write it.
  const prevData = useMemo(() => loadMonthData(prevYear, prevMonth, lang), [prevYear, prevMonth, lang]);
  const monthName = MONTHS[lang][month];
  const monthLabel = `${inSentence(monthName, lang)} ${year}`;

  // ── The regular budget, seen as blocks ──
  const categoryOf = (d: MonthData, id: string) => d.expenses.find(c => c.id === id);
  const hasSource = (d: MonthData, s: LinkedSource) =>
    s.kind === 'category' ? categoryOf(d, s.id) !== undefined
      : s.kind === 'income' ? d.income.length > 0
        : hasBudgetContent(d);

  /** A block the shared renderer understands, or null when this month has no
   *  such category. Rows keep the budget's own ids, so an amount typed here is
   *  written to exactly that row. */
  const toBlock = (lb: LinkedBlock): CustomBlock | null => {
    const common = {
      id: lb.id, width: lb.width, bg: lb.bg, chart: lb.chart, icon: lb.icon, target: lb.target, userNamed: true,
    };
    const rowsOf = (rows: BudgetRow[]) => rows.map((r, i) => ({
      id: r.id, name: shownName(r, lang), color: paletteColor(i), userNamed: true,
    }));
    switch (lb.source.kind) {
      case 'income':
        return { ...common, kind: 'block', tag: 'in', name: lb.name ?? t.income, rows: rowsOf(data.income) };
      case 'category': {
        const cat = categoryOf(data, lb.source.id);
        if (!cat) return null;
        return {
          ...common, kind: 'block', tag: cat.id === SAVINGS_CATEGORY ? 'save' : 'out',
          name: shownName(cat, lang), icon: lb.icon ?? cat.icon, rows: rowsOf(cat.rows),
        };
      }
      case 'summary':
        return { ...common, kind: 'summary', tag: 'in', name: lb.name ?? t.summaryBlock, rows: [] };
      case 'note':
        return {
          ...common, kind: 'note', tag: 'in', name: lb.name ?? t.newNoteName, rows: [],
          text: lb.text, noteScope: lb.noteScope, monthText: lb.monthText,
        };
      // Rendered by InsightContent, not by the block renderer.
      case 'actual':
      case 'goal':
      case 'kpi':
        return null;
    }
  };

  const values = useMemo(() => {
    const out: Record<string, number> = {};
    for (const r of data.income) out[r.id] = r.amount;
    for (const c of data.expenses) for (const r of c.rows) out[r.id] = r.amount;
    return out;
  }, [data]);
  const summary = linkedSummary(data);
  const prevSummary = linkedSummary(prevData);
  const totalOf = (d: MonthData, s: LinkedSource) =>
    s.kind === 'income' ? sumRows(d.income)
      : s.kind === 'category' ? sumRows(categoryOf(d, s.id)?.rows ?? [])
        : 0;

  const monthRecorded = hasBudgetContent(data);
  const prevRecorded = hasBudgetContent(prevData);

  // ── Writes to the regular budget ──
  const patchLayout = (id: string, patch: Partial<LinkedBlock>) =>
    setLayout(prev => prev.map(b => (b.id === id ? { ...b, ...patch } : b)));
  const sourceOf = (id: string) => layout.find(b => b.id === id)?.source;

  const updateRows = (blockId: string, change: (rows: BudgetRow[]) => BudgetRow[]) => {
    const s = sourceOf(blockId);
    if (s?.kind === 'income') onSetIncome(change(data.income));
    if (s?.kind === 'category') {
      const cat = categoryOf(data, s.id);
      if (cat) onSetCategory({ ...cat, rows: change(cat.rows) });
    }
  };

  const setAmount = (rowId: string, amount: number) => {
    if (data.income.some(r => r.id === rowId)) {
      onSetIncome(data.income.map(r => (r.id === rowId ? { ...r, amount } : r)));
      return;
    }
    const cat = data.expenses.find(c => c.rows.some(r => r.id === rowId));
    if (cat) onSetCategory({ ...cat, rows: cat.rows.map(r => (r.id === rowId ? { ...r, amount } : r)) });
  };
  const renameRow = (blockId: string, rowId: string, label: string) =>
    updateRows(blockId, rows => rows.map(r => (r.id === rowId ? { ...r, label, userNamed: true } : r)));
  const deleteRow = (blockId: string, rowId: string) =>
    updateRows(blockId, rows => rows.filter(r => r.id !== rowId));
  const addRow = (blockId: string) =>
    updateRows(blockId, rows => [...rows, { id: generateId(), label: t.newRow, amount: 0, isCustom: true }]);

  // A category's name is the budget's; everything else's is the panel's.
  const renameBlock = (id: string, name: string) => {
    const s = sourceOf(id);
    if (s?.kind === 'category') {
      const cat = categoryOf(data, s.id);
      if (cat) onSetCategory({ ...cat, name, userNamed: true });
      patchLayout(id, { name });
      return;
    }
    patchLayout(id, { name });
  };

  const noteFields = (b: CustomBlock) => ({ text: b.text, noteScope: b.noteScope, monthText: b.monthText });
  const setNoteText = (id: string, text: string) => {
    const lb = layout.find(b => b.id === id);
    const block = lb && toBlock(lb);
    if (block) patchLayout(id, noteFields(withNoteText(block, year, month, text)));
  };
  const setNoteScope = (id: string, scope: 'month' | 'all') => {
    const lb = layout.find(b => b.id === id);
    const block = lb && toBlock(lb);
    if (block) patchLayout(id, noteFields(withNoteScope(block, scope, year, month)));
  };

  // ── Layout ──
  const move = (id: string, dir: -1 | 1) => setLayout(prev => {
    const i = prev.findIndex(b => b.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= prev.length) return prev;
    const next = [...prev];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  // Removing a block hides a part of the budget from this panel; the budget
  // itself is untouched. A note's text lives only here, so its removal can be
  // taken back.
  const removeBlock = (id: string) => {
    const lb = layout.find(b => b.id === id);
    if (lb?.source.kind === 'note' && (lb.text || lb.monthText)) {
      onRecordUndo({
        at: new Date().toISOString(), action: 'deleteBlock', count: 1,
        changes: captureKeys(appStorage, [CUSTOM_LINKED_KEY]),
      });
    }
    setLayout(prev => prev.filter(b => b.id !== id));
  };
  const addBlock = (source: LinkedSource) => {
    // The name as it is now, so a month without it can still say which it was.
    const name = source.kind === 'category' || (source.kind === 'actual' && source.id !== INCOME_ACTUAL_ID)
      ? categoryOf(data, source.id)?.name
      : source.kind === 'goal' ? goals.find(g => g.id === source.id)?.name : undefined;
    const extra: Partial<LinkedBlock> = source.kind === 'note' ? { noteScope: 'month' } : { name };
    setLayout(prev => [...prev, newLinkedBlock(source, extra)]);
    setPicking(false);
  };
  /** A new category in THIS month's budget, the way the budget tab makes one,
   *  shown on the panel straight away. */
  const addCategory = () => {
    const n = data.expenses.length;
    const cat = createCategory(t.newCategory, CATEGORY_ICONS[n % CATEGORY_ICONS.length],
      CATEGORY_PALETTE[n % CATEGORY_PALETTE.length], t.newRow);
    onAddCategory(cat);
    addBlock({ kind: 'category', id: cat.id });
  };

  const shown = (s: LinkedSource) => layout.some(b => sameSource(b.source, s));

  const cfgLinked = configFor ? layout.find(b => b.id === configFor) : undefined;
  const cfgBlock = cfgLinked ? toBlock(cfgLinked) : null;
  const expandedLinked = expandedFor ? layout.find(b => b.id === expandedFor) : undefined;
  const expandedBlock = expandedLinked ? toBlock(expandedLinked) : null;

  const content = (lb: LinkedBlock, b: CustomBlock) => {
    const recorded = hasSource(data, lb.source);
    return (
      <BlockContent
        block={b} total={totalOf(data, lb.source)} prevTotal={totalOf(prevData, lb.source)}
        prevRemaining={prevSummary.remaining}
        recorded={recorded} showDelta={recorded && hasSource(prevData, lb.source)}
        summary={summary} values={values} editing={editing}
        onRename={renameBlock} onRenameRow={renameRow} onDeleteRow={deleteRow}
        onRecolorRow={() => {}} canRecolor={false}
        onAddRow={addRow} onSetAmount={setAmount} onSetNote={setNoteText}
        noteText={noteTextFor(b, year, month)}
        noteScopeLabel={b.noteScope === 'month' ? t.noteScopeMonth(monthLabel) : t.noteScopeAll}
        money={money} currency={currency} t={t}
      />
    );
  };

  const insightName = (src: LinkedSource) =>
    src.kind === 'kpi' ? (src.metric === 'largest' ? t.kpiLargest : t.dailyBudgetTitle)
      : src.kind === 'actual' && src.id === INCOME_ACTUAL_ID ? t.income : '';

  const editToggle = (
    <button className={`custom-edit-btn${editing ? ' custom-edit-active' : ''}`}
      onClick={() => { setMenuOpen(false); setEditing(e => !e); }}>
      {editing ? `✓ ${t.cfgDone}` : `✎ ${t.editLayout}`}
    </button>
  );

  return (
    <div className="custom-canvas">
      <div className="custom-page">
        <h2 className="sr-only">{t.layoutCustom}</h2>
        <div className="custom-toolbar">
          {!isPhone && <>
            <button className="custom-edit-btn" onClick={() => setHelpOpen(true)} title={t.howItWorks}>
              ❔ {t.howItWorks}
            </button>
            <button className="custom-edit-btn" onClick={onCopyPrev} title={t.copyLastMonth}>
              📋 {t.copyLastMonth}
            </button>
            <button className="custom-edit-btn" onClick={() => setQuickOpen(true)}>⚡ {t.quickEntry}</button>
            {editToggle}
            {editing && (
              <button className="custom-edit-btn custom-reset-btn" onClick={onStartOver}>↺ {t.startOver}</button>
            )}
          </>}
          {isPhone && <>
            {editToggle}
            <button className="custom-edit-btn custom-more-btn" onClick={() => setMenuOpen(true)}
              aria-haspopup="menu" aria-expanded={menuOpen} aria-label={t.moreActions}
              title={t.moreActions}>•••</button>
            {menuOpen && (
              <div ref={menuRef} className="custom-menu-layer">
                <div className="custom-menu-backdrop" onClick={() => setMenuOpen(false)} />
                <div className="custom-menu" role="menu" aria-label={t.moreActions}>
                  <button role="menuitem" className="custom-menu-item"
                    onClick={() => { setMenuOpen(false); setQuickOpen(true); }}>
                    ⚡ {t.quickEntry}
                  </button>
                  <button role="menuitem" className="custom-menu-item"
                    onClick={() => { setMenuOpen(false); setHelpOpen(true); }}>
                    ❔ {t.howItWorks}
                  </button>
                  <button role="menuitem" className="custom-menu-item"
                    onClick={() => { setMenuOpen(false); onCopyPrev(); }}>
                    📋 {t.copyLastMonth}
                  </button>
                  {editing && (
                    <button role="menuitem" className="custom-menu-item custom-menu-danger"
                      onClick={() => { setMenuOpen(false); onStartOver(); }}>
                      ↺ {t.startOver}
                    </button>
                  )}
                </div>
              </div>
            )}
          </>}
        </div>

        <p className="custom-standalone-note">{t.customLinkedNote}</p>

        {!monthRecorded && prevRecorded && (
          <div className="custom-month-empty" role="status">
            <span>{t.customMonthEmpty(monthName)}</span>
            <button className="custom-primary-btn" onClick={onCopyPrev}>
              📋 {t.customCopyFrom(inSentence(MONTHS[lang][prevMonth], lang))}
            </button>
          </div>
        )}

        {layout.map((lb, index) => {
          const b = toBlock(lb);
          const insight = isInsight(lb.source);
          const asTile = isPhone && !editing && b !== null;
          const controlsName = b ? b.name : (lb.name ?? insightName(lb.source));
          return (
            <section key={lb.id}
              className={`custom-section w-${lb.width}${editing ? ' custom-section-editing' : ''}${asTile ? ' custom-section-tile' : ''}`}
              style={bgStyle(lb.bg)}>
              {editing && (
                <div className="custom-section-controls">
                  <div className="custom-width-toggle" role="group" title={t.cfgWidth}>
                    {((isPhone ? ['full', 'half'] : ['full', 'half', 'third']) as BlockWidth[]).map(w => (
                      <button key={w}
                        className={`width-seg${(lb.width === w || (isPhone && w === 'half' && lb.width === 'third')) ? ' width-active' : ''}`}
                        onClick={() => patchLayout(lb.id, { width: w })}
                        title={widthLabel(w, t)} aria-label={widthLabel(w, t)}>
                        {w === 'full' ? '▭' : w === 'half' ? '◧' : '⅓'}
                      </button>
                    ))}
                  </div>
                  <button className="custom-icon-btn" onClick={() => move(lb.id, -1)} disabled={index === 0}
                    title={t.moveUp} aria-label={t.moveUp}>↑</button>
                  <button className="custom-icon-btn" onClick={() => move(lb.id, 1)} disabled={index === layout.length - 1}
                    title={t.moveDown} aria-label={t.moveDown}>↓</button>
                  {b && (
                    <button className="custom-icon-btn" onClick={() => setConfigFor(lb.id)}
                      title={t.sectionSettings} aria-label={t.sectionSettings}>⚙</button>
                  )}
                  <button className="custom-icon-btn custom-remove-btn" onClick={() => removeBlock(lb.id)}
                    title={t.linkedRemove} aria-label={t.ariaLinkedRemove(controlsName)}>✕</button>
                </div>
              )}

              {insight ? (
                <InsightContent source={lb.source as InsightSource}
                  fallbackName={lb.name} data={data} goals={goals} entries={entries}
                  year={year} month={month} monthLabel={monthLabel}
                  periodStartDay={periodStartDay} periodLocks={periodLocks} />
              ) : b === null ? (
                // This month's budget has no such category. Said, not hidden:
                // an empty space where "Transport" was would look like 0 kr.
                // In a month with no budget at all the callout above already
                // says why, so each block only shows the unknown mark.
                monthRecorded
                  ? <p className="cv3-linked-missing">{t.linkedMissing(lb.name ?? '', monthLabel)}</p>
                  : <p className="cv3-linked-missing">
                      {lb.name} <span className="amount-unknown" title={t.monthNotFilledHint}>–</span>
                    </p>
              ) : asTile ? (
                <button className="custom-tile-btn" onClick={() => setExpandedFor(lb.id)} title={b.name}>
                  <span className="custom-tile-head">
                    <span className="custom-tile-icon">{displayIcon(b)}</span>
                    <span className="custom-tile-title">{b.name}</span>
                  </span>
                  {b.kind === 'note' ? (
                    <span className="custom-tile-preview">{noteTextFor(b, year, month).split('\n')[0] || '—'}</span>
                  ) : hasSource(data, lb.source) ? (
                    <span className={`custom-tile-headline tone-${b.kind === 'summary' ? (summary.remaining >= 0 ? 'positive' : 'negative') : 'neutral'}`}>
                      {b.kind === 'summary'
                        ? `${summary.remaining >= 0 ? '+' : ''}${money(summary.remaining)}`
                        : money(totalOf(data, lb.source))}
                    </span>
                  ) : (
                    <span className="custom-tile-headline"><span className="amount-unknown" title={t.monthNotFilledHint}>–</span></span>
                  )}
                  {b.kind === 'summary' && <span className="custom-tile-sub">{t.summaryRemaining}</span>}
                </button>
              ) : content(lb, b)}
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

      {picking && (
        <LinkedPicker data={data} goals={goals} shown={shown} onAdd={addBlock} onAddCategory={addCategory}
          onClose={() => setPicking(false)} />
      )}

      {quickOpen && (
        // The whole month, not only the blocks on the panel: quick entry fills
        // in the budget, and a category left off the panel is still in it.
        <QuickEntry monthLabel={monthLabel} onSetAmount={setAmount} onClose={() => setQuickOpen(false)}
          groups={[
            { id: 'income', title: t.income, icon: '💵',
              rows: data.income.map(r => ({ id: r.id, name: shownName(r, lang), amount: r.amount })) },
            ...data.expenses.map(c => ({
              id: c.id, title: shownName(c, lang), icon: c.icon,
              rows: c.rows.map(r => ({ id: r.id, name: shownName(r, lang), amount: r.amount })),
            })),
          ]} />
      )}

      {helpOpen && (
        <CustomHelp t={t} onClose={() => setHelpOpen(false)} intro={t.customHelpLinkedIntro}
          items={t.customHelpLinked.map((item, i) => ({ ...item, icon: LINKED_HELP_ICONS[i] ?? '•' }))} />
      )}

      {cfgLinked && cfgBlock && (
        <ConfigPanel block={cfgBlock} linked
          onChange={(patch) => {
            // Only presentation is the panel's. A retag or a rename would claim
            // to change the budget from a settings dialog about looks.
            const { width, bg, icon, chart, target } = patch;
            const keep: Partial<LinkedBlock> = {};
            if ('width' in patch && width) keep.width = width;
            if ('bg' in patch) keep.bg = bg ?? null;
            if ('icon' in patch) keep.icon = icon;
            if ('chart' in patch && chart) keep.chart = chart;
            if ('target' in patch) keep.target = target;
            patchLayout(cfgLinked.id, keep);
          }}
          onSetNoteScope={(scope) => setNoteScope(cfgLinked.id, scope)} monthLabel={monthLabel}
          onClose={() => setConfigFor(null)} t={t} />
      )}

      {expandedLinked && expandedBlock && (
        <div className="custom-modal-backdrop" onClick={() => setExpandedFor(null)}>
          <div className="custom-modal custom-expand" onClick={e => e.stopPropagation()} role="dialog"
            aria-modal="true" aria-label={expandedBlock.name} ref={expandRef}>
            <div className="custom-expand-head" style={{ justifyContent: 'flex-end' }}>
              <button className="custom-icon-btn" onClick={() => setExpandedFor(null)}
                title={t.cfgDone} aria-label={t.cfgDone}>✕</button>
            </div>
            <div className="custom-expand-body">{content(expandedLinked, expandedBlock)}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const LINKED_HELP_ICONS = ['🔗', '⚡', '🧾', '🎯', '📊', '＋', '✎', '↺'];

// ── What can be added: the parts of the budget not on the panel yet ──
const LinkedPicker = ({ data, goals, shown, onAdd, onAddCategory, onClose }: {
  data: MonthData;
  goals: SavingsGoal[];
  shown: (s: LinkedSource) => boolean;
  onAdd: (s: LinkedSource) => void;
  onAddCategory: () => void;
  onClose: () => void;
}) => {
  const { t, lang } = useLang();
  const panelRef = useRef<HTMLDivElement>(null);
  useModalFocus(panelRef, true, onClose);
  type Option = { key: string; source: LinkedSource; emoji: string; label: string };
  const notShown = (options: Option[]) => options.filter(o => !shown(o.source));
  const fromBudget = notShown([
    { key: 'income', source: { kind: 'income' }, emoji: '💵', label: t.income },
    ...data.expenses.map(c => ({
      key: `c-${c.id}`, source: { kind: 'category', id: c.id } as LinkedSource, emoji: c.icon, label: shownName(c, lang),
    })),
  ]);
  const outcomes = notShown([
    { key: 'a-income', source: { kind: 'actual', id: INCOME_ACTUAL_ID }, emoji: '💵', label: t.income },
    ...data.expenses.filter(c => c.id !== SAVINGS_CATEGORY).map(c => ({
      key: `a-${c.id}`, source: { kind: 'actual', id: c.id } as LinkedSource, emoji: c.icon, label: shownName(c, lang),
    })),
  ]);
  const goalOptions = notShown(goals.map(g => ({
    key: `g-${g.id}`, source: { kind: 'goal', id: g.id } as LinkedSource, emoji: '🎯', label: shownName(g, lang),
  })));
  const figures = notShown([
    { key: 'k-largest', source: { kind: 'kpi', metric: 'largest' }, emoji: '🏆', label: t.kpiLargest },
    { key: 'k-perDay', source: { kind: 'kpi', metric: 'perDay' }, emoji: '💸', label: t.dailyBudgetTitle },
  ]);
  const other = notShown([
    { key: 'summary', source: { kind: 'summary' }, emoji: '📊', label: t.summaryBlock },
  ]).concat([{ key: 'note', source: { kind: 'note' }, emoji: '📝', label: t.addNote }]);

  const group = (id: string, heading: string, options: Option[], extra?: ReactNode, empty?: string) => (
    <>
      <h3 className={`custom-picker-heading${id === 'budget' ? '' : ' custom-picker-heading-next'}`}
        id={`linked-picker-${id}`}>{heading}</h3>
      {options.length === 0 && !extra ? (
        empty ? <p className="custom-picker-empty">{empty}</p> : null
      ) : (
        <div className="custom-picker-grid" role="group" aria-labelledby={`linked-picker-${id}`}>
          {options.map(o => (
            <button key={o.key} className="custom-picker-btn" onClick={() => onAdd(o.source)}>
              <span className="custom-picker-emoji">{o.emoji}</span><span>{o.label}</span>
            </button>
          ))}
          {extra}
        </div>
      )}
    </>
  );

  return (
    <div className="custom-modal-backdrop" onClick={onClose}>
      <div className="custom-modal" onClick={e => e.stopPropagation()} role="dialog"
        aria-modal="true" aria-labelledby="linked-picker-title" ref={panelRef}>
        <div className="custom-modal-title" id="linked-picker-title">{t.addBlock}</div>
        {group('budget', t.pickerFromBudget, fromBudget, (
          <button className="custom-picker-btn" onClick={onAddCategory}>
            <span className="custom-picker-emoji">＋</span><span>{t.pickerNewCategory}</span>
          </button>
        ))}
        {group('actual', t.pickerOutcome, outcomes, undefined, t.linkedAllShown)}
        {goals.length > 0 && group('goal', t.pickerGoals, goalOptions, undefined, t.linkedAllShown)}
        {group('kpi', t.pickerFigures, figures, undefined, t.linkedAllShown)}
        {group('other', t.pickerOther, other)}
        <button className="custom-modal-close" onClick={onClose}>{t.cfgDone}</button>
      </div>
    </div>
  );
};
