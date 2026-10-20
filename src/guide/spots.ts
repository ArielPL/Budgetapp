// ── "Show me": where each part of the guide lives in the app ────────────────
//
// Ariel, 2026-10-20: rather than screenshots in the guide (eleven languages,
// two themes, phone and desktop, all outdated by the next change), a "Show me"
// button that opens the right tab and lights up the real control. The element
// carries data-guide="<id>"; the guide only names the id, so the light always
// falls on what is really there, in whatever language, theme or layout.
//
// Kept apart from the prose: the ids, tabs and sections are the same in every
// language. Each language's label and bubble text live in its guide file, as
// Record<SpotId, …>, so a missing translation fails the build.

import type { ActiveTab } from '../types';

export type SpotId =
  | 'income' | 'month' | 'summary' | 'leftToLive' | 'addCategory' | 'categoryEdit'
  | 'import' | 'questions' | 'payPeriod'
  | 'savings'
  | 'addDebt' | 'debtPath'
  | 'goals' | 'sparplan' | 'year'
  | 'menu' | 'language' | 'wallets' | 'copyBudget'
  | 'export';

export interface SpotTarget {
  /** The tab to open first. None: the control is on every tab (the header). */
  tab?: ActiveTab;
  /** The control is in the menu, which has to be open. */
  menu?: boolean;
}

export const SPOT_TARGETS: Record<SpotId, SpotTarget> = {
  income: { tab: 'budget' },
  month: { tab: 'budget' },
  summary: { tab: 'budget' },
  leftToLive: { tab: 'budget' },
  addCategory: { tab: 'budget' },
  categoryEdit: { tab: 'budget' },
  import: { tab: 'followup' },
  questions: { tab: 'followup' },
  payPeriod: { menu: true },
  savings: { tab: 'savings' },
  addDebt: { tab: 'debt' },
  debtPath: { tab: 'debt' },
  goals: { tab: 'plan' },
  sparplan: { tab: 'plan' },
  year: { tab: 'year' },
  menu: {},
  language: { menu: true },
  wallets: { menu: true },
  copyBudget: { menu: true },
  export: { menu: true },
};

/** Which "Show me" buttons each section of the guide gets, by its emoji —
 *  the one thing every language's guide shares, in the same order. */
export const SECTION_SPOTS: Record<string, SpotId[]> = {
  '🚀': ['income', 'summary'],
  '📋': ['month', 'summary', 'leftToLive', 'addCategory', 'categoryEdit'],
  '🧾': ['import', 'questions', 'payPeriod'],
  '📈': ['savings'],
  '💳': ['addDebt', 'debtPath'],
  '🎯': ['goals', 'sparplan', 'year'],
  '⚙️': ['menu', 'language', 'wallets', 'copyBudget'],
  '🔒': ['export'],
};

export const spotSelector = (id: string) => `[data-guide="${id}"]`;
