import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { piecesToGrid, readPdfGrid, isPdf, type PdfPiece } from './pdfTable';

// ── A table out of a PDF (Ariel, 2026-11-04) ───────────────────────────────
//
// The fixtures are made-up: a two-page bank statement with right-aligned
// amounts and a page footer, and a budget typed as a table in a word
// processor and saved as PDF (written with fpdf2).

const read = (name: string): ArrayBuffer => {
  const b = readFileSync(`src/test-fixtures/pdf/${name}`);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

beforeAll(async () => {
  // In the app Vite hands pdf.js its worker; under Node it is the file itself.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).href;
});

describe('pieces to rows and columns', () => {
  const p = (str: string, x: number, y: number, w = str.length * 5, page = 1): PdfPiece => ({ page, str, x, y, w, h: 9 });

  it('puts a line together and splits it where the gap is wide', () => {
    expect(piecesToGrid([
      p('2026-10-01', 10, 700), p('ICA', 80, 700), p('Nära', 98, 700), p('-412,35', 200, 700),
      p('2026-10-02', 10, 690), p('Hyra', 80, 690), p('-9 000,00', 190, 690),
    ])).toEqual([
      ['2026-10-01', 'ICA Nära', '-412,35'],
      ['2026-10-02', 'Hyra', '-9 000,00'],
    ]);
  });

  it('keeps a missing cell empty instead of moving the next one left', () => {
    expect(piecesToGrid([
      p('Lön', 10, 700), p('31 000', 100, 700), p('31 000', 160, 700),
      p('Bonus', 10, 690), p('2 000', 165, 690),
    ])).toEqual([
      ['Lön', '31 000', '31 000'],
      ['Bonus', '', '2 000'],
    ]);
  });
});

describe('real PDFs', () => {
  it('knows a PDF by its first bytes', () => {
    expect(isPdf(new Uint8Array(read('budget-november-2026.pdf')))).toBe(true);
    expect(isPdf(new TextEncoder().encode('Datum;Text;Belopp'))).toBe(false);
  });

  it('a bank statement: every transaction a row, date, text and amount in their columns', async () => {
    const grid = await readPdfGrid(read('kontoutdrag-oktober-2026.pdf'));
    const tx = grid.filter(r => /^2026-10-\d\d$/.test(r[0]));
    expect(tx).toHaveLength(16);
    const header = grid.find(r => r.includes('Belopp'))!;
    const amount = header.indexOf('Belopp');
    const text = header.indexOf('Text');
    expect(tx.map(r => r[text])).toContain('ICA Nära Centrum');
    expect(tx.find(r => r[text] === 'Hyra Bostadsbolaget')?.[amount]).toBe('-9 000,00');
    expect(tx.find(r => r[text] === 'Swish från Erik')?.[amount]).toBe('500,00');
  });

  it('a budget saved as PDF: names and amounts side by side', async () => {
    const grid = await readPdfGrid(read('budget-november-2026.pdf'));
    const rows = grid.map(r => r.filter(c => c !== ''));
    expect(rows).toContainEqual(['Hyra', '9 000 kr']);
    expect(rows).toContainEqual(['Lön', '31 000 kr']);
    expect(rows).toContainEqual(['Boende']);
  });
});

describe('the imports, from a PDF', () => {
  it('Follow-up: a PDF statement gives the same transactions a CSV would', async () => {
    const { statementFromPdf, guessColumns, rowsToParsed } = await import('./csvImport');
    const rows = statementFromPdf(await readPdfGrid(read('kontoutdrag-oktober-2026.pdf')));
    const [header, ...body] = rows;
    expect(header).toEqual(['Bokföringsdag', 'Transaktionsdag', 'Text', 'Belopp', 'Saldo']);
    const map = guessColumns(header, body.slice(0, 20));
    // The transaction day, as for a CSV with both: the day the money moved.
    expect(map.roles).toEqual(['skip', 'date', 'text', 'amount', 'skip']);
    const { rows: parsed, skipped } = rowsToParsed(body, map);
    expect(skipped).toEqual([]);
    expect(parsed).toHaveLength(16);
    expect(parsed.find(r => r.text === 'Hyra Bostadsbolaget')).toEqual({ date: '2026-10-02', text: 'Hyra Bostadsbolaget', amount: -9000 });
    expect(Math.round(parsed.reduce((s, r) => s + r.amount, 0) * 100) / 100).toBe(31000 + 500 - 16_773.05);
  });

  it('Budget: a budget saved as PDF becomes rows with homes and amounts', async () => {
    const { readBudgetFile, analyse } = await import('./budgetImport');
    const sheets = await readBudgetFile(read('budget-november-2026.pdf'), 'budget.pdf');
    const d = analyse(sheets[0].rows, { year: 2026, month: 10 }, 'Övrigt');
    const byLabel = Object.fromEntries(d.rows.map(r => [r.label, r]));
    expect(byLabel['Lön'].target.kind).toBe('income');
    expect(byLabel['Lön'].amounts[0]).toBe(31000);
    expect(byLabel['Hyra'].amounts[0]).toBe(9000);
    expect(byLabel['Hyra'].target.kind).not.toBe('income');
    // Sums are left out, as from a spreadsheet.
    expect(byLabel['Summa utgifter']?.target.kind ?? 'skip').toBe('skip');
  });
});
