import { useState, useEffect, useRef } from 'react';
import { MonthNav } from './components/MonthNav';
import { MonthStrip } from './components/MonthStrip';
import { TabNav } from './components/TabNav';
import { IncomeSection } from './components/IncomeSection';
import { ExpenseCategory } from './components/ExpenseCategory';
import { SummaryCards } from './components/SummaryCards';
import { Charts } from './components/Charts';
import { SavingsTab } from './components/SavingsTab';
import { PlanTab } from './components/PlanTab';
import type { MonthData, BudgetCategory, BudgetRow, PlanData, ActiveTab } from './types';
import { loadMonthData, saveMonthData, loadPlanData, savePlanData, SWEDISH_MONTHS, defaultGivande } from './defaults';
import './index.css';

function App() {
  const now = new Date();
  const [year, setYear]       = useState(now.getFullYear());
  const [month, setMonth]     = useState(now.getMonth());
  const [activeTab, setActiveTab] = useState<ActiveTab>('budget');
  const [data, setData]       = useState<MonthData>(() => loadMonthData(now.getFullYear(), now.getMonth()));
  const [planData, setPlanData] = useState<PlanData>(() => loadPlanData());
  const [theme, setTheme]     = useState<'dark' | 'light'>(() =>
    (localStorage.getItem('budget_theme') as 'dark' | 'light') || 'dark'
  );

  // Copy menu
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const [copyMsg, setCopyMsg] = useState('');
  const copyRef = useRef<HTMLDivElement>(null);

  // ── Theme ─────────────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('budget_theme', theme);
  }, [theme]);

  // ── Persistence ───────────────────────────────────────────────────
  useEffect(() => {
    const monthData = loadMonthData(year, month);
    // Always sync givande rows from planData.giving (giving plan is consistent across months)
    const givandeIdx = monthData.expenses.findIndex(c => c.id === 'givande');
    if (givandeIdx !== -1) {
      monthData.expenses[givandeIdx].rows = planData.giving.map(r => ({ ...r }));
    } else {
      monthData.expenses.push(defaultGivande(planData.giving.map(r => ({ ...r }))));
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

  const showMsg = (msg: string) => {
    setCopyMsg(msg);
    setTimeout(() => setCopyMsg(''), 2200);
  };

  const copyToNextMonth = () => {
    const nextYear = month === 11 ? year + 1 : year;
    const nextMth  = month === 11 ? 0 : month + 1;
    saveMonthData(nextYear, nextMth, data);
    setCopyMenuOpen(false);
    showMsg(`✓ Kopierat till ${SWEDISH_MONTHS[nextMth]}`);
  };

  const copyToAllRemaining = () => {
    for (let m = month + 1; m <= 11; m++) saveMonthData(year, m, data);
    setCopyMenuOpen(false);
    showMsg(`✓ Kopierat till ${11 - month} månader`);
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

  // ── Also: when loading a new month, ensure linked budget rows exist ─
  // (in case goals were created before this feature existed)
  useEffect(() => {
    const sparandeIdx = data.expenses.findIndex(c => c.id === 'sparande');
    if (sparandeIdx === -1) return;
    const existingRowIds = new Set(data.expenses[sparandeIdx].rows.map(r => r.id));
    const missingRows = planData.goals.filter(
      g => g.budgetRowId && !existingRowIds.has(g.budgetRowId)
    );
    if (missingRows.length === 0) return;
    setData(d => ({
      ...d,
      expenses: d.expenses.map((c, i) =>
        i === sparandeIdx
          ? { ...c, rows: [...c.rows, ...missingRows.map(g => ({
              id: g.budgetRowId!,
              label: g.name,
              amount: 0,
              isCustom: true,
            }))] }
          : c
      ),
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]); // only run when month changes

  // ── Derived ───────────────────────────────────────────────────────
  const totalIncome   = data.income.reduce((s, r) => s + r.amount, 0);
  const totalExpenses = data.expenses.reduce(
    (s, cat) => s + cat.rows.reduce((cs, r) => cs + r.amount, 0), 0
  );

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-top">
          <MonthNav year={year} month={month} onPrev={prevMonth} onNext={nextMonth} />
        </div>
        <MonthStrip year={year} month={month} onSelect={setMonth} onYearChange={handleYearChange} />
        <div className="header-bottom">
          <TabNav active={activeTab} onChange={setActiveTab} />

          <div className="header-actions">
            {/* Theme toggle */}
            <button
              className="theme-btn"
              onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
              title={theme === 'dark' ? 'Byt till ljust tema' : 'Byt till mörkt tema'}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>

            {/* Copy budget */}
            <div className="copy-menu-wrap" ref={copyRef}>
              {copyMsg && <span className="copy-msg">{copyMsg}</span>}
              <button
                className="copy-btn"
                onClick={() => setCopyMenuOpen(o => !o)}
                title="Kopiera denna månads budget"
              >
                Kopiera budget {copyMenuOpen ? '▴' : '▾'}
              </button>
              {copyMenuOpen && (
                <div className="copy-dropdown">
                  <button onClick={copyToNextMonth}>
                    → Nästa månad ({SWEDISH_MONTHS[month === 11 ? 0 : month + 1]})
                  </button>
                  {month < 11 && (
                    <button onClick={copyToAllRemaining}>
                      → Alla återstående ({11 - month} månader)
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="app-main">
        {activeTab === 'budget' && (
          <>
            <SummaryCards totalIncome={totalIncome} totalExpenses={totalExpenses} year={year} month={month} />
            <div className="budget-grid">
              <div className="budget-left">
                <IncomeSection rows={data.income} onChange={setIncome} />
                {data.expenses.map(cat => (
                  <ExpenseCategory key={cat.id} category={cat} onChange={setExpenseCategory} />
                ))}
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
      </main>
    </div>
  );
}

export default App;
