import { createContext, useContext } from 'react';
import type { UndoAction } from './undo';

export type Lang = 'sv' | 'en' | 'es';

/** Runtime check for a stored/imported language. A TypeScript `as Lang` cast
 *  proves nothing at runtime: "xx" sailed through it, `translations["xx"]` came
 *  back undefined and the whole app rendered nothing — with no way to reach the
 *  menu and change it back. Derived from MONTHS, which is Record<Lang, …>, so
 *  adding a language cannot leave this guard behind. Shared with the backup
 *  validator, so the app can never store a value an import would reject. */
export function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(MONTHS, v);
}

/**
 * Which of the three to open in when nothing has been chosen yet.
 *
 * The app used to start in Swedish for everyone, so anyone who did not read
 * Swedish met a Swedish interface and had to find their way into the menu to
 * escape it — on the very first screen, before knowing where the menu was.
 * The device already knows what its owner reads. This asks it.
 *
 * English is the last resort rather than Swedish: for a phone set to German,
 * Polish or Finnish, English is the one of the three most likely to be read.
 *
 * Pure and given its tags, so it is testable without a browser.
 */
export function pickLang(tags: readonly string[]): Lang {
  for (const tag of tags) {
    const base = tag.toLowerCase().split('-')[0];
    if (isLang(base)) return base;
  }
  return 'en';
}

/** The same question, asked of this device. */
export function deviceLang(): Lang {
  const nav: Navigator | undefined = globalThis.navigator;
  const tags = nav?.languages?.length ? [...nav.languages]
    : (nav?.language ? [nav.language] : []);
  return pickLang(tags);
}

/**
 * The currency to start with, from the same signal.
 *
 * Symbol and formatting only — it never converts an amount, here or anywhere
 * else. English text next to "kr" was the old default's other half: coherent
 * for a Swede, puzzling for anyone else.
 */
export function pickCurrency(tags: readonly string[]): Currency {
  for (const tag of tags) {
    const lower = tag.toLowerCase();
    const [base, region] = lower.split('-');
    if (base === 'sv') return 'sek';
    if (base === 'es') return 'eur';
    if (base === 'en') return region === 'gb' ? 'gbp' : 'usd';
    // Somebody else's European locale: the euro is the better guess than kronor.
    if (['de', 'fr', 'it', 'pt', 'nl', 'fi', 'el', 'ga', 'et', 'lv', 'lt', 'sk', 'sl'].includes(base)) {
      return 'eur';
    }
  }
  // Nothing to go on. Dollars rather than kronor, to match the language this
  // same silence gets: English text beside "kr" is the incoherent pair, and a
  // device that tells us nothing is not more likely to be Swedish than not.
  return 'usd';
}

export function deviceCurrency(): Currency {
  const nav: Navigator | undefined = globalThis.navigator;
  const tags = nav?.languages?.length ? [...nav.languages]
    : (nav?.language ? [nav.language] : []);
  return pickCurrency(tags);
}

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

/** Runtime check for a stored/imported currency — same story as isLang: an
 *  unchecked `as Currency` left CURRENCIES[...] undefined and blanked the app.
 *  Derived from CURRENCIES so a new currency cannot be forgotten here. */
export function isCurrency(v: unknown): v is Currency {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(CURRENCIES, v);
}

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
  tabFollowUp: string;
  tabFollowUpShort: string;
  followUpHeading: string;
  followUpIncome: string;
  followUpColCategory: string;
  followUpColPlan: string;
  followUpColActual: string;
  followUpColDiff: string;
  followUpTotalOut: string;
  followUpNotRecorded: string;
  followUpNoEntries: string;
  followUpAddEntry: string;
  followUpManual: string;
  followUpDelete: (text: string) => string;
  followUpDeleteConfirm: (text: string) => string;
  followUpDate: string;
  followUpText: string;
  followUpAmount: string;
  followUpSave: string;
  followUpCancel: string;
  followUpBadAmount: string;
  followUpBadText: string;
  followUpBadDate: string;
  followUpExternalReloaded: string;
  /** Entries that turned out to belong to another month and were moved there
   *  instead of being dropped. The toast offers to go to that month. */
  followUpMovedOut: (n: number) => string;
  /** The spending card at the top of Follow-up — see spending.ts. */
  spendingTitle: string;
  spendingEmpty: string;
  spendingCount: (n: number) => string;
  spendingUnsorted: (amount: string, n: number) => string;
  spendingStatusComplete: string;
  spendingStatusPartial: (category: string) => string;
  spendingStatusInsufficient: string;
  spendingSort: string;
  spendingEvidenceShow: string;
  spendingEvidenceHide: string;
  /** The top of a category's possible range, when some money is unsorted. */
  spendingUpTo: (high: string) => string;
  followUpEmptyBody: string;
  followUpImport: string;
  csvTitle: string;
  csvDropLead: string;
  csvDropSub: string;
  csvPick: string;
  csvUnreadable: string;
  csvNoRows: string;
  csvNoText: string;
  csvColumnsLead: string;
  csvRoleDate: string;
  csvRoleText: string;
  csvRoleAmount: string;
  csvRoleIn: string;
  csvRoleOut: string;
  csvRoleSkip: string;
  csvRemember: string;
  csvContinue: string;
  csvNeedBoth: string;
  /** `choices` is how many category decisions there are; `places` how many
   *  distinct shops. They differ when a shop has both a purchase and a
   *  refund, which must stay separate decisions (review 2026-09-18, F8). */
  csvReviewLead: (rows: number, choices: number, places: number) => string;
  csvSkipped: (n: number) => string;
  csvRows: (n: number) => string;
  csvImportN: (n: number) => string;
  csvUnassigned: (n: number) => string;
  csvDoneAdded: (n: number) => string;
  csvDoneDuplicates: (n: number) => string;
  csvDoneUnassigned: (n: number) => string;
  csvDoneCreated: (n: number) => string;
  /** How many places the sorter placed without being asked. */
  csvSorted: (n: number, total: number) => string;
  csvExistingGroup: string;
  csvChangeColumns: string;
  followUpClear: string;
  followUpClearConfirm: (n: number, monthName: string) => string;
  followUpClearDone: (n: number) => string;
  followUpSpan: (n: number) => string;
  followUpSpanAria: string;
  followUpSpanRange: (from: string, to: string) => string;
  followUpSpanNoBudget: (n: number) => string;
  followUpAdjustPeriod: string;
  followUpOnlyActuals: string;
  followUpUnsorted: string;
  followUpUnsortedHint: string;
  followUpTransfer: string;
  followUpTransferHint: string;
  followUpMoveTo: (place: string) => string;
  followUpNewCategory: string;
  followUpNewCategoryName: string;
  csvSkipGroup: string;
  csvDateOrder: string;
  csvDateOrderDmy: string;
  csvDateOrderMdy: string;
  csvDateOrderReads: (sample: string, read: string) => string;
  csvDateOrderUnsure: string;
  csvNoHeader: string;
  csvToUnsorted: (n: number) => string;
  csvToTransfer: (n: number) => string;
  followUpWithPlan: string;
  followUpByPlace: string;
  followUpByDate: string;
  followUpPeriodStarts: string;
  followUpPeriodReset: string;
  followUpPeriodHint: string;
  csvCreateGroup: string;
  csvWillCreate: (n: number) => string;
  /** Takes you to a month the import wrote to that is not the one on screen. */
  csvGoToMonth: (monthName: string) => string;
  /** Collects entries whose category this month's budget does not have. */
  followUpOutsideBudget: string;
  followUpOutsideBudgetHint: string;
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
  deleteRowHistoryConfirm: (months: number) => string;
  yearArchivedNote: (amount: string) => string;
  // Copy confirmations — every copy path names its target before overwriting.
  copyOverwriteOne: (target: string, source: string) => string;
  copyOverwriteMany: (n: number) => string;
  // Pay-period label under the month heading. Purely descriptive.
  periodSection: string;
  periodStartDay: string;
  periodStartHint: string;
  periodStartOff: string;
  periodRefileConfirm: (n: number, day: string) => string;
  periodRefileDone: (n: number) => string;
  periodLabelAria: (month: string) => string;
  periodLabelPlaceholder: string;
  // Per-row period: how often the typed amount actually falls due.
  periodMonth: string; periodQuarter: string; periodYear: string;
  periodAria: (row: string) => string;
  periodOnce: string;
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
  // ── First run: three cards, then out of the way ────────────────────────
  // The letter below is the app's best writing and stays — under "About the
  // app", where someone who wants it will find it. It is not a first screen:
  // measured at 320px it ran four screen-heights before its button, and a
  // stranger deciding whether to keep the app does not read four screens.
  introPages: { emoji: string; title: string; body: string }[];
  introNext: string;
  introSkip: string;
  introDone: string;
  introStep: (n: number, of: number) => string;
  // The letter, kept for the menu
  welcomeTitle: string;
  /** The letter shown on first run and from the menu, one string per paragraph.
   *  Ariel's own words — edit them as prose, not as UI copy. */
  welcomeLetter: string[];
  welcomeSignature: string;
  welcomeStart: string;
  /** Menu entry that reopens the letter. Without it the text would only ever be
   *  seen by someone installing for the first time. */
  aboutApp: string;
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
  /** Custom's "Kvar" is before saving; this row is after it, which is what
   *  Classic calls "Kvar". Shown only when something was saved. */
  summaryRemainingAfterSaving: string;
  /** Custom keeps its own amounts; says so at the top of the page. */
  customStandalone: string;
  /** An empty month whose previous month is filled in. */
  customMonthEmpty: (month: string) => string;
  customCopyFrom: (month: string) => string;
  /** The phone toolbar's ••• menu. */
  moreActions: string;
  /** Background presets in words, for the swatch buttons. */
  cfgBgPresets: { 'bg-brand': string; 'bg-income': string; 'bg-expense': string; 'bg-savings': string; 'bg-remain': string };
  ariaTargetInput: (block: string) => string;
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
  /** An expense block's target is a ceiling, not a goal. */
  cfgLimit: string;
  /** Headings in the Add block picker. */
  pickerBuildOwn: string;
  /** Linked-panel blocks that show outcome, goals and figures (LinkedInsights). */
  kindActual: string;
  kindGoal: string;
  kindKpi: string;
  actualNoEntries: (month: string) => string;
  actualNothingHere: (name: string) => string;
  actualUnsorted: (amount: string) => string;
  actualIncomeDone: string;
  actualIncomeToCome: (amount: string) => string;
  actualOver: (amount: string) => string;
  actualLeft: (amount: string) => string;
  actualOfBudget: (amount: string) => string;
  actualNoBudget: string;
  actualCount: (n: number) => string;
  goalMissing: string;
  goalOf: (amount: string) => string;
  goalBy: (month: string) => string;
  goalThisMonth: (amount: string, month: string) => string;
  kpiNoIncome: string;
  kpiLargest: string;
  kpiShare: (pct: number) => string;
  kpiNothing: string;
  pickerNewCategory: string;
  pickerOutcome: string;
  pickerGoals: string;
  pickerFigures: string;
  /** Quick entry: every amount of the month in one list. */
  quickEntry: string;
  quickEntryTitle: (month: string) => string;
  quickEntryEmpty: string;
  quickEntrySaved: string;
  /** The guide for a linked panel. */
  customHelpLinkedIntro: string;
  customHelpLinked: { title: string; body: string }[];
  /** Custom linked to the regular budget (CustomLinked.tsx) and the choice. */
  customLinkedNote: string;
  linkedMissing: (name: string, month: string) => string;
  linkedRemove: string;
  ariaLinkedRemove: (name: string) => string;
  pickerFromBudget: string;
  pickerOther: string;
  linkedAllShown: string;
  startOver: string;
  startOverConfirmStandalone: string;
  startOverConfirmLinked: string;
  customChooseAgain: string;
  choiceTitle: string;
  choiceIntro: string;
  choiceLinkedTitle: string;
  choiceLinkedBody: string;
  choiceLinkedCta: string;
  choiceStandaloneTitle: string;
  choiceStandaloneBody: string;
  choiceStandaloneCta: string;
  choiceChangeLater: string;
  /** Where a note block is shown: one month, or all of them. */
  noteScope: string;
  noteScopeMonth: (month: string) => string;
  noteScopeAll: string;
  pickerReadyMade: string;
  ariaLimitInput: (block: string) => string;
  targetReached: string;
  targetToGo: (amount: string) => string;
  limitLeft: (amount: string) => string;
  limitOver: (amount: string) => string;
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
  /** The browser tab / installed-app title. Follows the interface language,
   *  which the <title> in index.html cannot do on its own. */
  appTitle: string;
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
  saveFailedTitle: string;
  saveFailedBody: string;
  saveRetry: string;
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
  /** Used instead when the month also holds recorded entries, which the reset
   *  deliberately does NOT touch — so the dialog says so rather than leaving
   *  the user to discover it. */
  resetMonthConfirmKept: (monthName: string, n: number) => string;
  resetMonthDone: string;
  dangerZone: string;
  // Undo — the step back from the buttons above. See src/undo.ts.
  undo: string;
  /** What the step back would take back, named in the CURRENT language: an undo
   *  entry stores the month as numbers rather than as a sentence, so a user who
   *  switches language does not find yesterday's actions written in the old one.
   *  `where` is "September 2026" or empty; `count` is 0 when it does not apply. */
  undoWhat: (action: UndoAction, where: string, count: number) => string;
  undoDone: string;
  undoFailed: string;
  undoDismiss: string;
  // Triage — the short list of decisions the leftover pile becomes. src/triage.ts
  triageWaiting: (n: number) => string;
  triageOpen: string;
  triageHide: string;
  triageSkip: string;
  triageOther: string;
  triageCreate: (name: string) => string;
  /** Why a category is being proposed. Shown, because "you corrected this
   *  yourself" and "a built-in list guessed" deserve different trust. */
  triageSource: (source: 'rule' | 'history' | 'seed') => string;
  triageAllDone: string;
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
  privacyTitle: string;
  /** Paragraphs; a line beginning "## " is a heading. */
  privacyBody: string[];
  privacyUpdated: string;
  privacyClose: string;
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
  monthNotFilledHint: string;
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
  /** The escalation, after roughly six months. Says what is actually at stake
   *  rather than repeating "recommended" in a louder colour. */
  backupUrgent: (months: number) => string;
  /** The same escalation for someone who has never exported at all — where the
   *  count is months of USING the app, not months since a backup. */
  backupNeverUrgent: (months: number) => string;
  /** Always visible in the menu, so the user never has to guess. */
  backupLast: (date: string) => string;
  backupNever: string;
  /** Shown after a plain browser download, which the web platform cannot report
   *  on. The date in the menu is a promise that a file exists, so it is only
   *  written on a yes (review 2026-09-18, F5). */
  backupConfirmSaved: string;
  backupSaved: string;
  // ── The guide to the follow-up tab ──────────────────────────────────────
  // Same shape as privacyBody: a '## ' prefix makes a heading, everything else
  // is a paragraph. One array per language rather than a dozen keys, because
  // this is prose and prose is edited as a whole.
  followUpHelp: string;
  followUpHelpTitle: string;
  followUpHelpBody: string[];
  followUpHelpClose: string;
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
    tabFollowUp: 'Uppföljning',
    tabFollowUpShort: 'Utfall',
    followUpHeading: 'Plan och utfall',
    followUpIncome: 'Inkomst',
    followUpColCategory: 'Kategori',
    followUpColPlan: 'Plan',
    followUpColActual: 'Utfall',
    followUpColDiff: 'Skillnad',
    followUpTotalOut: 'Totalt ut',
    followUpNotRecorded: 'Inget registrerat här ännu',
    followUpNoEntries: 'Inga poster ännu.',
    followUpAddEntry: 'Lägg till post',
    followUpManual: 'för hand',
    followUpDelete: (text) => `Ta bort ${text}`,
    followUpDeleteConfirm: (text) => `Ta bort "${text}"? Posten försvinner ur utfallet.`,
    followUpDate: 'Datum',
    followUpText: 'Vad gällde det?',
    followUpAmount: 'Belopp',
    followUpSave: 'Lägg till',
    followUpCancel: 'Avbryt',
    followUpBadAmount: 'Skriv ett belopp större än noll.',
    followUpBadText: 'Skriv vad posten gällde.',
    followUpBadDate: 'Välj ett datum inom månaden som visas.',
    followUpExternalReloaded: 'Utfallet ändrades i en annan flik. Den senaste versionen har lästs in — gör din ändring igen om det behövs.',
    followUpMovedOut: (n) => (n === 1
      ? '1 post hör till en annan månad efter din löneperiod och flyttades dit.'
      : `${n} poster hör till en annan månad efter din löneperiod och flyttades dit.`),
    spendingTitle: 'Vad gick pengarna till?',
    spendingEmpty: 'Inga utgifter är importerade för den här perioden.',
    spendingCount: (n) => (n === 1 ? '1 transaktion räknades.' : `${n} transaktioner räknades.`),
    spendingUnsorted: (amount, n) => (n === 1
      ? `${amount} i 1 post är ännu osorterat.`
      : `${amount} i ${n} poster är ännu osorterat.`),
    spendingStatusComplete: 'Allt är sorterat, så svaret är exakt.',
    spendingStatusPartial: (category) => `${category} är störst även om allt osorterat skulle höra till en annan kategori.`,
    spendingStatusInsufficient: 'Det osorterade är stort nog att ändra ordningen. Sortera det för ett säkert svar.',
    spendingSort: 'Sortera de här',
    spendingEvidenceShow: 'Visa underlag',
    spendingEvidenceHide: 'Dölj underlag',
    spendingUpTo: (high) => `kan vara upp till ${high}`,
    followUpEmptyBody: 'Här står din plan bredvid vad som faktiskt hände. Öppna en kategori och lägg till det du betalat — varje siffra går att fälla ut och läsa rad för rad.',
    followUpImport: 'Importera kontoutdrag',
    csvTitle: 'Importera kontoutdrag',
    csvDropLead: 'Släpp din fil här',
    csvDropSub: 'CSV från din bank. Filen lämnar aldrig den här enheten.',
    csvPick: 'Välj fil',
    csvUnreadable: 'Filen gick inte att läsa. Är det en CSV-fil från banken?',
    csvNoRows: 'Hittade inga transaktioner i filen.',
    csvNoText: '(utan text)',
    csvColumnsLead: 'Stämmer det här? Välj vad varje kolumn innehåller.',
    csvRoleDate: 'Datum',
    csvRoleText: 'Text',
    csvRoleAmount: 'Belopp',
    csvRoleIn: 'Insättning',
    csvRoleOut: 'Uttag',
    csvRoleSkip: 'Hoppa över',
    csvRemember: 'Appen kommer ihåg uppställningen och frågar inte nästa gång du hämtar från samma bank.',
    csvContinue: 'Fortsätt',
    csvNeedBoth: 'Välj minst en datumkolumn och en beloppskolumn.',
    csvReviewLead: (rows, choices, places) => places === choices
      ? `${rows} transaktioner, ${places} olika ställen. Välj kategori per ställe.`
      : `${rows} transaktioner, ${choices} kategorival för ${places} ställen. Köp och återbetalning från samma ställe väljs var för sig.`,
    csvSkipped: (n) => `${n} rader kunde inte läsas och hoppas över.`,
    csvRows: (n) => (n === 1 ? '1 post' : `${n} poster`),
    csvImportN: (n) => `Importera ${n} poster`,
    csvUnassigned: (n) => `${n} utan kategori importeras inte.`,
    csvDoneAdded: (n) => (n === 1 ? '1 post importerad' : `${n} poster importerade`),
    csvDoneDuplicates: (n) => `${n} fanns redan`,
    csvDoneUnassigned: (n) => `${n} utan kategori`,
    csvGoToMonth: (monthName) => `Visa ${monthName}`,
    csvDoneCreated: (n) => (n === 1 ? '1 ny kategori' : `${n} nya kategorier`),
    csvSorted: (n, total) => `${n} av ${total} placerades i en kategori åt dig.`,
    csvExistingGroup: 'I din budget',
    csvChangeColumns: '↩ Ändra kolumner',
    followUpClear: 'Rensa månadens utfall',
    followUpClearConfirm: (n, monthName) => `${n === 1 ? `Detta tar bort den enda posten för ${monthName}` : `Detta tar bort alla ${n} poster för ${monthName}`}.\n\nBudgeten påverkas inte, och du kan ångra det direkt efteråt.\n\nVill du fortsätta?`,
    followUpClearDone: (n) => (n === 1 ? '1 post borttagen' : `${n} poster borttagna`),
    followUpSpan: (n) => (n === 1 ? 'Månad' : `${n} mån`),
    followUpSpanAria: 'Hur många månader som visas',
    followUpSpanRange: (from, to) => `${from} – ${to}`,
    followUpSpanNoBudget: (n) => (n === 1 ? '1 månad i spannet har ingen budget och räknas inte i planen.' : `${n} månader i spannet har ingen budget och räknas inte i planen.`),
    followUpAdjustPeriod: 'Justera',
    followUpOnlyActuals: 'Bara utfall',
    followUpUnsorted: 'Övrigt',
    followUpUnsortedHint: 'Köp appen inte kunde placera. Flytta dem till en kategori — den minns valet till nästa gång.',
    followUpTransfer: 'Överföring',
    followUpTransferHint: 'Pengar mellan dina egna konton, Swish till och från personer, uttag. Räknas inte som utgift — det är samma pengar i en annan ficka.',
    followUpMoveTo: (place) => `Flytta ${place} till en annan kategori`,
    followUpNewCategory: '+ Ny kategori…',
    followUpNewCategoryName: 'Vad ska den heta?',
    csvSkipGroup: '— hoppa över —',
    csvDateOrder: 'Datumen läses som',
    csvDateOrderDmy: 'Dag först — 31/12/2026',
    csvDateOrderMdy: 'Månad först — 12/31/2026',
    csvDateOrderReads: (sample, read) => `${sample} blir ${read}`,
    csvDateOrderUnsure: 'Filen säger inte vilket. Kontrollera exemplet.',
    csvNoHeader: 'Filen har inga kolumnnamn — kolumnerna heter #1, #2 och så vidare. Alla rader är transaktioner.',
    csvToUnsorted: (n) => (n === 1 ? '1 ställe hamnar i Övrigt.' : `${n} ställen hamnar i Övrigt.`),
    csvToTransfer: (n) => (n === 1 ? '1 ställe hamnar i Överföring.' : `${n} ställen hamnar i Överföring.`),
    followUpWithPlan: 'Visa plan',
    followUpByPlace: 'Per ställe',
    followUpByDate: 'Per datum',
    followUpPeriodStarts: 'Perioden börjar',
    followUpPeriodReset: 'Återgå till regeln',
    followUpPeriodHint: 'Gäller bara den här månaden. Övriga följer startdagen i menyn, med helgjustering.',
    csvCreateGroup: 'Skapa ny kategori',
    csvWillCreate: (n) => (n === 1 ? '1 ny kategori skapas.' : `${n} nya kategorier skapas.`),
    followUpOutsideBudget: 'Utanför budgeten',
    followUpOutsideBudgetHint: 'Poster i kategorier som den här månadens budget inte har.',
    menu: 'Meny',
    menuTitle: 'Inställningar och verktyg',
    language: 'Språk',
    layout: 'Layout',
    layoutClassic: 'Klassisk',
    layoutCombined: 'Kombinerad',
    layoutCustom: 'Anpassad',
    editLayout: 'Redigera layout',
    duplicateBlock: 'Duplicera block',
    deleteBlockHistoryConfirm: (months) => `Blocket har belopp i ${months} ${months === 1 ? 'månad' : 'månader'}. Tar du bort det försvinner raderna ur månadsbudgeten, men beloppen räknas kvar i årsöversikten — de två vyerna kommer alltså visa olika siffror. Fortsätta?`,
    deleteRowHistoryConfirm: (months) => `Raden har belopp i ${months} ${months === 1 ? 'månad' : 'månader'}. Tar du bort den försvinner den ur månadsbudgeten, men beloppen räknas kvar i årsöversikten. Fortsätta?`,
    yearArchivedNote: (amount) => `${amount} kunde inte kopplas till något block — rader som togs bort innan appen började spara historik.`,
    copyOverwriteOne: (target, source) => `${target} har redan en budget. Ersätta inkomster och utgifter med ${source}?`,
    copyOverwriteMany: (n) => `${n} av de återstående månaderna har redan en budget. Ersätta dem?`,
    periodSection: 'Löneperiod',
    periodStartDay: 'Perioden börjar den',
    periodStartHint: 'Styr vilka poster som hamnar i månaden under Uppföljning. Budgetens belopp påverkas inte.',
    periodRefileConfirm: (n, day) => `${n === 1 ? '1 registrerad post' : `${n} registrerade poster`} flyttas till en annan månad under Uppföljning när perioden ändras till ${day}.\n\nIngenting försvinner — varje post har sitt eget datum. Budgetens belopp påverkas inte.\n\nVill du fortsätta?`,
    periodRefileDone: (n) => (n === 1 ? '✓ 1 post flyttad' : `✓ ${n} poster flyttade`),
    periodStartOff: 'Av',
    periodLabelAria: (month) => `Egen periodtext för ${month}`,
    periodLabelPlaceholder: 'Egen text',
    periodMonth: 'Varje månad', periodQuarter: 'Per kvartal', periodYear: 'Per år', periodOnce: 'Engångskostnad',
    periodAria: (row) => `När ${row} dras`,
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
    introPages: [
      {
        emoji: '🔒',
        title: 'Allt stannar på din enhet',
        body: 'Ingen inloggning, inget konto, ingen server. Det du skriver sparas här och lämnar inte enheten — om du inte själv exporterar en säkerhetskopia.',
      },
      {
        emoji: '✏️',
        title: 'Gör månadens budget',
        body: 'Börja från en mall eller ett tomt ark. Skriv in inkomsten och de utgifter du vet kommer. Några minuter, en gång i månaden.',
      },
      {
        emoji: '📊',
        title: 'Se vad som faktiskt hände',
        body: 'Under Uppföljning läser du in bankens CSV-fil. Appen sorterar posterna och ställer planen bredvid verkligheten — så du ser var pengarna tog vägen.',
      },
    ],
    introNext: 'Nästa',
    introSkip: 'Hoppa över',
    introDone: 'Kom igång',
    introStep: (n, of) => `Steg ${n} av ${of}`,
    welcomeTitle: 'Välkommen till Budgetapp!',
    welcomeLetter: [
      'Den här appen byggde jag först för mig själv. Tidigare skötte jag min budget för hand, på papper, och ville ha samma kontroll fast enklare — så jag byggde den med hjälp av AI.',
      'Den har gett mig överblick över sparande, budget och månad för månad. Den anpassade layouten gjorde jag för den som vill bygga sin egen vy, men jag upptäckte att den fungerar lika bra som en liten plånbok för en resa.',
      'Ekonomi är det som får vardagen att rulla — mat, fritid, nöje, ansvar. Just därför tycker jag att den ska vara din att styra, utan distraktioner.',
      'Därför är appen lokal. Allt lagras på din enhet. Du exporterar och importerar när du vill, utan att någon ser eller lägger sig i. Inga molntjänster, ingen bankkoppling, ingen utomstående.',
      'Numera betyder lokalt inte tjatigt. Du hämtar kontoutdraget som fil från banken, och appen läser och sorterar posterna åt dig — på din egen enhet, utan att filen lämnar den. Rättar du en kategori minns den det, så nästa månad blir mindre jobb än den här.',
      'Vad som kommer härnäst vet jag inte exakt. Jag bygger på det jag själv saknar, och hittills har det visat sig att andra saknar ungefär samma saker.',
      'Du och din ekonomi. Jag hoppas att den hjälper dig framåt.',
    ],
    welcomeSignature: '/Ariel',
    welcomeStart: 'Kom igång',
    aboutApp: 'Om appen',
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
    summaryRemainingAfterSaving: 'Kvar efter sparande',
    customStandalone: 'Fristående budget – påverkar inte din vanliga budget',
    customMonthEmpty: (month) => `${month} är inte ifylld ännu`,
    customCopyFrom: (month) => `Kopiera ${month}`,
    moreActions: 'Fler val',
    cfgBgPresets: {
      'bg-brand': 'Accentfärg', 'bg-income': 'Inkomstfärg', 'bg-expense': 'Utgiftsfärg',
      'bg-savings': 'Sparfärg', 'bg-remain': 'Kvar-färg',
    },
    ariaTargetInput: (block) => `Målbelopp för ${block}`,
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
      { title: 'Dina egna rader', body: 'Inuti ett block skriver du in beloppen. Nya rader, namn och färger ändrar du under Redigera layout.' },
      { title: 'Ändra storlek', body: 'Sätt varje block till Hel, Halv eller ⅓ bredd. På mobilen blir de tryckbara rutor.' },
      { title: 'Färg & emoji', body: 'Ge valfritt block en egen bakgrundsfärg och ikon – gör det till ditt.' },
      { title: 'Diagram', body: 'Slå på ett diagram och välj stil (munk, paj, staplar, trädkarta …), storlek och var det placeras.' },
      { title: 'Mål', body: 'Sätt ett målbelopp så fylls en förloppsmätare på vägen dit. För ett utgiftsblock blir det en gräns, som varnar när den nästan är nådd.' },
      { title: 'Anteckningar', body: 'Lägg till ett textblock för påminnelser eller planer, bredvid dina pengar. Välj om det gäller bara en månad eller alla.' },
      { title: 'Översikt', body: 'Lägg till ett översiktsblock – det räknar Inkomst − Utgifter automatiskt och visar förändringen mot förra månaden.' },
      { title: 'Kopiera förra månaden', body: 'Ett tryck hämtar förra månadens belopp till denna månad så du slipper skriva om.' },
      { title: 'Redigera layout', body: 'Här lägger du till rader och byter namn och färg. Dra för att flytta (↑↓ på mobil), ⚙ för inställningar, ✕ för att ta bort, 🧹 för att rensa alla belopp.' },
    ],
    cfgEmoji: 'Emoji',
    cfgEmojiDefault: 'Standard',
    cfgTarget: 'Mål',
    cfgLimit: 'Gräns',
    pickerBuildOwn: 'Bygg själv',
    kindActual: 'UTFALL',
    kindGoal: 'SPARMÅL',
    kindKpi: 'NYCKELTAL',
    actualNoEntries: (month) => `Inga transaktioner för ${month} ännu. Importera ett kontoutdrag under Uppföljning.`,
    actualNothingHere: (name) => `Inget har registrerats i ${name} ännu.`,
    actualUnsorted: (amount) => `Upp till ${amount} osorterat kan höra hit.`,
    actualIncomeDone: '✓ Allt har kommit in',
    actualIncomeToCome: (amount) => `${amount} har inte kommit in än`,
    actualOver: (amount) => `⚠ ${amount} över budget`,
    actualLeft: (amount) => `${amount} kvar av budgeten`,
    actualOfBudget: (amount) => `av ${amount} i budget`,
    actualNoBudget: 'ingen budget satt',
    actualCount: (n) => (n === 1 ? '1 transaktion' : `${n} transaktioner`),
    goalMissing: 'Sparmålet finns inte längre i Plan.',
    goalOf: (amount) => `av ${amount}`,
    goalBy: (month) => `Klart senast ${month}`,
    goalThisMonth: (amount, month) => `${amount} sparas i ${month}`,
    kpiNoIncome: 'Fyll i inkomsten först.',
    kpiLargest: 'Största kategorin',
    kpiShare: (pct) => `${pct} % av utgifterna`,
    kpiNothing: 'Inga utgifter i budgeten ännu.',
    pickerNewCategory: 'Ny kategori',
    pickerOutcome: 'Utfall',
    pickerGoals: 'Sparmål',
    pickerFigures: 'Nyckeltal',
    quickEntry: 'Snabbinmatning',
    quickEntryTitle: (month) => `Fyll i ${month}`,
    quickEntryEmpty: 'Det finns inga rader att fylla i än. Lägg till block eller rader först.',
    quickEntrySaved: 'Allt sparas medan du skriver.',
    customHelpLinkedIntro: 'Panelen visar din vanliga budget på ditt sätt. Samma belopp, samma kategorier – bara ordnade som du vill.',
    customHelpLinked: [
      { title: 'Samma budget', body: 'Ett belopp du skriver här ändras även under Uppföljning, Sparande, Plan och År. Det finns bara en siffra.' },
      { title: 'Snabbinmatning', body: 'Fyll i alla belopp för månaden i en enda lista.' },
      { title: 'Utfall', body: 'Lägg till ett utfallsblock för en kategori och se vad som faktiskt har gått åt, från transaktionerna du importerat under Uppföljning.' },
      { title: 'Sparmål', body: 'Visa ett mål från Plan direkt i panelen.' },
      { title: 'Nyckeltal', body: 'Största kategorin och Kvar att leva på, samma siffror som i budgeten.' },
      { title: 'Ny kategori', body: 'Skapar en kategori i din vanliga budget för månaden du tittar på.' },
      { title: 'Redigera layout', body: 'Välj vad som visas, ordning, storlek och färg. ✕ tar bara bort blocket från panelen – budgeten ändras inte.' },
      { title: 'Börja om', body: 'Tar dig tillbaka till valet mellan kopplad och fristående. Din vanliga budget rörs inte.' },
    ],
    customLinkedNote: '🔗 Kopplad till din vanliga budget – samma belopp på båda ställena',
    linkedMissing: (name, month) => `${name || 'Kategorin'} finns inte i budgeten för ${month}`,
    linkedRemove: 'Ta bort från panelen',
    ariaLinkedRemove: (name) => `Ta bort ${name} från panelen. Budgeten ändras inte`,
    pickerFromBudget: 'Från din budget',
    pickerOther: 'Övrigt',
    linkedAllShown: 'Allt i din budget visas redan',
    startOver: 'Börja om',
    startOverConfirmStandalone: 'Börja om Anpassad?\n\nAlla block, belopp och anteckningar i Anpassad raderas, i alla månader. Din vanliga budget påverkas inte.\n\nTips: exportera en backup först. Du kan också ångra direkt efteråt.',
    startOverConfirmLinked: 'Börja om Anpassad?\n\nBara panelens upplägg raderas: vilka block som visas, ordningen, färgerna och anteckningarna. Din vanliga budget och alla belopp finns kvar.\n\nDu kan ångra direkt efteråt.',
    customChooseAgain: 'Välj en annan sorts panel',
    choiceTitle: 'Vad ska Anpassad vara?',
    choiceIntro: 'Visa din vanliga budget på ditt eget sätt, eller bygg en separat budget, till exempel för en resa.',
    choiceLinkedTitle: '🔗 Kopplad till min budget',
    choiceLinkedBody: 'Använder kategorierna och beloppen i din vanliga budget. Ändrar du ett belopp syns det på båda ställena. Uppföljning, Sparande, Plan och År följer med.',
    choiceLinkedCta: 'Välj kopplad',
    choiceStandaloneTitle: '👛 Fristående budget',
    choiceStandaloneBody: 'Egna block och belopp som inte påverkar din vanliga budget. Passar resor, projekt och tillfälliga budgetar.',
    choiceStandaloneCta: 'Välj fristående',
    choiceChangeLater: 'Du kan välja om senare med "Börja om" under Redigera layout.',
    noteScope: 'Visas',
    noteScopeMonth: (month) => `Bara ${month}`,
    noteScopeAll: 'Alla månader',
    pickerReadyMade: 'Färdiga block',
    ariaLimitInput: (block) => `Gräns för ${block}`,
    targetReached: '✓ Målet nått',
    targetToGo: (amount) => `${amount} kvar till målet`,
    limitLeft: (amount) => `${amount} kvar av gränsen`,
    limitOver: (amount) => `⚠ ${amount} över gränsen`,
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
    appTitle: 'Budget – Månadsbudget',
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
    saveFailedTitle: 'Kunde inte spara',
    saveFailedBody: 'Ändringen syns på skärmen men är inte sparad. Frigör utrymme i webbläsaren eller exportera dina data, och försök sedan igen.',
    saveRetry: 'Försök spara igen',
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
    resetMonthConfirm: (monthName) => `Detta nollställer budgeten för ${monthName}.\n\nDu kan ångra det direkt efteråt.\n\nVill du fortsätta?`,
    resetMonthConfirmKept: (monthName, n) => `Detta nollställer budgeten för ${monthName}.\n\n${n === 1 ? 'Den registrerade posten' : `De ${n} registrerade posterna`} under Uppföljning ligger kvar — ${n === 1 ? 'den' : 'de'} rensas därifrån.\n\nDu kan ångra det direkt efteråt.\n\nVill du fortsätta?`,
    resetMonthDone: '✓ Budgeten återställd',
    undo: '↩ Ångra',
    undoWhat: (action, where, count) => {
      if (action === 'resetMonth') return `Budgeten för ${where} nollställdes`;
      if (action === 'clearActuals') return count === 1 ? `1 post togs bort i ${where}` : `${count} poster togs bort i ${where}`;
      if (action === 'import') return count === 1 ? '1 post importerades' : `${count} poster importerades`;
      if (action === 'restoreBackup') return 'Säkerhetskopian lästes in';
      if (action === 'copyBudget') return count > 1 ? `Budgeten skrevs över i ${count} månader` : `Budgeten skrevs över i ${where}`;
      if (action === 'deleteCategory') return `En kategori togs bort i ${where}`;
      if (action === 'deleteRow') return where ? `En rad togs bort i ${where}` : 'En rad togs bort';
      if (action === 'deleteEntry') return `En post togs bort i ${where}`;
      if (action === 'deleteGoal') return 'Ett sparmål togs bort';
      if (action === 'deleteBlock') return 'Ett block togs bort i Anpassad';
      if (action === 'clearCustom') return count === 1 ? 'Beloppen i Anpassad rensades i 1 månad' : `Beloppen i Anpassad rensades i ${count} månader`;
      if (action === 'refileRepair') return count === 1 ? '1 post flyttades till rätt månad' : `${count} poster flyttades till rätt månad`;
      if (action === 'resetCustom') return 'Anpassad började om från början';
      if (count === 1) return 'Löneperioden ändrades — 1 post flyttades';
      return count > 0 ? `Löneperioden ändrades — ${count} poster flyttades` : 'Löneperioden ändrades';
    },
    undoDone: '✓ Ångrat',
    undoFailed: 'Kunde inte ångra — enheten nekade skrivningen. Frigör utrymme och försök igen.',
    undoDismiss: 'Stäng',
    triageWaiting: (n) => n === 1 ? '1 post väntar på en kategori' : `${n} poster väntar på en kategori`,
    triageOpen: 'Sortera',
    triageHide: 'Dölj',
    triageSkip: 'Hoppa över',
    triageOther: 'Annan…',
    triageCreate: (name) => `+ ${name}`,
    triageSource: (source) => source === 'rule' ? 'din regel' : source === 'history' ? 'som du gjort förut' : 'förslag',
    triageAllDone: '✓ Inget väntar — allt är sorterat',
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
    privacyTitle: "Integritet",
    privacyBody: [
      "Budgetappen samlar inte in, överför eller delar några personuppgifter.",
      "## Vad Budgetappen är i dag",
      "Budgetappen är en webbsida som du öppnar i webbläsaren och kan lägga till på hemskärmen. Det finns ingen version i App Store eller på Google Play än. Den dagen det gör det uppdateras den här texten — fram till dess beskriver den en webbsida.",
      "## Allt stannar på din enhet",
      "Din budget, dina registrerade utgifter och de kontoutdrag du importerar behandlas och sparas lokalt i din webbläsare. Ingenting av det skickas till utvecklaren eller till någon tredje part. Det finns inget konto, ingen inloggning och ingen databas att skicka något till.",
      "## Kontoutdrag läses på plats",
      "När du importerar en CSV-fil läses den där du är. Innehållet lämnar aldrig din enhet — varken transaktionerna, beloppen eller namnen på ställen du handlat.",
      "## Ingen reklam, ingen analys, ingen spårning",
      "Det finns inga annonsnätverk, ingen besöksstatistik och inga spårningsverktyg. Inte heller några tredjepartsskript som samlar in data i bakgrunden.",
      "Sorteringen som känner igen butiker är en lista som följer med sidan, inte en tjänst den frågar. Den fungerar utan nätverk.",
      "## Ingenting hämtas medan du använder den",
      "Typsnitt, bilder och kod ligger på samma plats som sidan själv — ingenting hämtas från externa servrar. Efter första besöket fungerar den även utan internetanslutning.",
      "## Webbservern",
      "Sidan levereras av en webbserver. Den för, som alla webbservrar, en teknisk logg över förfrågningar som innehåller IP-adress. Loggen används bara för drift. Den kopplas aldrig till något du skrivit in, av det enkla skälet att ingenting du skriver in någonsin skickas dit.",
      "## Radering",
      "Rensar du webbläsarens lagrade data för sidan försvinner allt den har sparat. Utvecklaren har ingen kopia och kan inte återskapa den. Vill du ha en säkerhetskopia gör du den själv via Meny → Exportera data — filen hamnar där du väljer.",
      "## Frågor",
      "Har du en fråga om hur appen hanterar dina uppgifter kan du mejla ariel_padilla@hotmail.com.",
    ],
    privacyUpdated: "Senast uppdaterad 19 september 2026.",
    privacyClose: "Stäng",
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
    yearChartTitle: 'Inkomst, utgifter och sparsaldo',
    monthNotFilledHint: 'Månaden är inte ifylld ännu',
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
    backupNeverUrgent: (months) => `Du har använt appen i ${months} månader utan att säkerhetskopiera en enda gång. Försvinner enheten finns ingenting att återställa från.`,
    backupUrgent: (months) => `Din senaste säkerhetskopia är ${months} månader gammal. Försvinner enheten finns ingenting att återställa från.`,
    backupLast: (date) => `Senaste säkerhetskopia: ${date}`,
    backupNever: 'Senaste säkerhetskopia: aldrig',
    backupConfirmSaved: 'Kontrollera att filen verkligen sparades.\n\nTryck OK så antecknar appen att du har en säkerhetskopia från idag. Avbryt om nedladdningen inte gick igenom — då står datumet kvar som förut.',
    backupSaved: '✓ Säkerhetskopia sparad',
    followUpHelp: 'Hjälp',
    followUpHelpTitle: 'Så fungerar utfallet',
    followUpHelpBody: [
      '## Vad fliken är till för',
      'Budgeten är vad du tänkte. Utfallet är vad som hände. Här står de bredvid varandra, kategori för kategori, så du ser var det gick åt mer än du trodde — och var det gick åt mindre.',
      '## Få in siffrorna',
      'Två vägar: läs in bankens CSV-fil med Importera kontoutdrag, eller skriv in en post för hand med +.',
      'Filen läses på din enhet och skickas ingenstans. Varje post hamnar i den månad dess eget datum tillhör, så en fil som spänner över två månader fyller båda — appen säger vilka den rörde och tar dig dit.',
      '## Perioden',
      'Får du lön den 25:e lever du inte i kalendermånader. Ställ in startdagen, så räknas utfallet från lönedag till lönedag: 25 juli till 24 augusti.',
      'Infaller den 25:e på en helg flyttar appen till närmaste vardag före, för det är då pengarna kom. Blir det ändå fel kan du nåla fast en enskild period för hand — det gäller bara den månaden.',
      '## Sorteraren',
      'Det är ingen AI, och ingenting laddas ner. Det är en lista på 863 namn — butiker, banker och tjänster i Sverige, USA, Spanien och internationellt — plus dina egna rättelser.',
      '1. Den läser texten på raden och letar efter ett namn den känner igen. "ICA NÄRA KUNGSHOLMEN 4711" är ICA.',
      '2. Känner den inte igen något lägger den posten i Övrigt i stället för att gissa. En fel kategori kostar mer än en tom.',
      '3. Flyttar du ett ställe till rätt kategori minns den det. Nästa gång väger din rättelse tyngre än listan.',
      'Det sista är hela poängen. Efter en månad eller två är listan mest din egen. Den är inte smart — den är bara noggrann, och den lyssnar på dig.',
      '## Sortera resten',
      'Sortera tar det som ligger i Övrigt och visar det som en lista med störst belopp först och ett förslag per ställe. Ett tryck flyttar hela stället — alla åtta ICA-posterna på en gång — och lär sig valet.',
      'Förslaget säger varifrån det kommer: din regel, som du gjort förut, eller förslag ur den inbyggda listan. Är den osäker föreslår den ingenting alls.',
      '## Övrigt och Överföring',
      'Övrigt är det sorteraren inte kände igen. Överföring är pengar mellan dina egna konton — de räknas inte som utgift, för att flytta 5 000 kr till sparkontot är inte att spendera 5 000 kr.',
      'Båda går att ändra. Ingenting kastas bort.',
      '## Verktygen',
      'Månad / 3 / 6 / 12 summerar över flera månader. Bra för "hur mycket lägger jag egentligen på mat".',
      'Bara utfall tar bort plan och skillnad och sorterar kategorierna efter var pengarna går. För när frågan inte är "höll jag budgeten" utan "var blöder det".',
      'Per ställe / Per datum visar åtta besök som en rad, eller i tidsordning. Klicka på ett ställe för att se datumen.',
      '## Om du ångrar dig',
      'Rensa månad, en import och en borttagen kategori går att ta tillbaka. Knappen dyker upp direkt efteråt och ligger kvar i ⚙ Meny.',
    ],
    followUpHelpClose: 'Stäng',
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
    tabFollowUp: 'Follow-up',
    tabFollowUpShort: 'Actual',
    followUpHeading: 'Plan and actual',
    followUpIncome: 'Income',
    followUpColCategory: 'Category',
    followUpColPlan: 'Plan',
    followUpColActual: 'Actual',
    followUpColDiff: 'Difference',
    followUpTotalOut: 'Total out',
    followUpNotRecorded: 'Nothing recorded here yet',
    followUpNoEntries: 'No entries yet.',
    followUpAddEntry: 'Add entry',
    followUpManual: 'by hand',
    followUpDelete: (text) => `Delete ${text}`,
    followUpDeleteConfirm: (text) => `Delete "${text}"? The entry leaves your actuals.`,
    followUpDate: 'Date',
    followUpText: 'What was it for?',
    followUpAmount: 'Amount',
    followUpSave: 'Add',
    followUpCancel: 'Cancel',
    followUpBadAmount: 'Enter an amount greater than zero.',
    followUpBadText: 'Say what the entry was for.',
    followUpBadDate: 'Choose a date within the month being shown.',
    followUpExternalReloaded: 'Actuals changed in another tab. The latest version has been loaded — repeat your edit if needed.',
    followUpMovedOut: (n) => (n === 1
      ? '1 entry belongs to another month under your pay period and was moved there.'
      : `${n} entries belong to another month under your pay period and were moved there.`),
    spendingTitle: 'Where did the money go?',
    spendingEmpty: 'No spending has been imported for this period.',
    spendingCount: (n) => (n === 1 ? '1 transaction counted.' : `${n} transactions counted.`),
    spendingUnsorted: (amount, n) => (n === 1
      ? `${amount} in 1 entry is not sorted yet.`
      : `${amount} in ${n} entries is not sorted yet.`),
    spendingStatusComplete: 'Everything is sorted, so this is exact.',
    spendingStatusPartial: (category) => `${category} is the biggest even if everything unsorted belonged to another category.`,
    spendingStatusInsufficient: 'What is unsorted is enough to change the order. Sort it for a sure answer.',
    spendingSort: 'Sort these',
    spendingEvidenceShow: 'Show details',
    spendingEvidenceHide: 'Hide details',
    spendingUpTo: (high) => `could be up to ${high}`,
    followUpEmptyBody: 'Here your plan sits next to what actually happened. Open a category and add what you paid — every figure can be unfolded and read line by line.',
    followUpImport: 'Import statement',
    csvTitle: 'Import bank statement',
    csvDropLead: 'Drop your file here',
    csvDropSub: 'A CSV from your bank. The file never leaves this device.',
    csvPick: 'Choose file',
    csvUnreadable: 'That file could not be read. Is it a CSV from your bank?',
    csvNoRows: 'No transactions found in the file.',
    csvNoText: '(no text)',
    csvColumnsLead: 'Is this right? Choose what each column holds.',
    csvRoleDate: 'Date',
    csvRoleText: 'Text',
    csvRoleAmount: 'Amount',
    csvRoleIn: 'Money in',
    csvRoleOut: 'Money out',
    csvRoleSkip: 'Skip',
    csvRemember: 'The app remembers this layout and will not ask again for the same bank.',
    csvContinue: 'Continue',
    csvNeedBoth: 'Pick at least one date column and one amount column.',
    csvReviewLead: (rows, choices, places) => places === choices
      ? `${rows} transactions, ${places} different places. Choose a category for each.`
      : `${rows} transactions, ${choices} category choices for ${places} places. A purchase and a refund from the same place are chosen separately.`,
    csvSkipped: (n) => `${n} rows could not be read and are skipped.`,
    csvRows: (n) => (n === 1 ? '1 entry' : `${n} entries`),
    csvImportN: (n) => `Import ${n} entries`,
    csvUnassigned: (n) => `${n} without a category are not imported.`,
    csvDoneAdded: (n) => (n === 1 ? '1 entry imported' : `${n} entries imported`),
    csvDoneDuplicates: (n) => (n === 1 ? '1 was already there' : `${n} were already there`),
    csvDoneUnassigned: (n) => `${n} without a category`,
    csvGoToMonth: (monthName) => `Show ${monthName}`,
    csvDoneCreated: (n) => (n === 1 ? '1 new category' : `${n} new categories`),
    csvSorted: (n, total) => `${n} of ${total} were placed in a category for you.`,
    csvExistingGroup: 'In your budget',
    csvChangeColumns: '↩ Change columns',
    followUpClear: "Clear this month's actuals",
    followUpClearConfirm: (n, monthName) => `${n === 1 ? `This removes the only entry for ${monthName}` : `This removes all ${n} entries for ${monthName}`}.\n\nThe budget is not affected, and you can undo it straight afterwards.\n\nContinue?`,
    followUpClearDone: (n) => (n === 1 ? '1 entry removed' : `${n} entries removed`),
    followUpSpan: (n) => (n === 1 ? 'Month' : `${n} mo`),
    followUpSpanAria: 'How many months are shown',
    followUpSpanRange: (from, to) => `${from} – ${to}`,
    followUpSpanNoBudget: (n) => (n === 1 ? '1 month in this span has no budget and is not counted in the plan.' : `${n} months in this span have no budget and are not counted in the plan.`),
    followUpAdjustPeriod: 'Adjust',
    followUpOnlyActuals: 'Actuals only',
    followUpUnsorted: 'Other',
    followUpUnsortedHint: 'Purchases the app could not place. Move them to a category — it remembers the choice for next time.',
    followUpTransfer: 'Transfers',
    followUpTransferHint: 'Money between your own accounts, Swish to and from people, withdrawals. Not counted as spending — it is the same money in another pocket.',
    followUpMoveTo: (place) => `Move ${place} to another category`,
    followUpNewCategory: '+ New category…',
    followUpNewCategoryName: 'What should it be called?',
    csvSkipGroup: '— skip —',
    csvDateOrder: 'Dates are read as',
    csvDateOrderDmy: 'Day first — 31/12/2026',
    csvDateOrderMdy: 'Month first — 12/31/2026',
    csvDateOrderReads: (sample, read) => `${sample} becomes ${read}`,
    csvDateOrderUnsure: 'The file does not say which. Check the example.',
    csvNoHeader: 'This file has no column names — the columns are called #1, #2 and so on. Every row is a transaction.',
    csvToUnsorted: (n) => (n === 1 ? '1 place goes to Other.' : `${n} places go to Other.`),
    csvToTransfer: (n) => (n === 1 ? '1 place goes to Transfers.' : `${n} places go to Transfers.`),
    followUpWithPlan: 'Show plan',
    followUpByPlace: 'By place',
    followUpByDate: 'By date',
    followUpPeriodStarts: 'The period starts',
    followUpPeriodReset: 'Back to the rule',
    followUpPeriodHint: 'This month only. The rest follow the start day in the menu, weekends adjusted.',
    csvCreateGroup: 'Create a new category',
    csvWillCreate: (n) => (n === 1 ? '1 new category will be created.' : `${n} new categories will be created.`),
    followUpOutsideBudget: 'Outside the budget',
    followUpOutsideBudgetHint: "Entries in categories this month's budget does not have.",
    menu: 'Menu',
    menuTitle: 'Settings & tools',
    language: 'Language',
    layout: 'Layout',
    layoutClassic: 'Classic',
    layoutCombined: 'Combined',
    layoutCustom: 'Custom',
    editLayout: 'Edit layout',
    duplicateBlock: 'Duplicate block',
    deleteBlockHistoryConfirm: (months) => `This block has amounts in ${months} ${months === 1 ? 'month' : 'months'}. Deleting it takes the rows out of the monthly budget, but the amounts stay counted in the year overview — so the two views will show different figures. Continue?`,
    deleteRowHistoryConfirm: (months) => `This row has amounts in ${months} ${months === 1 ? 'month' : 'months'}. Deleting it takes it out of the monthly budget, but the amounts stay counted in the year overview. Continue?`,
    yearArchivedNote: (amount) => `${amount} could not be matched to a block — rows deleted before the app started recording history.`,
    copyOverwriteOne: (target, source) => `${target} already has a budget. Replace its income and expenses with ${source}?`,
    copyOverwriteMany: (n) => `${n} of the remaining months already have a budget. Replace them?`,
    periodSection: 'Pay period',
    periodStartDay: 'The period starts on the',
    periodStartHint: 'Decides which entries land in the month under Follow-up. The budget’s amounts are untouched.',
    periodRefileConfirm: (n, day) => `${n === 1 ? '1 recorded entry' : `${n} recorded entries`} will move to a different month under Follow-up when the period changes to ${day}.\n\nNothing is lost — every entry carries its own date. The budget’s amounts are untouched.\n\nContinue?`,
    periodRefileDone: (n) => (n === 1 ? '✓ 1 entry moved' : `✓ ${n} entries moved`),
    periodStartOff: 'Off',
    periodLabelAria: (month) => `Custom period text for ${month}`,
    periodLabelPlaceholder: 'Custom text',
    periodMonth: 'Every month', periodQuarter: 'Quarterly', periodYear: 'Yearly', periodOnce: 'One-off',
    periodAria: (row) => `When ${row} is charged`,
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
    introPages: [
      {
        emoji: '🔒',
        title: 'Everything stays on your device',
        body: 'No sign-in, no account, no server. What you type is kept here and does not leave the device — unless you export a backup yourself.',
      },
      {
        emoji: '✏️',
        title: 'Build the month\u2019s budget',
        body: 'Start from a template or an empty sheet. Type the income and the costs you know are coming. A few minutes, once a month.',
      },
      {
        emoji: '📊',
        title: 'See what actually happened',
        body: 'Under Follow-up you load your bank\u2019s CSV file. The app sorts the entries and puts the plan next to reality — so you can see where the money went.',
      },
    ],
    introNext: 'Next',
    introSkip: 'Skip',
    introDone: 'Get started',
    introStep: (n, of) => `Step ${n} of ${of}`,
    welcomeTitle: 'Welcome to Budgetapp!',
    welcomeLetter: [
      'I built this app for myself first. I used to keep my budget by hand, on paper, and wanted the same control but easier — so I built it with the help of AI.',
      'It has given me an overview of my savings, my budget and each month as it goes. The custom layout I made for anyone who wants to build their own view, but I found it works just as well as a little wallet for a trip.',
      'Money is what keeps everyday life moving — food, free time, small pleasures, responsibilities. That is exactly why I think it should be yours to steer, without distractions.',
      'So the app is local. Everything is stored on your device. You export and import whenever you like, without anyone watching or interfering. No cloud services, no bank connection, no third party.',
      'These days local does not mean tedious. You take your bank statement as a file, and the app reads it and sorts the entries for you — on your own device, without the file ever leaving it. Correct a category and it remembers, so next month is less work than this one.',
      'What comes next I do not exactly know. I build what I miss myself, and so far it has turned out that other people miss much the same things.',
      'You and your money. I hope it helps you forward.',
    ],
    welcomeSignature: '/Ariel',
    welcomeStart: 'Get started',
    aboutApp: 'About the app',
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
    summaryRemainingAfterSaving: 'Left after saving',
    customStandalone: 'A separate budget – it does not change your regular budget',
    customMonthEmpty: (month) => `${month} has not been filled in yet`,
    customCopyFrom: (month) => `Copy ${month}`,
    moreActions: 'More actions',
    cfgBgPresets: {
      'bg-brand': 'Accent colour', 'bg-income': 'Income colour', 'bg-expense': 'Expense colour',
      'bg-savings': 'Savings colour', 'bg-remain': 'Remaining colour',
    },
    ariaTargetInput: (block) => `Target amount for ${block}`,
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
      { title: 'Your own rows', body: 'Inside a block, type in the amounts. New rows, names and colours are changed under Edit layout.' },
      { title: 'Resize', body: 'Set each block to Full, Half or ⅓ width. On phone they become tap-to-open tiles.' },
      { title: 'Colour & emoji', body: 'Give any block its own background colour and icon — make it yours.' },
      { title: 'Charts', body: 'Turn on a chart and pick the style (donut, pie, bars, treemap…), size, and where it sits.' },
      { title: 'Targets', body: 'Set a goal amount and a progress bar fills toward it. On an expense block it becomes a limit that warns you when it is nearly used up.' },
      { title: 'Notes', body: 'Add a text block for reminders or plans, right beside your money. Choose whether it is for one month or every month.' },
      { title: 'Summary', body: 'Add a Summary block — it adds up Income − Expenses automatically and shows the change vs last month.' },
      { title: 'Copy last month', body: 'One tap brings last month’s amounts into this month so you don’t retype.' },
      { title: 'Edit layout', body: 'This is where you add rows and change names and colours. Drag to reorder (↑↓ on phone), ⚙ to configure, ✕ to remove, 🧹 to clear all amounts.' },
    ],
    cfgEmoji: 'Emoji',
    cfgEmojiDefault: 'Default',
    cfgTarget: 'Target',
    cfgLimit: 'Limit',
    pickerBuildOwn: 'Build your own',
    kindActual: 'OUTCOME',
    kindGoal: 'GOAL',
    kindKpi: 'FIGURE',
    actualNoEntries: (month) => `No transactions for ${month} yet. Import a statement under Follow-up.`,
    actualNothingHere: (name) => `Nothing has been recorded in ${name} yet.`,
    actualUnsorted: (amount) => `Up to ${amount} still unsorted could belong here.`,
    actualIncomeDone: '✓ All of it has come in',
    actualIncomeToCome: (amount) => `${amount} has not come in yet`,
    actualOver: (amount) => `⚠ ${amount} over budget`,
    actualLeft: (amount) => `${amount} left of the budget`,
    actualOfBudget: (amount) => `of ${amount} budgeted`,
    actualNoBudget: 'no budget set',
    actualCount: (n) => (n === 1 ? '1 transaction' : `${n} transactions`),
    goalMissing: 'This savings goal is no longer in Plan.',
    goalOf: (amount) => `of ${amount}`,
    goalBy: (month) => `Done by ${month}`,
    goalThisMonth: (amount, month) => `${amount} saved in ${month}`,
    kpiNoIncome: 'Fill in your income first.',
    kpiLargest: 'Biggest category',
    kpiShare: (pct) => `${pct}% of spending`,
    kpiNothing: 'No expenses in the budget yet.',
    pickerNewCategory: 'New category',
    pickerOutcome: 'Outcome',
    pickerGoals: 'Savings goals',
    pickerFigures: 'Figures',
    quickEntry: 'Quick entry',
    quickEntryTitle: (month) => `Fill in ${month}`,
    quickEntryEmpty: 'There are no rows to fill in yet. Add blocks or rows first.',
    quickEntrySaved: 'Everything is saved as you type.',
    customHelpLinkedIntro: 'The panel shows your regular budget your way. Same amounts, same categories – arranged how you like.',
    customHelpLinked: [
      { title: 'One budget', body: 'An amount you type here also changes under Follow-up, Savings, Plan and Year. There is only one figure.' },
      { title: 'Quick entry', body: 'Fill in every amount for the month in a single list.' },
      { title: 'Outcome', body: 'Add an outcome block for a category and see what was actually spent, from the transactions you imported under Follow-up.' },
      { title: 'Savings goals', body: 'Show a goal from Plan right on the panel.' },
      { title: 'Figures', body: 'The biggest category and Left to live on – the same figures as in the budget.' },
      { title: 'New category', body: 'Creates a category in your regular budget for the month you are looking at.' },
      { title: 'Edit layout', body: 'Choose what is shown, the order, size and colour. ✕ only removes the block from the panel – the budget does not change.' },
      { title: 'Start over', body: 'Takes you back to the choice between linked and separate. Your regular budget is not touched.' },
    ],
    customLinkedNote: '🔗 Linked to your regular budget – the same amounts in both places',
    linkedMissing: (name, month) => `${name || 'This category'} is not in the budget for ${month}`,
    linkedRemove: 'Remove from panel',
    ariaLinkedRemove: (name) => `Remove ${name} from the panel. The budget does not change`,
    pickerFromBudget: 'From your budget',
    pickerOther: 'Other',
    linkedAllShown: 'Everything in your budget is already shown',
    startOver: 'Start over',
    startOverConfirmStandalone: 'Start Custom over?\n\nEvery block, amount and note in Custom is deleted, in every month. Your regular budget is not affected.\n\nTip: export a backup first. You can also undo straight afterwards.',
    startOverConfirmLinked: 'Start Custom over?\n\nOnly the panel\'s layout is deleted: which blocks are shown, their order, colours and notes. Your regular budget and every amount stay.\n\nYou can undo straight afterwards.',
    customChooseAgain: 'Choose another kind of panel',
    choiceTitle: 'What should Custom be?',
    choiceIntro: 'Show your regular budget your own way, or build a separate budget, for a trip for example.',
    choiceLinkedTitle: '🔗 Linked to my budget',
    choiceLinkedBody: 'Uses the categories and amounts in your regular budget. Change an amount and it changes in both places. Follow-up, Savings, Plan and Year come along.',
    choiceLinkedCta: 'Choose linked',
    choiceStandaloneTitle: '👛 Separate budget',
    choiceStandaloneBody: 'Its own blocks and amounts, which do not affect your regular budget. Good for trips, projects and temporary budgets.',
    choiceStandaloneCta: 'Choose separate',
    choiceChangeLater: 'You can choose again later with "Start over" under Edit layout.',
    noteScope: 'Shown',
    noteScopeMonth: (month) => `Only ${month}`,
    noteScopeAll: 'Every month',
    pickerReadyMade: 'Ready-made blocks',
    ariaLimitInput: (block) => `Limit for ${block}`,
    targetReached: '✓ Target reached',
    targetToGo: (amount) => `${amount} to go`,
    limitLeft: (amount) => `${amount} left of the limit`,
    limitOver: (amount) => `⚠ ${amount} over the limit`,
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
    appTitle: 'Budget – Monthly budget',
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
    saveFailedTitle: 'Could not save',
    saveFailedBody: 'The change is on screen but has not been stored. Free up space in the browser or export your data, then try again.',
    saveRetry: 'Try saving again',
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
    resetMonthConfirm: (monthName) => `This resets the budget for ${monthName}.\n\nYou can undo it straight afterwards.\n\nContinue?`,
    dangerZone: 'Danger zone',
    resetMonthConfirmKept: (monthName, n) => `This resets the budget for ${monthName}.\n\n${n === 1 ? 'The recorded entry under Follow-up is kept — clear it from there.' : `The ${n} recorded entries under Follow-up are kept — clear those from there.`}\n\nYou can undo it straight afterwards.\n\nContinue?`,
    resetMonthDone: '✓ Budget reset',
    undo: '↩ Undo',
    undoWhat: (action, where, count) => {
      if (action === 'resetMonth') return `The budget for ${where} was reset`;
      if (action === 'clearActuals') return count === 1 ? `1 entry was removed from ${where}` : `${count} entries were removed from ${where}`;
      if (action === 'import') return count === 1 ? '1 entry was imported' : `${count} entries were imported`;
      if (action === 'restoreBackup') return 'The backup was restored';
      if (action === 'copyBudget') return count > 1 ? `The budget was written over ${count} months` : `The budget for ${where} was written over`;
      if (action === 'deleteCategory') return `A category was removed from ${where}`;
      if (action === 'deleteRow') return where ? `A row was removed from ${where}` : 'A row was removed';
      if (action === 'deleteEntry') return `An entry was removed from ${where}`;
      if (action === 'deleteGoal') return 'A savings goal was removed';
      if (action === 'deleteBlock') return 'A block was removed from Custom';
      if (action === 'clearCustom') return count === 1 ? 'Custom amounts were cleared from 1 month' : `Custom amounts were cleared from ${count} months`;
      if (action === 'refileRepair') return count === 1 ? '1 entry was moved to the right month' : `${count} entries were moved to the right month`;
      if (action === 'resetCustom') return 'Custom was started over';
      if (count === 1) return 'The pay period was changed — 1 entry moved';
      return count > 0 ? `The pay period was changed — ${count} entries moved` : 'The pay period was changed';
    },
    undoDone: '✓ Undone',
    undoFailed: 'Could not undo — the device refused the write. Free some space and try again.',
    undoDismiss: 'Dismiss',
    triageWaiting: (n) => n === 1 ? '1 entry is waiting for a category' : `${n} entries are waiting for a category`,
    triageOpen: 'Sort them',
    triageHide: 'Hide',
    triageSkip: 'Skip',
    triageOther: 'Other…',
    triageCreate: (name) => `+ ${name}`,
    triageSource: (source) => source === 'rule' ? 'your rule' : source === 'history' ? 'as you did before' : 'suggestion',
    triageAllDone: '✓ Nothing waiting — everything is sorted',
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
    privacyTitle: "Privacy",
    privacyBody: [
      "Budget does not collect, transmit or share any personal data.",
      "## What Budget is today",
      "Budget is a web page you open in a browser and can add to your home screen. There is no version in the App Store or on Google Play yet. The day there is, this text will be updated — until then it describes a web page.",
      "## Everything stays on your device",
      "Your budget, the spending you record and the bank statements you import are processed and stored locally in your browser. None of it is sent to the developer or to any third party. There is no account, no sign-in and no database to send anything to.",
      "## Statements are read where they are",
      "When you import a CSV file it is read where you are. The contents never leave your device — not the transactions, not the amounts, not the names of the places you shopped.",
      "## No ads, no analytics, no tracking",
      "There are no ad networks, no visitor statistics and no tracking tools. Nor any third-party scripts collecting data in the background.",
      "The sorting that recognises shops is a list that ships with the page, not a service it asks. It works with no network at all.",
      "## Nothing is fetched while you use it",
      "Typefaces, images and code sit in the same place as the page itself — nothing is fetched from external servers. After the first visit it works without an internet connection.",
      "## The web server",
      "The page is served by a web server. Like every web server it keeps a technical log of requests, which includes IP addresses. That log is used only for operations. It is never connected to anything you typed, for the simple reason that nothing you type is ever sent there.",
      "## Deletion",
      "Clear the browser's stored data for the page and everything it has saved is gone. The developer has no copy and cannot recreate it. If you want a backup you make it yourself through Menu → Export data — the file goes wherever you choose.",
      "## Questions",
      "If you have a question about how the app handles your data, you can email ariel_padilla@hotmail.com.",
    ],
    privacyUpdated: "Last updated 19 September 2026.",
    privacyClose: "Close",
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
    yearChartTitle: 'Income, expenses and savings balance',
    monthNotFilledHint: 'This month has not been filled in yet',
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
    backupNeverUrgent: (months) => `You have used the app for ${months} months without backing up once. If the device goes, there is nothing to restore from.`,
    backupUrgent: (months) => `Your last backup is ${months} months old. If the device goes, there is nothing to restore from.`,
    backupLast: (date) => `Last backup: ${date}`,
    backupNever: 'Last backup: never',
    backupConfirmSaved: 'Check that the file really was saved.\n\nPress OK and the app will record that you have a backup from today. Cancel if the download did not go through — the previous date then stays as it was.',
    backupSaved: '✓ Backup saved',
    followUpHelp: 'Help',
    followUpHelpTitle: 'How Follow-up works',
    followUpHelpBody: [
      '## What this tab is for',
      'The budget is what you intended. Follow-up is what happened. Here they stand side by side, category by category, so you can see where more went than you thought — and where less did.',
      '## Getting the figures in',
      'Two ways: load your bank\u2019s CSV file with Import statement, or type an entry by hand with +.',
      'The file is read on your device and sent nowhere. Every entry lands in the month its own date belongs to, so a file spanning two months fills both — the app says which ones it touched and takes you there.',
      '## The period',
      'If you are paid on the 25th you do not live in calendar months. Set the start day and Follow-up counts from payday to payday: 25 July to 24 August.',
      'When the 25th falls on a weekend the app moves to the nearest weekday before it, because that is when the money arrived. If it is still wrong you can pin a single period by hand — that applies to that month only.',
      '## The sorter',
      'It is not an AI, and nothing is downloaded. It is a list of 863 names — shops, banks and services in Sweden, the United States, Spain and internationally — plus your own corrections.',
      '1. It reads the text on the row and looks for a name it knows. "ICA NÄRA KUNGSHOLMEN 4711" is ICA.',
      '2. If it recognises nothing it puts the entry in Övrigt rather than guessing. A wrong category costs more than an empty one.',
      '3. When you move a place to the right category it remembers. Next time your correction outweighs the list.',
      'That last part is the whole point. After a month or two the list is mostly your own. It is not clever — it is only careful, and it listens to you.',
      '## Sorting the rest',
      'Sort them takes what sits in Övrigt and shows it as a list, biggest first, with a proposal per place. One tap moves the whole place — all eight ICA entries at once — and learns the choice.',
      'The proposal says where it came from: your rule, as you did before, or suggestion from the built-in list. When it is unsure it proposes nothing at all.',
      '## Övrigt and Transfer',
      'Övrigt is what the sorter did not recognise. Transfer is money between your own accounts — it does not count as spending, because moving 5 000 kr to your savings account is not spending 5 000 kr.',
      'Both can be changed. Nothing is thrown away.',
      '## The tools',
      'Month / 3 / 6 / 12 sums across several months. Good for "how much do I actually spend on food".',
      'Actuals only drops the plan and difference columns and sorts the categories by where the money goes. For when the question is not "did I keep to the budget" but "where is it bleeding".',
      'By place / By date shows eight visits as one row, or in time order. Tap a place to see the dates.',
      '## If you change your mind',
      'Clearing a month, an import and a deleted category can all be taken back. The button appears right afterwards and stays in the ⚙ Menu.',
    ],
    followUpHelpClose: 'Close',
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
    tabFollowUp: 'Seguimiento',
    tabFollowUpShort: 'Real',
    followUpHeading: 'Plan y realidad',
    followUpIncome: 'Ingresos',
    followUpColCategory: 'Categoría',
    followUpColPlan: 'Plan',
    followUpColActual: 'Real',
    followUpColDiff: 'Diferencia',
    followUpTotalOut: 'Total salidas',
    followUpNotRecorded: 'Aquí no hay nada registrado todavía',
    followUpNoEntries: 'Aún no hay movimientos.',
    followUpAddEntry: 'Añadir movimiento',
    followUpManual: 'a mano',
    followUpDelete: (text) => `Eliminar ${text}`,
    followUpDeleteConfirm: (text) => `¿Eliminar "${text}"? El movimiento sale de tus cifras reales.`,
    followUpDate: 'Fecha',
    followUpText: '¿De qué se trataba?',
    followUpAmount: 'Importe',
    followUpSave: 'Añadir',
    followUpCancel: 'Cancelar',
    followUpBadAmount: 'Escribe un importe mayor que cero.',
    followUpBadText: 'Indica de qué se trataba.',
    followUpBadDate: 'Elige una fecha dentro del mes que se muestra.',
    followUpExternalReloaded: 'Los movimientos cambiaron en otra pestaña. Se cargó la versión más reciente; repite el cambio si hace falta.',
    followUpMovedOut: (n) => (n === 1
      ? '1 movimiento pertenece a otro mes según tu periodo de cobro y se movió allí.'
      : `${n} movimientos pertenecen a otro mes según tu periodo de cobro y se movieron allí.`),
    spendingTitle: '¿A dónde fue el dinero?',
    spendingEmpty: 'No se ha importado ningún gasto para este periodo.',
    spendingCount: (n) => (n === 1 ? 'Se contó 1 movimiento.' : `Se contaron ${n} movimientos.`),
    spendingUnsorted: (amount, n) => (n === 1
      ? `${amount} en 1 movimiento sigue sin clasificar.`
      : `${amount} en ${n} movimientos sigue sin clasificar.`),
    spendingStatusComplete: 'Todo está clasificado, así que es exacto.',
    spendingStatusPartial: (category) => `${category} es la mayor aunque todo lo no clasificado perteneciera a otra categoría.`,
    spendingStatusInsufficient: 'Lo no clasificado basta para cambiar el orden. Clasifícalo para una respuesta segura.',
    spendingSort: 'Clasificar estos',
    spendingEvidenceShow: 'Ver detalles',
    spendingEvidenceHide: 'Ocultar detalles',
    spendingUpTo: (high) => `podría llegar a ${high}`,
    followUpEmptyBody: 'Aquí tu plan aparece junto a lo que pasó de verdad. Abre una categoría y añade lo que pagaste — cada cifra se puede desplegar y leer línea por línea.',
    followUpImport: 'Importar extracto',
    csvTitle: 'Importar extracto bancario',
    csvDropLead: 'Suelta tu archivo aquí',
    csvDropSub: 'Un CSV de tu banco. El archivo nunca sale de este dispositivo.',
    csvPick: 'Elegir archivo',
    csvUnreadable: 'No se pudo leer el archivo. ¿Es un CSV de tu banco?',
    csvNoRows: 'No se encontraron movimientos en el archivo.',
    csvNoText: '(sin texto)',
    csvColumnsLead: '¿Es correcto? Elige qué contiene cada columna.',
    csvRoleDate: 'Fecha',
    csvRoleText: 'Texto',
    csvRoleAmount: 'Importe',
    csvRoleIn: 'Entrada',
    csvRoleOut: 'Salida',
    csvRoleSkip: 'Omitir',
    csvRemember: 'La app recuerda esta disposición y no volverá a preguntar para el mismo banco.',
    csvContinue: 'Continuar',
    csvNeedBoth: 'Elige al menos una columna de fecha y una de importe.',
    csvReviewLead: (rows, choices, places) => places === choices
      ? `${rows} movimientos, ${places} sitios distintos. Elige categoría para cada uno.`
      : `${rows} movimientos, ${choices} decisiones de categoría para ${places} sitios. Una compra y una devolución del mismo sitio se eligen por separado.`,
    csvSkipped: (n) => `${n} filas no se pudieron leer y se omiten.`,
    csvRows: (n) => (n === 1 ? '1 movimiento' : `${n} movimientos`),
    csvImportN: (n) => `Importar ${n} movimientos`,
    csvUnassigned: (n) => `${n} sin categoría no se importan.`,
    csvDoneAdded: (n) => (n === 1 ? '1 movimiento importado' : `${n} movimientos importados`),
    csvDoneDuplicates: (n) => (n === 1 ? '1 ya estaba' : `${n} ya estaban`),
    csvDoneUnassigned: (n) => `${n} sin categoría`,
    csvGoToMonth: (monthName) => `Ver ${monthName}`,
    csvDoneCreated: (n) => (n === 1 ? '1 categoría nueva' : `${n} categorías nuevas`),
    csvSorted: (n, total) => `${n} de ${total} se colocaron en una categoría automáticamente.`,
    csvExistingGroup: 'En tu presupuesto',
    csvChangeColumns: '↩ Cambiar columnas',
    followUpClear: 'Borrar los movimientos del mes',
    followUpClearConfirm: (n, monthName) => `${n === 1 ? `Esto elimina el único movimiento de ${monthName}` : `Esto elimina los ${n} movimientos de ${monthName}`}.\n\nEl presupuesto no se ve afectado, y puedes deshacerlo justo después.\n\n¿Continuar?`,
    followUpClearDone: (n) => (n === 1 ? '1 movimiento eliminado' : `${n} movimientos eliminados`),
    followUpSpan: (n) => (n === 1 ? 'Mes' : `${n} meses`),
    followUpSpanAria: 'Cuántos meses se muestran',
    followUpSpanRange: (from, to) => `${from} – ${to}`,
    followUpSpanNoBudget: (n) => (n === 1 ? '1 mes del periodo no tiene presupuesto y no cuenta en el plan.' : `${n} meses del periodo no tienen presupuesto y no cuentan en el plan.`),
    followUpAdjustPeriod: 'Ajustar',
    followUpOnlyActuals: 'Solo movimientos',
    followUpUnsorted: 'Otros',
    followUpUnsortedHint: 'Compras que la app no pudo colocar. Muévelas a una categoría — recordará la elección para la próxima vez.',
    followUpTransfer: 'Transferencias',
    followUpTransferHint: 'Dinero entre tus propias cuentas, Swish a y desde personas, retiradas. No cuenta como gasto — es el mismo dinero en otro bolsillo.',
    followUpMoveTo: (place) => `Mover ${place} a otra categoría`,
    followUpNewCategory: '+ Categoría nueva…',
    followUpNewCategoryName: '¿Cómo se va a llamar?',
    csvSkipGroup: '— omitir —',
    csvDateOrder: 'Las fechas se leen como',
    csvDateOrderDmy: 'Día primero — 31/12/2026',
    csvDateOrderMdy: 'Mes primero — 12/31/2026',
    csvDateOrderReads: (sample, read) => `${sample} se lee ${read}`,
    csvDateOrderUnsure: 'El archivo no lo dice. Comprueba el ejemplo.',
    csvNoHeader: 'Este archivo no tiene nombres de columna — se llaman #1, #2, etc. Todas las filas son movimientos.',
    csvToUnsorted: (n) => (n === 1 ? '1 sitio va a Otros.' : `${n} sitios van a Otros.`),
    csvToTransfer: (n) => (n === 1 ? '1 sitio va a Transferencias.' : `${n} sitios van a Transferencias.`),
    followUpWithPlan: 'Ver plan',
    followUpByPlace: 'Por sitio',
    followUpByDate: 'Por fecha',
    followUpPeriodStarts: 'El periodo empieza',
    followUpPeriodReset: 'Volver a la regla',
    followUpPeriodHint: 'Solo este mes. Los demás siguen el día de inicio del menú, con ajuste de fin de semana.',
    csvCreateGroup: 'Crear categoría nueva',
    csvWillCreate: (n) => (n === 1 ? 'Se creará 1 categoría nueva.' : `Se crearán ${n} categorías nuevas.`),
    followUpOutsideBudget: 'Fuera del presupuesto',
    followUpOutsideBudgetHint: 'Movimientos en categorías que el presupuesto de este mes no tiene.',
    menu: 'Menú',
    menuTitle: 'Ajustes y herramientas',
    language: 'Idioma',
    layout: 'Diseño',
    layoutClassic: 'Clásico',
    layoutCombined: 'Combinado',
    layoutCustom: 'Personalizado',
    editLayout: 'Editar diseño',
    duplicateBlock: 'Duplicar bloque',
    deleteBlockHistoryConfirm: (months) => `Este bloque tiene importes en ${months} ${months === 1 ? 'mes' : 'meses'}. Si lo eliminas, las filas salen del presupuesto mensual, pero los importes siguen contando en la vista anual — las dos vistas mostrarán cifras distintas. ¿Continuar?`,
    deleteRowHistoryConfirm: (months) => `Esta fila tiene importes en ${months} ${months === 1 ? 'mes' : 'meses'}. Si la eliminas, sale del presupuesto mensual, pero los importes siguen contando en la vista anual. ¿Continuar?`,
    yearArchivedNote: (amount) => `${amount} no se pudo asociar a ningún bloque — filas eliminadas antes de que la app empezara a guardar el historial.`,
    copyOverwriteOne: (target, source) => `${target} ya tiene un presupuesto. ¿Reemplazar sus ingresos y gastos con ${source}?`,
    copyOverwriteMany: (n) => `${n} de los meses restantes ya tienen presupuesto. ¿Reemplazarlos?`,
    periodSection: 'Periodo de pago',
    periodStartDay: 'El periodo empieza el día',
    periodStartHint: 'Decide qué movimientos caen en el mes en Seguimiento. Los importes del presupuesto no se tocan.',
    periodRefileConfirm: (n, day) => `${n === 1 ? '1 movimiento registrado pasará' : `${n} movimientos registrados pasarán`} a otro mes en Seguimiento al cambiar el periodo a ${day}.\n\nNo se pierde nada — cada movimiento lleva su propia fecha. Los importes del presupuesto no se tocan.\n\n¿Continuar?`,
    periodRefileDone: (n) => (n === 1 ? '✓ 1 movimiento movido' : `✓ ${n} movimientos movidos`),
    periodStartOff: 'Desactivado',
    periodLabelAria: (month) => `Texto propio del periodo para ${month}`,
    periodLabelPlaceholder: 'Texto propio',
    periodMonth: 'Cada mes', periodQuarter: 'Trimestral', periodYear: 'Anual', periodOnce: 'Pago único',
    periodAria: (row) => `Cuándo se cobra ${row}`,
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
    introPages: [
      {
        emoji: '🔒',
        title: 'Todo se queda en tu dispositivo',
        body: 'Sin registro, sin cuenta, sin servidor. Lo que escribes se guarda aquí y no sale del dispositivo — salvo que exportes una copia tú mismo.',
      },
      {
        emoji: '✏️',
        title: 'Haz el presupuesto del mes',
        body: 'Empieza con una plantilla o con una hoja en blanco. Escribe los ingresos y los gastos que sabes que llegan. Unos minutos, una vez al mes.',
      },
      {
        emoji: '📊',
        title: 'Mira qué pasó de verdad',
        body: 'En Seguimiento cargas el archivo CSV de tu banco. La app clasifica los movimientos y pone el plan junto a la realidad — para que veas adónde fue el dinero.',
      },
    ],
    introNext: 'Siguiente',
    introSkip: 'Omitir',
    introDone: 'Empezar',
    introStep: (n, of) => `Paso ${n} de ${of}`,
    welcomeTitle: '¡Bienvenido a Budgetapp!',
    welcomeLetter: [
      'Esta app la hice primero para mí. Antes llevaba mi presupuesto a mano, en papel, y quería el mismo control pero más fácil — así que la construí con ayuda de la IA.',
      'Me ha dado una visión de mis ahorros, mi presupuesto y de cada mes según avanza. El diseño personalizado lo hice para quien quiera montar su propia vista, pero descubrí que funciona igual de bien como una pequeña cartera para un viaje.',
      'El dinero es lo que hace que la vida diaria funcione — comida, tiempo libre, gustos, responsabilidades. Justo por eso creo que debe ser tuyo de manejar, sin distracciones.',
      'Por eso la app es local. Todo se guarda en tu dispositivo. Exportas e importas cuando quieras, sin que nadie lo vea ni se meta. Sin servicios en la nube, sin conexión bancaria, sin terceros.',
      'Hoy local ya no significa pesado. Traes el extracto de tu banco como archivo, y la app lo lee y ordena los movimientos por ti — en tu propio dispositivo, sin que el archivo salga de él. Si corriges una categoría lo recuerda, así que el mes que viene cuesta menos que este.',
      'Qué viene después no lo sé exactamente. Construyo lo que echo en falta yo mismo, y hasta ahora ha resultado que otros echan en falta más o menos lo mismo.',
      'Tú y tu economía. Espero que te ayude a avanzar.',
    ],
    welcomeSignature: '/Ariel',
    welcomeStart: 'Empezar',
    aboutApp: 'Sobre la app',
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
    summaryRemainingAfterSaving: 'Queda tras ahorrar',
    customStandalone: 'Presupuesto independiente – no cambia tu presupuesto normal',
    customMonthEmpty: (month) => `${month} aún no está rellenado`,
    customCopyFrom: (month) => `Copiar ${month}`,
    moreActions: 'Más acciones',
    cfgBgPresets: {
      'bg-brand': 'Color de acento', 'bg-income': 'Color de ingresos', 'bg-expense': 'Color de gastos',
      'bg-savings': 'Color de ahorro', 'bg-remain': 'Color de restante',
    },
    ariaTargetInput: (block) => `Importe objetivo de ${block}`,
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
      { title: 'Tus propias filas', body: 'Dentro de un bloque, escribe los importes. Las filas nuevas, los nombres y los colores se cambian en Editar diseño.' },
      { title: 'Cambiar tamaño', body: 'Pon cada bloque a ancho Completo, Medio o ⅓. En el móvil se convierten en fichas que se tocan.' },
      { title: 'Color y emoji', body: 'Dale a cualquier bloque su propio color de fondo e icono: hazlo tuyo.' },
      { title: 'Gráficos', body: 'Activa un gráfico y elige el estilo (dona, tarta, barras, mapa de árbol…), el tamaño y dónde se coloca.' },
      { title: 'Objetivos', body: 'Define un importe objetivo y una barra de progreso se llena hacia él. En un bloque de gastos se convierte en un límite que avisa cuando casi se ha agotado.' },
      { title: 'Notas', body: 'Añade un bloque de texto para recordatorios o planes, junto a tu dinero. Elige si es para un mes o para todos.' },
      { title: 'Resumen', body: 'Añade un bloque de Resumen: suma Ingresos − Gastos automáticamente y muestra el cambio respecto al mes anterior.' },
      { title: 'Copiar mes anterior', body: 'Un toque trae los importes del mes anterior a este mes para no volver a escribirlos.' },
      { title: 'Editar diseño', body: 'Aquí añades filas y cambias nombres y colores. Arrastra para reordenar (↑↓ en el móvil), ⚙ para configurar, ✕ para quitar, 🧹 para borrar todos los importes.' },
    ],
    cfgEmoji: 'Emoji',
    cfgEmojiDefault: 'Predeterminado',
    cfgTarget: 'Objetivo',
    cfgLimit: 'Límite',
    pickerBuildOwn: 'Crea el tuyo',
    kindActual: 'REAL',
    kindGoal: 'META',
    kindKpi: 'DATO',
    actualNoEntries: (month) => `Aún no hay movimientos de ${month}. Importa un extracto en Seguimiento.`,
    actualNothingHere: (name) => `Aún no se ha registrado nada en ${name}.`,
    actualUnsorted: (amount) => `Hasta ${amount} sin clasificar podría ir aquí.`,
    actualIncomeDone: '✓ Ha entrado todo',
    actualIncomeToCome: (amount) => `Faltan por entrar ${amount}`,
    actualOver: (amount) => `⚠ ${amount} por encima del presupuesto`,
    actualLeft: (amount) => `Quedan ${amount} del presupuesto`,
    actualOfBudget: (amount) => `de ${amount} presupuestados`,
    actualNoBudget: 'sin presupuesto',
    actualCount: (n) => (n === 1 ? '1 movimiento' : `${n} movimientos`),
    goalMissing: 'Esta meta de ahorro ya no está en Plan.',
    goalOf: (amount) => `de ${amount}`,
    goalBy: (month) => `Lista para ${month}`,
    goalThisMonth: (amount, month) => `${amount} ahorrados en ${month}`,
    kpiNoIncome: 'Rellena primero los ingresos.',
    kpiLargest: 'Categoría más grande',
    kpiShare: (pct) => `${pct} % de los gastos`,
    kpiNothing: 'Aún no hay gastos en el presupuesto.',
    pickerNewCategory: 'Categoría nueva',
    pickerOutcome: 'Real',
    pickerGoals: 'Metas de ahorro',
    pickerFigures: 'Datos',
    quickEntry: 'Entrada rápida',
    quickEntryTitle: (month) => `Rellenar ${month}`,
    quickEntryEmpty: 'Aún no hay filas que rellenar. Añade bloques o filas primero.',
    quickEntrySaved: 'Todo se guarda mientras escribes.',
    customHelpLinkedIntro: 'El panel muestra tu presupuesto normal a tu manera. Los mismos importes y categorías, ordenados como quieras.',
    customHelpLinked: [
      { title: 'Un solo presupuesto', body: 'Un importe que escribes aquí cambia también en Seguimiento, Ahorro, Plan y Año. Solo hay una cifra.' },
      { title: 'Entrada rápida', body: 'Rellena todos los importes del mes en una sola lista.' },
      { title: 'Real', body: 'Añade un bloque de gasto real para una categoría y mira lo que se ha gastado de verdad, según los movimientos importados en Seguimiento.' },
      { title: 'Metas de ahorro', body: 'Muestra una meta de Plan directamente en el panel.' },
      { title: 'Datos', body: 'La categoría más grande y lo que queda para vivir, las mismas cifras que en el presupuesto.' },
      { title: 'Categoría nueva', body: 'Crea una categoría en tu presupuesto normal para el mes que estás viendo.' },
      { title: 'Editar diseño', body: 'Elige qué se muestra, el orden, el tamaño y el color. ✕ solo quita el bloque del panel; el presupuesto no cambia.' },
      { title: 'Empezar de nuevo', body: 'Te devuelve a la elección entre vinculado y aparte. Tu presupuesto normal no se toca.' },
    ],
    customLinkedNote: '🔗 Vinculado a tu presupuesto normal – los mismos importes en ambos sitios',
    linkedMissing: (name, month) => `${name || 'Esta categoría'} no está en el presupuesto de ${month}`,
    linkedRemove: 'Quitar del panel',
    ariaLinkedRemove: (name) => `Quitar ${name} del panel. El presupuesto no cambia`,
    pickerFromBudget: 'De tu presupuesto',
    pickerOther: 'Otros',
    linkedAllShown: 'Todo tu presupuesto ya se muestra',
    startOver: 'Empezar de nuevo',
    startOverConfirmStandalone: '¿Empezar Personalizado de nuevo?\n\nSe borran todos los bloques, importes y notas de Personalizado, en todos los meses. Tu presupuesto normal no se ve afectado.\n\nConsejo: exporta una copia de seguridad antes. También puedes deshacerlo justo después.',
    startOverConfirmLinked: '¿Empezar Personalizado de nuevo?\n\nSolo se borra el diseño del panel: qué bloques se muestran, su orden, colores y notas. Tu presupuesto normal y todos los importes se quedan.\n\nPuedes deshacerlo justo después.',
    customChooseAgain: 'Elegir otro tipo de panel',
    choiceTitle: '¿Qué quieres que sea Personalizado?',
    choiceIntro: 'Muestra tu presupuesto normal a tu manera, o crea un presupuesto aparte, por ejemplo para un viaje.',
    choiceLinkedTitle: '🔗 Vinculado a mi presupuesto',
    choiceLinkedBody: 'Usa las categorías y los importes de tu presupuesto normal. Si cambias un importe, cambia en ambos sitios. Seguimiento, Ahorro, Plan y Año te acompañan.',
    choiceLinkedCta: 'Elegir vinculado',
    choiceStandaloneTitle: '👛 Presupuesto aparte',
    choiceStandaloneBody: 'Bloques e importes propios que no afectan a tu presupuesto normal. Ideal para viajes, proyectos y presupuestos temporales.',
    choiceStandaloneCta: 'Elegir aparte',
    choiceChangeLater: 'Puedes volver a elegir con "Empezar de nuevo" en Editar diseño.',
    noteScope: 'Se muestra',
    noteScopeMonth: (month) => `Solo ${month}`,
    noteScopeAll: 'Todos los meses',
    pickerReadyMade: 'Bloques listos',
    ariaLimitInput: (block) => `Límite de ${block}`,
    targetReached: '✓ Objetivo alcanzado',
    targetToGo: (amount) => `Faltan ${amount}`,
    limitLeft: (amount) => `Quedan ${amount} del límite`,
    limitOver: (amount) => `⚠ ${amount} por encima del límite`,
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
    appTitle: 'Budget – Presupuesto mensual',
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
    saveFailedTitle: 'No se pudo guardar',
    saveFailedBody: 'El cambio se ve en pantalla pero no se ha guardado. Libera espacio en el navegador o exporta tus datos, y vuelve a intentarlo.',
    saveRetry: 'Intentar guardar de nuevo',
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
    resetMonthConfirm: (monthName) => `Esto reinicia el presupuesto de ${monthName}.\n\nPuedes deshacerlo justo después.\n\n¿Continuar?`,
    dangerZone: 'Zona de peligro',
    resetMonthConfirmKept: (monthName, n) => `Esto reinicia el presupuesto de ${monthName}.\n\n${n === 1 ? 'El movimiento registrado en Seguimiento se conserva — bórralo desde allí.' : `Los ${n} movimientos registrados en Seguimiento se conservan — bórralos desde allí.`}\n\nPuedes deshacerlo justo después.\n\n¿Continuar?`,
    resetMonthDone: '✓ Presupuesto restablecido',
    undo: '↩ Deshacer',
    undoWhat: (action, where, count) => {
      if (action === 'resetMonth') return `El presupuesto de ${where} se restableció`;
      if (action === 'clearActuals') return count === 1 ? `Se eliminó 1 movimiento de ${where}` : `Se eliminaron ${count} movimientos de ${where}`;
      if (action === 'import') return count === 1 ? 'Se importó 1 movimiento' : `Se importaron ${count} movimientos`;
      if (action === 'restoreBackup') return 'Se restauró la copia de seguridad';
      if (action === 'copyBudget') return count > 1 ? `El presupuesto se sobrescribió en ${count} meses` : `El presupuesto de ${where} se sobrescribió`;
      if (action === 'deleteCategory') return `Se eliminó una categoría de ${where}`;
      if (action === 'deleteRow') return where ? `Se eliminó una fila de ${where}` : 'Se eliminó una fila';
      if (action === 'deleteEntry') return `Se eliminó un movimiento de ${where}`;
      if (action === 'deleteGoal') return 'Se eliminó una meta de ahorro';
      if (action === 'deleteBlock') return 'Se eliminó un bloque de Personalizado';
      if (action === 'clearCustom') return count === 1 ? 'Se borraron los importes de Personalizado de 1 mes' : `Se borraron los importes de Personalizado de ${count} meses`;
      if (action === 'refileRepair') return count === 1 ? 'Se movió 1 movimiento al mes correcto' : `Se movieron ${count} movimientos al mes correcto`;
      if (action === 'resetCustom') return 'Personalizado empezó de nuevo';
      if (count === 1) return 'Se cambió el periodo de cobro — se movió 1 movimiento';
      return count > 0 ? `Se cambió el periodo de cobro — se movieron ${count} movimientos` : 'Se cambió el periodo de cobro';
    },
    undoDone: '✓ Deshecho',
    undoFailed: 'No se pudo deshacer — el dispositivo rechazó la escritura. Libera espacio e inténtalo de nuevo.',
    undoDismiss: 'Cerrar',
    triageWaiting: (n) => n === 1 ? '1 movimiento espera una categoría' : `${n} movimientos esperan una categoría`,
    triageOpen: 'Clasificar',
    triageHide: 'Ocultar',
    triageSkip: 'Omitir',
    triageOther: 'Otra…',
    triageCreate: (name) => `+ ${name}`,
    triageSource: (source) => source === 'rule' ? 'tu regla' : source === 'history' ? 'como hiciste antes' : 'sugerencia',
    triageAllDone: '✓ No queda nada — todo está clasificado',
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
    privacyTitle: "Privacidad",
    privacyBody: [
      "Budget no recoge, transmite ni comparte ningún dato personal.",
      "## Qué es Budget hoy",
      "Budget es una página web que abres en el navegador y puedes añadir a la pantalla de inicio. Todavía no hay versión en la App Store ni en Google Play. El día que la haya, este texto se actualizará — hasta entonces describe una página web.",
      "## Todo se queda en tu dispositivo",
      "Tu presupuesto, los gastos que registras y los extractos bancarios que importas se procesan y se guardan localmente en tu navegador. Nada de eso se envía al desarrollador ni a terceros. No hay cuenta, no hay inicio de sesión y no hay base de datos a la que enviar nada.",
      "## Los extractos se leen donde están",
      "Cuando importas un archivo CSV se lee donde estás. El contenido nunca sale de tu dispositivo — ni los movimientos, ni los importes, ni los nombres de los sitios donde compraste.",
      "## Sin publicidad, sin analítica, sin rastreo",
      "No hay redes publicitarias, ni estadísticas de uso, ni herramientas de rastreo. Tampoco scripts de terceros que recojan datos en segundo plano.",
      "La clasificación que reconoce las tiendas es una lista que viaja con la página, no un servicio al que consulta. Funciona sin red.",
      "## No se descarga nada mientras la usas",
      "Las tipografías, las imágenes y el código están en el mismo sitio que la página — no se descarga nada de servidores externos. Después de la primera visita funciona sin conexión a internet.",
      "## El servidor web",
      "La página la sirve un servidor web. Como todos los servidores web, mantiene un registro técnico de las peticiones que incluye direcciones IP. Ese registro se usa solo para la operación. Nunca se vincula con nada de lo que escribes, por la sencilla razón de que nada de lo que escribes se envía allí.",
      "## Borrado",
      "Si borras los datos guardados del navegador para la página, desaparece todo lo que haya guardado. El desarrollador no tiene copia y no puede recuperarla. Si quieres una copia de seguridad la haces tú desde Menú → Exportar datos — el archivo va donde tú elijas.",
      "## Preguntas",
      "Si tienes alguna pregunta sobre cómo la app trata tus datos, puedes escribir a ariel_padilla@hotmail.com.",
    ],
    privacyUpdated: "Última actualización: 19 de septiembre de 2026.",
    privacyClose: "Cerrar",
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
    yearChartTitle: 'Ingresos, gastos y saldo de ahorro',
    monthNotFilledHint: 'Este mes aún no se ha rellenado',
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
    backupNeverUrgent: (months) => `Llevas ${months} meses usando la app sin hacer ni una copia de seguridad. Si el dispositivo desaparece, no hay nada que restaurar.`,
    backupUrgent: (months) => `Tu última copia de seguridad tiene ${months} meses. Si el dispositivo desaparece, no hay nada que restaurar.`,
    backupLast: (date) => `Última copia de seguridad: ${date}`,
    backupNever: 'Última copia de seguridad: nunca',
    backupConfirmSaved: 'Comprueba que el archivo se guardó de verdad.\n\nPulsa Aceptar y la app anotará que tienes una copia de hoy. Cancela si la descarga no salió — entonces la fecha anterior se queda como estaba.',
    backupSaved: '✓ Copia de seguridad guardada',
    followUpHelp: 'Ayuda',
    followUpHelpTitle: 'Cómo funciona Seguimiento',
    followUpHelpBody: [
      '## Para qué sirve esta pestaña',
      'El presupuesto es lo que pensabas. Seguimiento es lo que pasó. Aquí están uno al lado del otro, categoría por categoría, para que veas dónde se fue más de lo que creías — y dónde menos.',
      '## Meter las cifras',
      'Dos caminos: carga el archivo CSV de tu banco con Importar extracto, o escribe un movimiento a mano con +.',
      'El archivo se lee en tu dispositivo y no se envía a ninguna parte. Cada movimiento cae en el mes al que pertenece su propia fecha, así que un archivo que abarca dos meses llena los dos — la app dice cuáles tocó y te lleva allí.',
      '## El periodo',
      'Si cobras el día 25 no vives en meses naturales. Fija el día de inicio y Seguimiento cuenta de cobro a cobro: del 25 de julio al 24 de agosto.',
      'Si el 25 cae en fin de semana la app se mueve al día laborable anterior, porque es cuando llegó el dinero. Si aun así falla puedes fijar un periodo a mano — vale solo para ese mes.',
      '## El clasificador',
      'No es una IA, y no se descarga nada. Es una lista de 863 nombres — tiendas, bancos y servicios de Suecia, Estados Unidos, España e internacionales — más tus propias correcciones.',
      '1. Lee el texto de la fila y busca un nombre que conozca. "ICA NÄRA KUNGSHOLMEN 4711" es ICA.',
      '2. Si no reconoce nada deja el movimiento en Övrigt en vez de adivinar. Una categoría equivocada cuesta más que una vacía.',
      '3. Cuando mueves un sitio a la categoría correcta lo recuerda. La próxima vez tu corrección pesa más que la lista.',
      'Eso último es lo esencial. Al cabo de un mes o dos la lista es sobre todo tuya. No es lista — solo es cuidadosa, y te hace caso.',
      '## Clasificar el resto',
      'Clasificar toma lo que está en Övrigt y lo muestra como una lista, de mayor a menor, con una propuesta por sitio. Un toque mueve el sitio entero — los ocho movimientos de ICA a la vez — y aprende la elección.',
      'La propuesta dice de dónde viene: tu regla, como hiciste antes, o sugerencia de la lista incorporada. Si duda, no propone nada.',
      '## Övrigt y Transferencia',
      'Övrigt es lo que el clasificador no reconoció. Transferencia es dinero entre tus propias cuentas — no cuenta como gasto, porque mover 5 000 kr a tu cuenta de ahorro no es gastar 5 000 kr.',
      'Los dos se pueden cambiar. No se tira nada.',
      '## Las herramientas',
      'Mes / 3 / 6 / 12 suma varios meses. Útil para "cuánto gasto de verdad en comida".',
      'Solo movimientos quita las columnas de plan y diferencia y ordena las categorías por dónde va el dinero. Para cuando la pregunta no es "¿cumplí el presupuesto?" sino "¿por dónde se escapa?".',
      'Por sitio / Por fecha muestra ocho visitas como una fila, o en orden cronológico. Pulsa un sitio para ver las fechas.',
      '## Si te arrepientes',
      'Vaciar un mes, una importación y una categoría eliminada se pueden deshacer. El botón aparece justo después y se queda en el ⚙ Menú.',
    ],
    followUpHelpClose: 'Cerrar',
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
