import { Capacitor } from '@capacitor/core';
import { Haptics, NotificationType } from '@capacitor/haptics';
import type { SavingsGoal } from './types';
import { inPlan, type Debt } from './debts';

// ── Rewards — a tap of the phone when something big is done ────────────────
//
// Haptics only for the two moments worth it: a savings goal reached and a debt
// paid off (Ariel, 2026-10-04). Never on ordinary taps — a phone that buzzes
// at everything says nothing. The words on screen always come with it, so a
// phone without haptics, or the web, loses nothing but the buzz.

/** Goals that were short of their target before and reach it after. A new
 *  goal that starts already met is not news; a target of 0 is not a goal. */
export function goalsJustReached(before: SavingsGoal[], after: SavingsGoal[]): SavingsGoal[] {
  const was = new Map(before.map(g => [g.id, g]));
  return after.filter(g => {
    const old = was.get(g.id);
    return old !== undefined
      && g.targetAmount > 0 && g.currentAmount >= g.targetAmount
      && !(old.targetAmount > 0 && old.currentAmount >= old.targetAmount);
  });
}

/** Whether this edit paid the debt off: something was owed, now nothing is. */
export function justPaidOff(before: Debt, after: Debt): boolean {
  return inPlan({ ...before, kind: 'other' }) && !inPlan({ ...after, kind: 'other' });
}

/** The success buzz, on a phone. Fire and forget: it can never fail a save. */
export function celebrate(): void {
  if (!Capacitor.isNativePlatform()) return;
  Haptics.notification({ type: NotificationType.Success }).catch(() => {});
}
