import { createContext, useContext } from 'react';

export type Lang = 'sv' | 'en';

export const MONTHS: Record<Lang, string[]> = {
  sv: [
    'Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni',
    'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December',
  ],
  en: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ],
};

export const MONTHS_SHORT: Record<Lang, string[]> = {
  sv: ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

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
  theme: string;
  themeLight: string;
  themeDark: string;
  themeToLight: string;
  themeToDark: string;
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
  // Savings tab
  savedThisMonth: string;
  savedPrevMonth: string;
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
    theme: 'Tema',
    themeLight: 'Ljust',
    themeDark: 'Mörkt',
    themeToLight: 'Byt till ljust tema',
    themeToDark: 'Byt till mörkt tema',
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
    chartPerCategory: 'Per kategori (kr)',
    chartTotal: 'Totalt',
    chartGrowth: (year) => `Tillväxt ${year}`,
    placeholderExpenses: 'Fyll i utgifter för att se diagram',
    placeholderSavings: 'Fyll i sparande & investeringar för att se tillväxten',
    savedThisMonth: 'Sparat denna månad',
    savedPrevMonth: 'Sparat förra månaden',
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
    theme: 'Theme',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeToLight: 'Switch to light theme',
    themeToDark: 'Switch to dark theme',
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
    chartPerCategory: 'Per category (kr)',
    chartTotal: 'Total',
    chartGrowth: (year) => `Growth ${year}`,
    placeholderExpenses: 'Fill in expenses to see the chart',
    placeholderSavings: 'Fill in savings & investments to see the growth',
    savedThisMonth: 'Saved this month',
    savedPrevMonth: 'Saved last month',
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
};

interface LangContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Translations;
}

export const LanguageContext = createContext<LangContextValue>({
  lang: 'sv',
  setLang: () => {},
  t: translations.sv,
});

export function useLang(): LangContextValue {
  return useContext(LanguageContext);
}
