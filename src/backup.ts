// ── backup — export/import of everything the app knows about you ───────────
//
// Pure, DOM-free logic (unit-tested in backup.test.ts) behind a tiny storage
// port, so the whole import pipeline can be exercised without a real browser
// and without risking a real user's data.
//
// Two rules drive the design:
//
//   1. REPLACE MEANS REPLACE. The confirm dialog promises, in all three
//      languages, that importing "REPLACES all current data". It used to only
//      write the incoming keys, so a restore from an older backup left newer
//      months sitting there — the user ended up with a silent merge of two
//      different realities. Import now deletes every backup-owned key first.
//
//   2. ALL-OR-NOTHING. A file is validated completely before a single byte is
//      written, and a failure mid-write rolls back to the snapshot taken up
//      front. There is no state where the user is left with half of an old
//      backup and half of a new one.
//
// Authentication is explicitly out of scope: its keys are never exported, never
// deleted, never overwritten. See isBackupOwnedKey.

import type { Lang } from './i18n';
import { validateSavingsPlan, type SavingsPlan } from './sparplan';
import { isValidMoney } from './money';

/** Bumped only when the payload SHAPE changes in a way older apps can't read. */
export const BACKUP_VERSION = 1;

/** The subset of localStorage this module is allowed to touch. */
const BACKUP_PREFIX = 'budget_';

/**
 * Keys that look like ours but belong to sign-in / cloud sync. Auth is out of
 * scope for backup: exporting them would put credentials in a file the user
 * emails around, and deleting them on import would sign the user out.
 *
 * Supabase's own keys (`sb-*-auth-token`) don't carry our prefix and are already
 * excluded, but the accounts work parked on the `authorization` branch may add
 * prefixed ones — this list is where they go, and the test suite asserts they
 * survive an import untouched.
 */
const AUTH_KEY_PATTERNS = [/^budget_auth/, /^budget_sync/, /^budget_session/, /^budget_user/];

export function isAuthenticationKey(key: string): boolean {
  return AUTH_KEY_PATTERNS.some(re => re.test(key));
}

/** The single key policy shared by export, delete and import — so the three can
 *  never disagree about what "your data" means. */
export function isBackupOwnedKey(key: string): boolean {
  return key.startsWith(BACKUP_PREFIX) && !isAuthenticationKey(key);
}

/** The bits of localStorage we use, so tests can pass a plain fake. */
export interface StorageLike {
  readonly length: number;
  key(i: number): string | null;
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export interface BackupPayload {
  app: 'budget';
  version: number;
  exportedAt: string;
  data: Record<string, string>;
}

export type ImportFailure =
  | 'not-json'        // the file isn't JSON at all
  | 'not-a-backup'    // valid JSON, but not one of our exports
  | 'too-new'         // written by a newer app version than this one
  | 'corrupt'         // right shape, but a value is unusable
  | 'write-failed';   // storage rejected a write (quota) — rolled back

export type ImportCheck =
  | { ok: true; payload: BackupPayload; keyCount: number }
  | { ok: false; reason: ImportFailure };

// ── validation ────────────────────────────────────────────────────────────
// Everything below answers one question: is this value safe to hand back to the
// app as if the user had typed it? Anything uncertain is rejected outright —
// a refused import costs the user a retry, a bad one costs them their records.

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Finite number: rejects NaN and ±Infinity, which JSON.stringify turns into
 *  `null` and which then poison every total they touch. */
const isMoney = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const isRow = (v: unknown): boolean =>
  isPlainObject(v) &&
  typeof v.id === 'string' &&
  // Same ceiling and finiteness rule the UI enforces — a backup must not be
  // able to introduce an amount the app would have refused on the keyboard.
  isValidMoney(v.amount) &&
  (v.label === undefined || typeof v.label === 'string') &&
  (v.name === undefined || typeof v.name === 'string');

const isCategory = (v: unknown): boolean =>
  isPlainObject(v) && typeof v.id === 'string' && Array.isArray(v.rows) && v.rows.every(isRow);

const isMonthData = (v: unknown): boolean =>
  isPlainObject(v) &&
  Array.isArray(v.income) && v.income.every(isRow) &&
  Array.isArray(v.expenses) && v.expenses.every(isCategory) &&
  Array.isArray(v.savings) && v.savings.every(isCategory) &&
  (v.savingsSnapshotRecorded === undefined || typeof v.savingsSnapshotRecorded === 'boolean');

/** A savings goal, checked in full. The old version looked at id + the two
 *  amounts only, so a goal missing its name, or carrying a numeric name or a
 *  `2026-13` deadline, imported cleanly and then behaved as app data
 *  (main review §7). Amounts go through the shared money rules, so a backup
 *  can't smuggle in a value the UI itself would refuse. */
const isGoal = (v: unknown): boolean => {
  if (!isPlainObject(v)) return false;
  const optionalString = (x: unknown) => x === undefined || typeof x === 'string';
  return (
    typeof v.id === 'string' && v.id !== '' &&
    typeof v.name === 'string' &&
    isValidMoney(v.targetAmount) &&
    isValidMoney(v.currentAmount) &&
    // Deadline is an optional "YYYY-MM"; empty means "no deadline".
    (v.deadline === undefined || v.deadline === '' ||
      (typeof v.deadline === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v.deadline))) &&
    // Type only — older data predates any hex convention, and rejecting a
    // legitimate old backup over a colour string would be worse than useless.
    optionalString(v.color) &&
    optionalString(v.budgetRowId) &&
    (v.userNamed === undefined || typeof v.userNamed === 'boolean')
  );
};

const isPlanData = (v: unknown): boolean =>
  isPlainObject(v) &&
  Array.isArray(v.goals) && v.goals.every(isGoal) &&
  (v.notes === undefined || typeof v.notes === 'string');

/** THE savings-plan rules — the same validateSavingsPlan the form and the
 *  loader use. This module used to carry its own looser copy, which approved
 *  backups (negative returns, year 1899) that loadSavingsPlan then rejected
 *  after the reload: the import "succeeded" and the plan silently vanished
 *  (main review §9). One source of truth, no drift. */
const isSavingsPlan = (v: unknown): boolean =>
  isPlainObject(v) &&
  typeof v.monthlyAmount === 'number' &&
  typeof v.annualReturnPct === 'number' &&
  typeof v.startAmount === 'number' &&
  typeof v.startYM === 'string' &&
  validateSavingsPlan(v as unknown as SavingsPlan).length === 0;

const isCustomValues = (v: unknown): boolean =>
  isPlainObject(v) && Object.values(v).every(isMoney);

/** Custom structure: an array of block-shaped objects. Lenient on purpose —
 *  loadStructure normalizes unknown fields — but "it's an array" alone let
 *  arbitrary junk through. */
const isCustomStructure = (v: unknown): boolean =>
  Array.isArray(v) && v.every(b => isPlainObject(b) && (b.name === undefined || typeof b.name === 'string'));

/** Parse a JSON-valued key and check it against its own shape. Keys we don't
 *  recognise are accepted as opaque strings: they're inside a versioned backup
 *  we wrote, and a future key is not the user's fault. */
function isValidValue(key: string, raw: string): boolean {
  const parseThen = (check: (v: unknown) => boolean): boolean => {
    try { return check(JSON.parse(raw)); } catch { return false; }
  };
  const monthKey = /^budget_\d{4}_(\d{1,2})$/.exec(key);
  if (monthKey) {
    // The suffix is a 0-based month INDEX: budget_2026_11 is December.
    // Anything above 11 (e.g. _99) is not a month the app can ever load.
    if (Number(monthKey[1]) > 11) return false;
    return parseThen(isMonthData);
  }
  if (key === 'budget_plan') return parseThen(isPlanData);
  if (key === 'budget_savings_plan') return parseThen(isSavingsPlan);
  if (key === 'budget_custom_v3') return parseThen(isCustomStructure);
  if (/^budget_custom_v3_values_/.test(key)) return parseThen(isCustomValues);
  return true; // settings & unknown future keys: any string is fine
}

/**
 * Validate a backup file end to end WITHOUT writing anything, so the caller can
 * show a confirmation the user can still say no to. Nothing here mutates state.
 */
export function checkBackup(text: string): ImportCheck {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'not-json' };
  }
  if (!isPlainObject(parsed)) return { ok: false, reason: 'not-a-backup' };
  if (parsed.app !== 'budget') return { ok: false, reason: 'not-a-backup' };
  // An array passes a bare `typeof === 'object'` check — the old bug.
  if (!isPlainObject(parsed.data)) return { ok: false, reason: 'not-a-backup' };
  if (typeof parsed.version !== 'number' || !Number.isFinite(parsed.version)) {
    return { ok: false, reason: 'not-a-backup' };
  }
  if (parsed.version > BACKUP_VERSION) return { ok: false, reason: 'too-new' };

  const data = parsed.data;
  for (const [key, value] of Object.entries(data)) {
    // A non-string would be written as "[object Object]" and read back as junk.
    if (typeof value !== 'string') return { ok: false, reason: 'corrupt' };
    if (!isBackupOwnedKey(key)) return { ok: false, reason: 'corrupt' };
    if (!isValidValue(key, value)) return { ok: false, reason: 'corrupt' };
  }
  return {
    ok: true,
    keyCount: Object.keys(data).length,
    payload: {
      app: 'budget',
      version: parsed.version,
      exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : '',
      data: data as Record<string, string>,
    },
  };
}

/** Every backup-owned key currently in storage, as a plain object. */
export function collectBackupData(storage: StorageLike): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && isBackupOwnedKey(key)) out[key] = storage.getItem(key) ?? '';
  }
  return out;
}

export function buildBackup(storage: StorageLike, now = new Date()): BackupPayload {
  return {
    app: 'budget',
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    data: collectBackupData(storage),
  };
}

/**
 * Replace all backup-owned data with `payload`'s. Assumes `checkBackup` already
 * passed — call it first and let the user confirm in between.
 *
 * Order matters: snapshot, delete, write. If any write throws (quota is the
 * realistic one), every key is put back exactly as it was and the caller is told
 * it failed — the user keeps the data they had rather than a half-restored mix.
 */
export function applyBackup(storage: StorageLike, payload: BackupPayload): ImportCheck | { ok: true } {
  const before = collectBackupData(storage);
  try {
    for (const key of Object.keys(before)) storage.removeItem(key);
    for (const [key, value] of Object.entries(payload.data)) storage.setItem(key, value);
    return { ok: true };
  } catch {
    // Roll back to the pre-import state: drop whatever landed, restore the copy.
    try {
      for (const key of Object.keys(collectBackupData(storage))) storage.removeItem(key);
      for (const [key, value] of Object.entries(before)) storage.setItem(key, value);
    } catch {
      // Restoring failed too (storage is badly broken). Nothing more we can do
      // here; the caller surfaces the error rather than pretending it worked.
    }
    return { ok: false, reason: 'write-failed' };
  }
}

/** Filename for a downloaded backup: budget-backup-2026-07-16.json */
export function backupFilename(now = new Date()): string {
  return `budget-backup-${now.toISOString().slice(0, 10)}.json`;
}

/** Human-readable, translated reason an import was refused. */
export function importErrorText(reason: ImportFailure, t: {
  importInvalid: string; importTooNew: string; importCorrupt: string; importWriteFailed: string;
}): string {
  switch (reason) {
    case 'too-new': return t.importTooNew;
    case 'corrupt': return t.importCorrupt;
    case 'write-failed': return t.importWriteFailed;
    default: return t.importInvalid;
  }
}

// Re-exported for the language type used by callers of importErrorText.
export type { Lang };
