import { describe, it, expect } from 'vitest';
import { stampServiceWorker } from './swStamp';
import swTemplate from '../public/sw.js?raw';

// ── The service worker cleans up after older builds (full sweep 2026-10-08) ─
//
// public/sw.js is run here as the browser would run it, against a fake
// CacheStorage, so install and activate are tested for real. Synthetic names.

type Handler = (e: { waitUntil(p: Promise<unknown>): void }) => void;

function runWorker(source: string, existing: Record<string, string[]>) {
  const stores = new Map<string, Set<string>>(Object.entries(existing).map(([k, v]) => [k, new Set(v)]));
  const handlers: Record<string, Handler> = {};
  const caches = {
    async keys() { return [...stores.keys()]; },
    async open(name: string) {
      if (!stores.has(name)) stores.set(name, new Set());
      const store = stores.get(name)!;
      return { async addAll(urls: string[]) { for (const u of urls) store.add(u); } };
    },
    async delete(name: string) { return stores.delete(name); },
  };
  const self = {
    addEventListener(type: string, fn: Handler) { handlers[type] = fn; },
    skipWaiting() {}, clients: { claim() {} },
  };
  new Function('self', 'caches', source)(self, caches);
  const fire = async (type: string) => {
    const waits: Promise<unknown>[] = [];
    handlers[type]({ waitUntil: p => { waits.push(p); } });
    await Promise.all(waits);
  };
  return { stores, fire };
}

describe('stampServiceWorker', () => {
  it('fills in the build id and the bundles', () => {
    const out = stampServiceWorker(swTemplate, 'abc123', ['/assets/a-1.js', '/assets/b-2.css']);
    expect(out).toContain("const BUILD = 'abc123';");
    expect(out).toContain('["/assets/a-1.js","/assets/b-2.css"]');
    expect(out).not.toContain('__BUILD_ID__');
  });

  it('refuses a template without the placeholders, or an odd id', () => {
    expect(() => stampServiceWorker('const CACHE = "x";', 'abc', [])).toThrow();
    expect(() => stampServiceWorker(swTemplate, "a'b", [])).toThrow();
  });
});

describe('the stamped worker', () => {
  it('precaches every bundle of its build, so offline start needs nothing more', async () => {
    const sw = runWorker(stampServiceWorker(swTemplate, 'b2', ['/assets/index-2.js', '/assets/Year-2.js']), {});
    await sw.fire('install');
    expect([...sw.stores.get('budget-b2')!]).toEqual(
      expect.arrayContaining(['/', '/index.html', '/manifest.json', '/assets/index-2.js', '/assets/Year-2.js']),
    );
  });

  it('drops older builds on activate, keeping only the one just before it', async () => {
    const sw = runWorker(stampServiceWorker(swTemplate, 'b3', ['/assets/index-3.js']), {
      'budget-v3': ['/assets/index-0.js', '/assets/index-older.js'], // the old, ever-growing cache
      'budget-b1': ['/assets/index-1.js'],
      'budget-b2': ['/assets/index-2.js'],
      'someone-else': ['/x'],
    });
    await sw.fire('install');
    await sw.fire('activate');
    expect([...sw.stores.keys()].sort()).toEqual(['budget-b2', 'budget-b3', 'someone-else']);
  });

  it('on the first stamped deploy, keeps the old cache for one generation, then lets it go', async () => {
    const first = runWorker(stampServiceWorker(swTemplate, 'b1', []), { 'budget-v3': ['/assets/old.js'] });
    await first.fire('install');
    await first.fire('activate');
    expect([...first.stores.keys()].sort()).toEqual(['budget-b1', 'budget-v3']);
    const second = runWorker(stampServiceWorker(swTemplate, 'b2', []), Object.fromEntries(
      [...first.stores].map(([k, v]) => [k, [...v]]),
    ));
    await second.fire('install');
    await second.fire('activate');
    expect([...second.stores.keys()].sort()).toEqual(['budget-b1', 'budget-b2']);
  });
});
