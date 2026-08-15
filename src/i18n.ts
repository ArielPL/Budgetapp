import { createContext, useContext } from 'react';

export type Lang = 'sv' | 'en' | 'es';

export const MONTHS: Record<Lang, string[]> = {
  sv: [
    'Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni',
    'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December',
  ],
  en: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ],
  es: [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ],
};

export const MONTHS_SHORT: Record<Lang, string[]> = {
  sv: ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  es: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
};

// ── Currency ────────────────────────────────────────────────────────
// Switching currency changes the SYMBOL/FORMAT ONLY — amounts are never
// converted (no exchange rates). The user's numbers stay the same.
export type Currency = 'sek' | 'eur' | 'usd' | 'gbp';

interface CurrencyConfig {
  code: 'SEK' | 'EUR' | 'USD' | 'GBP';
  locale: string;
  symbol: string;
}

export const CURRENCIES: Record<Currency, CurrencyConfig> = {
  sek: { code: 'SEK', locale: 'sv-SE', symbol: 'kr' },
  eur: { code: 'EUR', locale: 'de-DE', symbol: '€' },
  usd: { code: 'USD', locale: 'en-US', symbol: '$' },
  gbp: { code: 'GBP', locale: 'en-GB', symbol: '£' },
};

// Two cached formatters per currency: whole amounts show NO decimals
// ("1 200 kr"), amounts with öre/cents show EXACTLY two ("1 200,50 kr") —
// never one ("1 200,5 kr" reads sloppy in a money app; fix plan 2026-07-12 §8).
// Rounding to 2 digits first also clamps float drift like 0.30000000004.
const wholeFmt: Partial<Record<Currency, Intl.NumberFormat>> = {};
const centsFmt: Partial<Record<Currency, Intl.NumberFormat>> = {};

function getFormatter(currency: Currency, withCents: boolean): Intl.NumberFormat {
  const cache = withCents ? centsFmt : wholeFmt;
  let fmt = cache[currency];
  if (!fmt) {
    const cfg = CURRENCIES[currency];
    const digits = withCents ? 2 : 0;
    fmt = new Intl.NumberFormat(cfg.locale, {
      style: 'currency',
      currency: cfg.code,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    cache[currency] = fmt;
  }
  return fmt;
}

/** Format an amount with the given currency's symbol/grouping (no conversion).
 *  Whole amounts get no decimals; fractional amounts get exactly two. */
export function formatMoney(amount: number, currency: Currency): string {
  const rounded = Math.round(amount * 100) / 100;
  const hasCents = !Number.isInteger(rounded);
  return getFormatter(currency, hasCents).format(rounded);
}

// Language → locale for numeric formatting on chart axes (decimal separator).
const AXIS_LOCALE: Record<Lang, string> = { sv: 'sv-SE', en: 'en-US', es: 'es-ES' };

// Magnitude suffixes per language. "Billion" is a false friend: a Swedish
// "biljon" is 1e12, so sv uses md (miljard) / bn (biljon); es follows the
// same long-scale convention with "mil M" for 1e9.
const AXIS_SUFFIX: Record<Lang, { m: string; b: string; t: string }> = {
  sv: { m: 'M', b: 'md', t: 'bn' },
  en: { m: 'M', b: 'B', t: 'T' },
  es: { m: 'M', b: 'mil M', t: 'B' },
};

/**
 * Compact axis-tick label. Values below 1000 are shown in full (250, 750);
 * larger ones step through k / M / billion / trillion tiers with up to ONE
 * decimal in the language's separator (1500→"1,5k" sv / "1.5k" en;
 * 2 500 000 000 → "2,5 md" sv / "2.5B" en). Two things this protects:
 * distinct ticks must not collapse to the same text (600/800/1000 all reading
 * "1k" — UX review §10), and a 10-billion axis must not read "10 000 000k"
 * and clip out of the chart (stress test §13).
 */
export function formatAxisTick(value: number, lang: Lang): string {
  const abs = Math.abs(value);
  const one = new Intl.NumberFormat(AXIS_LOCALE[lang], { maximumFractionDigits: 1 });
  const sfx = AXIS_SUFFIX[lang];
  if (abs < 1000) return new Intl.NumberFormat(AXIS_LOCALE[lang]).format(value);
  // Tier boundaries respect ROUNDING: 999 999 999 999 must read "1T", not
  // "1,000B" — the raw magnitude sits under 1e12 but the one-decimal display
  // rounds up to the next unit. A tier fits while the scaled value still
  // renders below 1000 (999.95 is where one decimal starts saying 1 000).
  const fitsTier = (divisor: number) => abs < divisor * 999.95;
  if (fitsTier(1e3)) return one.format(value / 1e3) + 'k';
  if (fitsTier(1e6)) return one.format(value / 1e6) + sfx.m;
  if (fitsTier(1e9)) return one.format(value / 1e9) + sfx.b;
  return one.format(value / 1e12) + sfx.t;
}

/**
 * Compact money for tight spots (the summary cards) when the amount is so
 * large it would overflow: 10 000 000 000 → "10 md kr" / "$10B". Only used at
 * ≥ 1e9 — everyday amounts keep their exact figures — and the full amount
 * always rides along in title=/aria so nothing is actually lost.
 */
export function formatMoneyCompact(amount: number, currency: Currency, lang: Lang): string {
  const compact = formatAxisTick(amount, lang);
  const symbol: Record<Currency, string> = { sek: 'kr', eur: '€', usd: '$', gbp: '£' };
  return currency === 'usd' || currency === 'gbp'
    ? `${symbol[currency]}${compact}`
    : `${compact} ${symbol[currency]}`;
}

export interface Translations {
  // Tabs
  tabBudget: string;
  tabSavings: string;
  tabSavingsShort: string;
  tabPlan: string;
  tabPlanShort: string;
  tabYear: string;
  tabYearShort: string;
  // Header buttons
  menu: string;
  menuTitle: string;
  language: string;
  layout: string;
  layoutClassic: string;
  layoutCombined: string;
  layoutCustom: string;
  // Custom layout: edit mode + block headings
  editLayout: string;
  duplicateBlock: string;
  deleteBlockHistoryConfirm: (months: number) => string;
  yearArchivedNote: (amount: string) => string;
  // Copy confirmations — every copy path names its target before overwriting.
  copyOverwriteOne: (target: string, source: string) => string;
  copyOverwriteMany: (n: number) => string;
  copyNothingToDo: string;
  // Pay-period label under the month heading. Purely descriptive.
  periodSection: string;
  periodStartDay: string;
  periodStartHint: string;
  periodStartOff: string;
  periodLabelAria: (month: string) => string;
  periodLabelPlaceholder: string;
  // Per-row period: how often the typed amount actually falls due.
  periodMonth: string; periodQuarter: string; periodYear: string;
  periodAria: (row: string) => string;
  periodOnce: string;
  periodChargedNote: (period: string) => string;
  // The one-line insight under the summary cards. Amounts arrive pre-formatted.
  insightDeficit: (over: string) => string;
  insightSavingsDown: (amount: string) => string;
  insightGoalClose: (name: string, remaining: string) => string;
  insightSavingsStreak: (months: number) => string;
  insightSavedRate: (pct: number) => string;
  insightTopCategory: (name: string, pct: number) => string;
  // Ready-made blocks in the Custom add-picker. Stored as KEYS on the block, so
  // they follow a language switch instead of freezing in the creation language.
  tplHousing: string; tplRent: string; tplUtilities: string;
  tplFood: string; tplGroceries: string;
  tplTransport: string; tplCommute: string;
  tplSavings: string; tplBuffer: string;
  copyOfName: (name: string) => string;
  moveUp: string;
  moveDown: string;
  dragToReorder: string;
  // Expense chart style switch
  chartStyleDonut: string;
  chartStyleBars: string;
  chartStylePie: string;
  chartStyleList: string;
  chartStyleStacked: string;
  chartStyleTreemap: string;
  chartStyleRadial: string;
  // Custom section builder
  customEmptyTitle: string;
  customEmptyBody: string;
  removeSection: string;
  sectionSettings: string;
  cfgBackground: string;
  cfgBgNone: string;
  cfgShowChart: string;
  cfgChartType: string;
  cfgChartSize: string;
  cfgSizeS: string;
  cfgSizeM: string;
  cfgSizeL: string;
  cfgWidth: string;
  cfgWidthFull: string;
  cfgWidthHalf: string;
  cfgWidthThird: string;
  cfgDone: string;
  addStarterCategories: string;
  // First-run welcome / introduction
  welcomeTitle: string;
  welcomeBody: string;
  welcomeFeatBudget: string;
  welcomeFeatOffline: string;
  welcomeFeatThemes: string;
  welcomeStart: string;
  onboardBudgetTitle: string;
  onboardBudgetBody: string;
  useBudgetTemplate: string;
  startFromEmpty: string;
  templateIncludes: string;
  onboardSavingsTitle: string;
  onboardSavingsBody: string;
  useSavingsTemplate: string;
  // Custom v3 — generic block builder
  addBlock: string;
  newBlockName: string;
  newRowName: string;
  blockTotal: string;
  quickStartCustom: string;
  cfgTag: string;
  tagIn: string;
  tagOut: string;
  tagSave: string;
  kindIn: string;
  kindOut: string;
  kindSave: string;
  kindSummary: string;
  cfgCustomColor: string;
  cfgChartPosition: string;
  posTop: string;
  posBottom: string;
  posLeft: string;
  posRight: string;
  posBetween: string;
  summaryBlock: string;
  summaryIncome: string;
  summaryExpenses: string;
  summarySaved: string;
  summaryRemaining: string;
  copyLastMonth: string;
  copiedLastMonth: string;
  clearAmounts: string;
  clearAmountsConfirm: string;
  clearedAmounts: string;
  howItWorks: string;
  gotIt: string;
  showGuide: string;
  customHelpTitle: string;
  customHelpIntro: string;
  customHelp: { title: string; body: string }[];
  cfgEmoji: string;
  cfgEmojiDefault: string;
  cfgTarget: string;
  kindNote: string;
  addNote: string;
  newNoteName: string;
  notePlaceholder: string;
  currency: string;
  currencyHint: string;
  theme: string;
  whatsNew: string;
  whatsNewLatest: string;
  badgeNew: string;
  themeLight: string;
  themeDark: string;
  // Theme Builder panel
  themeTitle: string;
  themeClose: string;
  presets: string;
  accent: string;
  /** Colour NAMES for the accent swatches — a hex code is not a description. */
  accentLavender: string;
  accentViolet: string;
  accentSky: string;
  accentTeal: string;
  accentGreen: string;
  accentRose: string;
  accentAmber: string;
  accentPink: string;
  accentCustom: string;
  advancedOverride: string;
  resetToPreset: string;
  colorBackground: string;
  colorCards: string;
  colorIncome: string;
  colorExpenses: string;
  colorSavings: string;
  colorAccent: string;
  paletteNames: {
    sorbet: string;
    ocean: string;
    forest: string;
    sunset: string;
    custom: string;
  };
  copyBudget: string;
  copyNextMonth: string;
  copyAllRemaining: (n: number) => string;
  copiedTo: (month: string) => string;
  copiedToMonths: (n: number) => string;
  copyPrevMonth: (month: string) => string;
  copyPrevMonthConfirm: (from: string, to: string) => string;
  copyPrevMonthEmpty: (month: string) => string;
  // Backup (export / import)
  backup: string;
  exportData: string;
  importData: string;
  importConfirm: string;
  importInvalid: string;
  /** Distinct import failures — "invalid file" for all of them left the user
   *  with no idea whether to retry, update the app, or find another backup. */
  importTooNew: string;
  importCorrupt: string;
  importWriteFailed: string;
  // Reset month
  resetMonth: string;
  resetMonthConfirm: (monthName: string) => string;
  resetMonthDone: string;
  dangerZone: string;
  // Month nav
  prevMonth: string;
  nextMonth: string;
  // Summary cards
  income: string;
  expenses: string;
  remaining: string;
  pctOfIncome: string;
  vsPrev: string;
  samePrevMonth: string;
  leftAfterBudget: (pct: number) => string;
  /** Overspend says so IN WORDS. Colour alone can't carry the message —
   *  the old card showed a green "0% left" line under a red negative total. */
  deficitAmount: (amount: string) => string;
  deficitOverBudget: (pct: number) => string;
  // Income section
  incomeSection: string;
  addRow: string;
  deleteRow: string;
  newRow: string;
  // Charts
  chartExpenseDistribution: string;
  chartPerCategory: string;
  chartTotal: string;
  chartGrowth: (year: number) => string;
  placeholderExpenses: string;
  placeholderSavings: string;
  // Custom stat tiles
  // Savings tab
  totalSaved: string;
  savedThisMonth: string;
  savedPrevMonth: string;
  pensionBox: string;
  /** Shown instead of an amount when a month has no savings recorded — we don't
   *  know what the balance was, and 0 would be a claim we can't back up. */
  notRecorded: string;
  /** Explains the "–" above: why there's no number and how to get one. */
  notRecordedHint: string;
  // Plan tab
  planOverview: string;
  overviewSavingsRate: string;
  overviewSavedThisMonth: string;
  overviewGoalProgress: string;
  goalProgressSummary: string;
  noGoalsSummary: string;
  savingsGoals: string;
  newGoal: string;
  newGoalName: string;
  goalNameLabel: string;
  createGoal: string;
  cancel: string;
  goalErrorName: string;
  /** One message per real problem — "must be greater than 0" was shown for
   *  unparseable input too, which described the wrong mistake. */
  goalErrorTarget: string;        // 0 or negative
  goalErrorTargetRequired: string;
  goalErrorTargetInvalid: string;
  // Daily/weekly budget split ("left to live on")
  dailyBudgetTitle: string;
  /** Reserved for the planned "rest of the month" burn-down mode. The card
   *  itself now always spreads across the whole month — see DailyBudget. */
  dailyBudgetDaysInMonth: (n: number, month: string) => string;
  dailyBudgetPerDay: string;
  dailyBudgetPerWeek: string;
  // Sparplan (savings plan projection + plan-vs-actual)
  sparplanTitle: string;
  sparplanBody: string;
  sparplanMonthly: string;
  sparplanReturn: string;
  sparplanStartAmount: string;
  sparplanStartMonth: string;
  /** Inline field errors — the UI keeps the draft so the user can fix it. */
  sparplanErrAmount: string;
  sparplanErrReturn: string;
  sparplanErrMonth: string;
  sparplanDelete: string;
  sparplanDeleteConfirm: string;
  sparplanIn5Years: string;
  sparplanNow: string;
  sparplanMonth: (n: number) => string;
  sparplanOfWhichGrowth: (amount: string) => string;
  sparplanWithGrowth: string;
  sparplanDepositsOnly: string;
  sparplanVsTitle: string;
  sparplanVsBody: string;
  sparplanSinceStart: string;
  sparplanPlanLine: string;
  sparplanAhead: (amount: string) => string;
  sparplanBehind: (amount: string) => string;
  sparplanOnTrack: string;
  noGoals: string;
  deleteGoal: string;
  linkedToBudget: string;
  linkedRowTitle: string;
  saved: string;
  goal: string;
  of: string;
  deadline: string;
  notes: string;
  notesPlaceholder: string;
  // Year overview
  yearOverview: (year: number) => string;
  yearChartTitle: string;
  colMonth: string;
  colIncome: string;
  colExpenses: string;
  /** The Year tab reports two different savings measures and must never call
   *  them the same thing: each month shows the BALANCE at that point, while the
   *  year's total row shows how much that balance CHANGED over the year. */
  colSavingsBalance: string;
  colSavedDuringYear: string;
  /** Shown when the year's change can't be computed: the missing fact is LAST
   *  year's December baseline, and the hint must say so — "fill in this month"
   *  pointed the user at the wrong cell entirely. */
  yearBaselineHint: (year: number) => string;
  colRemaining: string;
  yearTotal: string;
  yearEmpty: string;
  // Editable
  clickToEdit: string;
  /** Shown when a typed amount is rejected — the previous value is kept rather
   *  than silently storing something the user never meant. */
  invalidAmount: string;
  clickToRename: string;
  ariaEditAmount: (name: string, amount: string) => string;
  ariaAmountInput: (name: string) => string;
  ariaOpenMenu: string;
  ariaEditCategory: (name: string) => string;
  ariaCollapse: (name: string) => string;
  ariaExpand: (name: string) => string;
  ariaDeleteRow: (name: string) => string;
  ariaRemoveSection: (name: string) => string;
  ariaRowColor: (name: string) => string;
  ariaNameField: (name: string) => string;
  // Custom categories
  addCategory: string;
  newCategory: string;
  editCategory: string;
  doneEditing: string;
  deleteCategory: string;
  deleteCategoryConfirm: (name: string) => string;
  categoryName: string;
  chooseIcon: string;
  chooseColor: string;
  protectedCategory: string;
  /** Confirmation that removing a goal's budget row unlinked the goal — the row
   *  will not reappear, and the goal keeps the progress it already has. */
  goalUnlinkedFromBudget: (goal: string) => string;
  protectedSavingsCategory: string;
  // Backup reminder
  backupReminder: string;
  backupReminderShort: string;
  backupReminderExport: string;
  backupReminderDismiss: string;
  // Growth chart line labels
  lineSparkonto: string;
  lineIsk: string;
  lineFonder: string;
  // Growth chart type toggle
  chartTypeArea: string;
  chartTypeLine: string;
  chartTypeStacked: string;
}

export const translations: Record<Lang, Translations> = {
  sv: {
    tabBudget: 'Budget',
    tabSavings: 'Sparande & Investeringar',
    tabSavingsShort: 'Sparande',
    tabPlan: 'Plan & Översikt',
    tabPlanShort: 'Plan',
    tabYear: 'År',
    tabYearShort: 'År',
    menu: 'Meny',
    menuTitle: 'Inställningar och verktyg',
    language: 'Språk',
    layout: 'Layout',
    layoutClassic: 'Klassisk',
    layoutCombined: 'Kombinerad',
    layoutCustom: 'Anpassad',
    editLayout: 'Redigera layout',
    duplicateBlock: 'Duplicera block',
    deleteBlockHistoryConfirm: (months) => `Blocket har belopp i ${months} ${months === 1 ? 'annan månad' : 'andra månader'}. De försvinner ur årsöversikten om du tar bort det. Fortsätta?`,
    yearArchivedNote: (amount) => `${amount} kunde inte kopplas till något block — rader som togs bort innan appen började spara historik.`,
    copyOverwriteOne: (target, source) => `${target} har redan en budget. Ersätta inkomster och utgifter med ${source}?`,
    copyOverwriteMany: (n) => `${n} av de återstående månaderna har redan en budget. Ersätta dem?`,
    copyNothingToDo: 'Ingenting att hämta — månaden är tom.',
    periodSection: 'Löneperiod',
    periodStartDay: 'Perioden börjar den',
    periodStartHint: 'Visas bara som text under månaden — påverkar inga belopp.',
    periodStartOff: 'Av',
    periodLabelAria: (month) => `Egen periodtext för ${month}`,
    periodLabelPlaceholder: 'Egen text',
    periodMonth: 'Varje månad', periodQuarter: 'Per kvartal', periodYear: 'Per år', periodOnce: 'Engångskostnad',
    periodAria: (row) => `När ${row} dras`,
    periodChargedNote: (p) => p === 'year' ? 'dras en gång per år' : p === 'quarter' ? 'dras per kvartal' : 'engångskostnad',
    insightDeficit: (over) => `Utgifterna överstiger inkomsten med ${over}.`,
    insightSavingsDown: (amount) => `Ditt sparande minskade med ${amount} den här månaden.`,
    insightGoalClose: (name, remaining) => `Bara ${remaining} kvar till ${name}.`,
    insightSavingsStreak: (months) => `Ditt sparande har vuxit ${months} månader i rad.`,
    insightSavedRate: (pct) => `Du la undan ${pct} % av inkomsten den här månaden.`,
    insightTopCategory: (name, pct) => `${name} är din största utgiftspost — ${pct} % av inkomsten.`,
    tplHousing: 'Boende', tplRent: 'Hyra', tplUtilities: 'El & Internet',
    tplFood: 'Mat', tplGroceries: 'Matvaror',
    tplTransport: 'Transport', tplCommute: 'Resor',
    tplSavings: 'Sparande', tplBuffer: 'Buffert',
    copyOfName: (name) => `${name} (kopia)`,
    moveUp: 'Flytta upp',
    moveDown: 'Flytta ner',
    dragToReorder: 'Dra för att ändra ordning',
    chartStyleDonut: 'Munk',
    chartStyleBars: 'Staplar',
    chartStylePie: 'Paj',
    chartStyleList: 'Lista',
    chartStyleStacked: 'Staplad',
    chartStyleTreemap: 'Trädkarta',
    chartStyleRadial: 'Radiell',
    customEmptyTitle: 'Din panel är tom',
    customEmptyBody: 'Lägg till de sektioner du vill ha.',
    removeSection: 'Ta bort sektion',
    sectionSettings: 'Sektionsinställningar',
    cfgBackground: 'Bakgrund',
    cfgBgNone: 'Ingen',
    cfgShowChart: 'Visa diagram',
    cfgChartType: 'Diagramtyp',
    cfgChartSize: 'Storlek',
    cfgSizeS: 'S',
    cfgSizeM: 'M',
    cfgSizeL: 'L',
    cfgWidth: 'Bredd',
    cfgWidthFull: 'Hel',
    cfgWidthHalf: 'Halv',
    cfgWidthThird: 'Tredjedel',
    cfgDone: 'Klar',
    addStarterCategories: 'Lägg till startkategorier',
    welcomeTitle: 'Välkommen till Budgetapp!',
    welcomeBody: 'Ett enkelt och privat sätt att planera din månadsbudget och ditt sparande.',
    welcomeFeatBudget: 'Håll koll på inkomster, utgifter och sparmål',
    welcomeFeatOffline: 'Fungerar offline — dina data stannar på den här enheten',
    welcomeFeatThemes: 'Gör den till din med teman och språk',
    welcomeStart: 'Kom igång',
    onboardBudgetTitle: 'Kom igång med din månadsbudget',
    onboardBudgetBody: 'Välj en färdig mall eller bygg budgeten själv.',
    useBudgetTemplate: 'Använd budgetmall',
    startFromEmpty: 'Börja från tom budget',
    templateIncludes: 'Mallen innehåller inkomst, boende, mat, transport och sparande.',
    onboardSavingsTitle: 'Kom igång med sparande',
    onboardSavingsBody: 'Lägg till en sparmall med sparkonto, investeringar och pension.',
    useSavingsTemplate: 'Använd sparmall',
    addBlock: 'Lägg till block',
    newBlockName: 'Nytt block',
    newRowName: 'Ny rad',
    blockTotal: 'Totalt',
    quickStartCustom: 'Snabbstart',
    cfgTag: 'Typ',
    tagIn: 'In',
    tagOut: 'Ut',
    tagSave: 'Spar',
    kindIn: 'IN',
    kindOut: 'UT',
    kindSave: 'SPAR',
    kindSummary: 'SUMMERING',
    cfgCustomColor: 'Egen färg',
    cfgChartPosition: 'Diagramposition',
    posTop: 'Topp',
    posBottom: 'Botten',
    posLeft: 'Vänster',
    posRight: 'Höger',
    posBetween: 'Emellan',
    summaryBlock: 'Sammanfattning',
    summaryIncome: 'Inkomster',
    summaryExpenses: 'Utgifter',
    summarySaved: 'Sparat',
    summaryRemaining: 'Kvar',
    copyLastMonth: 'Kopiera förra månaden',
    copiedLastMonth: 'Kopierat från förra månaden',
    clearAmounts: 'Rensa belopp',
    clearAmountsConfirm: 'Rensa alla belopp i alla månader? Din layout behålls.',
    clearedAmounts: 'Alla belopp rensade',
    howItWorks: 'Så funkar det',
    gotIt: 'Jag förstår!',
    showGuide: 'Visa guiden',
    customHelpTitle: 'Bygg din egen budget',
    customHelpIntro: 'Här bygger du budgeten precis som du vill — skapa block för inkomster, utgifter, sparande och anteckningar.',
    customHelp: [
      { title: 'Lägg till block', body: 'Tryck på "Lägg till block", ge det ett namn och välj vad det är – pengar in, ut, sparande eller en anteckning.' },
      { title: 'IN / UT / SPAR', body: 'Taggen avgör hur blocket räknas. Översikten använder den för att räkna ut vad som är kvar.' },
      { title: 'Dina egna rader', body: 'Inuti ett block lägger du till hur många kategorirader du vill och skriver in beloppen.' },
      { title: 'Ändra storlek', body: 'Sätt varje block till Hel, Halv eller ⅓ bredd. På mobilen blir de tryckbara rutor.' },
      { title: 'Färg & emoji', body: 'Ge valfritt block en egen bakgrundsfärg och ikon – gör det till ditt.' },
      { title: 'Diagram', body: 'Slå på ett diagram och välj stil (munk, paj, staplar, trädkarta …), storlek och var det placeras.' },
      { title: 'Mål', body: 'Sätt ett målbelopp så fylls en förloppsmätare på vägen dit.' },
      { title: 'Anteckningar', body: 'Lägg till ett textblock för påminnelser eller planer, bredvid dina pengar.' },
      { title: 'Översikt', body: 'Lägg till ett översiktsblock – det räknar Inkomst − Utgifter automatiskt och visar förändringen mot förra månaden.' },
      { title: 'Kopiera förra månaden', body: 'Ett tryck hämtar förra månadens belopp till denna månad så du slipper skriva om.' },
      { title: 'Redigera layout', body: 'Dra för att flytta (↑↓ på mobil), ⚙ för inställningar, ✕ för att ta bort, 🧹 för att rensa alla belopp.' },
    ],
    cfgEmoji: 'Emoji',
    cfgEmojiDefault: 'Standard',
    cfgTarget: 'Mål',
    kindNote: 'ANTECKNING',
    addNote: 'Anteckning',
    newNoteName: 'Anteckning',
    notePlaceholder: 'Skriv en anteckning…',
    currency: 'Valuta',
    currencyHint: 'Byter bara symbol och format — beloppen räknas inte om',
    theme: 'Tema',
    whatsNew: 'Nyheter',
    whatsNewLatest: 'Senaste',
    badgeNew: 'NYTT',
    themeLight: 'Ljust',
    themeDark: 'Mörkt',
    themeTitle: 'Tema',
    themeClose: 'Stäng',
    presets: 'Förinställningar',
    accent: 'Accentfärg',
    accentLavender: 'Lavendel',
    accentViolet: 'Violett',
    accentSky: 'Himmelsblå',
    accentTeal: 'Turkos',
    accentGreen: 'Grön',
    accentRose: 'Rosenröd',
    accentAmber: 'Bärnsten',
    accentPink: 'Rosa',
    accentCustom: 'Egen accentfärg',
    advancedOverride: 'Avancerat — ändra alla färger',
    resetToPreset: 'Återställ till förinställning',
    colorBackground: 'Bakgrund',
    colorCards: 'Kort',
    colorIncome: 'Inkomst',
    colorExpenses: 'Utgifter',
    colorSavings: 'Sparande',
    colorAccent: 'Accent',
    paletteNames: {
      sorbet: 'Sorbet',
      ocean: 'Hav',
      forest: 'Skog',
      sunset: 'Solnedgång',
      custom: 'Egen',
    },
    copyBudget: 'Kopiera budget',
    copyNextMonth: 'Nästa månad',
    copyAllRemaining: (n) => `Alla återstående (${n} månader)`,
    copiedTo: (month) => `✓ Kopierat till ${month}`,
    copiedToMonths: (n) => `✓ Kopierat till ${n} månader`,
    copyPrevMonth: (month) => `Hämta från ${month}`,
    copyPrevMonthConfirm: (from, to) =>
      `Detta ersätter inkomster och utgifter i ${to} med de från ${from}. Sparande rörs inte. Vill du fortsätta?`,
    copyPrevMonthEmpty: (month) => `${month} är tom — inget att hämta`,
    backup: 'Data',
    exportData: '⬇ Exportera data',
    importData: '⬆ Importera data',
    importConfirm: 'Detta ERSÄTTER all nuvarande data med innehållet i filen. Vill du fortsätta?',
    importInvalid: 'Ogiltig fil. Välj en säkerhetskopia exporterad från denna app.',
    importTooNew: 'Filen kommer från en nyare version av appen. Uppdatera appen och försök igen. Din data är oförändrad.',
    importCorrupt: 'Filen är skadad och kunde inte läsas. Ingenting har ändrats — din nuvarande data är kvar.',
    importWriteFailed: 'Importen misslyckades och avbröts. Din tidigare data är återställd och oförändrad.',
    resetMonth: '↺ Återställ månad',
    resetMonthConfirm: (monthName) => `Detta nollställer ${monthName} och kan inte ångras. Vill du fortsätta?`,
    resetMonthDone: '✓ Månad återställd',
    dangerZone: 'Farozon',
    prevMonth: 'Föregående månad',
    nextMonth: 'Nästa månad',
    income: 'Inkomst',
    expenses: 'Utgifter',
    remaining: 'Kvar',
    pctOfIncome: 'av inkomst',
    vsPrev: 'vs förra',
    samePrevMonth: '= förra månaden',
    leftAfterBudget: (pct) => `${pct}% kvar efter budgeterade utgifter`,
    deficitAmount: (amount) => `Underskott: ${amount}`,
    deficitOverBudget: (pct) => `${pct}% över inkomsten`,
    incomeSection: 'Inkomst',
    addRow: '+ Lägg till rad',
    deleteRow: 'Ta bort rad',
    newRow: 'Ny rad',
    chartExpenseDistribution: 'Utgiftsfördelning',
    chartPerCategory: 'Per kategori',
    chartTotal: 'Totalt',
    chartGrowth: (year) => `Tillväxt ${year}`,
    placeholderExpenses: 'Fyll i några utgifter så visas diagrammet här',
    placeholderSavings: 'Fyll i sparande & investeringar för att se tillväxten',
    totalSaved: 'Totalt sparat',
    savedThisMonth: 'Sparat denna månad',
    savedPrevMonth: 'Sparat förra månaden',
    notRecorded: 'Inte registrerat',
    notRecordedHint: 'Fyll i ditt sparsaldo för månaden så räknar vi ut det här',
    pensionBox: 'Pension',
    planOverview: 'Översikt',
    overviewSavingsRate: 'Sparkvot',
    overviewSavedThisMonth: 'Sparat denna månad',
    overviewGoalProgress: 'Måluppfyllnad',
    goalProgressSummary: 'Måluppfyllnad',
    noGoalsSummary: 'Inga mål ännu — lägg till ett nedan',
    savingsGoals: 'Sparmål',
    newGoal: '+ Nytt mål',
    newGoalName: 'Nytt mål',
    goalNameLabel: 'Namn',
    createGoal: 'Skapa mål',
    cancel: 'Avbryt',
    goalErrorName: 'Ange ett namn på målet',
    goalErrorTarget: 'Målbeloppet måste vara större än 0',
    goalErrorTargetRequired: 'Ange ett målbelopp',
    goalErrorTargetInvalid: 'Skriv ett giltigt belopp mellan 0 och 999 999 999 999',
    dailyBudgetTitle: 'Kvar att leva på',
    dailyBudgetDaysInMonth: (n, month) => `utslaget på ${month} (${n} dagar)`,
    dailyBudgetPerDay: 'Per dag',
    dailyBudgetPerWeek: 'Per vecka',
    sparplanTitle: 'Sparplan',
    sparplanBody: 'Planera ditt månadssparande och din förväntade avkastning — och se hur det växer med ränta på ränta.',
    sparplanMonthly: 'Månadssparande',
    sparplanReturn: 'Avkastning per år (%)',
    sparplanStartAmount: 'Startbelopp',
    sparplanStartMonth: 'Startmånad (ditt utgångsläge)',
    sparplanErrAmount: 'Ange ett belopp mellan 0 och 999 999 999 999',
    sparplanErrReturn: 'Ange en avkastning mellan 0 och 100 %',
    sparplanErrMonth: 'Ange en riktig månad mellan 1900 och 2200',
    sparplanDelete: 'Radera sparplan',
    sparplanDeleteConfirm: 'Radera sparplanen? Dina månadsdata och sparmål påverkas inte.',
    sparplanIn5Years: 'om 5 år',
    sparplanNow: 'Nu',
    sparplanMonth: (n) => `Månad ${n}`,
    sparplanOfWhichGrowth: (amount) => `varav ${amount} är avkastning`,
    sparplanWithGrowth: 'Med avkastning',
    sparplanDepositsOnly: 'Bara insättningar',
    sparplanVsTitle: 'Plan mot verklighet',
    sparplanVsBody: 'Din plan (streckad) jämfört med vad du faktiskt sparat.',
    sparplanSinceStart: 'sedan start',
    sparplanPlanLine: 'Plan',
    sparplanAhead: (amount) => `${amount} före plan`,
    sparplanBehind: (amount) => `${amount} efter plan`,
    sparplanOnTrack: 'I fas med planen',
    noGoals: 'Inga mål ännu — klicka "+ Nytt mål" för att komma igång',
    deleteGoal: 'Ta bort mål',
    linkedToBudget: 'Kopplad till budget',
    linkedRowTitle: 'Kopplad rad i Budget → Sparande',
    saved: 'Sparat',
    goal: 'Mål',
    of: 'av',
    deadline: 'Deadline',
    notes: 'Anteckningar & Strategi',
    notesPlaceholder: 'Skriv din plan, strategi, tankar om investeringar...',
    yearOverview: (year) => `Årsöversikt ${year}`,
    yearChartTitle: 'Inkomst vs Utgifter',
    colMonth: 'Månad',
    colIncome: 'Inkomst',
    colExpenses: 'Utgifter',
    colSavingsBalance: 'Sparsaldo',
    colSavedDuringYear: 'Sparat under året',
    yearBaselineHint: (year) => `Registrera sparsaldot för december ${year - 1} så kan vi räkna ut hur mycket du sparat under ${year}.`,
    colRemaining: 'Kvar',
    yearTotal: 'Helår',
    yearEmpty: 'Ingen data för detta år ännu',
    clickToEdit: 'Klicka för att redigera',
    invalidAmount: 'Ogiltigt belopp — skriv en siffra mellan 0 och 999 999 999 999',
    ariaEditAmount: (name, amount) => `Redigera belopp för ${name}, nu ${amount}`,
    ariaAmountInput: (name) => `Belopp för ${name}`,
    ariaOpenMenu: 'Öppna meny',
    ariaEditCategory: (name) => `Redigera kategori: ${name}`,
    ariaCollapse: (name) => `Fäll ihop ${name}`,
    ariaExpand: (name) => `Visa ${name}`,
    ariaDeleteRow: (name) => `Ta bort rad: ${name}`,
    ariaRemoveSection: (name) => `Ta bort sektion: ${name}`,
    ariaRowColor: (name) => `Färg för ${name}`,
    ariaNameField: (name) => `Namn: ${name}`,
    clickToRename: 'Klicka för att byta namn',
    addCategory: '+ Lägg till kategori',
    newCategory: 'Ny kategori',
    editCategory: 'Redigera kategori',
    doneEditing: 'Klar',
    deleteCategory: 'Ta bort kategori',
    deleteCategoryConfirm: (name) => `Ta bort kategorin "${name}" och alla dess rader?`,
    categoryName: 'Kategorinamn',
    chooseIcon: 'Välj ikon',
    chooseColor: 'Välj färg',
    protectedCategory: 'Kopplad till Plan — kan inte tas bort',
    goalUnlinkedFromBudget: (goal) => `"${goal}" är inte längre kopplat till budgeten. Målet behåller det du sparat.`,
    protectedSavingsCategory: 'Standardkategori — kan inte tas bort',
    backupReminder: 'Säkerhetskopiera dina data så du inte förlorar dem',
    backupReminderShort: 'Backup rekommenderas',
    backupReminderExport: 'Exportera nu',
    backupReminderDismiss: 'Stäng',
    lineSparkonto: 'Sparkonto',
    lineIsk: 'ISK / Aktiedepå',
    lineFonder: 'Fonder',
    chartTypeArea: 'Yta',
    chartTypeLine: 'Linje',
    chartTypeStacked: 'Staplar',
  },
  en: {
    tabBudget: 'Budget',
    tabSavings: 'Savings & Investments',
    tabSavingsShort: 'Savings',
    tabPlan: 'Plan & Overview',
    tabPlanShort: 'Plan',
    tabYear: 'Year',
    tabYearShort: 'Year',
    menu: 'Menu',
    menuTitle: 'Settings & tools',
    language: 'Language',
    layout: 'Layout',
    layoutClassic: 'Classic',
    layoutCombined: 'Combined',
    layoutCustom: 'Custom',
    editLayout: 'Edit layout',
    duplicateBlock: 'Duplicate block',
    deleteBlockHistoryConfirm: (months) => `This block has amounts in ${months} other ${months === 1 ? 'month' : 'months'}. They will drop out of the year overview if you delete it. Continue?`,
    yearArchivedNote: (amount) => `${amount} could not be matched to a block — rows deleted before the app started recording history.`,
    copyOverwriteOne: (target, source) => `${target} already has a budget. Replace its income and expenses with ${source}?`,
    copyOverwriteMany: (n) => `${n} of the remaining months already have a budget. Replace them?`,
    copyNothingToDo: 'Nothing to pull — that month is empty.',
    periodSection: 'Pay period',
    periodStartDay: 'The period starts on the',
    periodStartHint: 'Shown as text under the month only — it changes no amounts.',
    periodStartOff: 'Off',
    periodLabelAria: (month) => `Custom period text for ${month}`,
    periodLabelPlaceholder: 'Custom text',
    periodMonth: 'Every month', periodQuarter: 'Quarterly', periodYear: 'Yearly', periodOnce: 'One-off',
    periodAria: (row) => `When ${row} is charged`,
    periodChargedNote: (p) => p === 'year' ? 'charged once a year' : p === 'quarter' ? 'charged quarterly' : 'one-off cost',
    insightDeficit: (over) => `Expenses exceed income by ${over}.`,
    insightSavingsDown: (amount) => `Your savings fell by ${amount} this month.`,
    insightGoalClose: (name, remaining) => `Only ${remaining} to go for ${name}.`,
    insightSavingsStreak: (months) => `Your savings have grown ${months} months running.`,
    insightSavedRate: (pct) => `You set aside ${pct}% of your income this month.`,
    insightTopCategory: (name, pct) => `${name} is your largest expense — ${pct}% of income.`,
    tplHousing: 'Housing', tplRent: 'Rent', tplUtilities: 'Power & Internet',
    tplFood: 'Food', tplGroceries: 'Groceries',
    tplTransport: 'Transport', tplCommute: 'Travel',
    tplSavings: 'Savings', tplBuffer: 'Buffer',
    copyOfName: (name) => `${name} (copy)`,
    moveUp: 'Move up',
    moveDown: 'Move down',
    dragToReorder: 'Drag to reorder',
    chartStyleDonut: 'Donut',
    chartStyleBars: 'Bars',
    chartStylePie: 'Pie',
    chartStyleList: 'List',
    chartStyleStacked: 'Stacked',
    chartStyleTreemap: 'Treemap',
    chartStyleRadial: 'Radial',
    customEmptyTitle: 'Your dashboard is empty',
    customEmptyBody: 'Add the sections you want.',
    removeSection: 'Remove section',
    sectionSettings: 'Section settings',
    cfgBackground: 'Background',
    cfgBgNone: 'None',
    cfgShowChart: 'Show chart',
    cfgChartType: 'Chart type',
    cfgChartSize: 'Size',
    cfgSizeS: 'S',
    cfgSizeM: 'M',
    cfgSizeL: 'L',
    cfgWidth: 'Width',
    cfgWidthFull: 'Full',
    cfgWidthHalf: 'Half',
    cfgWidthThird: 'Third',
    cfgDone: 'Done',
    addStarterCategories: 'Add starter categories',
    welcomeTitle: 'Welcome to Budgetapp!',
    welcomeBody: 'A simple, private way to plan your monthly budget and savings.',
    welcomeFeatBudget: 'Track income, expenses and savings goals',
    welcomeFeatOffline: 'Works offline — your data stays on this device',
    welcomeFeatThemes: 'Make it yours with themes and languages',
    welcomeStart: 'Get started',
    onboardBudgetTitle: 'Get started with your monthly budget',
    onboardBudgetBody: 'Pick a ready-made template or build the budget yourself.',
    useBudgetTemplate: 'Use budget template',
    startFromEmpty: 'Start from an empty budget',
    templateIncludes: 'The template includes income, housing, food, transport and savings.',
    onboardSavingsTitle: 'Get started with savings',
    onboardSavingsBody: 'Add a savings template with a savings account, investments and pension.',
    useSavingsTemplate: 'Use savings template',
    addBlock: 'Add block',
    newBlockName: 'New block',
    newRowName: 'New row',
    blockTotal: 'Total',
    quickStartCustom: 'Quick start',
    cfgTag: 'Type',
    tagIn: 'In',
    tagOut: 'Out',
    tagSave: 'Save',
    kindIn: 'IN',
    kindOut: 'OUT',
    kindSave: 'SAVINGS',
    kindSummary: 'SUMMARY',
    cfgCustomColor: 'Custom color',
    cfgChartPosition: 'Chart position',
    posTop: 'Top',
    posBottom: 'Bottom',
    posLeft: 'Left',
    posRight: 'Right',
    posBetween: 'Between',
    summaryBlock: 'Summary',
    summaryIncome: 'Income',
    summaryExpenses: 'Expenses',
    summarySaved: 'Saved',
    summaryRemaining: 'Remaining',
    copyLastMonth: 'Copy last month',
    copiedLastMonth: 'Copied from last month',
    clearAmounts: 'Clear amounts',
    clearAmountsConfirm: 'Clear all amounts in every month? Your layout is kept.',
    clearedAmounts: 'All amounts cleared',
    howItWorks: 'How it works',
    gotIt: 'Got it!',
    showGuide: 'Show the guide',
    customHelpTitle: 'Build your own budget',
    customHelpIntro: 'This is where you build the budget exactly how you want — create blocks for income, expenses, savings and notes.',
    customHelp: [
      { title: 'Add blocks', body: 'Tap "Add block", give it a name, and choose what it is — money In, Out, Savings, or a Note.' },
      { title: 'In / Out / Savings', body: 'The tag decides how a block counts. The Summary uses it to work out what’s left.' },
      { title: 'Your own rows', body: 'Inside a block, add as many category rows as you like and type in the amounts.' },
      { title: 'Resize', body: 'Set each block to Full, Half or ⅓ width. On phone they become tap-to-open tiles.' },
      { title: 'Colour & emoji', body: 'Give any block its own background colour and icon — make it yours.' },
      { title: 'Charts', body: 'Turn on a chart and pick the style (donut, pie, bars, treemap…), size, and where it sits.' },
      { title: 'Targets', body: 'Set a goal amount and a progress bar fills toward it.' },
      { title: 'Notes', body: 'Add a text block for reminders or plans, right beside your money.' },
      { title: 'Summary', body: 'Add a Summary block — it adds up Income − Expenses automatically and shows the change vs last month.' },
      { title: 'Copy last month', body: 'One tap brings last month’s amounts into this month so you don’t retype.' },
      { title: 'Edit layout', body: 'Drag to reorder (↑↓ on phone), ⚙ to configure, ✕ to remove, 🧹 to clear all amounts.' },
    ],
    cfgEmoji: 'Emoji',
    cfgEmojiDefault: 'Default',
    cfgTarget: 'Target',
    kindNote: 'NOTE',
    addNote: 'Note',
    newNoteName: 'Note',
    notePlaceholder: 'Write a note…',
    currency: 'Currency',
    currencyHint: "Changes only the symbol and format — amounts aren't converted",
    theme: 'Theme',
    whatsNew: "What's new",
    whatsNewLatest: 'Latest',
    badgeNew: 'NEW',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeTitle: 'Theme',
    themeClose: 'Close',
    presets: 'Presets',
    accent: 'Accent',
    accentLavender: 'Lavender',
    accentViolet: 'Violet',
    accentSky: 'Sky blue',
    accentTeal: 'Teal',
    accentGreen: 'Green',
    accentRose: 'Rose',
    accentAmber: 'Amber',
    accentPink: 'Pink',
    accentCustom: 'Custom accent',
    advancedOverride: 'Advanced — override every color',
    resetToPreset: 'Reset to preset',
    colorBackground: 'Background',
    colorCards: 'Cards',
    colorIncome: 'Income',
    colorExpenses: 'Expenses',
    colorSavings: 'Savings',
    colorAccent: 'Accent',
    paletteNames: {
      sorbet: 'Sorbet',
      ocean: 'Ocean',
      forest: 'Forest',
      sunset: 'Sunset',
      custom: 'Custom',
    },
    copyBudget: 'Copy budget',
    copyNextMonth: 'Next month',
    copyAllRemaining: (n) => `All remaining (${n} months)`,
    copiedTo: (month) => `✓ Copied to ${month}`,
    copiedToMonths: (n) => `✓ Copied to ${n} months`,
    copyPrevMonth: (month) => `Pull from ${month}`,
    copyPrevMonthConfirm: (from, to) =>
      `This replaces income and expenses in ${to} with those from ${from}. Savings are left alone. Continue?`,
    copyPrevMonthEmpty: (month) => `${month} is empty — nothing to pull`,
    backup: 'Data',
    exportData: '⬇ Export data',
    importData: '⬆ Import data',
    importConfirm: 'This will REPLACE all current data with the contents of the file. Continue?',
    importInvalid: 'Invalid file. Please choose a backup exported from this app.',
    importTooNew: 'This file comes from a newer version of the app. Update the app and try again. Your data is unchanged.',
    importCorrupt: 'This file is damaged and could not be read. Nothing was changed — your current data is still here.',
    importWriteFailed: 'The import failed and was cancelled. Your previous data has been restored and is unchanged.',
    resetMonth: '↺ Reset month',
    resetMonthConfirm: (monthName) => `This clears ${monthName} and can't be undone. Continue?`,
    dangerZone: 'Danger zone',
    resetMonthDone: '✓ Month reset',
    prevMonth: 'Previous month',
    nextMonth: 'Next month',
    income: 'Income',
    expenses: 'Expenses',
    remaining: 'Remaining',
    pctOfIncome: 'of income',
    vsPrev: 'vs prev',
    samePrevMonth: '= last month',
    leftAfterBudget: (pct) => `${pct}% left after budgeted expenses`,
    deficitAmount: (amount) => `Overspend: ${amount}`,
    deficitOverBudget: (pct) => `${pct}% over your income`,
    incomeSection: 'Income',
    addRow: '+ Add row',
    deleteRow: 'Delete row',
    newRow: 'New row',
    chartExpenseDistribution: 'Expense distribution',
    chartPerCategory: 'Per category',
    chartTotal: 'Total',
    chartGrowth: (year) => `Growth ${year}`,
    placeholderExpenses: 'Fill in a few expenses and the chart appears here',
    placeholderSavings: 'Fill in savings & investments to see the growth',
    totalSaved: 'Total saved',
    savedThisMonth: 'Saved this month',
    savedPrevMonth: 'Saved last month',
    notRecorded: 'Not recorded',
    notRecordedHint: 'Enter your savings balance for this month and we\'ll work it out',
    pensionBox: 'Pension',
    planOverview: 'Overview',
    overviewSavingsRate: 'Savings rate',
    overviewSavedThisMonth: 'Saved this month',
    overviewGoalProgress: 'Goal progress',
    goalProgressSummary: 'Goal progress',
    noGoalsSummary: 'No goals yet — add one below',
    savingsGoals: 'Savings goals',
    newGoal: '+ New goal',
    newGoalName: 'New goal',
    goalNameLabel: 'Name',
    createGoal: 'Create goal',
    cancel: 'Cancel',
    goalErrorName: 'Enter a name for the goal',
    goalErrorTarget: 'The goal amount must be greater than 0',
    goalErrorTargetRequired: 'Enter a goal amount',
    goalErrorTargetInvalid: 'Enter a valid amount between 0 and 999,999,999,999',
    dailyBudgetTitle: 'Left to live on',
    dailyBudgetDaysInMonth: (n, month) => `spread across ${month} (${n} days)`,
    dailyBudgetPerDay: 'Per day',
    dailyBudgetPerWeek: 'Per week',
    sparplanTitle: 'Savings plan',
    sparplanBody: 'Plan your monthly saving and expected return — and watch compound growth do its work.',
    sparplanMonthly: 'Monthly saving',
    sparplanReturn: 'Return per year (%)',
    sparplanStartAmount: 'Starting amount',
    sparplanStartMonth: 'Start month (your baseline)',
    sparplanErrAmount: 'Enter an amount between 0 and 999,999,999,999',
    sparplanErrReturn: 'Enter a return between 0 and 100%',
    sparplanErrMonth: 'Enter a real month between 1900 and 2200',
    sparplanDelete: 'Delete savings plan',
    sparplanDeleteConfirm: 'Delete the savings plan? Your monthly data and goals are not affected.',
    sparplanIn5Years: 'in 5 years',
    sparplanNow: 'Now',
    sparplanMonth: (n) => `Month ${n}`,
    sparplanOfWhichGrowth: (amount) => `of which ${amount} is growth`,
    sparplanWithGrowth: 'With growth',
    sparplanDepositsOnly: 'Deposits only',
    sparplanVsTitle: 'Plan vs reality',
    sparplanVsBody: 'Your plan (dashed) compared with what you have actually saved.',
    sparplanSinceStart: 'since start',
    sparplanPlanLine: 'Plan',
    sparplanAhead: (amount) => `${amount} ahead of plan`,
    sparplanBehind: (amount) => `${amount} behind plan`,
    sparplanOnTrack: 'On track with the plan',
    noGoals: 'No goals yet — click "+ New goal" to get started',
    deleteGoal: 'Delete goal',
    linkedToBudget: 'Linked to budget',
    linkedRowTitle: 'Linked row in Budget → Savings',
    saved: 'Saved',
    goal: 'Goal',
    of: 'of',
    deadline: 'Deadline',
    notes: 'Notes & Strategy',
    notesPlaceholder: 'Write your plan, strategy, thoughts on investments...',
    yearOverview: (year) => `Year overview ${year}`,
    yearChartTitle: 'Income vs Expenses',
    colMonth: 'Month',
    colIncome: 'Income',
    colExpenses: 'Expenses',
    colSavingsBalance: 'Savings balance',
    colSavedDuringYear: 'Saved during the year',
    yearBaselineHint: (year) => `Record your savings balance for December ${year - 1} and we can work out how much you saved during ${year}.`,
    colRemaining: 'Remaining',
    yearTotal: 'Full year',
    yearEmpty: 'No data for this year yet',
    clickToEdit: 'Click to edit',
    invalidAmount: 'Invalid amount — enter a number between 0 and 999,999,999,999',
    ariaEditAmount: (name, amount) => `Edit amount for ${name}, now ${amount}`,
    ariaAmountInput: (name) => `Amount for ${name}`,
    ariaOpenMenu: 'Open menu',
    ariaEditCategory: (name) => `Edit category: ${name}`,
    ariaCollapse: (name) => `Collapse ${name}`,
    ariaExpand: (name) => `Show ${name}`,
    ariaDeleteRow: (name) => `Delete row: ${name}`,
    ariaRemoveSection: (name) => `Remove section: ${name}`,
    ariaRowColor: (name) => `Colour for ${name}`,
    ariaNameField: (name) => `Name: ${name}`,
    clickToRename: 'Click to rename',
    addCategory: '+ Add category',
    newCategory: 'New category',
    editCategory: 'Edit category',
    doneEditing: 'Done',
    deleteCategory: 'Delete category',
    deleteCategoryConfirm: (name) => `Delete the category "${name}" and all its rows?`,
    categoryName: 'Category name',
    chooseIcon: 'Choose icon',
    chooseColor: 'Choose color',
    protectedCategory: 'Linked to Plan — cannot be deleted',
    goalUnlinkedFromBudget: (goal) => `"${goal}" is no longer linked to your budget. The goal keeps what you've saved.`,
    protectedSavingsCategory: 'Default category — cannot be deleted',
    backupReminder: "Back up your data so you don't lose it",
    backupReminderShort: 'Backup recommended',
    backupReminderExport: 'Export now',
    backupReminderDismiss: 'Dismiss',
    lineSparkonto: 'Savings account',
    lineIsk: 'Investment account',
    lineFonder: 'Funds',
    chartTypeArea: 'Area',
    chartTypeLine: 'Line',
    chartTypeStacked: 'Stacked',
  },
  es: {
    tabBudget: 'Presupuesto',
    tabSavings: 'Ahorro e Inversiones',
    tabSavingsShort: 'Ahorro',
    tabPlan: 'Plan y Resumen',
    tabPlanShort: 'Plan',
    tabYear: 'Año',
    tabYearShort: 'Año',
    menu: 'Menú',
    menuTitle: 'Ajustes y herramientas',
    language: 'Idioma',
    layout: 'Diseño',
    layoutClassic: 'Clásico',
    layoutCombined: 'Combinado',
    layoutCustom: 'Personalizado',
    editLayout: 'Editar diseño',
    duplicateBlock: 'Duplicar bloque',
    deleteBlockHistoryConfirm: (months) => `Este bloque tiene importes en ${months} ${months === 1 ? 'otro mes' : 'otros meses'}. Desaparecerán de la vista anual si lo eliminas. ¿Continuar?`,
    yearArchivedNote: (amount) => `${amount} no se pudo asociar a ningún bloque — filas eliminadas antes de que la app empezara a guardar el historial.`,
    copyOverwriteOne: (target, source) => `${target} ya tiene un presupuesto. ¿Reemplazar sus ingresos y gastos con ${source}?`,
    copyOverwriteMany: (n) => `${n} de los meses restantes ya tienen presupuesto. ¿Reemplazarlos?`,
    copyNothingToDo: 'Nada que traer — ese mes está vacío.',
    periodSection: 'Periodo de pago',
    periodStartDay: 'El periodo empieza el día',
    periodStartHint: 'Solo se muestra como texto bajo el mes — no cambia ningún importe.',
    periodStartOff: 'Desactivado',
    periodLabelAria: (month) => `Texto propio del periodo para ${month}`,
    periodLabelPlaceholder: 'Texto propio',
    periodMonth: 'Cada mes', periodQuarter: 'Trimestral', periodYear: 'Anual', periodOnce: 'Pago único',
    periodAria: (row) => `Cuándo se cobra ${row}`,
    periodChargedNote: (p) => p === 'year' ? 'se cobra una vez al año' : p === 'quarter' ? 'se cobra cada trimestre' : 'pago único',
    insightDeficit: (over) => `Los gastos superan los ingresos en ${over}.`,
    insightSavingsDown: (amount) => `Tu ahorro bajó ${amount} este mes.`,
    insightGoalClose: (name, remaining) => `Solo faltan ${remaining} para ${name}.`,
    insightSavingsStreak: (months) => `Tu ahorro ha crecido ${months} meses seguidos.`,
    insightSavedRate: (pct) => `Apartaste el ${pct} % de tus ingresos este mes.`,
    insightTopCategory: (name, pct) => `${name} es tu mayor gasto: el ${pct} % de los ingresos.`,
    tplHousing: 'Vivienda', tplRent: 'Alquiler', tplUtilities: 'Luz e Internet',
    tplFood: 'Comida', tplGroceries: 'Comestibles',
    tplTransport: 'Transporte', tplCommute: 'Viajes',
    tplSavings: 'Ahorro', tplBuffer: 'Reserva',
    copyOfName: (name) => `${name} (copia)`,
    moveUp: 'Subir',
    moveDown: 'Bajar',
    dragToReorder: 'Arrastra para reordenar',
    chartStyleDonut: 'Dona',
    chartStyleBars: 'Barras',
    chartStylePie: 'Circular',
    chartStyleList: 'Lista',
    chartStyleStacked: 'Apilado',
    chartStyleTreemap: 'Mapa de árbol',
    chartStyleRadial: 'Radial',
    customEmptyTitle: 'Tu panel está vacío',
    customEmptyBody: 'Añade las secciones que quieras.',
    removeSection: 'Quitar sección',
    sectionSettings: 'Ajustes de sección',
    cfgBackground: 'Fondo',
    cfgBgNone: 'Ninguno',
    cfgShowChart: 'Mostrar gráfico',
    cfgChartType: 'Tipo de gráfico',
    cfgChartSize: 'Tamaño',
    cfgSizeS: 'S',
    cfgSizeM: 'M',
    cfgSizeL: 'L',
    cfgWidth: 'Ancho',
    cfgWidthFull: 'Completo',
    cfgWidthHalf: 'Mitad',
    cfgWidthThird: 'Tercio',
    cfgDone: 'Listo',
    addStarterCategories: 'Añadir categorías iniciales',
    welcomeTitle: '¡Bienvenido a Budgetapp!',
    welcomeBody: 'Una forma sencilla y privada de planificar tu presupuesto mensual y tus ahorros.',
    welcomeFeatBudget: 'Controla ingresos, gastos y metas de ahorro',
    welcomeFeatOffline: 'Funciona sin conexión: tus datos se quedan en este dispositivo',
    welcomeFeatThemes: 'Hazla tuya con temas e idiomas',
    welcomeStart: 'Empezar',
    onboardBudgetTitle: 'Empieza con tu presupuesto mensual',
    onboardBudgetBody: 'Elige una plantilla lista o construye el presupuesto tú mismo.',
    useBudgetTemplate: 'Usar plantilla de presupuesto',
    startFromEmpty: 'Empezar con un presupuesto vacío',
    templateIncludes: 'La plantilla incluye ingresos, vivienda, comida, transporte y ahorro.',
    onboardSavingsTitle: 'Empieza a ahorrar',
    onboardSavingsBody: 'Añade una plantilla de ahorro con cuenta, inversiones y pensión.',
    useSavingsTemplate: 'Usar plantilla de ahorro',
    addBlock: 'Añadir bloque',
    newBlockName: 'Bloque nuevo',
    newRowName: 'Fila nueva',
    blockTotal: 'Total',
    quickStartCustom: 'Inicio rápido',
    cfgTag: 'Tipo',
    tagIn: 'Ent.',
    tagOut: 'Sal.',
    tagSave: 'Ahorro',
    kindIn: 'ENTRADA',
    kindOut: 'SALIDA',
    kindSave: 'AHORRO',
    kindSummary: 'RESUMEN',
    cfgCustomColor: 'Color propio',
    cfgChartPosition: 'Posición del gráfico',
    posTop: 'Arriba',
    posBottom: 'Abajo',
    posLeft: 'Izquierda',
    posRight: 'Derecha',
    posBetween: 'En medio',
    summaryBlock: 'Resumen',
    summaryIncome: 'Ingresos',
    summaryExpenses: 'Gastos',
    summarySaved: 'Ahorrado',
    summaryRemaining: 'Restante',
    copyLastMonth: 'Copiar mes anterior',
    copiedLastMonth: 'Copiado del mes anterior',
    clearAmounts: 'Borrar importes',
    clearAmountsConfirm: '¿Borrar todos los importes de todos los meses? Se mantiene tu diseño.',
    clearedAmounts: 'Importes borrados',
    howItWorks: 'Cómo funciona',
    gotIt: '¡Entendido!',
    showGuide: 'Ver la guía',
    customHelpTitle: 'Crea tu propio presupuesto',
    customHelpIntro: 'Aquí construyes el presupuesto justo como quieras — crea bloques de ingresos, gastos, ahorro y notas.',
    customHelp: [
      { title: 'Añadir bloques', body: 'Pulsa "Añadir bloque", ponle un nombre y elige qué es: dinero que Entra, Sale, Ahorro o una Nota.' },
      { title: 'Entrada / Salida / Ahorro', body: 'La etiqueta decide cómo cuenta el bloque. El Resumen la usa para calcular lo que queda.' },
      { title: 'Tus propias filas', body: 'Dentro de un bloque, añade tantas filas de categoría como quieras y escribe los importes.' },
      { title: 'Cambiar tamaño', body: 'Pon cada bloque a ancho Completo, Medio o ⅓. En el móvil se convierten en fichas que se tocan.' },
      { title: 'Color y emoji', body: 'Dale a cualquier bloque su propio color de fondo e icono: hazlo tuyo.' },
      { title: 'Gráficos', body: 'Activa un gráfico y elige el estilo (dona, tarta, barras, mapa de árbol…), el tamaño y dónde se coloca.' },
      { title: 'Objetivos', body: 'Define un importe objetivo y una barra de progreso se llena hacia él.' },
      { title: 'Notas', body: 'Añade un bloque de texto para recordatorios o planes, junto a tu dinero.' },
      { title: 'Resumen', body: 'Añade un bloque de Resumen: suma Ingresos − Gastos automáticamente y muestra el cambio respecto al mes anterior.' },
      { title: 'Copiar mes anterior', body: 'Un toque trae los importes del mes anterior a este mes para no volver a escribirlos.' },
      { title: 'Editar diseño', body: 'Arrastra para reordenar (↑↓ en el móvil), ⚙ para configurar, ✕ para quitar, 🧹 para borrar todos los importes.' },
    ],
    cfgEmoji: 'Emoji',
    cfgEmojiDefault: 'Predeterminado',
    cfgTarget: 'Objetivo',
    kindNote: 'NOTA',
    addNote: 'Nota',
    newNoteName: 'Nota',
    notePlaceholder: 'Escribe una nota…',
    currency: 'Moneda',
    currencyHint: 'Solo cambia el símbolo y el formato — los importes no se convierten',
    theme: 'Tema',
    whatsNew: 'Novedades',
    whatsNewLatest: 'Último',
    badgeNew: 'NUEVO',
    themeLight: 'Claro',
    themeDark: 'Oscuro',
    themeTitle: 'Tema',
    themeClose: 'Cerrar',
    presets: 'Preajustes',
    accent: 'Color de acento',
    accentLavender: 'Lavanda',
    accentViolet: 'Violeta',
    accentSky: 'Azul cielo',
    accentTeal: 'Turquesa',
    accentGreen: 'Verde',
    accentRose: 'Rosa fuerte',
    accentAmber: 'Ámbar',
    accentPink: 'Rosa',
    accentCustom: 'Acento personalizado',
    advancedOverride: 'Avanzado — cambiar todos los colores',
    resetToPreset: 'Restablecer al preajuste',
    colorBackground: 'Fondo',
    colorCards: 'Tarjetas',
    colorIncome: 'Ingresos',
    colorExpenses: 'Gastos',
    colorSavings: 'Ahorro',
    colorAccent: 'Acento',
    paletteNames: {
      sorbet: 'Sorbete',
      ocean: 'Océano',
      forest: 'Bosque',
      sunset: 'Atardecer',
      custom: 'Personalizado',
    },
    copyBudget: 'Copiar presupuesto',
    copyNextMonth: 'Mes siguiente',
    copyAllRemaining: (n) => `Todos los restantes (${n} meses)`,
    copiedTo: (month) => `✓ Copiado a ${month}`,
    copiedToMonths: (n) => `✓ Copiado a ${n} meses`,
    copyPrevMonth: (month) => `Traer de ${month}`,
    copyPrevMonthConfirm: (from, to) =>
      `Esto reemplaza los ingresos y gastos de ${to} con los de ${from}. El ahorro no se toca. ¿Continuar?`,
    copyPrevMonthEmpty: (month) => `${month} está vacío — no hay nada que traer`,
    backup: 'Datos',
    exportData: '⬇ Exportar datos',
    importData: '⬆ Importar datos',
    importConfirm: 'Esto REEMPLAZARÁ todos los datos actuales con el contenido del archivo. ¿Continuar?',
    importInvalid: 'Archivo no válido. Elige una copia de seguridad exportada desde esta app.',
    importTooNew: 'El archivo procede de una versión más reciente de la app. Actualízala e inténtalo de nuevo. Tus datos no han cambiado.',
    importCorrupt: 'El archivo está dañado y no se pudo leer. No se ha cambiado nada: tus datos siguen intactos.',
    importWriteFailed: 'La importación falló y se canceló. Tus datos anteriores se han restaurado y están intactos.',
    resetMonth: '↺ Restablecer mes',
    resetMonthConfirm: (monthName) => `Esto borra ${monthName} y no se puede deshacer. ¿Continuar?`,
    dangerZone: 'Zona de peligro',
    resetMonthDone: '✓ Mes restablecido',
    prevMonth: 'Mes anterior',
    nextMonth: 'Mes siguiente',
    income: 'Ingresos',
    expenses: 'Gastos',
    remaining: 'Restante',
    pctOfIncome: 'de los ingresos',
    vsPrev: 'vs anterior',
    samePrevMonth: '= mes anterior',
    leftAfterBudget: (pct) => `${pct}% restante tras los gastos presupuestados`,
    deficitAmount: (amount) => `Déficit: ${amount}`,
    deficitOverBudget: (pct) => `${pct}% por encima de tus ingresos`,
    incomeSection: 'Ingresos',
    addRow: '+ Añadir fila',
    deleteRow: 'Eliminar fila',
    newRow: 'Nueva fila',
    chartExpenseDistribution: 'Distribución de gastos',
    chartPerCategory: 'Por categoría',
    chartTotal: 'Total',
    chartGrowth: (year) => `Crecimiento ${year}`,
    placeholderExpenses: 'Rellena algunos gastos y el gráfico aparecerá aquí',
    placeholderSavings: 'Rellena el ahorro e inversiones para ver el crecimiento',
    totalSaved: 'Ahorro total',
    savedThisMonth: 'Ahorrado este mes',
    savedPrevMonth: 'Ahorrado el mes anterior',
    notRecorded: 'Sin registrar',
    notRecordedHint: 'Introduce tu saldo de ahorro de este mes y lo calculamos',
    pensionBox: 'Pensión',
    planOverview: 'Resumen',
    overviewSavingsRate: 'Tasa de ahorro',
    overviewSavedThisMonth: 'Ahorrado este mes',
    overviewGoalProgress: 'Progreso de metas',
    goalProgressSummary: 'Progreso de metas',
    noGoalsSummary: 'Aún no hay metas — añade una abajo',
    savingsGoals: 'Metas de ahorro',
    newGoal: '+ Nueva meta',
    newGoalName: 'Nueva meta',
    goalNameLabel: 'Nombre',
    createGoal: 'Crear meta',
    cancel: 'Cancelar',
    goalErrorName: 'Escribe un nombre para la meta',
    goalErrorTarget: 'El importe de la meta debe ser mayor que 0',
    goalErrorTargetRequired: 'Introduce un importe para la meta',
    goalErrorTargetInvalid: 'Introduce un importe válido entre 0 y 999.999.999.999',
    dailyBudgetTitle: 'Para vivir este mes',
    dailyBudgetDaysInMonth: (n, month) => `repartido en ${month} (${n} días)`,
    dailyBudgetPerDay: 'Por día',
    dailyBudgetPerWeek: 'Por semana',
    sparplanTitle: 'Plan de ahorro',
    sparplanBody: 'Planifica tu ahorro mensual y el rendimiento esperado — y mira crecer el interés compuesto.',
    sparplanMonthly: 'Ahorro mensual',
    sparplanReturn: 'Rendimiento anual (%)',
    sparplanStartAmount: 'Importe inicial',
    sparplanStartMonth: 'Mes de inicio (tu punto de partida)',
    sparplanErrAmount: 'Introduce un importe entre 0 y 999.999.999.999',
    sparplanErrReturn: 'Introduce un rendimiento entre 0 y 100 %',
    sparplanErrMonth: 'Introduce un mes real entre 1900 y 2200',
    sparplanDelete: 'Eliminar plan de ahorro',
    sparplanDeleteConfirm: '¿Eliminar el plan de ahorro? Tus datos mensuales y metas no se ven afectados.',
    sparplanIn5Years: 'en 5 años',
    sparplanNow: 'Ahora',
    sparplanMonth: (n) => `Mes ${n}`,
    sparplanOfWhichGrowth: (amount) => `de los cuales ${amount} es rendimiento`,
    sparplanWithGrowth: 'Con rendimiento',
    sparplanDepositsOnly: 'Solo aportaciones',
    sparplanVsTitle: 'Plan frente a realidad',
    sparplanVsBody: 'Tu plan (discontinuo) comparado con lo que realmente has ahorrado.',
    sparplanSinceStart: 'desde el inicio',
    sparplanPlanLine: 'Plan',
    sparplanAhead: (amount) => `${amount} por delante del plan`,
    sparplanBehind: (amount) => `${amount} por detrás del plan`,
    sparplanOnTrack: 'En línea con el plan',
    noGoals: 'Aún no hay metas — pulsa "+ Nueva meta" para empezar',
    deleteGoal: 'Eliminar meta',
    linkedToBudget: 'Vinculado al presupuesto',
    linkedRowTitle: 'Fila vinculada en Presupuesto → Ahorro',
    saved: 'Ahorrado',
    goal: 'Meta',
    of: 'de',
    deadline: 'Fecha límite',
    notes: 'Notas y Estrategia',
    notesPlaceholder: 'Escribe tu plan, estrategia, ideas sobre inversiones...',
    yearOverview: (year) => `Resumen anual ${year}`,
    yearChartTitle: 'Ingresos vs Gastos',
    colMonth: 'Mes',
    colIncome: 'Ingresos',
    colExpenses: 'Gastos',
    colSavingsBalance: 'Saldo de ahorro',
    colSavedDuringYear: 'Ahorrado durante el año',
    yearBaselineHint: (year) => `Registra tu saldo de ahorro de diciembre de ${year - 1} y podremos calcular cuánto ahorraste durante ${year}.`,
    colRemaining: 'Restante',
    yearTotal: 'Año completo',
    yearEmpty: 'Aún no hay datos para este año',
    clickToEdit: 'Pulsa para editar',
    invalidAmount: 'Importe no válido — introduce un número entre 0 y 999.999.999.999',
    ariaEditAmount: (name, amount) => `Editar importe de ${name}, ahora ${amount}`,
    ariaAmountInput: (name) => `Importe de ${name}`,
    ariaOpenMenu: 'Abrir menú',
    ariaEditCategory: (name) => `Editar categoría: ${name}`,
    ariaCollapse: (name) => `Contraer ${name}`,
    ariaExpand: (name) => `Mostrar ${name}`,
    ariaDeleteRow: (name) => `Eliminar fila: ${name}`,
    ariaRemoveSection: (name) => `Eliminar sección: ${name}`,
    ariaRowColor: (name) => `Color de ${name}`,
    ariaNameField: (name) => `Nombre: ${name}`,
    clickToRename: 'Pulsa para renombrar',
    addCategory: '+ Añadir categoría',
    newCategory: 'Nueva categoría',
    editCategory: 'Editar categoría',
    doneEditing: 'Listo',
    deleteCategory: 'Eliminar categoría',
    deleteCategoryConfirm: (name) => `¿Eliminar la categoría "${name}" y todas sus filas?`,
    categoryName: 'Nombre de la categoría',
    chooseIcon: 'Elegir icono',
    chooseColor: 'Elegir color',
    protectedCategory: 'Vinculada al Plan — no se puede eliminar',
    goalUnlinkedFromBudget: (goal) => `"${goal}" ya no está vinculada a tu presupuesto. La meta conserva lo que has ahorrado.`,
    protectedSavingsCategory: 'Categoría predeterminada — no se puede eliminar',
    backupReminder: 'Haz una copia de seguridad de tus datos para no perderlos',
    backupReminderShort: 'Copia de seguridad recomendada',
    backupReminderExport: 'Exportar ahora',
    backupReminderDismiss: 'Descartar',
    lineSparkonto: 'Cuenta de ahorro',
    lineIsk: 'Cuenta de inversión',
    lineFonder: 'Fondos',
    chartTypeArea: 'Área',
    chartTypeLine: 'Línea',
    chartTypeStacked: 'Apiladas',
  },
};

interface LangContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Translations;
  currency: Currency;
  setCurrency: (currency: Currency) => void;
  /** Format an amount with the active currency's symbol/grouping (no conversion). */
  money: (amount: number) => string;
}

export const LanguageContext = createContext<LangContextValue>({
  lang: 'sv',
  setLang: () => {},
  t: translations.sv,
  currency: 'sek',
  setCurrency: () => {},
  money: (amount: number) => formatMoney(amount, 'sek'),
});

export function useLang(): LangContextValue {
  return useContext(LanguageContext);
}
