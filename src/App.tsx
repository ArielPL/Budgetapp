import { useState, useEffect, useRef, type ChangeEvent } from 'react';
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
import { BackupBanner } from './components/BackupBanner';
import type { MonthData, BudgetCategory, BudgetRow, PlanData, ActiveTab } from './types';
import { loadMonthData, saveMonthData, loadPlanData, savePlanData, defaultGivande, createCategory, CATEGORY_PALETTE, CATEGORY_ICONS } from './defaults';
import { LanguageContext, translations, MONTHS, type Lang } from './i18n';
import './index.css';

const DAY_MS = 24 * 60 * 60 * 1000;
const BACKUP_STALE_DAYS = 30;
const BACKUP_SNOOZE_DAYS = 7;

// Decide whether the backup-reminder banner should appear on load.
function shouldShowBackupReminder(): boolean {
  // Only nag if there is real month data saved.
  let hasData = false;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && /^budget_\d{4}_\d+$/.test(key)) { hasData = true; break; }
  }
  if (!hasData) return false;

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
  const [theme, setTheme]     = useState<'dark' | 'light'>(() =>
    (localStorage.getItem('budget_theme') as 'dark' | 'light') || 'dark'
  );

  const t = translations[lang];

  // Copy menu
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const [copyMsg, setCopyMsg] = useState('');
  const copyRef = useRef<HTMLDivElement>(null);

  // Backup menu (export / import)
  const [backupMenuOpen, setBackupMenuOpen] = useState(false);
  const backupRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Backup reminder banner
  const [showBackupReminder, setShowBackupReminder] = useState(() => shouldShowBackupReminder());

  // ── Theme ─────────────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('budget_theme', theme);
  }, [theme]);

  // ── Language ──────────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem('budget_lang', lang);
  }, [lang]);

  // ── Persistence ───────────────────────────────────────────────────
  useEffect(() => {
    const monthData = loadMonthData(year, month, lang);
    // Always sync givande rows from planData.giving (giving plan is consistent across months)
    const givandeIdx = monthData.expenses.findIndex(c => c.id === 'givande');
    if (givandeIdx !== -1) {
      monthData.expenses[givandeIdx].rows = planData.giving.map(r => ({ ...r }));
    } else {
      monthData.expenses.push(defaultGivande(planData.giving.map(r => ({ ...r }))));
    }
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
    setData(monthData);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);
  useEffect(() => { saveMonthData(year, month, data); },   [data, year, month]);
  useEffect(() => { savePlanData(planData); },             [planData]);

  // ── Close copy menu on outside click ─────────────────────────────
  useEffect(() => {
    if (!copyMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!copyRef.current?.contains(e.target as Node)) setCopyMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [copyMenuOpen]);

  // ── Close backup menu on outside click ───────────────────────────
  useEffect(() => {
    if (!backupMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!backupRef.current?.contains(e.target as Node)) setBackupMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [backupMenuOpen]);

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
    setBackupMenuOpen(false);
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
    setCopyMenuOpen(false);
    showMsg(t.copiedTo(MONTHS[lang][nextMth]));
  };

  const copyToAllRemaining = () => {
    for (let m = month + 1; m <= 11; m++) saveMonthData(year, m, data);
    setCopyMenuOpen(false);
    showMsg(t.copiedToMonths(11 - month));
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
    // When givande rows change → directly update planData.giving (single source of truth)
    if (updatedCat.id === 'givande') {
      setPlanData(pd => ({ ...pd, giving: updatedCat.rows.map(r => ({ ...r })) }));
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
    // sparande/givande are protected (the component already hides delete for them).
    if (id === 'sparande' || id === 'givande') return;
    setData(d => ({ ...d, expenses: d.expenses.filter(c => c.id !== id) }));
  };

  // ── Savings ───────────────────────────────────────────────────────
  const setSavingsCategory = (cat: BudgetCategory) => {
    setData(d => ({ ...d, savings: d.savings.map(c => c.id === cat.id ? cat : c) }));
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

    // When giving rows change in Plan → mirror to Budget givande category
    if (newPlan.giving !== planData.giving) {
      setData(d => ({
        ...d,
        expenses: d.expenses.map(c =>
          c.id === 'givande'
            ? { ...c, rows: newPlan.giving.map(r => ({ ...r })) }
            : c
        ),
      }));
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

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
    <div className="app">
      <header className="app-header">
        <div className="header-top">
          <MonthNav year={year} month={month} onPrev={prevMonth} onNext={nextMonth} />
        </div>
        <MonthStrip year={year} month={month} onSelect={setMonth} onYearChange={handleYearChange} />
        <div className="header-bottom">
          <TabNav active={activeTab} onChange={setActiveTab} />

          <div className="header-actions">
            {/* Language toggle — shows the flag you'll switch TO */}
            <button
              className="lang-btn"
              onClick={() => setLang(l => l === 'sv' ? 'en' : 'sv')}
              title={lang === 'sv' ? t.switchToEnglish : t.switchToSwedish}
            >
              {lang === 'sv' ? '🇬🇧' : '🇸🇪'}
            </button>

            {/* Theme toggle */}
            <button
              className="theme-btn"
              onClick={() => setTheme(th => th === 'dark' ? 'light' : 'dark')}
              title={theme === 'dark' ? t.themeToLight : t.themeToDark}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>

            {/* Copy budget */}
            <div className="copy-menu-wrap" ref={copyRef}>
              {copyMsg && <span className="copy-msg">{copyMsg}</span>}
              <button
                className="copy-btn"
                onClick={() => setCopyMenuOpen(o => !o)}
                title={t.copyBudgetTitle}
              >
                {t.copyBudget} {copyMenuOpen ? '▴' : '▾'}
              </button>
              {copyMenuOpen && (
                <div className="copy-dropdown">
                  <button onClick={copyToNextMonth}>
                    → {t.copyNextMonth} ({MONTHS[lang][month === 11 ? 0 : month + 1]})
                  </button>
                  {month < 11 && (
                    <button onClick={copyToAllRemaining}>
                      → {t.copyAllRemaining(11 - month)}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Backup: export / import data */}
            <div className="copy-menu-wrap" ref={backupRef}>
              <button
                className="copy-btn"
                onClick={() => setBackupMenuOpen(o => !o)}
                title={t.backupTitle}
              >
                {t.backup} {backupMenuOpen ? '▴' : '▾'}
              </button>
              {backupMenuOpen && (
                <div className="copy-dropdown">
                  <button onClick={exportData}>{t.exportData}</button>
                  <button onClick={() => fileInputRef.current?.click()}>{t.importData}</button>
                </div>
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
        </div>
      </header>

      <main className="app-main">
        {showBackupReminder && (
          <BackupBanner onExport={exportData} onDismiss={dismissBackupReminder} />
        )}
        {activeTab === 'budget' && (
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
              </div>
              <div className="budget-right">
                <Charts categories={data.expenses} totalIncome={totalIncome} />
              </div>
            </div>
          </>
        )}

        {activeTab === 'savings' && (
          <SavingsTab
            categories={data.savings}
            onChange={setSavingsCategory}
            year={year}
            currentMonth={month}
          />
        )}

        {activeTab === 'plan' && (
          <PlanTab data={planData} onChange={handlePlanDataChange} />
        )}

        {activeTab === 'year' && (
          <YearTab year={year} />
        )}
      </main>
    </div>
    </LanguageContext.Provider>
  );
}

export default App;
