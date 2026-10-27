// ── Budget AI: the app checks every field before anything is shown ─────────
//
// The model is not locked to valid values (the lock cost more than it gave,
// lab round 2), so now and then it writes something odd: a row name where a
// category id belongs, "this_month" in a month field, a month it copied from
// an example. Every field is checked against the user's own data here. What
// cannot be read one way only is never guessed: the field is left open, with
// the user's own choices when there are any ("Did you mean …?"), and the card
// asks the user.
//
// Pure: the components hand in this month's budget, the goals and wallets, the
// question as typed, and today.

import type { MonthData } from '../types';
import type { YearMonth } from '../debts';
import type { WhatIfTarget } from '../tools';
import { parseMoneyInput } from '../money';
import { isToolName, PERIODS, STRATEGIES, toolSpecs, type ToolKind, type ToolName } from './registry';
import { resolveMonth, type MonthMode } from './months';
import type { RawCall } from './parseCall';

export interface Named {
  id: string;
  name: string;
}

export interface AiContext {
  /** The month on screen, as stored. */
  budget: MonthData;
  goals: Named[];
  wallets: Named[];
  /** What the user typed: month names in it win over the model's month. */
  question: string;
  now: YearMonth;
}

export type FieldValue = string | number | YearMonth | WhatIfTarget;

/** A field the user must fill in or pick, with the choices when the app has
 *  any. The card opens with it empty. */
export interface OpenField {
  field: string;
  choices?: Named[];
}

export type CheckedCall =
  | { ok: false; reason: 'no-call' | 'unknown-tool' }
  | {
    ok: true;
    tool: ToolName;
    kind: ToolKind;
    /** Every field the app could read one way only, in the app's own shape:
     *  ids, numbers, months. */
    values: Record<string, FieldValue>;
    /** Empty when the card can open ready. */
    open: OpenField[];
  };

/** Lower case, accents dropped, spaces collapsed — for matching names the
 *  user wrote against names the model wrote. */
const key = (s: string) =>
  s.normalize('NFKC').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim();

const text = (raw: unknown): string | null =>
  typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;

/** Long enough to stand for a name inside another: three letters, or two
 *  Chinese or Japanese characters ("携帯" in "携帯電話"). A row called "El"
 *  must not match "Telefon". */
const telling = (s: string) =>
  [...s].reduce((w, c) => w + (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(c) ? 2 : 1), 0) >= 3;

/** One match by exact name, else one by one name containing the other.
 *  Several matches, or none, is not an answer. */
function pick<T extends { name: string }>(raw: unknown, items: T[]): T | T[] {
  const s = text(raw);
  if (!s) return items;
  const k = key(s);
  const exact = items.filter(i => key(i.name) === k);
  if (exact.length === 1) return exact[0];
  const partial = items.filter(i => {
    const n = key(i.name);
    return (telling(k) && n.includes(k)) || (telling(n) && k.includes(n));
  });
  if (partial.length === 1) return partial[0];
  return partial.length > 1 ? partial : items;
}

const categoryChoices = (budget: MonthData): Named[] =>
  budget.expenses.map(c => ({ id: c.id, name: c.name }));

/**
 * A category id from what the model wrote: the id itself, the category's
 * name, or a row in it ("Bensin" → transport, as the plan says).
 */
function category(raw: unknown, budget: MonthData): string | null {
  const s = text(raw);
  if (!s) return null;
  const k = key(s);
  const byId = budget.expenses.find(c => c.id.toLowerCase() === k);
  if (byId) return byId.id;
  const byName = budget.expenses.filter(c => key(c.name) === k);
  if (byName.length === 1) return byName[0].id;
  const rows = budget.expenses.flatMap(c => c.rows.map(r => ({ name: r.label, category: c.id })));
  const row = pick(s, rows);
  return Array.isArray(row) ? null : row.category;
}

function target(raw: unknown, budget: MonthData): WhatIfTarget | null {
  const s = text(raw);
  if (!s) return null;
  if (['income', 'salary'].includes(key(s))) return { kind: 'income' };
  const id = category(s, budget);
  if (id) return { kind: 'category', id };
  const income = pick(s, budget.income.map(r => ({ name: r.label })));
  return Array.isArray(income) ? null : { kind: 'income' };
}

/** A number, or text in any of the formats a money field accepts — handed to
 *  the parser exactly as the model wrote it, as every amount field in the app
 *  is (moneyInputGuard.test.ts). A sign is allowed only where the field can go
 *  down ("what if" changes), and only on a number: the model writes those as
 *  numbers, and text with a sign is left for the user to fill in. */
function amount(raw: unknown, signed: boolean): number | null {
  let n: number | null = null;
  if (typeof raw === 'number') n = Number.isFinite(raw) ? raw : null;
  else if (typeof raw === 'string') {
    const parsed = parseMoneyInput(raw);
    n = parsed.ok ? parsed.value : null;
  }
  if (n === null) return null;
  return signed || n >= 0 ? n : null;
}

const MONTH_FIELDS: Record<string, MonthMode> = { month: 'past', by_month: 'deadline' };

/**
 * The model's call, checked field by field against the user's data. Unknown
 * fields are dropped; a missing optional field gets its default.
 */
export function checkCall(call: RawCall | null, ctx: AiContext): CheckedCall {
  if (!call) return { ok: false, reason: 'no-call' };
  if (!isToolName(call.name)) return { ok: false, reason: 'unknown-tool' };
  const spec = toolSpecs(categoryChoices(ctx.budget)).find(t => t.name === call.name)!;
  const values: Record<string, FieldValue> = {};
  const open: OpenField[] = [];
  const a = call.args;

  for (const field of spec.fields) {
    const raw = a[field.name];
    const given = raw !== undefined && raw !== null && raw !== '';
    const leave = (choices?: Named[]) => open.push(choices ? { field: field.name, choices } : { field: field.name });

    switch (field.name) {
      case 'category': {
        const id = category(raw, ctx.budget);
        if (id) values.category = id; else leave(categoryChoices(ctx.budget));
        break;
      }
      case 'target': {
        const t = target(raw, ctx.budget);
        if (t) values.target = t; else leave(categoryChoices(ctx.budget));
        break;
      }
      case 'period': {
        if ((PERIODS as readonly unknown[]).includes(raw)) values.period = raw as string;
        else if (!field.required) values.period = 'this_year';
        else leave(PERIODS.map(p => ({ id: p, name: p })));
        break;
      }
      case 'month':
      case 'by_month': {
        const at = resolveMonth(raw, ctx.question, ctx.now, MONTH_FIELDS[field.name]);
        // "Where did the money go?" with no month at all means this month.
        if (at) values[field.name] = at;
        else if (call.name === 'where_money_went' && !given) values.month = ctx.now;
        else leave();
        break;
      }
      case 'strategy': {
        const s = text(raw)?.toLowerCase() ?? '';
        const strategy = STRATEGIES.find(x => s.includes(x.slice(0, 4)));
        if (strategy) values.strategy = strategy;
        else if (!field.required || !given) values.strategy = 'avalanche';
        else leave(STRATEGIES.map(x => ({ id: x, name: x })));
        break;
      }
      case 'years': {
        const n = amount(raw, false);
        if (n !== null && Number.isInteger(n) && n >= 1 && n <= 40) values.years = n; else leave();
        break;
      }
      case 'goal':
      case 'wallet': {
        const items = field.name === 'goal' ? ctx.goals : ctx.wallets;
        const found = pick(raw, items);
        if (Array.isArray(found)) leave(found); else values[field.name] = found.id;
        break;
      }
      case 'row':
        break; // after the loop: it needs the category
      default: {
        if (field.type === 'string') {
          const s = text(raw);
          if (s) values[field.name] = s; else leave();
          break;
        }
        // Amounts. Only a "what if" change may be negative, and a change of
        // nothing is no question at all.
        const n = amount(raw, field.name === 'change');
        if (n !== null && !(field.name === 'change' && n === 0) && !(field.name === 'target_amount' && n <= 0)) {
          values[field.name] = n;
        } else if (!field.required && !given) {
          values[field.name] = 0;
        } else leave();
      }
    }
  }

  if (call.name === 'propose_set_amount') checkRow(a.row, ctx.budget, values, open);
  return { ok: true, tool: spec.name, kind: spec.kind, values, open };
}

/** The row whose amount changes. Looked for in the category the model named
 *  first; a row found in another category takes that category with it. */
function checkRow(raw: unknown, budget: MonthData, values: Record<string, FieldValue>, open: OpenField[]) {
  const all = budget.expenses.flatMap(c => c.rows.map(r => ({ id: r.id, name: r.label, category: c.id })));
  const inCategory = all.filter(r => r.category === values.category);
  const here = inCategory.length > 0 ? pick(raw, inCategory) : [];
  const found = Array.isArray(here) ? pick(raw, all) : here;
  if (Array.isArray(found)) {
    open.push({ field: 'row', choices: (inCategory.length > 0 && !text(raw) ? inCategory : found).map(r => ({ id: r.id, name: r.name })) });
    return;
  }
  values.row = found.id;
  if (values.category !== found.category) {
    values.category = found.category;
    const i = open.findIndex(o => o.field === 'category');
    if (i >= 0) open.splice(i, 1);
  }
}

/**
 * Amounts in a text reply that the user never wrote. The model must not work
 * out sums ("about 208 € a month"), so the app never shows such a reply; it
 * opens the matching card instead (lab: "own sums").
 */
export function amountsNotInQuestion(reply: string, question: string): string[] {
  const numbers = (s: string) =>
    [...s.normalize('NFKC').matchAll(/\d[\d\s.,']*\d|\d/g)]
      .map(m => m[0].replace(/[\s.,']/g, ''))
      .filter(n => n.length >= 2);
  const asked = new Set(numbers(question));
  // Months the app itself told the model ("2026-10", "2026年10月") are dates.
  const withoutDates = reply.replace(/20\d\d(?:[-/]\d{1,2}|年(?:\d{1,2}月)?)/g, ' ');
  return numbers(withoutDates).filter(n => !asked.has(n));
}
