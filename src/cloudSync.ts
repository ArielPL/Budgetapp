// ── cloudSync — cross-device sync layer, UNDER the localStorage app ──────
//
// The app itself is 100% localStorage and knows nothing about this file. Sync
// is layered underneath so that, when signed OUT (or with sync disabled),
// behavior is byte-identical to the original local-only app: no Supabase calls
// of any kind happen beyond the one-time session check at boot.
//
// KEY MODEL: rows in public.kv_store mirror this app's localStorage 1:1 —
//   key   = the localStorage key string (every app key is prefixed `budget_`)
//   value = that key's JSON-parsed value
//   updated_at = server-set by a DB trigger (we NEVER send it).
//
// ── Why we monkey-patch Storage.prototype.setItem instead of refactoring ──
// There are 15+ `localStorage.setItem(...)` call sites spread across App.tsx,
// CustomV3.tsx, defaults.ts and themes.ts. Refactoring each to also push to the
// cloud is high-risk: miss one site and that key silently never syncs. Instead
// we patch setItem ONCE (installed from main.tsx at boot). Every existing and
// future write flows through the patch automatically — call through to the real
// setItem first (so local behavior is unchanged), then, only while signed in,
// queue a debounced upsert. This is the single load-bearing trick here; keep it
// in mind when reading the rest of the file.
//
// v1 SCOPE: no Supabase Realtime subscriptions. The real need is multi-DEVICE
// sync (open the app later on another device), not live co-editing. Realtime
// would risk clobbering a field the user is actively typing into. We instead
// pull on sign-in, boot (existing session), and tab focus/visibility. Realtime
// is a natural v2 once this is proven solid.

import { supabase } from './supabaseClient';
import type { User } from '@supabase/supabase-js';

const SYNC_PREFIX = 'budget_';

// Our own bookkeeping keys — they live in localStorage but must NEVER sync to
// the cloud (they're per-device sync metadata / auth plumbing, not budget data).
const SYNC_META_KEY = 'budget_sync_meta';
const NO_SYNC_KEYS = new Set<string>([SYNC_META_KEY]);

/** Should this localStorage key participate in cloud sync? */
function isSyncableKey(key: string): boolean {
  return key.startsWith(SYNC_PREFIX) && !NO_SYNC_KEYS.has(key);
}

// ── Signed-in user tracking ──────────────────────────────────────────
// cloudSync holds its own copy of the current user (set by useAuth via
// setSyncUser) so the patched setItem — which runs outside React — can cheaply
// check "are we signed in?" without a hook. null = guest = no network.
let currentUser: User | null = null;

// ── Sync-meta: per-key "last known LOCAL write" timestamps ───────────────
// Stored as one JSON blob under budget_sync_meta:  { [key]: isoTimestamp }.
// Updated on every LOCAL write BEFORE the network push fires, so on pull we can
// answer "was my local copy of this key written after or before the remote row
// I just fetched?" and resolve the conflict last-write-wins by timestamp.

type SyncMeta = Record<string, string>;

function readSyncMeta(): SyncMeta {
  try {
    const raw = localStorage.getItem(SYNC_META_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as SyncMeta;
  } catch {
    return {};
  }
}

function writeSyncMeta(meta: SyncMeta): void {
  // Uses the REAL setItem (captured below) so writing meta never triggers a
  // push and never recurses through the patch.
  realSetItem.call(localStorage, SYNC_META_KEY, JSON.stringify(meta));
}

function touchSyncMeta(key: string, iso: string): void {
  const meta = readSyncMeta();
  meta[key] = iso;
  writeSyncMeta(meta);
}

// ── The patched setItem ──────────────────────────────────────────────
// Captured reference to the genuine implementation. Everything that must NOT
// trigger a push (writing sync-meta, applying a pulled remote value) goes
// through realSetItem directly.
const realSetItem = Storage.prototype.setItem;

// Debounced per-key push queue. Each key gets its own timer so a burst of edits
// to one key collapses to a single upsert, while unrelated keys aren't delayed.
const PUSH_DEBOUNCE_MS = 800;
const pushTimers = new Map<string, ReturnType<typeof setTimeout>>();
// Latest raw string value seen per pending key (so the debounced push sends the
// freshest value, not whatever was current when the timer was first armed).
const pendingValues = new Map<string, string>();

function queuePush(key: string, rawValue: string): void {
  pendingValues.set(key, rawValue);
  const existing = pushTimers.get(key);
  if (existing) clearTimeout(existing);
  pushTimers.set(
    key,
    setTimeout(() => {
      pushTimers.delete(key);
      const value = pendingValues.get(key);
      pendingValues.delete(key);
      if (value !== undefined) void pushKey(key, value);
    }, PUSH_DEBOUNCE_MS),
  );
}

async function pushKey(key: string, rawValue: string): Promise<void> {
  if (!supabase || !currentUser) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawValue);
  } catch {
    // Value isn't valid JSON — skip the upsert rather than crash the app over a
    // sync failure. (Shouldn't happen: the app stores JSON, but be defensive.)
    console.warn(`[cloudSync] skipping push for "${key}" — value is not valid JSON`);
    return;
  }
  // NEVER send updated_at — the DB trigger owns it. But read the trigger-set
  // value BACK and stamp sync-meta with it: that marks this key as "in sync",
  // so our own push doesn't look like newer remote data on the next pull
  // (which would pointlessly re-apply it and reload the page).
  const { data, error } = await supabase
    .from('kv_store')
    .upsert(
      { user_id: currentUser.id, key, value: parsed },
      { onConflict: 'user_id,key' },
    )
    .select('updated_at')
    .single();
  if (error) {
    console.warn(`[cloudSync] push failed for "${key}":`, error.message);
  } else if (data?.updated_at) {
    touchSyncMeta(key, data.updated_at);
  }
}

/**
 * Install the setItem patch. Idempotent — safe to call once at boot. From here
 * on, EVERY localStorage write in the app flows through here.
 */
export function installStoragePatch(): void {
  if ((Storage.prototype.setItem as unknown as { __budgetPatched?: boolean }).__budgetPatched) {
    return;
  }
  const patched = function (this: Storage, key: string, value: string): void {
    // 1) Always do the real write first — local behavior is never altered.
    realSetItem.call(this, key, value);

    // 2) Sync bookkeeping only for the default localStorage (the app never uses
    //    sessionStorage, but be safe) and only for syncable budget_ keys.
    if (this !== window.localStorage || !isSyncableKey(key)) return;

    // 3) Record the local write time BEFORE any network push, so pull-side
    //    conflict resolution always knows our local copy's age — even if the
    //    user is signed out right now (they may sign in later; a truthful local
    //    timestamp keeps the eventual merge correct).
    touchSyncMeta(key, new Date().toISOString());

    // 4) Push only while signed in. Guests: nothing else happens — byte-identical
    //    to the original app.
    if (currentUser) queuePush(key, value);
  } as typeof Storage.prototype.setItem;
  (patched as unknown as { __budgetPatched?: boolean }).__budgetPatched = true;
  Storage.prototype.setItem = patched;
}

/**
 * Apply a value pulled from the cloud into localStorage WITHOUT triggering a
 * push (bypasses the patch via realSetItem) — otherwise every pull would
 * immediately re-push and loop. Also stamps sync-meta to the remote row's
 * updated_at so we know this local copy matches that remote version.
 */
function applyPulledValue(key: string, value: unknown, remoteIso: string): void {
  realSetItem.call(localStorage, key, JSON.stringify(value));
  touchSyncMeta(key, remoteIso);
}

// ── Pull (cloud → local) ─────────────────────────────────────────────
// Fetch all rows for the user; for each, last-write-wins vs the local sync-meta
// timestamp. Newer-or-absent-locally → write it down; local newer/equal → leave
// local (it'll push up via the debounced queue). Returns true if anything
// changed locally (so the caller can decide whether a reload/re-read is needed).
export async function pullAll(user: User): Promise<boolean> {
  if (!supabase) return false;
  // Make sure pushes queued below can actually fire: at BOOT this runs before
  // useAuth has called setSyncUser, so currentUser would still be null and the
  // upload sweep would silently drop everything. pullAll is only ever called
  // with the signed-in user, so claiming it here is always correct.
  currentUser = user;

  const { data, error } = await supabase
    .from('kv_store')
    .select('key, value, updated_at')
    .eq('user_id', user.id);
  if (error) {
    console.warn('[cloudSync] pull failed:', error.message);
    return false;
  }
  if (!data) return false;

  const meta = readSyncMeta();
  let changed = false;
  // Per-key remote timestamps, kept for the upload sweep below so it can tell
  // "cloud never saw this key" and "local is strictly newer" apart from
  // "already in sync" (pushing in-sync keys would bump their server timestamp
  // and make the next pull re-apply + reload — an endless loop).
  const remoteTimes = new Map<string, number>();

  for (const row of data as Array<{ key: string; value: unknown; updated_at: string }>) {
    const { key, value, updated_at } = row;
    if (!isSyncableKey(key)) continue; // ignore anything unexpected

    const localIso = meta[key];
    const remoteTime = Date.parse(updated_at);
    const localTime = localIso ? Date.parse(localIso) : NaN;
    remoteTimes.set(key, remoteTime);

    // Take the remote value if we have no local copy, no local timestamp, or the
    // remote row is strictly newer than our last local write.
    const localExists = localStorage.getItem(key) !== null;
    const remoteWins =
      !localExists ||
      Number.isNaN(localTime) ||
      remoteTime > localTime;

    if (remoteWins) {
      applyPulledValue(key, value, updated_at);
      changed = true;
    }
    // else: local is strictly newer — leave it; the sweep below pushes it up.
  }

  // ── Upload sweep (local → cloud reconcile) ────────────────────────────
  // Push syncable local keys the cloud LACKS, plus keys where local is
  // STRICTLY newer. THIS is what makes the first sign-in on a device with
  // existing data seed the cloud — pushes otherwise only fire on edits, so
  // months you never touch again would never reach your other devices.
  // Running on every pull (boot, sign-in, tab focus) also self-heals pushes
  // that failed offline. In-sync keys (local time <= remote time) are left
  // alone so the system converges instead of ping-ponging.
  const metaAfterPull = readSyncMeta();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !isSyncableKey(key)) continue;
    const remoteTime = remoteTimes.get(key);
    if (remoteTime !== undefined) {
      const localIso = metaAfterPull[key];
      const localTime = localIso ? Date.parse(localIso) : NaN;
      if (Number.isNaN(localTime) || localTime <= remoteTime) continue; // in sync (or just applied)
    }
    const raw = localStorage.getItem(key);
    if (raw !== null) queuePush(key, raw);
  }

  return changed;
}

// ── Debounced focus/visibility pulls ─────────────────────────────────
// This is what actually delivers "edited on phone, then opened laptop" without
// realtime. We debounce so a flurry of focus/visibility events (common on
// mobile) collapses into a single refetch.
let visibilityHandlersInstalled = false;
let focusPullTimer: ReturnType<typeof setTimeout> | null = null;
const FOCUS_PULL_DEBOUNCE_MS = 600;

function schedulePull(): void {
  if (!currentUser) return;
  if (focusPullTimer) clearTimeout(focusPullTimer);
  focusPullTimer = setTimeout(() => {
    focusPullTimer = null;
    if (!currentUser) return;
    void pullAll(currentUser).then((changed) => {
      // A background pull can change data the app already rendered from
      // localStorage. Simplest correct refresh: reload once, only if something
      // actually changed. This mirrors how the app treats import (full reload).
      if (changed) window.location.reload();
    });
  }, FOCUS_PULL_DEBOUNCE_MS);
}

function onVisibility(): void {
  if (document.visibilityState === 'visible') schedulePull();
}

function installVisibilityPulls(): void {
  if (visibilityHandlersInstalled) return;
  visibilityHandlersInstalled = true;
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('focus', schedulePull);
}

function removeVisibilityPulls(): void {
  if (!visibilityHandlersInstalled) return;
  visibilityHandlersInstalled = false;
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('focus', schedulePull);
  if (focusPullTimer) {
    clearTimeout(focusPullTimer);
    focusPullTimer = null;
  }
}

// ── User lifecycle wiring (called by useAuth) ────────────────────────
/**
 * Tell cloudSync who's signed in. Passing a user turns ON pushes + focus pulls;
 * passing null turns everything OFF (guest mode — no further network at all).
 * `pullOnSignIn` triggers an immediate pull; the caller sets it true on a fresh
 * sign-in and false when it has already pulled at boot (to avoid a double pull).
 */
export function setSyncUser(user: User | null, pullOnSignIn: boolean): void {
  const wasSignedIn = currentUser !== null;
  currentUser = user;

  if (user) {
    installVisibilityPulls();
    if (pullOnSignIn && !wasSignedIn) {
      void pullAll(user).then((changed) => {
        if (changed) window.location.reload();
      });
    }
  } else {
    // Signing out: stop syncing. Does NOT clear localStorage — the app keeps
    // working exactly as today, just local-only again.
    removeVisibilityPulls();
    // Flush any pending push timers so a half-typed edit doesn't fire after
    // sign-out. (The values are already safe in localStorage.)
    for (const timer of pushTimers.values()) clearTimeout(timer);
    pushTimers.clear();
    pendingValues.clear();
  }
}
