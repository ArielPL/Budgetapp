import { describe, it, expect } from 'vitest';
import {
  FOLLOWUP_LAYOUT_KEY, loadFollowUpLayout, saveFollowUpLayout, availableSections, shownSection,
} from './followUpLayout';
import type { StorageLike } from './storage';

class FakeStorage implements StorageLike {
  private map = new Map<string, string>();
  throws = false;
  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) { if (this.throws) throw new Error('unreadable'); return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { if (this.throws) throw new Error('full'); this.map.set(k, v); }
  removeItem(k: string) { if (this.throws) throw new Error('full'); this.map.delete(k); }
}

describe('followUpLayout', () => {
  it('starts on sub-tabs, which is what Ariel chose as the default', () => {
    expect(loadFollowUpLayout(new FakeStorage())).toBe('tabs');
  });

  it('remembers boxes, and goes back to the default by removing the key', () => {
    const s = new FakeStorage();
    saveFollowUpLayout(s, 'boxes');
    expect(s.getItem(FOLLOWUP_LAYOUT_KEY)).toBe('boxes');
    expect(loadFollowUpLayout(s)).toBe('boxes');
    saveFollowUpLayout(s, 'tabs');
    expect(s.getItem(FOLLOWUP_LAYOUT_KEY)).toBeNull();
    expect(loadFollowUpLayout(s)).toBe('tabs');
  });

  it('ignores a stored value it does not know', () => {
    const s = new FakeStorage();
    s.setItem(FOLLOWUP_LAYOUT_KEY, 'grid');
    expect(loadFollowUpLayout(s)).toBe('tabs');
  });

  it('survives storage that cannot be read or written', () => {
    const s = new FakeStorage();
    s.throws = true;
    expect(loadFollowUpLayout(s)).toBe('tabs');
    expect(() => saveFollowUpLayout(s, 'boxes')).not.toThrow();
  });

  it('offers only the sections that have something to show', () => {
    expect(availableSections({ waiting: 0, hasEntries: false, nothingYet: true })).toEqual(['overview']);
    expect(availableSections({ waiting: 0, hasEntries: false, nothingYet: false })).toEqual(['overview', 'questions']);
    expect(availableSections({ waiting: 7, hasEntries: true, nothingYet: false }))
      .toEqual(['overview', 'sort', 'purchases', 'questions']);
  });

  it('falls back to the overview when the chosen section goes away', () => {
    const all = availableSections({ waiting: 7, hasEntries: true, nothingYet: false });
    expect(shownSection('sort', all)).toBe('sort');
    // The last waiting item was sorted while Sort was open.
    const afterSorting = availableSections({ waiting: 0, hasEntries: true, nothingYet: false });
    expect(shownSection('sort', afterSorting)).toBe('overview');
  });
});
