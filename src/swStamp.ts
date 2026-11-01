// ── swStamp — giving each build's service worker its own name and files ────
//
// public/sw.js is copied into dist/ as it is, so it used to be the SAME file on
// every deploy: the browser never installed a new worker, the one cache name
// ('budget-v3') never changed, and every hashed bundle any deploy ever served
// was kept in it for good — origin storage that only grew, sharing a quota with
// the localStorage that holds the user's budget (full sweep 2026-10-08).
//
// The build now stamps the worker with an id for THIS build and the list of
// its bundles (vite.config.ts). A changed worker is a new install, so each
// deploy gets a cache of its own, filled up front with every bundle — offline
// start then needs nothing fetched on the way — and the old caches are dropped
// when it takes over. Only the service worker's cache is ever touched: the
// user's data lives in localStorage (web) or SQLite (apps), never here.
//
// Pure, so it is tested without a build.

export const BUILD_PLACEHOLDER = '__BUILD_ID__';
export const ASSETS_PLACEHOLDER = '/*__ASSETS__*/[]';

/** sw.js with this build's id and bundle list filled in. Throws if the
 *  template no longer carries the placeholders, so a build can never ship a
 *  worker that silently kept the old, ever-growing behaviour. */
export function stampServiceWorker(source: string, buildId: string, assets: string[]): string {
  if (!source.includes(BUILD_PLACEHOLDER) || !source.includes(ASSETS_PLACEHOLDER)) {
    throw new Error('sw.js: build placeholders missing');
  }
  if (!/^[A-Za-z0-9_-]+$/.test(buildId)) throw new Error('sw.js: unusable build id');
  return source
    .split(BUILD_PLACEHOLDER).join(buildId)
    .split(ASSETS_PLACEHOLDER).join(JSON.stringify(assets));
}
