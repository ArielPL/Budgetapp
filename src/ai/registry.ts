// ── Budget AI: the tools the model may choose from ─────────────────────────
//
// The model does one thing: it reads the question and fills in ONE form the
// app already has. It never sees a result and never answers with a figure of
// its own; the app works out everything, as when the user taps the card.
//
// The wording below is the lab's, word for word (~/Developer/budget-ai-lab,
// tools.py, round 8: 98.2 % of 762 questions in eleven languages). Only the
// first line of a description reaches the model as the tool's description;
// what a field may hold is said in the field's own description. There are no
// `enum` lists on purpose: without constrained decoding the model then writes
// ids without quotes, and the runtime's parser crashes on them (lab round 3).
//
// Nothing here deletes anything. "Delete my whole budget" cannot be asked for,
// because there is no tool for it.

export type ToolKind =
  /** A question about what is: opens a question card, filled in. */
  | 'read'
  /** "What if …": worked out, nothing saved. */
  | 'try'
  /** A proposal: the Confirm box shows before → after; nothing changes until
   *  the user approves, and it can be undone. */
  | 'change';

export type FieldType = 'string' | 'number' | 'integer';

export interface FieldSpec {
  name: string;
  type: FieldType;
  required: boolean;
  description: string;
}

export interface ToolSpec {
  name: ToolName;
  kind: ToolKind;
  description: string;
  fields: FieldSpec[];
}

export type ToolName =
  | 'category_spending' | 'list_subscriptions' | 'daily_allowance' | 'budget_kept'
  | 'biggest_increases' | 'where_money_went' | 'search_purchases' | 'goal_eta'
  | 'debt_overview' | 'savings_projection' | 'wallet_status'
  | 'what_if' | 'need_to_save'
  | 'propose_set_amount' | 'propose_add_row' | 'propose_create_goal'
  | 'propose_debt_plan' | 'propose_recategorize';

export const PERIODS = ['this_month', 'last_month', 'last_3_months', 'last_6_months', 'this_year', 'last_12_months'] as const;
export type Period = (typeof PERIODS)[number];

export const STRATEGIES = ['avalanche', 'snowball'] as const;

/** The ids the model may write in a category field: the budget's own, the
 *  standard ones first, in the order the lab tested them. */
export interface CategoryChoice {
  id: string;
  /** What the user calls it, for a category of their own. */
  name?: string;
}

const STANDARD_ORDER = ['boende', 'mat', 'transport', 'prenumerationer', 'personligt', 'fritid', 'lan', 'sparande', 'givande'];

function categoryList(categories: CategoryChoice[]): string {
  const ids = new Set(categories.map(c => c.id));
  const standard = STANDARD_ORDER.filter(id => ids.has(id));
  const own = categories
    .filter(c => !STANDARD_ORDER.includes(c.id))
    .map(c => (c.name ? `${c.id} (${c.name})` : c.id));
  return [...standard, ...own].join(', ');
}

const PERIOD_TEXT = `Exactly one of: ${PERIODS.join(', ')}.`;
const STRATEGY_TEXT = 'Exactly one of: avalanche, snowball. Default avalanche (highest interest first); snowball only if the user asks for it (smallest debt first).';
const DEADLINE_TEXT = 'The deadline as YYYY-MM, always after the current month: a month name means its next occurrence, which may be next year.';

const f = (name: string, type: FieldType, required: boolean, description: string): FieldSpec =>
  ({ name, type, required, description });

/** Every tool, with category fields listing this user's own categories. */
export function toolSpecs(categories: CategoryChoice[]): ToolSpec[] {
  const ids = categoryList(categories);
  const category = `Category id, exactly one of: ${ids}. Never a row name.`;
  return [
    {
      name: 'category_spending', kind: 'read',
      description: 'How much the user actually spent in one budget category over a period (from imported bank statements); a budget row such as the car, fuel or rent counts as its category.',
      fields: [f('category', 'string', true, category), f('period', 'string', true, PERIOD_TEXT)],
    },
    {
      name: 'list_subscriptions', kind: 'read',
      description: 'Lists the user\'s recurring subscriptions (same amount every month) and their total per month and year.',
      fields: [],
    },
    {
      name: 'daily_allowance', kind: 'read',
      description: 'How much the user can spend per day and per week for the rest of the current month ("left to live on").',
      fields: [],
    },
    {
      name: 'budget_kept', kind: 'read',
      description: 'Whether the user kept to the budget in a given month, category by category (plan versus actual).',
      fields: [f('month', 'string', true, 'The month as YYYY-MM.')],
    },
    {
      name: 'biggest_increases', kind: 'read',
      description: 'Which spending categories have gone up the most lately, compared with earlier months.',
      fields: [],
    },
    {
      name: 'where_money_went', kind: 'read',
      description: 'The biggest purchases and the many small purchases in a month: where the money went, and what the user spends the most on.',
      fields: [f('month', 'string', true, 'The month as YYYY-MM.')],
    },
    {
      name: 'search_purchases', kind: 'read',
      description: 'Searches the user\'s imported purchases for a shop or place name (e.g. "ICA", "Amazon"), with the total spent there; not for a budget category or row.',
      fields: [
        f('query', 'string', true, 'The shop, place or word to look for, e.g. "ICA" or "gym".'),
        f('period', 'string', false, `Optional. ${PERIOD_TEXT} Default this_year.`),
      ],
    },
    {
      name: 'goal_eta', kind: 'read',
      description: 'When the user will reach one of their savings goals at the current pace.',
      fields: [f('goal', 'string', true, 'The name of the savings goal, as listed in the system message.')],
    },
    {
      name: 'debt_overview', kind: 'read',
      description: 'When the user will be debt-free and how much interest it costs, optionally with an extra amount paid each month.',
      fields: [
        f('extra_per_month', 'number', false, 'Optional. Extra amount paid towards debts each month, in the user\'s currency. Default 0.'),
        f('strategy', 'string', false, `Optional. ${STRATEGY_TEXT}`),
      ],
    },
    {
      name: 'savings_projection', kind: 'read',
      description: 'How the user\'s savings plan grows with compound interest over a number of years.',
      fields: [f('years', 'integer', true, 'Number of years ahead: 5, 10, 15, 20, 30 or 40.')],
    },
    {
      name: 'wallet_status', kind: 'read',
      description: 'How much is left in one of the user\'s wallets (small separate budgets, e.g. for a trip).',
      fields: [f('wallet', 'string', true, 'The wallet\'s name, as listed in the system message.')],
    },
    {
      name: 'what_if', kind: 'try',
      description: 'Simulates a change to this month\'s budget without saving anything: the effect on what is left, per day and savings.',
      fields: [
        f('target', 'string', true, `Exactly one of: income, ${ids}. income for salary or other income; otherwise the id of the category the changing row is listed under. Saving more, with no goal named, is sparande.`),
        f('change', 'number', true, 'The change per month in the user\'s currency: positive for more (a rise), negative for less.'),
      ],
    },
    {
      name: 'need_to_save', kind: 'try',
      description: 'How much the user needs to save per month to reach an amount by a given month.',
      fields: [
        f('target_amount', 'number', true, 'The amount the user wants to have, in the user\'s currency.'),
        f('by_month', 'string', true, DEADLINE_TEXT),
      ],
    },
    {
      name: 'propose_set_amount', kind: 'change',
      description: 'Proposes a new budgeted amount for one row (the user must approve it in the app before anything changes).',
      fields: [
        f('category', 'string', true, `The row's category id, exactly one of: ${ids}. Never a row name.`),
        f('row', 'string', true, 'The row\'s name as it appears in the budget, e.g. "Matvaror".'),
        f('amount', 'number', true, 'The new monthly amount in the user\'s currency.'),
      ],
    },
    {
      name: 'propose_add_row', kind: 'change',
      description: 'Proposes adding a new budget row (the user must approve it before anything changes).',
      fields: [
        f('category', 'string', true, `${category} Pick the one that fits the new row best.`),
        f('label', 'string', true, 'The new row\'s name.'),
        f('amount', 'number', true, 'Its monthly amount in the user\'s currency.'),
      ],
    },
    {
      name: 'propose_create_goal', kind: 'change',
      description: 'Proposes creating a savings goal (the user must approve it before anything changes).',
      fields: [
        f('name', 'string', true, 'The goal\'s name, e.g. "Resa".'),
        f('target_amount', 'number', true, 'The amount to save, in the user\'s currency.'),
        f('by_month', 'string', true, DEADLINE_TEXT),
      ],
    },
    {
      name: 'propose_debt_plan', kind: 'change',
      description: 'Proposes setting the extra monthly debt payment and the strategy (the user must approve it).',
      fields: [
        f('extra_per_month', 'number', true, 'Extra amount per month towards debts.'),
        f('strategy', 'string', true, STRATEGY_TEXT),
      ],
    },
    {
      name: 'propose_recategorize', kind: 'change',
      description: 'Proposes moving all purchases from one shop, service or place (e.g. "Spotify", "ICA") to another category; no budget row changes (the user must approve it).',
      fields: [
        f('place', 'string', true, 'The shop or place name as it appears on the bank statement, e.g. "ICA".'),
        f('category', 'string', true, `The category id, exactly one of: ${ids}. Never a row name.`),
      ],
    },
  ];
}

export const TOOL_NAMES: readonly ToolName[] = toolSpecs([]).map(t => t.name);

export const isToolName = (name: string): name is ToolName =>
  (TOOL_NAMES as readonly string[]).includes(name);
