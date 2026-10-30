import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Lang } from '../i18n';
import type { MonthData } from '../types';
import { systemPrompt } from './prompt';

// The app's instructions must be the text the lab tested (context.py, round 8;
// Turkish round 9): the same start and the same language pack at the end, on
// the lab's day. Only the budget in between is the user's own.

const lab: Record<Lang, { head: string; tail: string }> =
  JSON.parse(new TextDecoder().decode(readFileSync('src/test-fixtures/aiLabPrompt.json')));

const budget: MonthData = {
  income: [{ id: 'lon', label: 'SYNT Lön', amount: 30000 }],
  expenses: [{ id: 'mat', name: 'Mat & dryck', icon: '•', color: '#888', rows: [{ id: 'm', label: 'Matvaror', amount: 4800 }] }],
  savings: [],
};

const build = (lang: Lang, monthName: string) => systemPrompt({
  lang, today: new Date(2026, 9, 21), currency: 'kr', budget, incomeName: 'Inkomst', monthName,
  goals: [{ id: 'g', name: 'Buffert', targetAmount: 50000, currentAmount: 18500, deadline: '2027-06', color: '#000' }],
  debts: [{ name: 'CSN' }], wallets: [{ name: 'Japan 2027' }],
  amount: n => n.toLocaleString('sv-SE'),
});

describe('systemPrompt', () => {
  it.each(Object.keys(lab) as Lang[])('%s is the lab\'s text around the budget', lang => {
    const monthName = /Today is \S+ \((.*)\)\./.exec(lab[lang].head)![1];
    const p = build(lang, monthName);
    expect(p.startsWith(lab[lang].head)).toBe(true);
    expect(p.endsWith(lab[lang].tail)).toBe(true);
  });

  it('gives the budget\'s structure, and never a purchase', () => {
    const p = build('sv', 'oktober 2026');
    expect(p).toContain('- income (Inkomst): SYNT Lön 30 000');
    expect(p).toContain('- mat (Mat & dryck): Matvaror 4 800');
    expect(p).toContain('Savings goals: Buffert (50 000 kr, 18 500 kr saved).');
    expect(p).toContain('Debts: CSN.\nWallets: Japan 2027.\n');
    expect(p).not.toContain('Recent purchases');
  });

  it('moves the pack\'s dates with today', () => {
    const p = systemPrompt({ ...{ lang: 'sv' as const, currency: 'kr', budget, incomeName: 'Inkomst', goals: [], debts: [], wallets: [], amount: String, monthName: 'mars 2027' }, today: new Date(2027, 2, 1) });
    expect(p).toContain('"till jul" = 2027-12, "nästa sommar" = 2027-06, "till februari" = 2028-02');
  });
});
