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

const formatterCache: Partial<Record<Currency, Intl.NumberFormat>> = {};

function getFormatter(currency: Currency): Intl.NumberFormat {
  let fmt = formatterCache[currency];
  if (!fmt) {
    const cfg = CURRENCIES[currency];
    fmt = new Intl.NumberFormat(cfg.locale, {
      style: 'currency',
      currency: cfg.code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
    formatterCache[currency] = fmt;
  }
  return fmt;
}

/** Format an amount with the given currency's symbol/grouping (no conversion). */
export function formatMoney(amount: number, currency: Currency): string {
  return getFormatter(currency).format(amount);
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
  hiddenBlock: string;
  moveUp: string;
  moveDown: string;
  dragToReorder: string;
  showBlock: string;
  hideBlock: string;
  blockSummary: string;
  blockBudgetInputs: string;
  blockExpenseChart: string;
  blockSavingsInputs: string;
  blockSavingsDonuts: string;
  blockGrowthChart: string;
  blockGoals: string;
  blockYear: string;
  blockNotes: string;
  // Expense chart style switch
  chartStyle: string;
  chartStyleDonut: string;
  chartStyleBars: string;
  chartStylePie: string;
  chartStyleList: string;
  chartStyleStacked: string;
  chartStyleTreemap: string;
  chartStyleRadial: string;
  chartStyleTrend: string;
  // Custom section builder
  customEmptyTitle: string;
  customEmptyBody: string;
  addSection: string;
  quickStartAll: string;
  removeSection: string;
  sectionSettings: string;
  sectionBudget: string;
  sectionSavings: string;
  sectionGoals: string;
  sectionYear: string;
  sectionNotes: string;
  cfgLabels: string;
  cfgLabelIcon: string;
  cfgLabelIconText: string;
  cfgBackground: string;
  cfgBgNone: string;
  cfgChart: string;
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
  themeLight: string;
  themeDark: string;
  themeToLight: string;
  themeToDark: string;
  // Theme Builder panel
  themeTitle: string;
  themeClose: string;
  presets: string;
  accent: string;
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
  switchToSwedish: string;
  switchToEnglish: string;
  copyBudget: string;
  copyBudgetTitle: string;
  copyNextMonth: string;
  copyAllRemaining: (n: number) => string;
  copiedTo: (month: string) => string;
  copiedToMonths: (n: number) => string;
  // Backup (export / import)
  backup: string;
  backupTitle: string;
  exportData: string;
  importData: string;
  importConfirm: string;
  importInvalid: string;
  importSuccess: string;
  // Reset month
  resetMonth: string;
  resetMonthConfirm: string;
  resetMonthDone: string;
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
  savingsRate: (pct: number) => string;
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
  goalCount: (n: number) => string;
  avgPerMonth: string;
  // Savings tab
  savedThisMonth: string;
  savedPrevMonth: string;
  pensionBox: string;
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
  noGoals: string;
  deleteGoal: string;
  linkedToBudget: string;
  linkedRowTitle: string;
  saved: string;
  goal: string;
  of: string;
  deadline: string;
  addPost: string;
  newPost: string;
  notes: string;
  notesPlaceholder: string;
  // Year overview
  yearOverview: (year: number) => string;
  yearChartTitle: string;
  colMonth: string;
  colIncome: string;
  colExpenses: string;
  colSavings: string;
  colRemaining: string;
  yearTotal: string;
  yearEmpty: string;
  // Editable
  clickToEdit: string;
  clickToRename: string;
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
  protectedSavingsCategory: string;
  // Backup reminder
  backupReminder: string;
  backupReminderExport: string;
  backupReminderDismiss: string;
  // Growth chart line labels
  lineSparkonto: string;
  lineIsk: string;
  lineFonder: string;
  linePension: string;
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
    hiddenBlock: 'Dolt block',
    moveUp: 'Flytta upp',
    moveDown: 'Flytta ner',
    dragToReorder: 'Dra för att ändra ordning',
    showBlock: 'Visa block',
    hideBlock: 'Dölj block',
    blockSummary: 'Budgetöversikt',
    blockBudgetInputs: 'Inkomster & utgifter',
    blockExpenseChart: 'Utgiftsfördelning',
    blockSavingsInputs: 'Sparposter',
    blockSavingsDonuts: 'Spardiagram',
    blockGrowthChart: 'Spartillväxt',
    blockGoals: 'Sparmål',
    blockYear: 'Årsöversikt',
    blockNotes: 'Anteckningar',
    chartStyle: 'Diagramtyp',
    chartStyleDonut: 'Munk',
    chartStyleBars: 'Staplar',
    chartStylePie: 'Paj',
    chartStyleList: 'Lista',
    chartStyleStacked: 'Staplad',
    chartStyleTreemap: 'Trädkarta',
    chartStyleRadial: 'Radiell',
    chartStyleTrend: 'Trend',
    customEmptyTitle: 'Din panel är tom',
    customEmptyBody: 'Lägg till de sektioner du vill ha.',
    addSection: 'Lägg till sektion',
    quickStartAll: 'Snabbstart: lägg till allt',
    removeSection: 'Ta bort sektion',
    sectionSettings: 'Sektionsinställningar',
    sectionBudget: 'Budget',
    sectionSavings: 'Sparande',
    sectionGoals: 'Sparmål',
    sectionYear: 'Årsöversikt',
    sectionNotes: 'Anteckningar',
    cfgLabels: 'Etiketter',
    cfgLabelIcon: 'Endast ikon',
    cfgLabelIconText: 'Ikon + text',
    cfgBackground: 'Bakgrund',
    cfgBgNone: 'Ingen',
    cfgChart: 'Diagram',
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
    customHelpTitle: 'Bygg din egen budget',
    customHelpIntro: 'Här bygger du budgeten precis som du vill. Så här fungerar varje del:',
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
    currencyHint: 'Endast symbol — belopp räknas inte om',
    theme: 'Tema',
    themeLight: 'Ljust',
    themeDark: 'Mörkt',
    themeToLight: 'Byt till ljust tema',
    themeToDark: 'Byt till mörkt tema',
    themeTitle: 'Tema',
    themeClose: 'Stäng',
    presets: 'Förinställningar',
    accent: 'Accentfärg',
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
    switchToSwedish: 'Byt till svenska',
    switchToEnglish: 'Switch to English',
    copyBudget: 'Kopiera budget',
    copyBudgetTitle: 'Kopiera denna månads budget',
    copyNextMonth: 'Nästa månad',
    copyAllRemaining: (n) => `Alla återstående (${n} månader)`,
    copiedTo: (month) => `✓ Kopierat till ${month}`,
    copiedToMonths: (n) => `✓ Kopierat till ${n} månader`,
    backup: 'Data',
    backupTitle: 'Säkerhetskopiera eller återställ data',
    exportData: '⬇ Exportera data',
    importData: '⬆ Importera data',
    importConfirm: 'Detta ERSÄTTER all nuvarande data med innehållet i filen. Vill du fortsätta?',
    importInvalid: 'Ogiltig fil. Välj en säkerhetskopia exporterad från denna app.',
    importSuccess: '✓ Data importerad',
    resetMonth: '↺ Återställ månad',
    resetMonthConfirm: 'Detta nollställer den valda månadens data och kan inte ångras. Vill du fortsätta?',
    resetMonthDone: '✓ Månad återställd',
    prevMonth: 'Föregående månad',
    nextMonth: 'Nästa månad',
    income: 'Inkomst',
    expenses: 'Utgifter',
    remaining: 'Kvar',
    pctOfIncome: 'av inkomst',
    vsPrev: 'vs förra',
    samePrevMonth: '= förra månaden',
    savingsRate: (pct) => `Du sparar ${pct}% av din inkomst`,
    incomeSection: 'Inkomst',
    addRow: '+ Lägg till rad',
    deleteRow: 'Ta bort rad',
    newRow: 'Ny rad',
    chartExpenseDistribution: 'Utgiftsfördelning',
    chartPerCategory: 'Per kategori',
    chartTotal: 'Totalt',
    chartGrowth: (year) => `Tillväxt ${year}`,
    placeholderExpenses: 'Fyll i utgifter för att se diagram',
    placeholderSavings: 'Fyll i sparande & investeringar för att se tillväxten',
    goalCount: (n) => `${n} mål`,
    avgPerMonth: 'Snitt/månad',
    savedThisMonth: 'Sparat denna månad',
    savedPrevMonth: 'Sparat förra månaden',
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
    noGoals: 'Inga mål ännu — klicka "+ Nytt mål" för att komma igång',
    deleteGoal: 'Ta bort mål',
    linkedToBudget: 'Kopplad till budget',
    linkedRowTitle: 'Kopplad rad i Budget → Sparande',
    saved: 'Sparat',
    goal: 'Mål',
    of: 'av',
    deadline: 'Deadline',
    addPost: '+ Lägg till post',
    newPost: 'Ny post',
    notes: 'Anteckningar & Strategi',
    notesPlaceholder: 'Skriv din plan, strategi, tankar om investeringar...',
    yearOverview: (year) => `Årsöversikt ${year}`,
    yearChartTitle: 'Inkomst vs Utgifter',
    colMonth: 'Månad',
    colIncome: 'Inkomst',
    colExpenses: 'Utgifter',
    colSavings: 'Sparande',
    colRemaining: 'Kvar',
    yearTotal: 'Helår',
    yearEmpty: 'Ingen data för detta år ännu',
    clickToEdit: 'Klicka för att redigera',
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
    protectedSavingsCategory: 'Standardkategori — kan inte tas bort',
    backupReminder: 'Säkerhetskopiera dina data så du inte förlorar dem',
    backupReminderExport: 'Exportera nu',
    backupReminderDismiss: 'Stäng',
    lineSparkonto: 'Sparkonto',
    lineIsk: 'ISK / Aktiedepå',
    lineFonder: 'Fonder',
    linePension: 'Pension',
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
    hiddenBlock: 'Hidden block',
    moveUp: 'Move up',
    moveDown: 'Move down',
    dragToReorder: 'Drag to reorder',
    showBlock: 'Show block',
    hideBlock: 'Hide block',
    blockSummary: 'Budget summary',
    blockBudgetInputs: 'Income & expenses',
    blockExpenseChart: 'Expense breakdown',
    blockSavingsInputs: 'Savings entries',
    blockSavingsDonuts: 'Savings donuts',
    blockGrowthChart: 'Savings growth',
    blockGoals: 'Savings goals',
    blockYear: 'Year overview',
    blockNotes: 'Notes',
    chartStyle: 'Chart style',
    chartStyleDonut: 'Donut',
    chartStyleBars: 'Bars',
    chartStylePie: 'Pie',
    chartStyleList: 'List',
    chartStyleStacked: 'Stacked',
    chartStyleTreemap: 'Treemap',
    chartStyleRadial: 'Radial',
    chartStyleTrend: 'Trend',
    customEmptyTitle: 'Your dashboard is empty',
    customEmptyBody: 'Add the sections you want.',
    addSection: 'Add section',
    quickStartAll: 'Quick start: add everything',
    removeSection: 'Remove section',
    sectionSettings: 'Section settings',
    sectionBudget: 'Budget',
    sectionSavings: 'Savings',
    sectionGoals: 'Goals',
    sectionYear: 'Year overview',
    sectionNotes: 'Notes',
    cfgLabels: 'Labels',
    cfgLabelIcon: 'Icon only',
    cfgLabelIconText: 'Icon + text',
    cfgBackground: 'Background',
    cfgBgNone: 'None',
    cfgChart: 'Chart',
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
    customHelpTitle: 'Build your own budget',
    customHelpIntro: 'This is where you build the budget exactly how you want. Here’s what each piece does:',
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
    currencyHint: "Symbol only — amounts aren't converted",
    theme: 'Theme',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeToLight: 'Switch to light theme',
    themeToDark: 'Switch to dark theme',
    themeTitle: 'Theme',
    themeClose: 'Close',
    presets: 'Presets',
    accent: 'Accent',
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
    switchToSwedish: 'Byt till svenska',
    switchToEnglish: 'Switch to English',
    copyBudget: 'Copy budget',
    copyBudgetTitle: "Copy this month's budget",
    copyNextMonth: 'Next month',
    copyAllRemaining: (n) => `All remaining (${n} months)`,
    copiedTo: (month) => `✓ Copied to ${month}`,
    copiedToMonths: (n) => `✓ Copied to ${n} months`,
    backup: 'Data',
    backupTitle: 'Back up or restore data',
    exportData: '⬇ Export data',
    importData: '⬆ Import data',
    importConfirm: 'This will REPLACE all current data with the contents of the file. Continue?',
    importInvalid: 'Invalid file. Please choose a backup exported from this app.',
    importSuccess: '✓ Data imported',
    resetMonth: '↺ Reset month',
    resetMonthConfirm: "This clears the selected month's data and can't be undone. Continue?",
    resetMonthDone: '✓ Month reset',
    prevMonth: 'Previous month',
    nextMonth: 'Next month',
    income: 'Income',
    expenses: 'Expenses',
    remaining: 'Remaining',
    pctOfIncome: 'of income',
    vsPrev: 'vs prev',
    samePrevMonth: '= last month',
    savingsRate: (pct) => `You're saving ${pct}% of your income`,
    incomeSection: 'Income',
    addRow: '+ Add row',
    deleteRow: 'Delete row',
    newRow: 'New row',
    chartExpenseDistribution: 'Expense distribution',
    chartPerCategory: 'Per category',
    chartTotal: 'Total',
    chartGrowth: (year) => `Growth ${year}`,
    placeholderExpenses: 'Fill in expenses to see the chart',
    placeholderSavings: 'Fill in savings & investments to see the growth',
    goalCount: (n) => `${n} ${n === 1 ? 'goal' : 'goals'}`,
    avgPerMonth: 'Avg/month',
    savedThisMonth: 'Saved this month',
    savedPrevMonth: 'Saved last month',
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
    noGoals: 'No goals yet — click "+ New goal" to get started',
    deleteGoal: 'Delete goal',
    linkedToBudget: 'Linked to budget',
    linkedRowTitle: 'Linked row in Budget → Savings',
    saved: 'Saved',
    goal: 'Goal',
    of: 'of',
    deadline: 'Deadline',
    addPost: '+ Add item',
    newPost: 'New item',
    notes: 'Notes & Strategy',
    notesPlaceholder: 'Write your plan, strategy, thoughts on investments...',
    yearOverview: (year) => `Year overview ${year}`,
    yearChartTitle: 'Income vs Expenses',
    colMonth: 'Month',
    colIncome: 'Income',
    colExpenses: 'Expenses',
    colSavings: 'Savings',
    colRemaining: 'Remaining',
    yearTotal: 'Full year',
    yearEmpty: 'No data for this year yet',
    clickToEdit: 'Click to edit',
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
    protectedSavingsCategory: 'Default category — cannot be deleted',
    backupReminder: "Back up your data so you don't lose it",
    backupReminderExport: 'Export now',
    backupReminderDismiss: 'Dismiss',
    lineSparkonto: 'Savings account',
    lineIsk: 'Investment account',
    lineFonder: 'Funds',
    linePension: 'Pension',
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
    hiddenBlock: 'Bloque oculto',
    moveUp: 'Subir',
    moveDown: 'Bajar',
    dragToReorder: 'Arrastra para reordenar',
    showBlock: 'Mostrar bloque',
    hideBlock: 'Ocultar bloque',
    blockSummary: 'Resumen del presupuesto',
    blockBudgetInputs: 'Ingresos y gastos',
    blockExpenseChart: 'Desglose de gastos',
    blockSavingsInputs: 'Entradas de ahorro',
    blockSavingsDonuts: 'Gráficos de ahorro',
    blockGrowthChart: 'Crecimiento del ahorro',
    blockGoals: 'Metas de ahorro',
    blockYear: 'Resumen anual',
    blockNotes: 'Notas',
    chartStyle: 'Tipo de gráfico',
    chartStyleDonut: 'Dona',
    chartStyleBars: 'Barras',
    chartStylePie: 'Circular',
    chartStyleList: 'Lista',
    chartStyleStacked: 'Apilado',
    chartStyleTreemap: 'Mapa de árbol',
    chartStyleRadial: 'Radial',
    chartStyleTrend: 'Tendencia',
    customEmptyTitle: 'Tu panel está vacío',
    customEmptyBody: 'Añade las secciones que quieras.',
    addSection: 'Añadir sección',
    quickStartAll: 'Inicio rápido: añadir todo',
    removeSection: 'Quitar sección',
    sectionSettings: 'Ajustes de sección',
    sectionBudget: 'Presupuesto',
    sectionSavings: 'Ahorro',
    sectionGoals: 'Metas',
    sectionYear: 'Resumen anual',
    sectionNotes: 'Notas',
    cfgLabels: 'Etiquetas',
    cfgLabelIcon: 'Solo icono',
    cfgLabelIconText: 'Icono + texto',
    cfgBackground: 'Fondo',
    cfgBgNone: 'Ninguno',
    cfgChart: 'Gráfico',
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
    customHelpTitle: 'Crea tu propio presupuesto',
    customHelpIntro: 'Aquí construyes el presupuesto justo como quieras. Esto hace cada parte:',
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
    currencyHint: 'Solo símbolo — los importes no se convierten',
    theme: 'Tema',
    themeLight: 'Claro',
    themeDark: 'Oscuro',
    themeToLight: 'Cambiar a tema claro',
    themeToDark: 'Cambiar a tema oscuro',
    themeTitle: 'Tema',
    themeClose: 'Cerrar',
    presets: 'Preajustes',
    accent: 'Color de acento',
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
    switchToSwedish: 'Byt till svenska',
    switchToEnglish: 'Switch to English',
    copyBudget: 'Copiar presupuesto',
    copyBudgetTitle: 'Copiar el presupuesto de este mes',
    copyNextMonth: 'Mes siguiente',
    copyAllRemaining: (n) => `Todos los restantes (${n} meses)`,
    copiedTo: (month) => `✓ Copiado a ${month}`,
    copiedToMonths: (n) => `✓ Copiado a ${n} meses`,
    backup: 'Datos',
    backupTitle: 'Hacer copia de seguridad o restaurar datos',
    exportData: '⬇ Exportar datos',
    importData: '⬆ Importar datos',
    importConfirm: 'Esto REEMPLAZARÁ todos los datos actuales con el contenido del archivo. ¿Continuar?',
    importInvalid: 'Archivo no válido. Elige una copia de seguridad exportada desde esta app.',
    importSuccess: '✓ Datos importados',
    resetMonth: '↺ Restablecer mes',
    resetMonthConfirm: 'Esto borra los datos del mes seleccionado y no se puede deshacer. ¿Continuar?',
    resetMonthDone: '✓ Mes restablecido',
    prevMonth: 'Mes anterior',
    nextMonth: 'Mes siguiente',
    income: 'Ingresos',
    expenses: 'Gastos',
    remaining: 'Restante',
    pctOfIncome: 'de los ingresos',
    vsPrev: 'vs anterior',
    samePrevMonth: '= mes anterior',
    savingsRate: (pct) => `Estás ahorrando el ${pct}% de tus ingresos`,
    incomeSection: 'Ingresos',
    addRow: '+ Añadir fila',
    deleteRow: 'Eliminar fila',
    newRow: 'Nueva fila',
    chartExpenseDistribution: 'Distribución de gastos',
    chartPerCategory: 'Por categoría',
    chartTotal: 'Total',
    chartGrowth: (year) => `Crecimiento ${year}`,
    placeholderExpenses: 'Rellena los gastos para ver el gráfico',
    placeholderSavings: 'Rellena el ahorro e inversiones para ver el crecimiento',
    goalCount: (n) => `${n} ${n === 1 ? 'meta' : 'metas'}`,
    avgPerMonth: 'Media/mes',
    savedThisMonth: 'Ahorrado este mes',
    savedPrevMonth: 'Ahorrado el mes anterior',
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
    noGoals: 'Aún no hay metas — pulsa "+ Nueva meta" para empezar',
    deleteGoal: 'Eliminar meta',
    linkedToBudget: 'Vinculado al presupuesto',
    linkedRowTitle: 'Fila vinculada en Presupuesto → Ahorro',
    saved: 'Ahorrado',
    goal: 'Meta',
    of: 'de',
    deadline: 'Fecha límite',
    addPost: '+ Añadir elemento',
    newPost: 'Nuevo elemento',
    notes: 'Notas y Estrategia',
    notesPlaceholder: 'Escribe tu plan, estrategia, ideas sobre inversiones...',
    yearOverview: (year) => `Resumen anual ${year}`,
    yearChartTitle: 'Ingresos vs Gastos',
    colMonth: 'Mes',
    colIncome: 'Ingresos',
    colExpenses: 'Gastos',
    colSavings: 'Ahorro',
    colRemaining: 'Restante',
    yearTotal: 'Año completo',
    yearEmpty: 'Aún no hay datos para este año',
    clickToEdit: 'Pulsa para editar',
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
    protectedSavingsCategory: 'Categoría predeterminada — no se puede eliminar',
    backupReminder: 'Haz una copia de seguridad de tus datos para no perderlos',
    backupReminderExport: 'Exportar ahora',
    backupReminderDismiss: 'Descartar',
    lineSparkonto: 'Cuenta de ahorro',
    lineIsk: 'Cuenta de inversión',
    lineFonder: 'Fondos',
    linePension: 'Pensión',
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
