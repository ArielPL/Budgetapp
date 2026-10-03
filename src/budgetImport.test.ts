// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import {
  readSpreadsheet, readText, analyse, monthOfHeader, classifyLabel, proposeFor, mergeInto, rowsByMonth,
  SpreadsheetError, MAX_FILE_BYTES, type ImportIds,
} from './budgetImport';
import type { MonthData } from './types';

// Budgets someone kept elsewhere, brought in. Synthetic rows and amounts only.

const AT = { year: 2026, month: 9 }; // October 2026 on screen
const OTHER = 'Övrigt';
const ids: ImportIds = { row: k => `row-${k}`, category: n => `cat-${n}` };
const empty: MonthData = { income: [], expenses: [], savings: [] };

/** A minimal .xlsx: one visible sheet, one hidden one. */
function xlsx(cells: string): ArrayBuffer {
  const files = {
    '[Content_Types].xml': strToU8('<Types/>'),
    'xl/workbook.xml': strToU8(`<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>
      <sheet name="Budget" sheetId="1" r:id="rId1"/><sheet name="Gömd" sheetId="2" state="hidden" r:id="rId2"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<Relationships>
      <Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>`),
    'xl/sharedStrings.xml': strToU8('<sst><si><t>Post</t></si><si><t>Belopp</t></si><si><r><t>Hy</t></r><r><t>ra</t></r></si></sst>'),
    'xl/worksheets/sheet1.xml': strToU8(`<worksheet><sheetData>${cells}</sheetData></worksheet>`),
    'xl/worksheets/sheet2.xml': strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>HEMLIG</t></is></c></row></sheetData></worksheet>'),
  };
  const u8 = zipSync(files);
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

describe('reading a spreadsheet', () => {
  it('reads an .xlsx: shared and rich strings, inline strings, numbers — and skips hidden sheets', () => {
    const sheets = readSpreadsheet(xlsx(`
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
      <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>9500</v></c></row>
      <row r="3"><c r="A3" t="inlineStr"><is><t>SYNT EL</t></is></c><c r="C3"><v>1234.567</v></c></row>
      <row r="4"><c r="A4" t="str"><v>SYNT FORMEL</v></c><c r="B4"><f>B2*2</f><v>19000</v></c></row>`), 'budget.xlsx');
    expect(sheets.map(s => s.name)).toEqual(['Budget']);
    expect(sheets[0].rows).toEqual([
      ['Post', 'Belopp'],
      ['Hyra', '9500'],
      ['SYNT EL', '', '1234,57'],
      ['SYNT FORMEL', '19000'],
    ]);
  });

  it('reads a CSV the way the bank import does — semicolons, Swedish decimals', () => {
    const csv = new TextEncoder().encode('Post;Belopp\nHyra;9 500,00\nMat;4 000\n');
    expect(readSpreadsheet(csv.buffer as ArrayBuffer, 'b.csv')[0].rows).toEqual([['Post', 'Belopp'], ['Hyra', '9 500,00'], ['Mat', '4 000']]);
  });

  it('reads cells pasted from a spreadsheet (tab-separated)', () => {
    expect(readText('Hyra\t9500\r\nMat\t4000\r\n')).toEqual([['Hyra', '9500'], ['Mat', '4000']]);
  });

  it('refuses a file too big to be a budget, a broken zip, and an empty sheet', () => {
    const big = new ArrayBuffer(MAX_FILE_BYTES + 1);
    expect(() => readSpreadsheet(big, 'x.csv')).toThrow(SpreadsheetError);
    const broken = new Uint8Array([0x50, 0x4b, 3, 4, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(() => readSpreadsheet(broken.buffer, 'x.xlsx')).toThrow(/unreadable/);
    expect(() => readSpreadsheet(new TextEncoder().encode(' \n ;; \n').buffer as ArrayBuffer, 'x.csv')).toThrow(/empty/);
  });
});

describe('what a row is', () => {
  it('knows budget words in three languages', () => {
    expect(classifyLabel('Hyra')).toBe('boende');
    expect(classifyLabel('Hemförsäkring')).toBe('boende');
    expect(classifyLabel('Electricity')).toBe('boende');
    expect(classifyLabel('Alquiler')).toBe('boende');
    expect(classifyLabel('Matvaror')).toBe('mat');
    expect(classifyLabel('Busskort')).toBe('transport');
    expect(classifyLabel('Netflix')).toBe('prenumerationer');
    expect(classifyLabel('CSN')).toBe('lan');
    expect(classifyLabel('Bolån')).toBe('lan');
    expect(classifyLabel('Buffert')).toBe('sparande');
    expect(classifyLabel('Lön')).toBe('income');
    expect(classifyLabel('Salario')).toBe('income');
    expect(classifyLabel('Totalt')).toBe('total');
    expect(classifyLabel('Kvar att leva på')).toBe('total');
    expect(classifyLabel('SYNT OKÄND')).toBeUndefined();
  });

  it('brings the app’s own labels home, and asks the sorter about shop names', () => {
    expect(proposeFor('Restaurang & Takeaway')).toBe('mat');
    expect(proposeFor('El & Värme')).toBe('boende');
    expect(proposeFor('Spotify')).toBe('prenumerationer');
  });

  it('reads months in a header', () => {
    expect(monthOfHeader('Jan')).toEqual({ month: 0 });
    expect(monthOfHeader('januari 2027')).toEqual({ month: 0, year: 2027 });
    expect(monthOfHeader('Okt')).toEqual({ month: 9 });
    expect(monthOfHeader('Diciembre')).toEqual({ month: 11 });
    expect(monthOfHeader('2026-03')).toEqual({ month: 2, year: 2026 });
    expect(monthOfHeader('03/2026')).toEqual({ month: 2, year: 2026 });
    expect(monthOfHeader('Sep-26')).toEqual({ month: 8, year: 2026 });
    expect(monthOfHeader('Belopp')).toBeNull();
    expect(monthOfHeader('Marsvin')).toBeNull();
  });
});

describe('a list: one month, under headings', () => {
  const grid = [
    ['Min budget 2026'],
    ['Post', 'Belopp', 'Utfall'],
    ['Inkomster'],
    ['SYNT LÖN', '30 000', '29 500'],
    ['Boende'],
    ['Hyra', '-9 000', '-9 000'],
    ['El', '600', '712'],
    ['Barnen'],
    ['SYNT FICKPENG', '500', '500'],
    ['Netflix', '129', '129'],
    ['SYNT OKÄND', '250', ''],
    ['Totalt utgifter', '10 479', ''],
  ];
  const draft = analyse(grid, AT, OTHER);

  it('goes into the month on screen, from the budget column rather than the outcome', () => {
    expect(draft.layout).toBe('list');
    expect(draft.columns).toEqual([{ index: 1, year: 2026, month: 9 }]);
    expect(draft.amountChoices.map(c => c.header)).toEqual(['Belopp', 'Utfall']);
    expect(analyse(grid, AT, OTHER, 2).columns[0].index).toBe(2);
  });

  it('proposes a home for every row, and leaves out the title and the total', () => {
    const by = Object.fromEntries(draft.rows.map(r => [r.label, r.target]));
    expect(by['SYNT LÖN']).toEqual({ kind: 'income' });
    expect(by['Hyra']).toEqual({ kind: 'standard', id: 'boende' });
    expect(by['El']).toEqual({ kind: 'standard', id: 'boende' });
    // A heading of the user's own becomes their category…
    expect(by['SYNT FICKPENG']).toEqual({ kind: 'custom', name: 'Barnen' });
    // …and governs what sits under it, even a name the words would place.
    expect(by['Netflix']).toEqual({ kind: 'custom', name: 'Barnen' });
    expect(by['Totalt utgifter']).toEqual({ kind: 'skip' });
    expect(draft.rows.map(r => r.label)).not.toContain('Min budget 2026');
  });

  it('turns a negative expense into an amount', () => {
    expect(draft.rows.find(r => r.label === 'Hyra')!.amounts).toEqual([9000]);
  });

  it('ends an income heading at the first clear expense, so what follows is not income', () => {
    const d = analyse([['Inkomster'], ['SYNT LÖN', '30000'], ['Matvaror', '3500'], ['SYNT OKÄND', '250']], AT, OTHER);
    expect(d.rows.map(r => r.target)).toEqual([
      { kind: 'income' }, { kind: 'standard', id: 'mat' }, { kind: 'custom', name: OTHER },
    ]);
  });

  it('without headings, falls back to the catch-all for what it cannot place', () => {
    const plain = analyse([['Hyra', '9000'], ['SYNT OKÄND', '250']], AT, OTHER);
    expect(plain.rows.map(r => r.target)).toEqual([
      { kind: 'standard', id: 'boende' }, { kind: 'custom', name: OTHER },
    ]);
  });
});

describe('months as columns', () => {
  it('puts each column into its own month, in the year on screen', () => {
    const d = analyse([
      ['Post', 'Jan', 'Feb', 'Mar', 'Summa'],
      ['Hyra', '9000', '9000', '9100', '27100'],
      ['Mat', '4000', '', '4200', '8200'],
    ], AT, OTHER);
    expect(d.layout).toBe('months');
    expect(d.columns.map(c => [c.year, c.month])).toEqual([[2026, 0], [2026, 1], [2026, 2]]);
    const months = rowsByMonth(d);
    expect(months.map(m => [m.month, m.rows.map(r => `${r.row.label}:${r.amount}`)])).toEqual([
      [0, ['Hyra:9000', 'Mat:4000']],
      [1, ['Hyra:9000']],          // an empty cell changes nothing that month
      [2, ['Hyra:9100', 'Mat:4200']],
    ]);
  });

  it('runs into the next year when the months wrap, or as the header says', () => {
    const wrap = analyse([['', 'Nov', 'Dec', 'Jan'], ['Hyra', '1', '2', '3']], AT, OTHER);
    expect(wrap.columns.map(c => [c.year, c.month])).toEqual([[2026, 10], [2026, 11], [2027, 0]]);
    const said = analyse([['', 'Jan 2027', 'Feb 2027'], ['Hyra', '1', '2']], AT, OTHER);
    expect(said.columns.map(c => c.year)).toEqual([2027, 2027]);
  });
});

describe('into the budget', () => {
  const draft = analyse([
    ['Inkomster'], ['SYNT LÖN', '30000'],
    ['Hyra', '9000'], ['Matvaror', '3500'], ['Restaurang', '800'],
    ['Barnen'], ['SYNT FICKPENG', '500'],
  ], AT, OTHER);
  const [october] = rowsByMonth(draft);

  it('adds categories with only the imported rows — not the template’s empty ones', () => {
    const out = mergeInto(empty, october.rows, ids, 'sv');
    expect(out.income.map(r => [r.label, r.amount])).toEqual([['SYNT LÖN', 30000]]);
    const boende = out.expenses.find(c => c.id === 'boende')!;
    expect(boende.rows.map(r => [r.label, r.amount])).toEqual([['Hyra', 9000]]);
    // Two rows into a category created by the first: both kept.
    expect(out.expenses.find(c => c.id === 'mat')!.rows.map(r => r.label)).toEqual(['Matvaror', 'Restaurang']);
    expect(out.expenses.find(c => c.name === 'Barnen')!.rows.map(r => r.label)).toEqual(['SYNT FICKPENG']);
  });

  it('updates a row of the same name, adds the rest, removes nothing — and a second import duplicates nothing', () => {
    const before: MonthData = {
      income: [],
      expenses: [{ id: 'boende', name: 'Boende', icon: '🏠', color: '#888', rows: [
        { id: 'h', label: 'hyra', amount: 8000 }, { id: 'keep', label: 'SYNT EGEN', amount: 50 },
      ] }],
      savings: [],
    };
    const once = mergeInto(before, october.rows, ids, 'sv');
    const boende = once.expenses.find(c => c.id === 'boende')!;
    expect(boende.rows.map(r => [r.id, r.amount])).toEqual([['h', 9000], ['keep', 50]]);
    expect(mergeInto(once, october.rows, ids, 'sv')).toEqual(once);
  });

  it('leaves out a row set to skip', () => {
    const skipped = { ...draft, rows: draft.rows.map(r => (r.label === 'Hyra' ? { ...r, target: { kind: 'skip' as const } } : r)) };
    const [m] = rowsByMonth(skipped);
    expect(mergeInto(empty, m.rows, ids, 'sv').expenses.find(c => c.id === 'boende')).toBeUndefined();
  });
});
