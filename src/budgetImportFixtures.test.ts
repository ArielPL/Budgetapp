// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { readSpreadsheet, analyse, rowsByMonth, SpreadsheetError, type Draft } from './budgetImport';

// ── Seven made-up annual budgets, read the way the app reads them ───────────
//
// The import test of 2026-10-17 (outputs/…/LAS_MIG_IMPORTTEST_2026.md): one
// CSV, XLSX or Word file per kind of household, January–December 2026, with
// the year's planned income and outflow worked out from the source. Every
// file must give twelve months and exactly those totals — including the Word
// plan, one page per month, and the freelancer's credit note of −245.

const read = (name: string): ArrayBuffer => {
  const b = readFileSync(`src/test-fixtures/budget-import/${name}`);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const at = { year: 2026, month: 9 };
const draftOf = (bytes: ArrayBuffer, name: string): Draft => analyse(readSpreadsheet(bytes, name)[0].rows, at, 'Övrigt');

const totals = (d: Draft) => {
  let income = 0;
  let out = 0;
  for (const r of d.rows) {
    if (r.target.kind === 'skip') continue;
    const sum = r.amounts.reduce<number>((s, a) => s + (a ?? 0), 0);
    if (r.target.kind === 'income') income += sum; else out += sum;
  }
  return { income: Math.round(income * 100) / 100, out: Math.round(out * 100) / 100 };
};

const cases: [string, number, number][] = [
  ['01_student_enkel_2026.csv', 150_000, 130_958],
  ['02_forsta_jobbet_2026.xlsx', 368_300, 266_322],
  ['03_pensionar_pappersplan_2026.csv', 295_200, 169_748],
  ['03_pensionar_pappersplan_2026.docx', 295_200, 169_748],
  ['04_frilans_ojamn_2026.csv', 353_500, 311_089],
  ['05_barnfamilj_komplex_2026.xlsx', 924_700, 726_688],
  ['06_skuldresa_2026.xlsx', 403_600, 324_968],
  ['07_resenar_spanska_2026.csv', 40_900, 34_913.43],
];

describe('Seven annual budgets import with the source totals', () => {
  for (const [file, income, out] of cases) {
    it(file, () => {
      const d = draftOf(read(file), file);
      expect(d.layout).toBe('months');
      expect(d.columns.map(c => `${c.year}-${c.month}`)).toEqual(
        Array.from({ length: 12 }, (_, m) => `2026-${m}`));
      expect(totals(d)).toEqual({ income, out });
      expect(rowsByMonth(d)).toHaveLength(12);
    });
  }
});

describe('Word: one table per month', () => {
  it('reads the same rows, homes and amounts as the plan\'s own CSV', () => {
    const docx = draftOf(read('03_pensionar_pappersplan_2026.docx'), 'plan.docx');
    const csv = draftOf(read('03_pensionar_pappersplan_2026.csv'), 'plan.csv');
    const shape = (d: Draft) => d.rows.map(r => [r.label, r.section, r.target, r.amounts]);
    expect(shape(docx)).toEqual(shape(csv));
  });

  it('an old .doc says to save it as .docx instead of reading noise', () => {
    const doc = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
    expect(() => readSpreadsheet(doc.buffer, 'plan.doc')).toThrow(SpreadsheetError);
    try { readSpreadsheet(doc.buffer, 'plan.doc'); } catch (e) { expect((e as SpreadsheetError).reason).toBe('convert'); }
  });

  it('a Pages or Numbers file says the same', () => {
    const pages = zipSync({ 'Index/Document.iwa': new Uint8Array([1, 2, 3]) });
    try { readSpreadsheet(pages.buffer as ArrayBuffer, 'plan.pages'); expect.unreachable(); }
    catch (e) { expect((e as SpreadsheetError).reason).toBe('convert'); }
  });
});

describe('Pension paid out is income', () => {
  it('"Allmän pension" and "Tjänstepension" under Inkomster', () => {
    const d = draftOf(read('03_pensionar_pappersplan_2026.csv'), 'plan.csv');
    for (const label of ['Allmän pension', 'Tjänstepension']) {
      expect(d.rows.find(r => r.label === label)?.target).toEqual({ kind: 'income' });
    }
  });

  it('while pension SAVING stays savings', () => {
    const d = draftOf(read('04_frilans_ojamn_2026.csv'), 'frilans.csv');
    expect(d.rows.find(r => r.label === 'Pension savings')?.target).toEqual({ kind: 'standard', id: 'sparande' });
  });
});

describe('A credit note is taken off, never turned into a cost', () => {
  it('a plain minus among plus amounts is read as a cost, and said', () => {
    const d = analyse([['Boende'], ['Hyra', '-9000'], ['El', '600']], at, 'Övrigt');
    const rent = d.rows.find(r => r.label === 'Hyra')!;
    expect(rent.amounts).toEqual([9000]);
    expect(rent.negativeRead).toBe(true);
    expect(rent.credit).toBeUndefined();
  });

  it('April adds up to the source: 24 432, not 24 922', () => {
    const d = draftOf(read('04_frilans_ojamn_2026.csv'), 'frilans.csv');
    const april = d.rows.filter(r => r.target.kind !== 'skip' && r.target.kind !== 'income')
      .reduce((s, r) => s + (r.amounts[3] ?? 0), 0);
    expect(april).toBe(24_432);
    const credit = d.rows.find(r => r.label === 'Software credit note')!;
    expect(credit.credit).toEqual({ into: 'Design software', taken: 245, left: 0 });
    expect(credit.target).toEqual({ kind: 'skip' });
    expect(d.rows.find(r => r.label === 'Design software')!.amounts[3]).toBe(695);
  });

  it('a sheet that keeps all its costs as negatives still reads them as amounts', () => {
    const grid = [['Post', 'Jan', 'Feb'], ['Lön', '30000', '30000'], ['Hyra', '-9000', '-9000'], ['Mat', '-4000', '-4100']];
    const d = analyse(grid, at, 'Övrigt');
    expect(d.rows.find(r => r.label === 'Hyra')!.amounts).toEqual([9000, 9000]);
    expect(d.rows.every(r => !r.credit)).toBe(true);
  });
});

describe('An .xlsx whose XML has prefixes', () => {
  it('gives the same months and amounts as the plain one', () => {
    // Same file, every spreadsheet element written <x:…> — valid, and what
    // some writers produce. It used to answer "unreadable".
    const plain = new Uint8Array(read('02_forsta_jobbet_2026.xlsx'));
    const files = unzipSync(plain);
    for (const name of Object.keys(files)) {
      if (!name.startsWith('xl/') || !name.endsWith('.xml') || name.includes('_rels')) continue;
      const xml = strFromU8(files[name])
        .replace(/<(\/?)(?![?!])([A-Za-z]+)([\s>/])/g, '<$1x:$2$3')
        .replace(/xmlns="([^"]+)"/, 'xmlns:x="$1"');
      files[name] = strToU8(xml);
    }
    const prefixed = zipSync(files);
    expect(strFromU8(prefixed).length).toBeGreaterThan(0);
    const a = draftOf(plain.buffer as ArrayBuffer, 'plain.xlsx');
    const b = draftOf(prefixed.buffer as ArrayBuffer, 'prefixed.xlsx');
    expect(b.rows.map(r => [r.label, r.amounts])).toEqual(a.rows.map(r => [r.label, r.amounts]));
    expect(totals(b)).toEqual(totals(a));
  });
});
