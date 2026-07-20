import { describe, it, expect } from 'vitest';
import {
  checkBackup, applyBackup, buildBackup, collectBackupData,
  isBackupOwnedKey, isAuthenticationKey, backupFilename, BACKUP_VERSION,
  type StorageLike, type BackupPayload,
} from './backup';

// ── a fake localStorage: real enough to test against, and it can be told to
//    fail on a chosen key so the rollback path is exercised for real ────────
class FakeStorage implements StorageLike {
  private map = new Map<string, string>();
  /** Throw on the NEXT write of this key, once. Models the realistic failure —
   *  a quota error that clears as soon as the rollback frees the space again,
   *  so the test asserts the recovery rather than a storage stuck broken. */
  failOnceOnKey: string | null = null;

  constructor(seed: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(seed)) this.map.set(k, v);
  }
  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) {
    if (k === this.failOnceOnKey) {
      this.failOnceOnKey = null;
      throw new DOMException('QuotaExceededError');
    }
    this.map.set(k, v);
  }
  removeItem(k: string) { this.map.delete(k); }
  snapshot() { return Object.fromEntries(this.map); }
}

const monthJSON = (amount: number) => JSON.stringify({
  income: [{ id: 'i1', label: 'Lön', amount: 30000 }],
  expenses: [{ id: 'mat', name: 'Mat', icon: '', color: '', rows: [{ id: 'r1', label: 'ICA', amount }] }],
  savings: [],
});

const backupFile = (data: Record<string, string>, over: Partial<BackupPayload> = {}) =>
  JSON.stringify({ app: 'budget', version: BACKUP_VERSION, exportedAt: '2026-07-16T00:00:00.000Z', data, ...over });

describe('key policy (shared by export, delete and import)', () => {
  it('owns budget_ keys', () => {
    expect(isBackupOwnedKey('budget_2026_6')).toBe(true);
    expect(isBackupOwnedKey('budget_lang')).toBe(true);
    expect(isBackupOwnedKey('budget_custom_v3_values_2026_6')).toBe(true);
  });
  it('leaves other apps alone', () => {
    expect(isBackupOwnedKey('theme')).toBe(false);
    expect(isBackupOwnedKey('sb-abc-auth-token')).toBe(false);
  });
  it('excludes authentication keys even though they carry our prefix', () => {
    expect(isAuthenticationKey('budget_auth_token')).toBe(true);
    expect(isBackupOwnedKey('budget_auth_token')).toBe(false);
    expect(isBackupOwnedKey('budget_sync_state')).toBe(false);
    expect(isBackupOwnedKey('budget_user_id')).toBe(false);
  });
});

describe('export', () => {
  it('collects every owned key and nothing else', () => {
    const s = new FakeStorage({
      budget_2026_6: monthJSON(100),
      budget_lang: 'sv',
      budget_auth_token: 'secret',   // auth: must not leave the device
      'sb-xyz-auth-token': 'secret', // Supabase's own key
      unrelated: 'x',
    });
    const payload = buildBackup(s, new Date('2026-07-16T10:00:00Z'));
    expect(Object.keys(payload.data).sort()).toEqual(['budget_2026_6', 'budget_lang']);
    expect(payload.app).toBe('budget');
    expect(payload.version).toBe(BACKUP_VERSION);
  });
  it('round-trips through import without data loss', () => {
    const original = { budget_2026_6: monthJSON(4500), budget_lang: 'en', budget_plan: JSON.stringify({ goals: [] }) };
    const s = new FakeStorage(original);
    const file = JSON.stringify(buildBackup(s));
    const target = new FakeStorage();
    const check = checkBackup(file);
    expect(check.ok).toBe(true);
    if (check.ok) applyBackup(target, check.payload);
    expect(target.snapshot()).toEqual(original);
  });
  it('names the file by date', () => {
    expect(backupFilename(new Date('2026-07-16T22:00:00Z'))).toBe('budget-backup-2026-07-16.json');
  });
});

describe('import validation — nothing is written unless the whole file is good', () => {
  it('rejects a file that is not JSON', () => {
    expect(checkBackup('nonsense{')).toMatchObject({ ok: false, reason: 'not-json' });
  });
  it('rejects JSON from some other app', () => {
    expect(checkBackup(JSON.stringify({ app: 'notes', data: {} }))).toMatchObject({ ok: false, reason: 'not-a-backup' });
  });
  it('rejects an array as `data` (a bare typeof check let this through)', () => {
    expect(checkBackup(backupFile([] as unknown as Record<string, string>))).toMatchObject({ ok: false, reason: 'not-a-backup' });
  });
  it('rejects a backup written by a newer app version', () => {
    expect(checkBackup(backupFile({}, { version: BACKUP_VERSION + 1 }))).toMatchObject({ ok: false, reason: 'too-new' });
  });
  it('rejects a non-string value (it would be stored as "[object Object]")', () => {
    const file = JSON.stringify({ app: 'budget', version: 1, data: { budget_lang: { nested: true } } });
    expect(checkBackup(file)).toMatchObject({ ok: false, reason: 'corrupt' });
  });
  it('rejects a key outside the backup policy', () => {
    expect(checkBackup(backupFile({ evil_key: 'x' }))).toMatchObject({ ok: false, reason: 'corrupt' });
    expect(checkBackup(backupFile({ budget_auth_token: 'stolen' }))).toMatchObject({ ok: false, reason: 'corrupt' });
  });
  it('rejects a month whose structure is wrong', () => {
    expect(checkBackup(backupFile({ budget_2026_6: JSON.stringify({ income: 'nope' }) }))).toMatchObject({ ok: false, reason: 'corrupt' });
    expect(checkBackup(backupFile({ budget_2026_6: 'not json at all' }))).toMatchObject({ ok: false, reason: 'corrupt' });
  });
  it('rejects rows carrying NaN or Infinity', () => {
    // JSON has no NaN/Infinity literals — they arrive as null via stringify.
    const withNull = '{"income":[{"id":"i1","amount":null}],"expenses":[],"savings":[]}';
    expect(checkBackup(backupFile({ budget_2026_6: withNull }))).toMatchObject({ ok: false, reason: 'corrupt' });
    const withString = '{"income":[{"id":"i1","amount":"1e309"}],"expenses":[],"savings":[]}';
    expect(checkBackup(backupFile({ budget_2026_6: withString }))).toMatchObject({ ok: false, reason: 'corrupt' });
  });
  it('rejects a savings plan with an impossible month', () => {
    const plan = (ym: string) => JSON.stringify({ monthlyAmount: 2000, annualReturnPct: 7, startAmount: 0, startYM: ym });
    expect(checkBackup(backupFile({ budget_savings_plan: plan('2026-13') }))).toMatchObject({ ok: false, reason: 'corrupt' });
    expect(checkBackup(backupFile({ budget_savings_plan: plan('2026-00') }))).toMatchObject({ ok: false, reason: 'corrupt' });
    expect(checkBackup(backupFile({ budget_savings_plan: plan('2026-05') })).ok).toBe(true);
  });

  // §9: the backup checker must apply the SAME plan rules as the app's loader —
  // its old looser copy approved files whose plan then vanished after reload.
  it('rejects every savings plan the app loader would reject', () => {
    const plan = (over: Record<string, unknown>) => JSON.stringify({
      monthlyAmount: 2000, annualReturnPct: 7, startAmount: 0, startYM: '2026-05', ...over,
    });
    expect(checkBackup(backupFile({ budget_savings_plan: plan({ annualReturnPct: -1 }) }))).toMatchObject({ ok: false, reason: 'corrupt' });
    expect(checkBackup(backupFile({ budget_savings_plan: plan({ annualReturnPct: 101 }) }))).toMatchObject({ ok: false, reason: 'corrupt' });
    expect(checkBackup(backupFile({ budget_savings_plan: plan({ startYM: '1899-05' }) }))).toMatchObject({ ok: false, reason: 'corrupt' });
    expect(checkBackup(backupFile({ budget_savings_plan: plan({ startYM: '2201-05' }) }))).toMatchObject({ ok: false, reason: 'corrupt' });
    // Boundary values the loader accepts must import fine.
    expect(checkBackup(backupFile({ budget_savings_plan: plan({ annualReturnPct: 100, startYM: '2200-12' }) })).ok).toBe(true);
    expect(checkBackup(backupFile({ budget_savings_plan: plan({ annualReturnPct: 0, startYM: '1900-01' }) })).ok).toBe(true);
  });

  it('rejects a budget_plan whose notes is not a string', () => {
    expect(checkBackup(backupFile({ budget_plan: JSON.stringify({ goals: [], notes: 42 }) }))).toMatchObject({ ok: false, reason: 'corrupt' });
    expect(checkBackup(backupFile({ budget_plan: JSON.stringify({ goals: [], notes: 'my plan' }) })).ok).toBe(true);
    expect(checkBackup(backupFile({ budget_plan: JSON.stringify({ goals: [] }) })).ok).toBe(true); // notes optional
  });

  it('rejects a custom structure that is an array of junk', () => {
    expect(checkBackup(backupFile({ budget_custom_v3: JSON.stringify([1, 2, 3]) }))).toMatchObject({ ok: false, reason: 'corrupt' });
    expect(checkBackup(backupFile({ budget_custom_v3: JSON.stringify(['a']) }))).toMatchObject({ ok: false, reason: 'corrupt' });
    expect(checkBackup(backupFile({ budget_custom_v3: JSON.stringify([{ id: 'b1', name: 'Block' }]) })).ok).toBe(true);
  });

  it('rejects a month key with an impossible month index', () => {
    expect(checkBackup(backupFile({ budget_2026_99: monthJSON(100) }))).toMatchObject({ ok: false, reason: 'corrupt' });
    expect(checkBackup(backupFile({ budget_2026_11: monthJSON(100) })).ok).toBe(true); // December
  });

  it('accepts the new savingsSnapshotRecorded flag and rejects a junk one', () => {
    const withFlag = (v: unknown) => JSON.stringify({
      income: [], expenses: [], savings: [], savingsSnapshotRecorded: v,
    });
    expect(checkBackup(backupFile({ budget_2026_6: withFlag(true) })).ok).toBe(true);
    expect(checkBackup(backupFile({ budget_2026_6: withFlag(undefined) })).ok).toBe(true);
    expect(checkBackup(backupFile({ budget_2026_6: withFlag('yes') }))).toMatchObject({ ok: false, reason: 'corrupt' });
  });
  it('accepts a valid file and reports how much is in it', () => {
    const check = checkBackup(backupFile({ budget_2026_6: monthJSON(100), budget_lang: 'sv' }));
    expect(check).toMatchObject({ ok: true, keyCount: 2 });
  });
  it('accepts an unknown future key as an opaque string', () => {
    // Inside a versioned backup we wrote; refusing it would strand the user.
    expect(checkBackup(backupFile({ budget_something_new: 'whatever' })).ok).toBe(true);
  });
});

describe('import really REPLACES — the dialog says so in all three languages', () => {
  it('removes a month that the backup does not contain', () => {
    // The reported bug: restore an older backup, and August lingered on.
    const s = new FakeStorage({ budget_2026_6: monthJSON(100), budget_2026_7: monthJSON(200) });
    const check = checkBackup(backupFile({ budget_2026_6: monthJSON(100) }));
    expect(check.ok).toBe(true);
    if (check.ok) applyBackup(s, check.payload);
    expect(s.getItem('budget_2026_7')).toBe(null);
    expect(s.getItem('budget_2026_6')).toBe(monthJSON(100));
  });

  it('never touches authentication keys', () => {
    const s = new FakeStorage({ budget_2026_6: monthJSON(100), budget_auth_token: 'keep-me', 'sb-x-auth-token': 'keep-me-too' });
    const check = checkBackup(backupFile({ budget_2026_7: monthJSON(200) }));
    if (check.ok) applyBackup(s, check.payload);
    expect(s.getItem('budget_auth_token')).toBe('keep-me');
    expect(s.getItem('sb-x-auth-token')).toBe('keep-me-too');
  });

  it('leaves data untouched when validation fails', () => {
    const before = { budget_2026_6: monthJSON(100) };
    const s = new FakeStorage(before);
    const check = checkBackup('not a backup');
    expect(check.ok).toBe(false);
    // The caller never reaches applyBackup — storage is exactly as it was.
    expect(s.snapshot()).toEqual(before);
  });

  it('rolls back completely when a write fails part-way', () => {
    const before = { budget_2026_6: monthJSON(100), budget_lang: 'sv' };
    const s = new FakeStorage(before);
    s.failOnceOnKey = 'budget_lang'; // fails mid-import, after the deletes ran
    const check = checkBackup(backupFile({ budget_2026_5: monthJSON(999), budget_lang: 'en' }));
    expect(check.ok).toBe(true);
    const result = check.ok ? applyBackup(s, check.payload) : null;
    expect(result).toMatchObject({ ok: false, reason: 'write-failed' });
    // Every original key is back, and nothing from the failed import survives.
    expect(s.snapshot()).toEqual(before);
    expect(s.getItem('budget_2026_5')).toBe(null);
  });
});

describe('collectBackupData', () => {
  it('is empty for a fresh device', () => {
    expect(collectBackupData(new FakeStorage())).toEqual({});
  });
});
