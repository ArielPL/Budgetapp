import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense, type ChangeEvent } from 'react';
import { MonthNav } from './components/MonthNav';
import { MonthStrip } from './components/MonthStrip';
import { TabNav } from './components/TabNav';
import { IncomeSection } from './components/IncomeSection';
import { ExpenseCategory } from './components/ExpenseCategory';
import { SummaryCards } from './components/SummaryCards';
import { DailyBudget } from './components/DailyBudget';
import { BackupBanner } from './components/BackupBanner';

// ── Code-split the chart-heavy views (stress test §12) ──
// Recharts is ~half the bundle, and these five components are the only paths
// to it — loading them on demand keeps the first paint (the Budget entry
// view) free of chart code. Each Suspense fallback reserves the region's
// height so the swap-in doesn't shift the layout.
const Charts = lazy(() => import('./components/Charts').then(m => ({ default: m.Charts })));
const SavingsTab = lazy(() => import('./components/SavingsTab').then(m => ({ default: m.SavingsTab })));
const PlanTab = lazy(() => import('./components/PlanTab').then(m => ({ default: m.PlanTab })));
const YearTab = lazy(() => import('./components/YearTab').then(m => ({ default: m.YearTab })));
const CustomV3 = lazy(() => import('./components/CustomV3').then(m => ({ default: m.CustomV3 })));
const lazyFallback = <div className="lazy-fallback" aria-hidden="true" />;
import { ThemePanel } from './components/ThemePanel';
import { WhatsNew } from './components/WhatsNew';
import { LATEST_VERSION } from './changelog';
import type { MonthData, BudgetCategory, BudgetRow, PlanData, SavingsGoal, ActiveTab } from './types';
import { shownName, loadMonthData, saveMonthData, loadPlanData, savePlanData, defaultMonthData, starterMonthData, createCategory, isProtectedCategory, ensureGoalLinkedBudgetRows, isHistoricMonth, runHistoricGoalRowMigration, storageKey, CATEGORY_PALETTE, CATEGORY_ICONS } from './defaults';
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
import { calculateBudgetMetrics, calculateSavingsMetrics, savedThisMonth, categoryTotal } from './metrics';
import { InsightLine } from './components/InsightLine';
import { savingsStreakFrom } from './insight';
import { buildBackup, backupFilename, checkBackup, applyBackup, importErrorText } from './backup';
import { useModalFocus } from './useModalFocus';
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
  // Loaded once via a lazy useState (never re-read; reading a ref during render
  // is disallowed by react-hooks/refs).
  const [initialTheme] = useState(loadThemeState);
  const [themePalette, setThemePalette] = useState<PaletteId>(initialTheme.palette);
  const [themeMode, setThemeMode] = useState<Mode>(initialTheme.mode);
  const [themeCustom, setThemeCustom] = useState<ThemeVars>(initialTheme.custom);
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
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Real-modal behavior for the menu: focus in, Tab trapped, Esc closes,
  // focus returns to the ⚙ button.
  useModalFocus(menuPanelRef, menuOpen, () => setMenuOpen(false));

  // Tap-to-open month picker (the 12-month strip)
  const [pickerOpen, setPickerOpen] = useState(false);

  // Backup reminder banner
  const [showBackupReminder, setShowBackupReminder] = useState(() => shouldShowBackupReminder());

  // Onboarding heroes — shown on a completely empty month until the user
  // explicitly chooses "start from empty" (persisted so it never nags again).
  const [onboardBudgetDone, setOnboardBudgetDone] = useState(() => !!localStorage.getItem('budget_onboard_budget'));
  const [onboardSavingsDone, setOnboardSavingsDone] = useState(() => !!localStorage.getItem('budget_onboard_savings'));
  const dismissBudgetHero = () => { localStorage.setItem('budget_onboard_budget', '1'); setOnboardBudgetDone(true); };
  const dismissSavingsHero = () => { localStorage.setItem('budget_onboard_savings', '1'); setOnboardSavingsDone(true); };

  // First-run welcome/introduction — shown once, before anything else, until the
  // user taps "Get started" (persisted so it never appears again on this device).
  // Devices that already hold real budget data are EXISTING users updating into
  // this release — greeting them with "Welcome!" would be wrong, so mark the
  // welcome as seen instead (they get the What's-new badge, the right message).
  const [welcomeOpen, setWelcomeOpen] = useState(() => {
    if (localStorage.getItem('budget_welcome_seen')) return false;
    if (hasMeaningfulData()) {
      localStorage.setItem('budget_welcome_seen', '1');
      return false;
    }
    return true;
  });
  const welcomeRef = useRef<HTMLDivElement>(null);
  const dismissWelcome = () => { localStorage.setItem('budget_welcome_seen', '1'); setWelcomeOpen(false); };
  useModalFocus(welcomeRef, welcomeOpen, dismissWelcome);

  // "What's new" changelog panel. A subtle badge shows on the menu until the
  // user opens it (persisted per version, so it only re-appears after a release).
  // FRESH installs are seeded as already-seen: on day one nothing is "news", so
  // the badge should only ever light up for releases shipped AFTER install.
  // Devices with existing data get no seeding — they see the badge for this release.
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [changelogSeen, setChangelogSeen] = useState(() => {
    const seen = localStorage.getItem('budget_changelog_seen');
    if (seen) return seen;
    if (!hasMeaningfulData()) {
      localStorage.setItem('budget_changelog_seen', LATEST_VERSION);
      return LATEST_VERSION;
    }
    return null;
  });
  const hasNewUpdate = changelogSeen !== LATEST_VERSION;
  const openWhatsNew = () => {
    setMenuOpen(false);
    setWhatsNewOpen(true);
    localStorage.setItem('budget_changelog_seen', LATEST_VERSION);
    setChangelogSeen(LATEST_VERSION);
  };

  // Guard: skip the save effect on the render where a month was just loaded.
  // Without this, switching months runs the save effect with the NEW month/year
  // but the OLD `data` still in scope (load's setData hasn't applied yet),
  // writing the previous month's amounts into the new month's key (data bleed).
  const skipNextSave = useRef(false);
  // JSON of the month exactly as the load effect produced it (stored data plus
  // any goal-linked rows offered for it). While `data` still equals this, the
  // user hasn't changed anything and the month must not be written back.
  const loadedSnapshot = useRef<string | null>(null);

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

  // ── Sticky-header height → CSS var ────────────────────────────────
  // The app header is sticky at top:0. Anything else sticky (the Combined
  // jump-nav) must sit BELOW it — at top:0 the two stacked and the nav covered
  // the month selector and menu button on phones (main review §6). The header's
  // real height varies with language and width, so it's measured, not guessed;
  // CSS reads it as --app-header-h for the nav's `top` and scroll margins.
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const publish = () =>
      document.documentElement.style.setProperty('--app-header-h', `${Math.ceil(el.getBoundingClientRect().height)}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Same trick for the Combined jump-nav, which is the OTHER sticky layer. Its
  // height is not one number: below 380px it wraps to a 2×2 grid (56px → 102px)
  // so the labels aren't clipped, and a fixed scroll-margin sized for one row
  // left ~38px of the section heading hidden behind it after a jump
  // (main review 2026-07-30 §6). Measuring covers every language and row count.
  // A callback ref (state, not useRef) so the effect re-runs exactly when the
  // nav attaches or detaches. With a plain ref the effect could fire while the
  // node was still unlaid-out and publish a height of 0, which is precisely the
  // wrong answer — and nothing would re-run to correct it.
  const [jumpNavEl, setJumpNavEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const root = document.documentElement;
    // No nav (other layouts, or desktop where it's display:none) → no offset.
    if (!jumpNavEl) { root.style.setProperty('--jump-nav-h', '0px'); return; }
    const publish = () =>
      root.style.setProperty('--jump-nav-h', `${Math.ceil(jumpNavEl.getBoundingClientRect().height)}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(jumpNavEl);
    return () => { ro.disconnect(); root.style.setProperty('--jump-nav-h', '0px'); };
  }, [jumpNavEl]);

  // Repair months the OLD backfill already wrote goal rows into. Runs before
  // the month-load effect below (declaration order = effect order), so the
  // month we're about to show is already clean. Guarded by a migration marker:
  // once done it never runs again, so a 0 the user deliberately records in a
  // past month later is safe from the sweep.
  useEffect(() => {
    runHistoricGoalRowMigration(planData.goals);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Persistence ───────────────────────────────────────────────────
  useEffect(() => {
    const stored = loadMonthData(year, month, lang);
    // Backfill goal-linked budget rows for goals created before this month's
    // data was saved. The shared helper creates the sparande category if the
    // month doesn't have one yet (e.g. a blank month) and never duplicates rows.
    // Finished months are skipped entirely — see isHistoricMonth.
    const monthData = isHistoricMonth(year, month)
      ? stored
      : ensureGoalLinkedBudgetRows(stored, planData.goals, lang);
    // A month/year switch just loaded fresh data; the save effect will run in
    // this same commit (month/year changed) with the PREVIOUS `data` still in
    // scope. Skip that one save so we never write one month's data into another.
    skipNextSave.current = true;
    // Remember exactly what the load produced. The save effect refuses to write
    // this back: a backfilled row is only an OFFER to budget for a goal, and
    // merely opening a month must not rewrite it (that's how browsing to June
    // made a row look like it had always been there). The first real edit
    // changes `data` away from this snapshot and saves the whole month, rows
    // included.
    loadedSnapshot.current = JSON.stringify(monthData);
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
    // Nothing user-driven has happened yet — this is still the freshly loaded
    // (possibly backfilled) month. Don't create or rewrite the month's record.
    if (JSON.stringify(data) === loadedSnapshot.current) return;
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

  // ── Backup: export every backup-owned key to a JSON file ─────────
  // The key policy, validation and replace-with-rollback all live in backup.ts
  // so they can be unit-tested without a real localStorage; this is just the
  // browser plumbing (file download, confirm dialog, reload).
  const exportData = () => {
    const payload = buildBackup(localStorage);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = backupFilename();
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

  // ── Backup: import a JSON file, REPLACING all data ───────────────
  // Validate the whole file first, then ask, then swap — so a refused file and
  // a cancelled dialog both leave the user's data exactly as it was, and a
  // failed write rolls back rather than stranding a half-restored mixture.
  const handleImportFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const check = checkBackup(reader.result as string);
      if (!check.ok) {
        alert(importErrorText(check.reason, t));
        return;
      }
      if (!window.confirm(t.importConfirm)) return;
      const result = applyBackup(localStorage, check.payload);
      if (!result.ok) {
        alert(importErrorText(result.reason, t));
        return;
      }
      location.reload();
    };
    reader.onerror = () => alert(t.importInvalid);
    reader.readAsText(file);
  };

  const showMsg = (msg: string) => {
    setCopyMsg(msg);
    setTimeout(() => setCopyMsg(''), 2200);
  };

  // Switching tabs always opens the new tab at the top. Without this, a long
  // scroll in one tab (e.g. Year) leaves the next tab scrolled past its header
  // and summary — confusing, especially on mobile. Respect reduced-motion:
  // jump instantly instead of smooth-scrolling when the user asked for less motion.
  const changeTab = useCallback((tab: ActiveTab) => {
    setActiveTab(tab);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  }, []);

  // Pull the PREVIOUS month's budget into this one — the mirror of "copy to next
  // month", and the Classic/Combined counterpart of Custom's "copy last month".
  //
  // Income + expenses ONLY. The Savings tab records a running BALANCE plus an
  // explicit `savingsSnapshotRecorded` flag, so copying last month's savings
  // would claim a snapshot the user never took: savedThisMonth would compute
  // balance − balance = 0, and the Year table would print a recorded "0 kr"
  // where it should print "not recorded". Savings are left exactly as they are.
  const copyFromPrevMonth = () => {
    const py = month === 0 ? year - 1 : year;
    const pm = month === 0 ? 11 : month - 1;
    const prevName = MONTHS[lang][pm];

    // A month that was never saved loads as blank defaults, so guard on the raw
    // key — otherwise "pull" would silently wipe this month with an empty one.
    if (!localStorage.getItem(storageKey(py, pm))) {
      setMenuOpen(false);
      showMsg(t.copyPrevMonthEmpty(prevName));
      return;
    }
    // Only interrupt when there is actually something to lose.
    const cur = calculateBudgetMetrics(data);
    const hasAmounts = cur.income > 0 || cur.expenses > 0;
    if (hasAmounts && !window.confirm(
      t.copyPrevMonthConfirm(prevName, `${MONTHS[lang][month]} ${year}`),
    )) return;

    const prev = loadMonthData(py, pm, lang);
    // Re-link goal rows afterwards: the incoming expenses come from a month that
    // may predate a goal, and the Plan tab's goal↔budget link must survive.
    setData(cur => ensureGoalLinkedBudgetRows(
      { ...cur, income: prev.income, expenses: prev.expenses },
      planData.goals,
      lang,
    ));
    setMenuOpen(false);
    showMsg(t.copiedLastMonth);
  };

  // Write this month's BUDGET into a target month, keeping whatever savings that
  // month already holds. The menu group is "Copy budget", and budget means income
  // + expenses: savings is a recorded BALANCE guarded by savingsSnapshotRecorded,
  // so carrying it forward made the target claim a snapshot the user never took —
  // savedThisMonth then read balance − balance = 0 and the Year tab printed a
  // recorded "0 kr" where it should print "not recorded". A month that was never
  // saved keeps the blank savings a fresh month gets, so nothing is invented.
  const copyBudgetInto = (targetYear: number, targetMonth: number) => {
    const target = loadMonthData(targetYear, targetMonth, lang);
    saveMonthData(targetYear, targetMonth, {
      ...target,
      income: data.income,
      expenses: data.expenses,
    });
  };

  const copyToNextMonth = () => {
    const nextYear = month === 11 ? year + 1 : year;
    const nextMth  = month === 11 ? 0 : month + 1;
    copyBudgetInto(nextYear, nextMth);
    setMenuOpen(false);
    showMsg(t.copiedTo(MONTHS[lang][nextMth]));
  };

  const copyToAllRemaining = () => {
    for (let m = month + 1; m <= 11; m++) copyBudgetInto(year, m);
    setMenuOpen(false);
    showMsg(t.copiedToMonths(11 - month));
  };

  // Reset ONLY the currently-selected month back to fresh defaults, then re-add
  // any goal-linked rows so goal↔budget links survive (same backfill as the
  // month-load effect). The save effect persists this to the current month's key.
  const resetCurrentMonth = () => {
    // Name the exact month in the confirm so the user knows what's being wiped.
    if (!window.confirm(t.resetMonthConfirm(`${MONTHS[lang][month]} ${year}`))) return;
    // Reset to a blank month, but re-create the goal-linked budget rows so the
    // goal↔budget links the Plan tab promises survive the wipe. (Before this, a
    // reset dropped them because a blank month has no sparande category.)
    const fresh = ensureGoalLinkedBudgetRows(defaultMonthData(lang), planData.goals, lang);
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
        let unlinkedName = '';
        const updatedGoals = planData.goals.map(goal => {
          if (!goal.budgetRowId) return goal;
          const oldRow = oldSparande.rows.find(r => r.id === goal.budgetRowId);
          const newRow = updatedCat.rows.find(r => r.id === goal.budgetRowId);

          // The row was DELETED from an OPEN month. Drop the link, or the
          // backfill would put the row straight back on the next month switch —
          // at 0 kr, quietly erasing whatever was in it while the goal still
          // claimed the money (the 1 000 kr that vanished from Buffert).
          // Removing the row here means "stop budgeting for this goal"; the goal
          // keeps the progress it has already recorded.
          // In a FINISHED month the row is only history being tidied up, so it
          // just goes away — unlinking there would break the link in the open
          // month where the goal is actually in use.
          if (oldRow && !newRow) {
            if (isHistoricMonth(year, month)) return goal;
            unlinkedName = goal.name;
            goalsChanged = true;
            return { ...goal, budgetRowId: undefined };
          }
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
        // Say so out loud — an unlink is invisible otherwise, and the row not
        // coming back is exactly the behaviour change worth explaining.
        if (unlinkedName) showMsg(t.goalUnlinkedFromBudget(unlinkedName));
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
      const merged: MonthData = {
        ...d,
        income: d.income.length === 0 ? starter.income : d.income,
        expenses: [...d.expenses, ...starter.expenses.filter(c => !haveExp.has(c.id))],
      };
      // The template's sparande category doesn't include the user's goal rows —
      // backfill them so existing goal↔budget links stay intact.
      return ensureGoalLinkedBudgetRows(merged, planData.goals, lang);
    });
  };

  // The month's CURRENT effective snapshot state, resolved the same way
  // calculateSavingsMetrics resolves it. Structure operations (template, add /
  // delete category, renames) pin this value explicitly instead of leaving it
  // to inference — so creating four empty template categories can never turn
  // into "the user recorded a balance of 0" (main review §5), while an old
  // month whose history predates the flag keeps counting as recorded.
  const effectiveSnapshotFlag = (d: MonthData): boolean =>
    typeof d.savingsSnapshotRecorded === 'boolean'
      ? d.savingsSnapshotRecorded
      : d.savings.length > 0;

  const addStarterSavings = () => {
    const starter = starterMonthData(lang);
    setData(d => {
      const haveSav = new Set(d.savings.map(c => c.id));
      return {
        ...d,
        savings: [...d.savings, ...starter.savings.filter(c => !haveSav.has(c.id))],
        savingsSnapshotRecorded: effectiveSnapshotFlag(d),
      };
    });
  };

  // ── Savings ───────────────────────────────────────────────────────
  // `amountEdited` comes from ExpenseCategory: editing an amount — 0 included —
  // IS the user recording their balance; renames and added rows are not.
  const setSavingsCategory = (cat: BudgetCategory, amountEdited?: boolean) => {
    setData(d => ({
      ...d,
      savings: d.savings.map(c => c.id === cat.id ? cat : c),
      savingsSnapshotRecorded: amountEdited ? true : effectiveSnapshotFlag(d),
    }));
  };

  const addSavingsCategory = () => {
    const existing = data.savings.length;
    const color = CATEGORY_PALETTE[existing % CATEGORY_PALETTE.length];
    const icon = CATEGORY_ICONS[existing % CATEGORY_ICONS.length];
    const newCat = createCategory(t.newCategory, icon, color, t.newRow);
    setData(d => ({
      ...d,
      savings: [...d.savings, newCat],
      savingsSnapshotRecorded: effectiveSnapshotFlag(d),
    }));
  };

  const deleteSavingsCategory = (id: string) => {
    // The four default savings categories are protected.
    if (isProtectedCategory(id)) return;
    setData(d => ({
      ...d,
      savings: d.savings.filter(c => c.id !== id),
      savingsSnapshotRecorded: effectiveSnapshotFlag(d),
    }));
  };

  // ── Plan — with goal↔budget sync ─────────────────────────────────
  const handlePlanDataChange = (newPlan: PlanData) => {
    const oldGoals   = planData.goals;
    const newGoals   = newPlan.goals;
    const newGoalIds = new Set(newGoals.map(g => g.id));
    // Linked rows of deleted goals. Removal rule (here AND in the cross-month
    // sweep below): only rows still at 0 kr — a row the user has put real money
    // in is budget history and survives as an ordinary custom row.
    const deletedRowIds = new Set(
      oldGoals.filter(g => !newGoalIds.has(g.id) && g.budgetRowId).map(g => g.budgetRowId!),
    );

    setData(d => {
      let expenses = d.expenses;
      const idx = expenses.findIndex(c => c.id === 'sparande');
      // Rename / delete only touch rows that already exist in the sparande category.
      if (idx !== -1) {
        let rows = [...expenses[idx].rows];
        let changed = false;
        // Renamed goals → update the linked budget row's label.
        for (const newGoal of newGoals) {
          if (!newGoal.budgetRowId) continue;
          const oldGoal = oldGoals.find(g => g.id === newGoal.id);
          if (oldGoal && oldGoal.name !== newGoal.name) {
            rows = rows.map(r => r.id === newGoal.budgetRowId ? { ...r, label: newGoal.name } : r);
            changed = true;
          }
        }
        // Deleted goals → remove the linked budget row (only if still 0 kr).
        if (deletedRowIds.size > 0) {
          const kept = rows.filter(r => !(deletedRowIds.has(r.id) && (r.amount || 0) === 0));
          if (kept.length !== rows.length) { rows = kept; changed = true; }
        }
        if (changed) {
          expenses = expenses
            .map((c, i) => i === idx ? { ...c, rows } : c)
            // A sparande category left with no rows at all is just clutter —
            // drop it (ensureGoalLinkedBudgetRows below re-creates it if any
            // remaining goal still needs a linked row).
            .filter(c => !(c.id === 'sparande' && c.rows.length === 0));
        }
      }
      // New goals → ensure a linked row exists, creating the sparande category if
      // the month doesn't have one yet (same guarantee as month load / reset).
      // Idempotent, so renames/deletes above are never double-applied.
      return ensureGoalLinkedBudgetRows({ ...d, expenses }, newGoals, lang);
    });

    // Cross-month sweep: the month-load effect backfills a goal's linked row
    // into EVERY month the user visits, so deleting the goal must also clean
    // those other months — otherwise each one keeps an orphaned 0 kr row
    // forever. Same conservation rule as above: rows with real amounts stay.
    // (The currently-loaded month was handled in state; skip its key so the
    // save effect doesn't race this write.)
    if (deletedRowIds.size > 0) {
      const currentKey = storageKey(year, month);
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (!key || !/^budget_\d{4}_\d+$/.test(key) || key === currentKey) continue;
        try {
          const m = JSON.parse(localStorage.getItem(key)!) as MonthData;
          const sp = m.expenses?.find(c => c.id === 'sparande');
          if (!sp) continue;
          const kept = sp.rows.filter(r => !(deletedRowIds.has(r.id) && (r.amount || 0) === 0));
          if (kept.length === sp.rows.length) continue;
          const expenses = kept.length > 0
            ? m.expenses.map(c => (c.id === 'sparande' ? { ...c, rows: kept } : c))
            : m.expenses.filter(c => c.id !== 'sparande');
          localStorage.setItem(key, JSON.stringify({ ...m, expenses }));
        } catch {
          // Malformed month blob — leave it untouched rather than risk data.
        }
      }
    }

    setPlanData(newPlan);
  };

  // (Linked budget-row backfill is handled in the month-load effect above,
  //  on freshly loaded data, to avoid double-appending rows.)

  // ── Derived ───────────────────────────────────────────────────────
  // All money math goes through the canonical helpers so every view agrees.
  const { income: totalIncome, expenses: totalExpenses } = calculateBudgetMetrics(data);
  // The Savings tab records a running BALANCE, so what was actually saved this
  // month is how far that balance moved since last month. Pension is excluded
  // (separate bucket). Plan, Savings and Year all use this same definition.
  // `null` = this month or last month has no savings recorded, so the answer is
  // genuinely unknown and the views show "–" rather than inventing a number.
  const savingsSnapshot = calculateSavingsMetrics(data);
  const prevSavingsSnapshot = calculateSavingsMetrics(
    loadMonthData(month === 0 ? year - 1 : year, month === 0 ? 11 : month - 1, lang),
  );
  const savedThisMonthAmount = savedThisMonth(savingsSnapshot, prevSavingsSnapshot);

  // Savings balances for the months leading up to this one, oldest first, so the
  // insight line can tell a real growth streak from a lucky month. Bounded at
  // four look-backs (a claim of "3 months running" is the most it can make) and
  // memoised — this is four localStorage reads plus parses.
  const savingsStreakMonths = useMemo(() => {
    const balances: (number | null)[] = [];
    for (let back = 3; back >= 0; back--) {
      let y = year, m = month - back;
      while (m < 0) { m += 12; y -= 1; }
      const snap = calculateSavingsMetrics(back === 0 ? data : loadMonthData(y, m, lang));
      balances.push(snap.hasSnapshot ? snap.balance : null);
    }
    return savingsStreakFrom(balances);
  }, [year, month, data, lang]);

  // ── Onboarding heroes & starter buttons ──────────────────────────
  // A brand-new empty month gets a guided "get started" hero with a primary
  // template CTA. Once the user has chosen "start from empty" (persisted),
  // empty months fall back to the small inline starter button instead.
  const budgetIsEmpty = data.income.length === 0 && data.expenses.length === 0;
  const budgetHero = budgetIsEmpty && !onboardBudgetDone ? (
    <section className="onboard-hero">
      <h2 className="onboard-title">🚀 {t.onboardBudgetTitle}</h2>
      <p className="onboard-body">{t.onboardBudgetBody}</p>
      <div className="onboard-actions">
        <button className="custom-primary-btn" onClick={addStarterBudget}>✨ {t.useBudgetTemplate}</button>
        <button className="custom-secondary-btn" onClick={dismissBudgetHero}>{t.startFromEmpty}</button>
      </div>
      <p className="onboard-hint">{t.templateIncludes}</p>
    </section>
  ) : null;
  const savingsIsEmpty = data.savings.length === 0;
  const savingsHero = savingsIsEmpty && !onboardSavingsDone ? (
    <section className="onboard-hero">
      <h2 className="onboard-title">🏦 {t.onboardSavingsTitle}</h2>
      <p className="onboard-body">{t.onboardSavingsBody}</p>
      <div className="onboard-actions">
        <button className="custom-primary-btn" onClick={addStarterSavings}>✨ {t.useSavingsTemplate}</button>
        <button className="custom-secondary-btn"
          onClick={() => { dismissSavingsHero(); addSavingsCategory(); }}>{t.addCategory}</button>
      </div>
    </section>
  ) : null;
  const budgetStarter = data.expenses.length === 0 && !budgetHero ? (
    <button className="starter-pack-btn" onClick={addStarterBudget}>
      ✨ {t.addStarterCategories}
    </button>
  ) : null;
  const savingsStarter = savingsIsEmpty && !savingsHero ? (
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
      {budgetHero}
      <SummaryCards totalIncome={totalIncome} totalExpenses={totalExpenses} year={year} month={month} />
      {/* Says something about the numbers instead of only showing them. Names
          are resolved here so the insight text follows the current language. */}
      <InsightLine
        income={totalIncome}
        expenses={totalExpenses}
        categories={data.expenses.map(c => ({
          name: shownName(c, lang),
          total: categoryTotal(c),
        }))}
        saved={savedThisMonthAmount}
        goals={planData.goals.map(g => ({
          name: shownName(g, lang),
          current: g.currentAmount,
          target: g.targetAmount,
        }))}
        savingsStreak={savingsStreakMonths}
      />
      {/* Daily/weekly pace for the remaining money — current real month only. */}
      {totalIncome > 0 && (
        <DailyBudget remaining={totalIncome - totalExpenses} year={year} month={month} />
      )}
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
          <Suspense fallback={lazyFallback}>
            <Charts categories={data.expenses} totalIncome={totalIncome} />
          </Suspense>
        </div>
      </div>
    </>
  );

  const savingsView = (
    <>
      {savingsHero}
      <Suspense fallback={lazyFallback}>
        <SavingsTab
          categories={data.savings}
          onChange={setSavingsCategory}
          onAddCategory={addSavingsCategory}
          onDeleteCategory={deleteSavingsCategory}
          year={year}
          currentMonth={month}
          snapshotRecorded={data.savingsSnapshotRecorded}
          starterSlot={savingsStarter}
        />
      </Suspense>
    </>
  );

  const planView = (
    <Suspense fallback={lazyFallback}>
      <PlanTab
        data={planData}
        onChange={handlePlanDataChange}
        totalIncome={totalIncome}
        savedThisMonth={savedThisMonthAmount}
        year={year}
        month={month}
      />
    </Suspense>
  );

  const yearView = (
    <Suspense fallback={lazyFallback}>
      <YearTab year={year} />
    </Suspense>
  );

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, currency, setCurrency, money }}>
    <div className="app">
      <header className="app-header" ref={headerRef}>
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
              aria-label={t.ariaOpenMenu}
              aria-haspopup="true"
              aria-expanded={menuOpen}
            >
              <span className="menu-btn-icon">⚙️</span>
              <span className="menu-btn-label">{t.menu}</span>
              {hasNewUpdate && <span className="menu-btn-badge" aria-hidden="true" />}
            </button>

            {menuOpen && (
              <>
                <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />
                <div className="utils-menu" role="menu" ref={menuPanelRef}>
                  <div className="utils-menu-drag-handle" aria-hidden="true" />
                  <div className="utils-menu-sheet-header">
                    <div className="utils-menu-sheet-title">{t.menu}</div>
                    <button
                      className="utils-menu-close-btn"
                      onClick={() => setMenuOpen(false)}
                      aria-label={t.themeClose}
                    >✕</button>
                  </div>

                  {/* Scrollable body — the drag handle + header above stay put
                      on mobile so the ✕ is always reachable (UX review §14). */}
                  <div className="utils-menu-scroll">
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
                      {/* Close the menu after picking a layout so the change
                          is immediately visible (especially on mobile). */}
                      <button
                        className={`seg-btn${layout === 'classic' ? ' seg-active' : ''}`}
                        onClick={() => { setLayout('classic'); setMenuOpen(false); }}
                      >
                        {t.layoutClassic}
                      </button>
                      <button
                        className={`seg-btn${layout === 'combined' ? ' seg-active' : ''}`}
                        onClick={() => { setLayout('combined'); setMenuOpen(false); }}
                      >
                        {t.layoutCombined}
                      </button>
                      <button
                        className={`seg-btn${layout === 'custom' ? ' seg-active' : ''}`}
                        onClick={() => { setLayout('custom'); setMenuOpen(false); }}
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

                  {/* What's new — opens the changelog panel */}
                  <button className="utils-action" onClick={openWhatsNew}>
                    <span>🎉 {t.whatsNew}</span>
                    {hasNewUpdate && <span className="utils-new-pill">{t.badgeNew}</span>}
                  </button>

                  <div className="utils-divider" />

                  {/* Copy budget */}
                  <div className="utils-group-label">{t.copyBudget}</div>
                  <button className="utils-action" onClick={copyFromPrevMonth}>
                    ← {t.copyPrevMonth(MONTHS[lang][month === 0 ? 11 : month - 1])}
                  </button>
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

                  {/* Danger zone — destructive actions, visually separated */}
                  <div className="utils-group-label utils-danger-label">⚠ {t.dangerZone}</div>
                  <button className="utils-action utils-action-danger" onClick={resetCurrentMonth}>
                    {t.resetMonth}
                  </button>
                  </div>
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
            <TabNav active={activeTab} onChange={changeTab} />
          </div>
        )}
      </header>

      {welcomeOpen && (
        <>
          <div className="theme-backdrop welcome-backdrop" onClick={dismissWelcome} />
          <div
            className="theme-panel welcome-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="welcome-title"
            ref={welcomeRef}
          >
            <div className="welcome-body-wrap">
              <div className="welcome-emoji" aria-hidden="true">👋💰</div>
              <h2 className="welcome-title" id="welcome-title">{t.welcomeTitle}</h2>
              <p className="welcome-lead">{t.welcomeBody}</p>
              <ul className="welcome-features">
                <li><span aria-hidden="true">📊</span> {t.welcomeFeatBudget}</li>
                <li><span aria-hidden="true">🔒</span> {t.welcomeFeatOffline}</li>
                <li><span aria-hidden="true">🎨</span> {t.welcomeFeatThemes}</li>
              </ul>
              <button className="welcome-start-btn" onClick={dismissWelcome}>
                {t.welcomeStart}
              </button>
            </div>
          </div>
        </>
      )}

      {whatsNewOpen && <WhatsNew onClose={() => setWhatsNewOpen(false)} />}

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
               one scrollable page. Same components/data/handlers as classic.
               On phones the page runs ~10 000px tall, so a sticky mini-nav
               (CSS shows it ≤640px only) jumps between the four sections. */
          <div className="combined-page">
            <nav className="combined-jump-nav" aria-label={t.layoutCombined} ref={setJumpNavEl}>
              {/* Two labels per destination: a short visible one, and the full
                  section name as the accessible name — so a screen reader always
                  hears "Sparande & Investeringar", never a clipped word. CSS
                  drops the row to 2×2 on the narrowest phones, which fits every
                  language without inventing abbreviations (main review §9). */}
              {([
                ['combined-budget', '📋', t.tabBudget, t.tabBudget],
                ['combined-savings', '📈', t.tabSavingsShort, t.tabSavings],
                ['combined-year', '🗓️', t.tabYearShort, t.tabYear],
                ['combined-plan', '🎯', t.tabPlanShort, t.tabPlan],
              ] as const).map(([id, icon, label, fullName]) => (
                <button
                  key={id}
                  className="combined-jump-btn"
                  aria-label={fullName}
                  title={fullName}
                  onClick={() => {
                    const el = document.getElementById(id);
                    if (!el) return;
                    // Focus FIRST (keyboard/SR users land where they jumped —
                    // the heading is focusable via tabIndex=-1), then scroll:
                    // Chrome cancels an in-flight smooth scrollIntoView when
                    // focus() runs after it, even with preventScroll.
                    el.focus({ preventScroll: true });
                    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
                  }}
                >
                  <span aria-hidden="true">{icon}</span> {label}
                </button>
              ))}
            </nav>
            <section className="combined-section">
              <h2 className="combined-section-title" id="combined-budget" tabIndex={-1}>{t.tabBudget}</h2>
              {budgetView}
            </section>
            <section className="combined-section">
              <h2 className="combined-section-title" id="combined-savings" tabIndex={-1}>{t.tabSavings}</h2>
              {savingsView}
            </section>
            <section className="combined-section">
              <h2 className="combined-section-title" id="combined-year" tabIndex={-1}>{t.tabYear}</h2>
              {yearView}
            </section>
            <section className="combined-section">
              <h2 className="combined-section-title" id="combined-plan" tabIndex={-1}>{t.tabPlan}</h2>
              {planView}
            </section>
          </div>
        )}

        {layout === 'custom' && (
          /* ── Custom v3: generic build-from-scratch block budget with its OWN
               separate data (never touches the shared Classic/Combined budget).
               Tab bar hidden; the global month selector drives its per-month
               amounts. */
          <Suspense fallback={lazyFallback}>
            <CustomV3 year={year} month={month} />
          </Suspense>
        )}
      </main>
    </div>
    </LanguageContext.Provider>
  );
}

export default App;
