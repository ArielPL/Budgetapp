import { describe, it, expect, beforeEach } from 'vitest';
import { loadCsvMaps, rememberCsvMap, forgetCsvMap, CSV_MAPS_KEY } from './csvMaps';
import type { StorageLike } from './storage';
import type { ColumnRole } from './csvImport';

const memory = (): StorageLike => {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
  };
};

const SWEDBANK = 'radnummer|bokföringsdag|referens|beskrivning|belopp';
const SPARKASSE = 'buchungstag|valutadatum|buchungstext|betrag';
const ROLES: ColumnRole[] = ['skip', 'date', 'skip', 'text', 'amount'];

describe('remembering a bank layout', () => {
  let store: StorageLike;
  beforeEach(() => { store = memory(); });

  it('starts with nothing', () => {
    expect(loadCsvMaps(store)).toEqual({});
  });

  it('remembers a layout against the file’s own header', () => {
    rememberCsvMap(store, SWEDBANK, ROLES);
    expect(loadCsvMaps(store)[SWEDBANK]).toEqual(ROLES);
  });
});

describe('forgetting one', () => {
  let store: StorageLike;
  beforeEach(() => {
    store = memory();
    rememberCsvMap(store, SWEDBANK, ROLES);
    rememberCsvMap(store, SPARKASSE, ['date', 'skip', 'text', 'amount']);
  });

  it('makes the app ask about those columns again', () => {
    // The whole point: a layout confirmed wrong once was otherwise permanent.
    expect(forgetCsvMap(store, SWEDBANK)).toBe(true);
    expect(loadCsvMaps(store)[SWEDBANK]).toBeUndefined();
  });

  it('leaves every other bank alone', () => {
    forgetCsvMap(store, SWEDBANK);
    expect(loadCsvMaps(store)[SPARKASSE]).toEqual(['date', 'skip', 'text', 'amount']);
  });

  it('is content when there was nothing to forget', () => {
    // The caller wants it gone; it is gone. Not an error.
    expect(forgetCsvMap(store, 'a header nobody has ever seen')).toBe(true);
  });

  it('can be re-confirmed afterwards, and remembers the new answer', () => {
    forgetCsvMap(store, SWEDBANK);
    const corrected: ColumnRole[] = ['skip', 'date', 'skip', 'text', 'skip'];
    rememberCsvMap(store, SWEDBANK, corrected);
    expect(loadCsvMaps(store)[SWEDBANK]).toEqual(corrected);
  });

  it('reports a refused write rather than pretending', () => {
    const full: StorageLike = {
      ...store,
      setItem: () => { throw new DOMException('quota', 'QuotaExceededError'); },
    };
    expect(forgetCsvMap(full, SWEDBANK)).toBe(false);
  });

  it('treats corrupt storage as nothing remembered', () => {
    store.setItem(CSV_MAPS_KEY, '{not json');
    expect(loadCsvMaps(store)).toEqual({});
    expect(forgetCsvMap(store, SWEDBANK)).toBe(true);
  });
});
