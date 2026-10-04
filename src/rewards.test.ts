import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SavingsGoal } from './types';
import type { Debt } from './debts';

const native = vi.hoisted(() => ({ on: false, buzz: vi.fn(() => Promise.resolve()) }));
vi.mock('@capacitor/core', async (orig) => ({
  ...(await orig<typeof import('@capacitor/core')>()),
  Capacitor: { isNativePlatform: () => native.on },
}));
vi.mock('@capacitor/haptics', () => ({
  Haptics: { notification: native.buzz },
  NotificationType: { Success: 'SUCCESS' },
}));

const { goalsJustReached, justPaidOff, celebrate } = await import('./rewards');

const goal = (id: string, current: number, target: number): SavingsGoal =>
  ({ id, name: `SYNT ${id}`, currentAmount: current, targetAmount: target, deadline: '', color: '#888' });
const debt = (balance: number, kind: Debt['kind'] = 'loan'): Debt =>
  ({ id: 'd', name: 'SYNT LÅN', kind, balance, balanceDate: '2026-10-04', ratePct: 5, monthlyPayment: 500 });

describe('goalsJustReached', () => {
  it('names a goal that crosses its target', () => {
    expect(goalsJustReached([goal('a', 9000, 10000)], [goal('a', 10000, 10000)]).map(g => g.id)).toEqual(['a']);
  });
  it('also when the target is lowered to what is saved', () => {
    expect(goalsJustReached([goal('a', 8000, 10000)], [goal('a', 8000, 8000)]).map(g => g.id)).toEqual(['a']);
  });
  it('not a goal that was already reached, nor one still short', () => {
    expect(goalsJustReached([goal('a', 12000, 10000), goal('b', 1, 10)], [goal('a', 13000, 10000), goal('b', 5, 10)])).toEqual([]);
  });
  it('not a new goal that starts already met, nor a target of 0', () => {
    expect(goalsJustReached([goal('z', 0, 0)], [goal('n', 500, 500), goal('z', 10, 0)])).toEqual([]);
  });
});

describe('justPaidOff', () => {
  it('is true when something was owed and now nothing is', () => {
    expect(justPaidOff(debt(1200), debt(0))).toBe(true);
  });
  it('also for a mortgage — paying one off is worth it too', () => {
    expect(justPaidOff(debt(1200, 'mortgage'), debt(0, 'mortgage'))).toBe(true);
  });
  it('is false for any other edit', () => {
    expect(justPaidOff(debt(1200), debt(900))).toBe(false);
    expect(justPaidOff(debt(0), debt(0))).toBe(false);
  });
});

describe('celebrate', () => {
  beforeEach(() => { native.buzz.mockClear(); });
  it('buzzes a phone with the success pattern', () => {
    native.on = true;
    celebrate();
    expect(native.buzz).toHaveBeenCalledWith({ type: 'SUCCESS' });
  });
  it('does nothing on the web', () => {
    native.on = false;
    celebrate();
    expect(native.buzz).not.toHaveBeenCalled();
  });
  it('never throws when the phone cannot buzz', async () => {
    native.on = true;
    native.buzz.mockImplementationOnce(() => Promise.reject(new Error('no haptics')));
    expect(() => celebrate()).not.toThrow();
    await Promise.resolve();
  });
});
