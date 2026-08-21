import { describe, it, expect } from 'vitest';
import { hasBudgetContent } from './monthContent';
import { defaultMonthData } from './defaults';
import type { MonthData } from './types';

const month = (over: Partial<MonthData> = {}): MonthData =>
  ({ income: [], expenses: [], savings: [], ...over });

const cat = (rows: MonthData['expenses'][number]['rows']) =>
  ({ id: 'boende', name: 'Boende', icon: '', color: '', rows });

describe('hasBudgetContent', () => {
  it('is false for the blank month a never-saved key loads as', () => {
    // What copyFromPrevMonth's guard rests on: loadMonthData returns
    // defaultMonthData for a month with no stored key, so checking content
    // subsumes the old "does the key exist" check instead of weakening it.
    expect(hasBudgetContent(defaultMonthData('sv'))).toBe(false);
  });

  it('is false for a month nobody has touched', () => {
    expect(hasBudgetContent(month())).toBe(false);
    expect(hasBudgetContent(null)).toBe(false);
    expect(hasBudgetContent(undefined)).toBe(false);
  });

  it('counts structure even when every amount is 0', () => {
    // The reason this exists: copying used to ask only when totals were above
    // zero, so a month worth 0 kr but full of the user's own rows and
    // categories was replaced without a word.
    expect(hasBudgetContent(month({
      income: [{ id: 'i1', label: 'Lön', amount: 0 }],
    }))).toBe(true);

    expect(hasBudgetContent(month({
      expenses: [cat([{ id: 'r1', label: 'Hyra', amount: 0 }])],
    }))).toBe(true);
  });

  it('counts a row marked per year, whatever it is worth', () => {
    expect(hasBudgetContent(month({
      expenses: [cat([{ id: 'r1', label: 'Försäkring', amount: 0, period: 'year' }])],
    }))).toBe(true);
  });

  it('counts an empty category — the user made it', () => {
    expect(hasBudgetContent(month({ expenses: [cat([])] }))).toBe(true);
  });

  it('ignores savings, which no budget copy touches', () => {
    // Warning about savings here would train people to click through the
    // dialog that actually matters.
    expect(hasBudgetContent(month({
      savings: [cat([{ id: 's1', label: 'Konto', amount: 60000 }])],
      savingsSnapshotRecorded: true,
    }))).toBe(false);
  });

  it('ignores a period label, which a budget copy preserves', () => {
    expect(hasBudgetContent(month({ periodLabel: 'Lönevecka 34' }))).toBe(false);
  });

  it('survives a half-written record with fields missing', () => {
    expect(hasBudgetContent({} as MonthData)).toBe(false);
  });
});
