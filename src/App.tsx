import { useState, useEffect, useRef, useCallback, type ChangeEvent } from 'react';
import { MonthNav } from './components/MonthNav';
import { MonthStrip } from './components/MonthStrip';
import { TabNav } from './components/TabNav';
import { IncomeSection } from './components/IncomeSection';
import { ExpenseCategory } from './components/ExpenseCategory';
import { SummaryCards } from './components/SummaryCards';
import { Charts } from './components/Charts';
import { SavingsTab } from './components/SavingsTab';
import { PlanTab } from './components/PlanTab';
import { YearTab } from './components/YearTab';
import { CustomV3 } from './components/CustomV3';
import { BackupBanner } from './components/BackupBanner';
import { ThemePanel } from './components/ThemePanel';
import type { MonthData, BudgetCategory, BudgetRow, PlanData, SavingsGoal, ActiveTab } from './types';
import { loadMonthData, saveMonthData, loadPlanData, savePlanData, defaultMonthData, starterMonthData, createCategory, isProtectedCategory, CATEGORY_PALETTE, CATEGORY_ICONS } from './defaults';
import { LanguageContext, translations, MONTHS, formatMoney, type Lang, type Currency } from './i18n';
import {
  loadThemeState,
  resolveVars,
  applyVars,
  baseVars,
  LS_PALETTE,
  LS_MODE,
  LS_CUSTOM,
  type PaletteId,
  type Mode,
  type ThemeVars,
} from './themes';
import './index.css';

const DAY_MS = 24 * 60 * 60 * 1000;
const BACKUP_STALE_DAYS = 30;
const BACKUP_SNOOZE_DAYS = 7;

// Sum every amount in a month (income + expense rows + savings rows).
function monthTotal(raw: string): number {
  try {
    const m = JSON.parse(raw) as MonthData;
    let total = 0;
    for (const row of m.income ?? []) total += row.amount || 0;
    for (const cat of m.expenses ?? []) {
      for (const row of cat.rows ?? []) total += row.amount || 0;
    }
    for (const cat of m.savings ?? []) {
      for (const row of cat.rows ?? []) total += row.amount || 0;
    }
    return total;
  } catch {
    return 0;
  }
}

// True only if there are real, non-zero amounts worth backing up.
function hasMeaningfulData(): boolean {
  // Any month with a positive total counts as data.
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !/^budget_\d{4}_\d+$/.test(key)) continue;
    const raw = localStorage.getItem(key);
    if (raw && monthTotal(raw) > 0) return true;
  }

  // Plan goals or giving amounts also count as data.
  const planRaw = localStorage.getItem('budget_plan');
  if (planRaw) {
    try {
      const plan = JSON.parse(planRaw) as PlanData;
      const goalsHaveData = (plan.goals ?? []).some(
        (g: SavingsGoal) => (g.currentAmount || 0) > 0 || (g.targetAmount || 0) > 0,
      );
      if (goalsHaveData) return true;
    } catch {
      /* malformed plan JSON → ignore */
    }
  }

  return false;
}

// Decide whether the backup-reminder banner should appear on load.
function shouldShowBackupReminder(): boolean {
  // Only nag if there is real, non-zero data worth backing up.
  if (!hasMeaningfulData()) return false;

  const now = Date.now();

  // Snoozed recently → stay hidden.
  const dismissed = localStorage.getItem('budget_backup_dismissed');
  if (dismissed) {
    const dismissedAt = Date.parse(dismissed);
    if (!isNaN(dismissedAt) && now - dismissedAt < BACKUP_SNOOZE_DAYS * DAY_MS) return false;
  }

  // Never backed up, or last backup older than the stale threshold → show.
  const lastBackup = localStorage.getItem('budget_last_backup');
  if (!lastBackup) return true;
  const lastAt = Date.parse(lastBackup);
  if (isNaN(lastAt)) return true;
  return now - lastAt >= BACKUP_STALE_DAYS * DAY_MS;
}

function App() {
  const now = new Date();
  const [lang, setLang]       = useState<Lang>(() =>
    (localStorage.getItem('budget_lang') as Lang) || 'sv'
  );
  const [year, setYear]       = useState(now.getFullYear());
  const [month, setMonth]     = useState(now.getMonth());
  const [activeTab, setActiveTab] = useState<ActiveTab>('budget');
  const [data, setData]       = useState<MonthData>(() => loadMonthData(now.getFullYear(), now.getMonth(), lang));
  const [planData, setPlanData] = useState<PlanData>(() => loadPlanData(lang));
  // ── Theme Builder: palette family + light/dark mode + override map ──
  const initialTheme = useRef(loadThemeState());
  const [themePalette, setThemePalette] = useState<PaletteId>(initialTheme.current.palette);
  const [themeMode, setThemeMode] = useState<Mode>(initialTheme.current.mode);
  const [themeCustom, setThemeCustom] = useState<ThemeVars>(initialTheme.current.custom);
  const [themePanelOpen, setThemePanelOpen] = useState(false);
  const [currency, setCurrency] = useState<Currency>(() =>
    (localStorage.getItem('budget_currency') as Currency) || 'sek'
  );
  // App layout: 'classic' (tabbed), 'combined' (all tabs on one page), or
  // 'custom' (card-level build-your-own dashboard).
  const [layout, setLayout] = useState<'classic' | 'combined' | 'custom'>(() => {
    const v = localStorage.getItem('budget_layout');
    return v === 'combined' || v === 'custom' ? v : 'classic';
  });

  const t = translations[lang];
  // Format an amount with the active currency (symbol/format only — no conversion).
  const money = useCallback((amount: number) => formatMoney(amount, currency), [currency]);

  // Single utilities menu (language, theme, copy budget, data export/import)
  const [menuOpen, setMenuOpen] = useState(false);
  const [copyMsg, setCopyMsg] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tap-to-open month picker (the 12-month strip)
  const [pickerOpen, setPickerOpen] = useState(false);

  // Backup reminder banner
  const [showBackupReminder, setShowBackupReminder] = useState(() => shouldShowBackupReminder());

  // Guard: skip the save effect on the render where a month was just loaded.
  // Without this, switching months runs the save effect with the NEW month/year
  // but the OLD `data` still in scope (load's setData hasn't applied yet),
  // writing the previous month's amounts into the new month's key (data bleed).
  const skipNextSave = useRef(false);

  // ── Theme ─────────────────────────────────────────────────────────
  // Apply the active theme (palette family + mode + any custom overrides) to
  // :root and persist palette / mode / override map. main.tsx already applied
  // the saved theme before first paint; this keeps :root in sync on changes.
  useEffect(() => {
    const state = { palette: themePalette, mode: themeMode, custom: themeCustom };
    applyVars(resolveVars(state), themeMode);
    localStorage.setItem(LS_PALETTE, themePalette);
    localStorage.setItem(LS_MODE, themeMode);
    if (themePalette === 'custom') {
      localStorage.setItem(LS_CUSTOM, JSON.stringify(themeCustom));
    } else {
      localStorage.removeItem(LS_CUSTOM);
    }
  }, [themePalette, themeMode, themeCustom]);

  // Selecting a palette family replaces the whole palette and clears overrides
  // (keeps the current light/dark mode).
  const selectPalette = useCallback((palette: Exclude<PaletteId, 'custom'>) => {
    setThemeCustom({});
    setThemePalette(palette);
  }, []);

  // Light/Dark toggle. Switching mode clears overrides (they were tuned to the
  // previous mode's base) and, if on custom, returns to Sorbet of the new mode.
  const setMode = useCallback((mode: Mode) => {
    setThemeMode(mode);
    setThemeCustom({});
    setThemePalette((p) => (p === 'custom' ? 'sorbet' : p));
  }, []);

  // Changing the accent updates only --accent-brand (+ -strong), keeping the
  // rest of the chosen palette. This flips to 'custom' and stores the override.
  const setAccent = useCallback((value: string) => {
    setThemeCustom((prev) => ({
      ...prev,
      '--accent-brand': value,
      '--accent-brand-strong': value,
    }));
    setThemePalette((p) => (p === 'custom' ? p : 'custom'));
  }, []);

  // Overriding any individual color flips to 'custom' and stores the var.
  const overrideColor = useCallback((cssVar: string, value: string) => {
    setThemeCustom((prev) => ({ ...prev, [cssVar]: value }));
    setThemePalette((p) => (p === 'custom' ? p : 'custom'));
  }, []);

  // Reset: clear all overrides and re-apply the active palette/mode cleanly.
  // If we were on 'custom', fall back to Sorbet (custom has no own base).
  const resetTheme = useCallback(() => {
    setThemeCustom({});
    setThemePalette((p) => (p === 'custom' ? 'sorbet' : p));
  }, []);

  // The accent shown in the panel: custom override if set, else the active base.
  const activeAccent =
    themeCustom['--accent-brand'] ?? baseVars(themePalette, themeMode)['--accent-brand'];

  // ── Language ──────────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem('budget_lang', lang);
  }, [lang]);

  // ── Currency (symbol/format only — never converts amounts) ─────────
  useEffect(() => {
    localStorage.setItem('budget_currency', currency);
  }, [currency]);

  // ── Budget tab layout (classic / combined) ─────────────────────────
  useEffect(() => {
    localStorage.setItem('budget_layout', layout);
  }, [layout]);

  // ── Persistence ───────────────────────────────────────────────────
  useEffect(() => {
    const monthData = loadMonthData(year, month, lang);
    // Ensure linked budget rows exist for every goal (for goals created before
    // this month's data was saved). Operate on the freshly loaded monthData and
    // guard against duplicates so navigating between months can't append twice.
    const sparandeIdx = monthData.expenses.findIndex(c => c.id === 'sparande');
    if (sparandeIdx !== -1) {
      const existingRowIds = new Set(monthData.expenses[sparandeIdx].rows.map(r => r.id));
      const missingRows = planData.goals.filter(
        g => g.budgetRowId && !existingRowIds.has(g.budgetRowId)
      );
      if (missingRows.length > 0) {
        monthData.expenses[sparandeIdx].rows = [
          ...monthData.expenses[sparandeIdx].rows,
          ...missingRows.map(g => ({
            id: g.budgetRowId!,
            label: g.name,
            amount: 0,
            isCustom: true,
          })),
        ];
      }
    }
    // A month/year switch just loaded fresh data; the save effect will run in
    // this same commit (month/year changed) with the PREVIOUS `data` still in
    // scope. Skip that one save so we never write one month's data into another.
    skipNextSave.current = true;
    setData(monthData);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);
  useEffect(() => {
    if (skipNextSave.current) {
      // This run was triggered by a month/year switch, not a real edit — the
      // `data` in scope still belongs to the previous month. Don't persist it.
      skipNextSave.current = false;
      return;
    }
    saveMonthData(year, month, data);
  }, [data, year, month]);
  useEffect(() => { savePlanData(planData); },             [planData]);

  // ── Close utilities menu on outside click ────────────────────────
  useEffect(() => {
    if (!menuOpen) return;
    const mouseHandler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', mouseHandler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', mouseHandler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [menuOpen]);

  // ── Backup: export all budget_* keys to a JSON file ──────────────
  const exportData = () => {
    const dataObj: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('budget_')) {
        dataObj[key] = localStorage.getItem(key) ?? '';
      }
    }
    const payload = {
      app: 'budget',
      version: 1,
      exportedAt: new Date().toISOString(),
      data: dataObj,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `budget-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setMenuOpen(false);
    // Record the backup so the reminder banner stays hidden.
    localStorage.setItem('budget_last_backup', new Date().toISOString());
    setShowBackupReminder(false);
  };

  const dismissBackupReminder = () => {
    localStorage.setItem('budget_backup_dismissed', new Date().toISOString());
    setShowBackupReminder(false);
  };

  // ── Backup: import a JSON file and replace all data ──────────────
  const handleImportFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        const incoming = parsed?.data;
        const looksValid =
          incoming && typeof incoming === 'object' &&
          (parsed.app === 'budget' || Object.keys(incoming).some(k => k.startsWith('budget_')));
        if (!looksValid) {
          alert(t.importInvalid);
          return;
        }
        if (!window.confirm(t.importConfirm)) return;
        for (const [key, value] of Object.entries(incoming)) {
          localStorage.setItem(key, value as string);
        }
        location.reload();
      } catch {
        alert(t.importInvalid);
      }
    };
    reader.readAsText(file);
  };

  const showMsg = (msg: string) => {
    setCopyMsg(msg);
    setTimeout(() => setCopyMsg(''), 2200);
  };

  const copyToNextMonth = () => {
    const nextYear = month === 11 ? year + 1 : year;
    const nextMth  = month === 11 ? 0 : month + 1;
    saveMonthData(nextYear, nextMth, data);
    setMenuOpen(false);
    showMsg(t.copiedTo(MONTHS[lang][nextMth]));
  };

  const copyToAllRemaining = () => {
    for (let m = month + 1; m <= 11; m++) saveMonthData(year, m, data);
    setMenuOpen(false);
    showMsg(t.copiedToMonths(11 - month));
  };

  // Reset ONLY the currently-selected month back to fresh defaults, then re-add
  // any goal-linked rows so goal↔budget links survive (same backfill as the
  // month-load effect). The save effect persists this to the current month's key.
  const resetCurrentMonth = () => {
    if (!window.confirm(t.resetMonthConfirm)) return;
    const fresh = defaultMonthData(lang);
    const sparandeIdx = fresh.expenses.findIndex(c => c.id === 'sparande');
    if (sparandeIdx !== -1) {
      const existingRowIds = new Set(fresh.expenses[sparandeIdx].rows.map(r => r.id));
      const missingRows = planData.goals.filter(
        g => g.budgetRowId && !existingRowIds.has(g.budgetRowId)
      );
      if (missingRows.length > 0) {
        fresh.expenses[sparandeIdx].rows = [
          ...fresh.expenses[sparandeIdx].rows,
          ...missingRows.map(g => ({
            id: g.budgetRowId!,
            label: g.name,
            amount: 0,
            isCustom: true,
          })),
        ];
      }
    }
    setData(fresh);
    setMenuOpen(false);
    showMsg(t.resetMonthDone);
  };

  // ── Month navigation ──────────────────────────────────────────────
  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };
  const handleYearChange = (delta: number) => setYear(y => y + delta);

  // Picker: selecting a month collapses the strip.
  const selectMonth = (m: number) => { setMonth(m); setPickerOpen(false); };

  // ── Income ────────────────────────────────────────────────────────
  const setIncome = (rows: BudgetRow[]) => {
    setData(d => ({ ...d, income: rows }));
  };

  // ── Expenses — with goal↔budget sync ─────────────────────────────
  const setExpenseCategory = (updatedCat: BudgetCategory) => {
    // When "sparande" changes, sync both amount AND label back to the linked goal
    if (updatedCat.id === 'sparande') {
      const oldSparande = data.expenses.find(c => c.id === 'sparande');
      if (oldSparande) {
        let goalsChanged = false;
        const updatedGoals = planData.goals.map(goal => {
          if (!goal.budgetRowId) return goal;
          const oldRow = oldSparande.rows.find(r => r.id === goal.budgetRowId);
          const newRow = updatedCat.rows.find(r => r.id === goal.budgetRowId);
          if (!oldRow || !newRow) return goal;

          let updated = goal;

          // Sync amount (delta)
          if (newRow.amount !== oldRow.amount) {
            const delta = newRow.amount - oldRow.amount;
            updated = { ...updated, currentAmount: Math.max(0, updated.currentAmount + delta) };
            goalsChanged = true;
          }

          // Sync label → goal name (reverse sync: Budget row → Plan goal)
          if (newRow.label !== oldRow.label) {
            updated = { ...updated, name: newRow.label };
            goalsChanged = true;
          }

          return updated;
        });
        if (goalsChanged) setPlanData(pd => ({ ...pd, goals: updatedGoals }));
      }
    }

    setData(d => ({ ...d, expenses: d.expenses.map(c => c.id === updatedCat.id ? updatedCat : c) }));
  };

  // ── Custom categories (current month only) ───────────────────────
  const addExpenseCategory = () => {
    const existing = data.expenses.length;
    const color = CATEGORY_PALETTE[existing % CATEGORY_PALETTE.length];
    const icon = CATEGORY_ICONS[existing % CATEGORY_ICONS.length];
    const newCat = createCategory(t.newCategory, icon, color, t.newRow);
    setData(d => ({ ...d, expenses: [...d.expenses, newCat] }));
  };

  const deleteExpenseCategory = (id: string) => {
    // sparande is protected (the component already hides delete for it).
    if (id === 'sparande') return;
    setData(d => ({ ...d, expenses: d.expenses.filter(c => c.id !== id) }));
  };

  // ── Starter pack (escape hatch for the blank "from scratch" app) ──
  // Adds the old default category set as a template, appending only the
  // categories not already present so it never clobbers existing data.
  const addStarterBudget = () => {
    const starter = starterMonthData(lang);
    setData(d => {
      const haveExp = new Set(d.expenses.map(c => c.id));
      return {
        ...d,
        income: d.income.length === 0 ? starter.income : d.income,
        expenses: [...d.expenses, ...starter.expenses.filter(c => !haveExp.has(c.id))],
      };
    });
  };

  const addStarterSavings = () => {
    const starter = starterMonthData(lang);
    setData(d => {
      const haveSav = new Set(d.savings.map(c => c.id));
      return { ...d, savings: [...d.savings, ...starter.savings.filter(c => !haveSav.has(c.id))] };
    });
  };

  // ── Savings ───────────────────────────────────────────────────────
  const setSavingsCategory = (cat: BudgetCategory) => {
    setData(d => ({ ...d, savings: d.savings.map(c => c.id === cat.id ? cat : c) }));
  };

  const addSavingsCategory = () => {
    const existing = data.savings.length;
    const color = CATEGORY_PALETTE[existing % CATEGORY_PALETTE.length];
    const icon = CATEGORY_ICONS[existing % CATEGORY_ICONS.length];
    const newCat = createCategory(t.newCategory, icon, color, t.newRow);
    setData(d => ({ ...d, savings: [...d.savings, newCat] }));
  };

  const deleteSavingsCategory = (id: string) => {
    // The four default savings categories are protected.
    if (isProtectedCategory(id)) return;
    setData(d => ({ ...d, savings: d.savings.filter(c => c.id !== id) }));
  };

  // ── Plan — with goal↔budget sync ─────────────────────────────────
  const handlePlanDataChange = (newPlan: PlanData) => {
    const oldGoals   = planData.goals;
    const newGoals   = newPlan.goals;
    const oldGoalIds = new Set(oldGoals.map(g => g.id));
    const newGoalIds = new Set(newGoals.map(g => g.id));

    const sparandeIdx = data.expenses.findIndex(c => c.id === 'sparande');
    let rows = sparandeIdx !== -1 ? [...data.expenses[sparandeIdx].rows] : [];
    let rowsChanged = false;

    if (sparandeIdx !== -1) {
      // New goals → add budget row
      for (const g of newGoals) {
        if (!oldGoalIds.has(g.id) && g.budgetRowId) {
          rows = [...rows, { id: g.budgetRowId, label: g.name, amount: 0, isCustom: true }];
          rowsChanged = true;
        }
      }

      // Renamed goals → update budget row label
      for (const newGoal of newGoals) {
        if (!newGoal.budgetRowId) continue;
        const oldGoal = oldGoals.find(g => g.id === newGoal.id);
        if (oldGoal && oldGoal.name !== newGoal.name) {
          rows = rows.map(r => r.id === newGoal.budgetRowId ? { ...r, label: newGoal.name } : r);
          rowsChanged = true;
        }
      }

      // Deleted goals → remove budget row
      for (const oldGoal of oldGoals) {
        if (!newGoalIds.has(oldGoal.id) && oldGoal.budgetRowId) {
          rows = rows.filter(r => r.id !== oldGoal.budgetRowId);
          rowsChanged = true;
        }
      }

      if (rowsChanged) {
        setData(d => ({
          ...d,
          expenses: d.expenses.map((c, i) => i === sparandeIdx ? { ...c, rows } : c),
        }));
      }
    }

    setPlanData(newPlan);
  };

  // (Linked budget-row backfill is handled in the month-load effect above,
  //  on freshly loaded data, to avoid double-appending rows.)

  // ── Derived ───────────────────────────────────────────────────────
  const totalIncome   = data.income.reduce((s, r) => s + r.amount, 0);
  const totalExpenses = data.expenses.reduce(
    (s, cat) => s + cat.rows.reduce((cs, r) => cs + r.amount, 0), 0
  );
  const totalSavings = data.savings.reduce(
    (s, cat) => s + cat.rows.reduce((cs, r) => cs + r.amount, 0), 0
  );

  // ── Starter-pack buttons (shown only when the relevant list is empty) ──
  const budgetStarter = data.expenses.length === 0 ? (
    <button className="starter-pack-btn" onClick={addStarterBudget}>
      ✨ {t.addStarterCategories}
    </button>
  ) : null;
  const savingsStarter = data.savings.length === 0 ? (
    <button className="starter-pack-btn" onClick={addStarterSavings}>
      ✨ {t.addStarterCategories}
    </button>
  ) : null;

  // ── Tab views ─────────────────────────────────────────────────────
  // Each tab's content, rendered once and reused by both layouts: Classic
  // shows one at a time (tabbed); Combined stacks all four on one page.
  // Same components/data/handlers either way — no duplication.
  const budgetView = (
    <>
      <SummaryCards totalIncome={totalIncome} totalExpenses={totalExpenses} year={year} month={month} />
      <div className="budget-grid">
        <div className="budget-left">
          <IncomeSection rows={data.income} onChange={setIncome} />
          {data.expenses.map(cat => (
            <ExpenseCategory
              key={cat.id}
              category={cat}
              onChange={setExpenseCategory}
              onDelete={deleteExpenseCategory}
            />
          ))}
          <button className="add-category-btn" onClick={addExpenseCategory}>
            {t.addCategory}
          </button>
          {budgetStarter}
        </div>
        <div className="budget-right">
          <Charts categories={data.expenses} totalIncome={totalIncome} />
        </div>
      </div>
    </>
  );

  const savingsView = (
    <SavingsTab
      categories={data.savings}
      onChange={setSavingsCategory}
      onAddCategory={addSavingsCategory}
      onDeleteCategory={deleteSavingsCategory}
      year={year}
      currentMonth={month}
      starterSlot={savingsStarter}
    />
  );

  const planView = (
    <PlanTab
      data={planData}
      onChange={handlePlanDataChange}
      totalIncome={totalIncome}
      totalExpenses={totalExpenses}
      totalSavings={totalSavings}
      year={year}
      month={month}
    />
  );

  const yearView = <YearTab year={year} />;

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, currency, setCurrency, money }}>
    <div className="app">
      <header className="app-header">
        <div className="header-top">
          <MonthNav
            year={year}
            month={month}
            onPrev={prevMonth}
            onNext={nextMonth}
            pickerOpen={pickerOpen}
            onTogglePicker={() => setPickerOpen(o => !o)}
          />

          {/* Single utilities menu: language, theme, copy budget, data */}
          <div className="menu-wrap" ref={menuRef}>
            {copyMsg && <span className="copy-msg">{copyMsg}</span>}
            <button
              className={`menu-btn${menuOpen ? ' menu-btn-open' : ''}`}
              onClick={() => setMenuOpen(o => !o)}
              title={t.menuTitle}
              aria-haspopup="true"
              aria-expanded={menuOpen}
            >
              <span className="menu-btn-icon">⚙️</span>
              <span className="menu-btn-label">{t.menu}</span>
            </button>

            {menuOpen && (
              <>
                <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />
                <div className="utils-menu" role="menu">
                  <div className="utils-menu-drag-handle" aria-hidden="true" />
                  <div className="utils-menu-sheet-header">
                    <div className="utils-menu-sheet-title">{t.menu}</div>
                    <button
                      className="utils-menu-close-btn"
                      onClick={() => setMenuOpen(false)}
                      aria-label="Close menu"
                    >✕</button>
                  </div>

                  {/* Language */}
                  <div className="utils-row">
                    <span className="utils-row-label">{t.language}</span>
                    <div className="utils-seg">
                      <button
                        className={`seg-btn${lang === 'sv' ? ' seg-active' : ''}`}
                        onClick={() => setLang('sv')}
                      >
                        🇸🇪 SV
                      </button>
                      <button
                        className={`seg-btn${lang === 'en' ? ' seg-active' : ''}`}
                        onClick={() => setLang('en')}
                      >
                        🇬🇧 EN
                      </button>
                      <button
                        className={`seg-btn${lang === 'es' ? ' seg-active' : ''}`}
                        onClick={() => setLang('es')}
                      >
                        🇪🇸 ES
                      </button>
                    </div>
                  </div>

                  {/* Layout: classic (tabbed) / combined (one page) / custom (build-your-own) */}
                  <div className="utils-row utils-row-stack">
                    <span className="utils-row-label">{t.layout}</span>
                    <div className="utils-seg">
                      <button
                        className={`seg-btn${layout === 'classic' ? ' seg-active' : ''}`}
                        onClick={() => setLayout('classic')}
                      >
                        {t.layoutClassic}
                      </button>
                      <button
                        className={`seg-btn${layout === 'combined' ? ' seg-active' : ''}`}
                        onClick={() => setLayout('combined')}
                      >
                        {t.layoutCombined}
                      </button>
                      <button
                        className={`seg-btn${layout === 'custom' ? ' seg-active' : ''}`}
                        onClick={() => setLayout('custom')}
                      >
                        {t.layoutCustom}
                      </button>
                    </div>
                  </div>

                  {/* Currency (symbol/format only — amounts are never converted) */}
                  <div className="utils-row">
                    <span className="utils-row-label">{t.currency}</span>
                    <div className="utils-seg">
                      <button
                        className={`seg-btn${currency === 'sek' ? ' seg-active' : ''}`}
                        onClick={() => setCurrency('sek')}
                        title="Svenska kronor"
                      >
                        kr
                      </button>
                      <button
                        className={`seg-btn${currency === 'eur' ? ' seg-active' : ''}`}
                        onClick={() => setCurrency('eur')}
                        title="Euro"
                      >
                        €
                      </button>
                      <button
                        className={`seg-btn${currency === 'usd' ? ' seg-active' : ''}`}
                        onClick={() => setCurrency('usd')}
                        title="US Dollar"
                      >
                        $
                      </button>
                      <button
                        className={`seg-btn${currency === 'gbp' ? ' seg-active' : ''}`}
                        onClick={() => setCurrency('gbp')}
                        title="British Pound"
                      >
                        £
                      </button>
                    </div>
                  </div>
                  <div className="utils-hint">{t.currencyHint}</div>

                  {/* Theme — opens the Theme Builder panel */}
                  <button
                    className="utils-action"
                    onClick={() => {
                      setMenuOpen(false);
                      setThemePanelOpen(true);
                    }}
                  >
                    🎨 {t.theme}
                  </button>

                  <div className="utils-divider" />

                  {/* Copy budget */}
                  <div className="utils-group-label">{t.copyBudget}</div>
                  <button className="utils-action" onClick={copyToNextMonth}>
                    → {t.copyNextMonth} ({MONTHS[lang][month === 11 ? 0 : month + 1]})
                  </button>
                  {month < 11 && (
                    <button className="utils-action" onClick={copyToAllRemaining}>
                      → {t.copyAllRemaining(11 - month)}
                    </button>
                  )}

                  <div className="utils-divider" />

                  {/* Data */}
                  <div className="utils-group-label">{t.backup}</div>
                  <button className="utils-action" onClick={exportData}>{t.exportData}</button>
                  <button className="utils-action" onClick={() => fileInputRef.current?.click()}>
                    {t.importData}
                  </button>

                  <div className="utils-divider" />

                  {/* Reset current month (mild destructive action) */}
                  <button className="utils-action utils-action-danger" onClick={resetCurrentMonth}>
                    {t.resetMonth}
                  </button>
                </div>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={handleImportFile}
            />
          </div>
        </div>

        {pickerOpen && (
          <MonthStrip
            year={year}
            month={month}
            onSelect={selectMonth}
            onYearChange={handleYearChange}
          />
        )}

        {/* Combined mode is one continuous scrolling page, so the tab bar is
            hidden — the user scrolls through all sections instead. */}
        {layout === 'classic' && (
          <div className="header-bottom">
            <TabNav active={activeTab} onChange={setActiveTab} />
          </div>
        )}
      </header>

      {themePanelOpen && (
        <ThemePanel
          palette={themePalette}
          mode={themeMode}
          custom={themeCustom}
          accent={activeAccent}
          onSelectPalette={selectPalette}
          onSetMode={setMode}
          onSetAccent={setAccent}
          onOverride={overrideColor}
          onReset={resetTheme}
          onClose={() => setThemePanelOpen(false)}
        />
      )}

      <main className="app-main">
        {showBackupReminder && (
          <BackupBanner onExport={exportData} onDismiss={dismissBackupReminder} />
        )}
        {layout === 'classic' && (
          /* ── Classic: tabbed. key={activeTab} remounts on every switch so the
               lightweight CSS entrance animation (.tab-enter) replays each time. */
          <div className="tab-enter" key={activeTab}>
            {activeTab === 'budget' && budgetView}
            {activeTab === 'savings' && savingsView}
            {activeTab === 'plan' && planView}
            {activeTab === 'year' && yearView}
          </div>
        )}

        {layout === 'combined' && (
          /* ── Combined: tab bar hidden (see header), all four views stacked on
               one scrollable page. Same components/data/handlers as classic. */
          <div className="combined-page">
            <section className="combined-section">
              <h2 className="combined-section-title">{t.tabBudget}</h2>
              {budgetView}
            </section>
            <section className="combined-section">
              <h2 className="combined-section-title">{t.tabSavings}</h2>
              {savingsView}
            </section>
            <section className="combined-section">
              <h2 className="combined-section-title">{t.tabYear}</h2>
              {yearView}
            </section>
            <section className="combined-section">
              <h2 className="combined-section-title">{t.tabPlan}</h2>
              {planView}
            </section>
          </div>
        )}

        {layout === 'custom' && (
          /* ── Custom v3: generic build-from-scratch block budget with its OWN
               separate data (never touches the shared Classic/Combined budget).
               Tab bar hidden; the global month selector drives its per-month
               amounts. */
          <CustomV3 year={year} month={month} />
        )}
      </main>
    </div>
    </LanguageContext.Provider>
  );
}

export default App;
