import { describe, it, expect } from 'vitest';
import type { MonthData } from '../types';
import { amountsNotInQuestion, checkCall, type AiContext } from './checks';
import { parseRawCall } from './parseCall';
import { dateHelp } from './dateHelp';
import { toolSpecs, TOOL_NAMES } from './registry';

// Synthetic values only.

const budget = {
  income: [{ id: 'lon', label: 'SYNT Lön', amount: 30000 }],
  expenses: [
    { id: 'boende', name: 'Boende', icon: '•', color: '#888', rows: [
      { id: 'hyra', label: 'Hyra', amount: 9000 }, { id: 'el', label: 'El', amount: 600 }] },
    { id: 'mat', name: 'Mat & dryck', icon: '•', color: '#888', rows: [
      { id: 'matvaror', label: 'Matvaror', amount: 4000 }, { id: 'ute', label: 'Restaurang', amount: 800 }] },
    { id: 'transport', name: 'Transport', icon: '•', color: '#888', rows: [
      { id: 'bensin', label: 'Bensin', amount: 1200 }] },
    { id: 'prenumerationer', name: 'Prenumerationer', icon: '•', color: '#888', rows: [
      { id: 'mobil', label: 'Mobilabonnemang', amount: 299 }, { id: 'gym', label: 'Gym', amount: 450 }] },
    { id: 'hund', name: 'Hunden', icon: '•', color: '#888', rows: [
      { id: 'foder', label: 'Foder', amount: 500 }] },
  ],
  savings: [],
} as unknown as MonthData;

const ctx = (question: string): AiContext => ({
  budget,
  goals: [{ id: 'g1', name: 'Buffert' }, { id: 'g2', name: 'Resa till Japan' }, { id: 'g3', name: 'Resa till Rom' }],
  wallets: [{ id: 'w1', name: 'Japan 2027' }],
  question,
  now: { year: 2026, month: 9 },
});

const check = (name: string, args: Record<string, unknown>, q = '') => checkCall({ name, args }, ctx(q));

describe('checkCall', () => {
  it('passes a clean call through, in the app\'s own shapes', () => {
    expect(check('need_to_save', { target_amount: 30000, by_month: '2027-06' })).toEqual({
      ok: true, tool: 'need_to_save', kind: 'try',
      values: { target_amount: 30000, by_month: { year: 2027, month: 5 } }, open: [],
    });
    expect(check('what_if', { target: 'boende', change: 1500 })).toMatchObject({
      values: { target: { kind: 'category', id: 'boende' }, change: 1500 }, open: [],
    });
  });

  it('refuses no call and tools that do not exist — there is no delete', () => {
    expect(checkCall(null, ctx(''))).toEqual({ ok: false, reason: 'no-call' });
    expect(check('delete_budget', {})).toEqual({ ok: false, reason: 'unknown-tool' });
  });

  it('turns a row or category name into its category id', () => {
    expect(check('category_spending', { category: 'Bensin', period: 'this_year' })).toMatchObject({ values: { category: 'transport' } });
    expect(check('category_spending', { category: 'Mat & dryck', period: 'this_year' })).toMatchObject({ values: { category: 'mat' } });
    expect(check('what_if', { target: 'income', change: 2000 })).toMatchObject({ values: { target: { kind: 'income' } } });
    expect(check('what_if', { target: 'Lön', change: 2000 })).toMatchObject({ values: { target: { kind: 'income' } } });
  });

  it('knows the user\'s own categories', () => {
    expect(check('propose_add_row', { category: 'hund', label: 'Hundförsäkring', amount: 250 })).toMatchObject({
      values: { category: 'hund', label: 'Hundförsäkring', amount: 250 }, open: [],
    });
    expect(toolSpecs([{ id: 'boende' }, { id: 'hund', name: 'Hunden' }])[0].fields[0].description)
      .toBe('Category id, exactly one of: boende, hund (Hunden). Never a row name.');
  });

  it('asks rather than guesses: an unknown category opens with the user\'s categories to pick from', () => {
    const c = check('category_spending', { category: 'rymdresor', period: 'this_year' });
    expect(c).toMatchObject({ ok: true, values: { period: 'this_year' } });
    if (c.ok) expect(c.open).toEqual([{ field: 'category', choices: budget.expenses.map(e => ({ id: e.id, name: e.name })) }]);
  });

  it('reads "this_month" and month names itself', () => {
    expect(check('where_money_went', { month: 'this_month' })).toMatchObject({ values: { month: { year: 2026, month: 9 } } });
    expect(check('where_money_went', {}, 'Vad lägger jag mest pengar på?')).toMatchObject({ values: { month: { year: 2026, month: 9 } } });
    expect(check('budget_kept', { month: '2026-10' }, 'Höll jag budgeten i juni?')).toMatchObject({ values: { month: { year: 2026, month: 5 } } });
    const noMonth = check('budget_kept', {}, 'Höll jag budgeten?');
    if (noMonth.ok) expect(noMonth.open).toEqual([{ field: 'month' }]);
  });

  it('a deadline in the past is left open', () => {
    const c = check('need_to_save', { target_amount: 1000, by_month: '2026-03' }, 'Spara 1000');
    if (c.ok) expect(c.open).toEqual([{ field: 'by_month' }]);
  });

  it('reads amounts written as text, and keeps a sign only on a change', () => {
    expect(check('need_to_save', { target_amount: '1 500 kr', by_month: '2027-01' })).toMatchObject({ values: { target_amount: 1500 } });
    expect(check('what_if', { target: 'mat', change: -500 })).toMatchObject({ values: { change: -500 } });
    const signedText = check('what_if', { target: 'mat', change: '-500' });
    if (signedText.ok) expect(signedText.open).toEqual([{ field: 'change' }]);
    const negative = check('propose_set_amount', { category: 'mat', row: 'Matvaror', amount: -10 });
    if (negative.ok) expect(negative.open).toEqual([{ field: 'amount' }]);
    const zero = check('what_if', { target: 'mat', change: 0 });
    if (zero.ok) expect(zero.open).toEqual([{ field: 'change' }]);
  });

  it('fills optional fields with their defaults', () => {
    expect(check('debt_overview', {})).toMatchObject({ values: { extra_per_month: 0, strategy: 'avalanche' }, open: [] });
    expect(check('search_purchases', { query: 'ICA' })).toMatchObject({ values: { query: 'ICA', period: 'this_year' }, open: [] });
    expect(check('debt_overview', { strategy: 'Snowball method' })).toMatchObject({ values: { strategy: 'snowball' } });
  });

  it('matches goals and wallets by name, and offers the candidates when several fit', () => {
    expect(check('goal_eta', { goal: 'buffert' })).toMatchObject({ values: { goal: 'g1' }, open: [] });
    expect(check('wallet_status', { wallet: 'Japan' })).toMatchObject({ values: { wallet: 'w1' } });
    const two = check('goal_eta', { goal: 'Resa' });
    if (two.ok) expect(two.open).toEqual([{ field: 'goal', choices: [{ id: 'g2', name: 'Resa till Japan' }, { id: 'g3', name: 'Resa till Rom' }] }]);
  });

  it('finds the row to change, and takes its category with it', () => {
    expect(check('propose_set_amount', { category: 'mat', row: 'matvaror', amount: 3500 }))
      .toMatchObject({ values: { category: 'mat', row: 'matvaror', amount: 3500 }, open: [] });
    expect(check('propose_set_amount', { category: 'boende', row: 'Mobil', amount: 199 }))
      .toMatchObject({ values: { category: 'prenumerationer', row: 'mobil' }, open: [] });
    const short = check('propose_set_amount', { category: 'boende', row: 'Telefon', amount: 99 });
    if (short.ok) expect(short.open[0].field).toBe('row');
    const unknown = check('propose_set_amount', { category: 'mat', row: 'Kaviar', amount: 99 });
    if (unknown.ok) expect(unknown.open[0].field).toBe('row');
  });

  it('every tool the lab tested is in the register', () => {
    expect(TOOL_NAMES).toHaveLength(18);
  });
});

describe('parseRawCall', () => {
  it('reads a call as Gemma writes it', () => {
    expect(parseRawCall('<|tool_call>call:what_if{change:1500,target:<|"|>boende<|"|>}<tool_call|>'))
      .toEqual({ name: 'what_if', args: { change: 1500, target: 'boende' } });
  });

  it('reads ids written without their quote marks, which crash the runtime', () => {
    expect(parseRawCall('<|tool_call>call:what_if{change:40,target:boende}<tool_call|>'))
      .toEqual({ name: 'what_if', args: { change: 40, target: 'boende' } });
  });

  it('keeps commas inside quoted text, and negative numbers', () => {
    expect(parseRawCall('<|tool_call>call:propose_add_row{amount:-1,category:<|"|>mat<|"|>,label:<|"|>Kaffe, te<|"|>}<tool_call|>'))
      .toEqual({ name: 'propose_add_row', args: { amount: -1, category: 'mat', label: 'Kaffe, te' } });
  });

  it('gives up on anything else', () => {
    expect(parseRawCall('Vilken kategori menar du?')).toBeNull();
    expect(parseRawCall('<|tool_call>call:what_if{change 40}<tool_call|>')).toBeNull();
  });
});

describe('amountsNotInQuestion', () => {
  it('finds sums the model worked out itself', () => {
    expect(amountsNotInQuestion('Det blir ca 208 € i månaden.', 'Hur mycket behöver jag spara för 2 500 €?')).toEqual(['208']);
    expect(amountsNotInQuestion('Du vill spara 2.500 €.', 'Hur mycket behöver jag spara för 2 500 €?')).toEqual([]);
  });

  it('dates the app gave the model are not sums', () => {
    expect(amountsNotInQuestion('2026年10月の支出をまとめますか？', '今月の買い物をまとめて')).toEqual([]);
    expect(amountsNotInQuestion('Ska jag visa 2026-10?', 'Visa')).toEqual([]);
  });
});

describe('dateHelp', () => {
  it('is the lab\'s text on the lab\'s day', () => {
    expect(dateHelp({ year: 2026, month: 9 })).toBe(
      'this month = 2026-10; last month = 2026-09; in 1 year = 2027-10; in 2 years = 2028-10; '
      + 'in 3 years = 2029-10; Christmas, New Year\'s Eve and year end = 2026-12. Past "juni" = 2026-06; '
      + 'deadline "november" = 2026-11, "mars" = 2027-03.');
  });

  it('moves with today', () => {
    expect(dateHelp({ year: 2027, month: 0 })).toContain('this month = 2027-01; last month = 2026-12;');
  });
});
