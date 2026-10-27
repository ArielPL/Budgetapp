import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { MonthData } from '../types';
import { STANDARD_CATEGORY_IDS } from '../categorise';
import { checkCall, type AiContext } from './checks';
import { formatYM } from './months';
import type { YearMonth } from '../debts';

// The lab's answers as facit (~/Developer/budget-ai-lab, round 8, Turkish from
// round 9): 762 synthetic questions in eleven languages, what the lab expected,
// and what Gemma 4 E4B actually called. No model runs here — the question is
// "if the model says this, does the app end up right?"

interface LabRow {
  id: string;
  q: string;
  expect: Array<[string, Record<string, unknown>]> | null | 'READ';
  calls: Array<{ name: string; args: Record<string, unknown> }>;
}

const rows: LabRow[] = JSON.parse(new TextDecoder().decode(readFileSync('src/test-fixtures/aiLabRound8.json')));

const budget = {
  income: [{ id: 'lon', label: 'Lön', amount: 30000 }],
  expenses: STANDARD_CATEGORY_IDS.map(id => ({ id, name: id, icon: '•', color: '#888', rows: [] })),
  savings: [],
} as unknown as MonthData;

const ctx = (q: string): AiContext => ({ budget, goals: [], wallets: [], question: q, now: { year: 2026, month: 9 } });

/** The first expected call with the same tool as the model's first call. */
function pair(r: LabRow) {
  if (!Array.isArray(r.expect) || r.calls.length === 0) return null;
  const call = r.calls[0];
  const want = r.expect.find(([name]) => name === call.name);
  return want ? { call, want: want[1] } : null;
}

describe('the lab answers, through the app\'s checks', () => {
  it('has all 762', () => {
    expect(rows).toHaveLength(762);
  });

  it('months: fixes the misses and breaks no answer the model had right', () => {
    let before = 0;
    let after = 0;
    const broken: string[] = [];
    const fixed: string[] = [];
    for (const r of rows) {
      const p = pair(r);
      if (!p) continue;
      for (const field of ['month', 'by_month'] as const) {
        const want = p.want[field];
        if (typeof want !== 'string') continue;
        const checked = checkCall(p.call, ctx(r.q));
        if (!checked.ok) continue;
        const got = checked.values[field] as YearMonth | undefined;
        const wasRight = p.call.args[field] === want;
        const isRight = got !== undefined && formatYM(got) === want;
        if (wasRight) before++;
        if (isRight) after++;
        if (wasRight && !isRight) broken.push(r.id);
        if (!wasRight && isRight) fixed.push(r.id);
      }
    }
    expect(broken).toEqual([]);
    expect(fixed.sort()).toEqual(['ja017', 'nsv05', 'ru057', 'sv021', 'tr056', 'tr057', 'tr063']);
    expect(after).toBe(before + fixed.length);
    // 139 of 146 month fields right as the model wrote them; all 146 after.
    expect([before, after]).toEqual([139, 146]);
  });

  it('categories: every id the model wrote stays the same id', () => {
    for (const r of rows) {
      const p = pair(r);
      if (!p) continue;
      const checked = checkCall(p.call, ctx(r.q));
      if (!checked.ok) continue;
      const raw = p.call.args.category;
      if (typeof raw === 'string' && (STANDARD_CATEGORY_IDS as readonly string[]).includes(raw)) {
        expect(checked.values.category, r.id).toBe(raw);
      }
      const t = p.call.args.target;
      if (typeof t === 'string' && t !== 'income' && (STANDARD_CATEGORY_IDS as readonly string[]).includes(t)) {
        expect(checked.values.target, r.id).toEqual({ kind: 'category', id: t });
      }
      if (t === 'income') expect(checked.values.target, r.id).toEqual({ kind: 'income' });
    }
  });

  it('amounts: every number the model wrote comes through unchanged', () => {
    for (const r of rows) {
      const p = pair(r);
      if (!p) continue;
      const checked = checkCall(p.call, ctx(r.q));
      if (!checked.ok) continue;
      for (const field of ['amount', 'change', 'target_amount', 'extra_per_month', 'years']) {
        const raw = p.call.args[field];
        if (typeof raw === 'number' && raw !== 0) expect(checked.values[field], `${r.id} ${field}`).toBe(raw);
      }
    }
  });
});
