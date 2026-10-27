import type { StorageLike } from '../storage';

/** A synchronous in-memory store for tests, with the map exposed so a test
 *  can compare everything at once. */
export function memory(seed: Record<string, string>): StorageLike & { map: Map<string, string> } {
  const map = new Map(Object.entries(seed));
  return {
    map,
    get length() { return map.size; },
    key: i => [...map.keys()][i] ?? null,
    getItem: k => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, v); },
    removeItem: k => { map.delete(k); },
  };
}
