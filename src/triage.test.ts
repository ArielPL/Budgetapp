import { describe, it, expect } from 'vitest';
import { triageUnsorted, proposeFor, placeHistory, movableIds } from './triage';
import { UNSORTED_ACTUAL_ID, TRANSFER_ACTUAL_ID, INCOME_ACTUAL_ID } from './actuals';
import type { ActualEntry } from './types';
import type { LearnedRules } from './categorise';

// ── Measured on the author's own statement ─────────────────────────────────
//
// 471 transactions, 123 distinct places, 34 of them left in Övrigt. Those 34
// were not hard to sort — they were hard to FIND, folded inside one collapsed
// row. These tests hold the list to the two things that make it worth reading:
// the biggest decision comes first, and a proposal is the user's own history
// before it is a stranger's list.

let n = 0;
const e = (text: string, amount: number, categoryId = UNSORTED_ACTUAL_ID): ActualEntry => ({
  id: `e${n++}`, date: '2026-09-05', text, amount, categoryId,
});

const rules: LearnedRules = {};
const ids = (...list: string[]) => new Set(list);

describe('what to propose', () => {
  it('prefers a rule the user taught over the built-in list', () => {
    // "Circle K" is a petrol station in the seed list. If the user has said it
    // is food — they eat there — that is the answer, every time.
    const taught: LearnedRules = { 'circle k': 'mat' };
    expect(proposeFor('Circle K', ids('mat', 'transport'), taught, new Map()))
      .toEqual({ categoryId: 'mat', source: 'rule' });
  });

  it('prefers where the user filed it before over the built-in list', () => {
    const history = new Map([['circle k', 'mat']]);
    expect(proposeFor('Circle K', ids('mat', 'transport'), rules, history))
      .toEqual({ categoryId: 'mat', source: 'history' });
  });

  it('falls back to the built-in list when the user has no opinion', () => {
    expect(proposeFor('Circle K', ids('transport'), rules, new Map()))
      .toEqual({ categoryId: 'transport', source: 'seed' });
  });

  it('offers to CREATE a standard category the budget does not have', () => {
    // Never created behind the user's back — the same promise the import makes.
    const out = proposeFor('Circle K', ids('mat'), rules, new Map());
    expect(out).toEqual({ create: 'transport', source: 'seed' });
  });

  it('keeps a taught rule alive when its category was deleted', () => {
    const taught: LearnedRules = { 'circle k': 'transport' };
    expect(proposeFor('Circle K', ids('mat'), taught, new Map()))
      .toEqual({ create: 'transport', source: 'rule' });
  });

  it('proposes nothing rather than guessing', () => {
    // A wrong proposal one tap away is worse than none: the tap is the point,
    // and unreliable proposals have to be read one by one anyway.
    expect(proposeFor('BETALNING 884213', ids('mat'), rules, new Map())).toEqual({});
  });
});

describe('history', () => {
  it('reads where each place was filed', () => {
    const history = placeHistory([e('ICA Nära', 312, 'mat'), e('SL', 990, 'transport')]);
    expect(history.get('ica nära')).toBe('mat');
    expect(history.get('sl')).toBe('transport');
  });

  it('does not count a bucket as an answer', () => {
    // "You put it in Övrigt last time" is the question repeated back.
    const history = placeHistory([
      e('ICA Nära', 312, UNSORTED_ACTUAL_ID),
      e('Eget konto', 5000, TRANSFER_ACTUAL_ID),
    ]);
    expect(history.size).toBe(0);
  });
});

describe('the list', () => {
  const unsorted = [
    e('Espresso House', 56), e('Espresso House', 62),
    e('Hyra Fastighets AB', 9400),
    e('ICA Nära', 312), e('ICA Nära', 289), e('ICA Nära', 154),
  ];

  it('puts the biggest decision first, by money not by count', () => {
    // Three grocery runs are three taps saved; one rent bill is 9 400 kr of the
    // month explained. The question is where the money went.
    const out = triageUnsorted(unsorted, [], ids('mat'), rules);
    expect(out.map(d => d.text)).toEqual(['Hyra Fastighets AB', 'ICA Nära', 'Espresso House']);
    expect(out[0].total).toBe(9400);
    expect(out[1].count).toBe(3);
  });

  it('carries the proposal for each place', () => {
    const filed = [e('Espresso House', 40, 'mat')];
    const out = triageUnsorted(unsorted, filed, ids('mat'), rules);
    const coffee = out.find(d => d.text === 'Espresso House')!;
    expect(coffee.categoryId).toBe('mat');
    expect(coffee.source).toBe('history');
  });

  it('is empty when nothing is waiting', () => {
    expect(triageUnsorted([], [], ids('mat'), rules)).toEqual([]);
  });

  it('sums a place the way the rest of the app does', () => {
    // A refund reduces the place's total rather than adding to it — the same
    // rule the category rows follow. One number, one meaning.
    const purchase = e('Elgiganten', 2000);
    const refund: ActualEntry = { ...e('Elgiganten', 500), direction: 'in' };
    const out = triageUnsorted([purchase, refund], [], ids('mat'), rules);
    expect(out[0].total).toBe(1500);
    expect(out[0].count).toBe(2);
  });
});

describe('movableIds', () => {
  it('includes Income, where a misread salary belongs', () => {
    const set = movableIds(['mat', 'transport']);
    expect(set.has(INCOME_ACTUAL_ID)).toBe(true);
    expect(set.has('mat')).toBe(true);
  });
});
