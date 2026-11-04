// ── pdfTable — a table out of a PDF ────────────────────────────────────────
//
// Ariel, 2026-11-04: banks hand out statements as PDF, and a budget made in
// Word or Excel is often saved as one. A PDF has no table in it, only pieces
// of text placed on a page; this puts them back into rows and columns, and
// the importers then treat the result like a spreadsheet's cells.
//
//   1. Lines: pieces at the same height on a page form a line.
//   2. Cells: on a line, pieces close together are one cell — a gap of about
//      a character's height or more starts the next.
//   3. Columns: the cells of every line that has more than one are laid on the
//      width of the page; where they overlap is one column, and the blank
//      strips between are the gaps between columns. Left-aligned text shares
//      its left edge and right-aligned amounts their right edge, so each column
//      overlaps itself and not its neighbour. A title over the whole width has
//      one cell and is left out of this, so it cannot join every column into
//      one; it lands in the column it starts in.
//
// The PDF is read by Mozilla's pdf.js (Apache 2.0), on the device, loaded only
// when a PDF is chosen. A scanned page is a picture with no text in it; that
// is said as such (PdfError 'no-text').

export type PdfFailure = 'no-text' | 'unreadable' | 'locked';

export class PdfError extends Error {
  readonly reason: PdfFailure;
  constructor(reason: PdfFailure) {
    super(reason);
    this.reason = reason;
  }
}

/** A piece of text where pdf.js placed it: x from the left, y from the bottom
 *  of its page, its width, and its height (about the font size). */
export interface PdfPiece {
  page: number;
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** True when the bytes are a PDF: every PDF begins "%PDF-". */
export const isPdf = (u8: Uint8Array) =>
  u8.length > 5 && u8[0] === 0x25 && u8[1] === 0x50 && u8[2] === 0x44 && u8[3] === 0x46 && u8[4] === 0x2d;

interface Cell { x0: number; x1: number; text: string }

/** Pieces at the same height on a page, as lines, top of the first page first. */
function linesOf(pieces: PdfPiece[]): PdfPiece[][] {
  const sorted = pieces
    .filter(p => p.str.trim() !== '')
    .sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const lines: PdfPiece[][] = [];
  for (const p of sorted) {
    const line = lines[lines.length - 1];
    const first = line?.[0];
    // The same line: same page, and within half a character's height.
    if (first && first.page === p.page && Math.abs(first.y - p.y) <= Math.max(first.h, p.h) * 0.5) line.push(p);
    else lines.push([p]);
  }
  return lines.map(line => [...line].sort((a, b) => a.x - b.x));
}

/** Pieces in x order joined into text, a space where there was a gap. */
function joined(pieces: PdfPiece[]): string {
  let text = '';
  let end = -Infinity;
  for (const p of pieces) {
    const gap = p.x - end;
    text += text && gap > p.h * 0.15 && !text.endsWith(' ') && !p.str.startsWith(' ') ? ` ${p.str}` : p.str;
    end = Math.max(end, p.x + p.w);
  }
  return text.replace(/\s+/g, ' ').trim();
}

/** A line's cells: pieces close together are one — a gap of about a
 *  character's height or more starts the next. */
function cellsOf(line: PdfPiece[]): Cell[] {
  const groups: PdfPiece[][] = [];
  let end = -Infinity;
  for (const p of line) {
    const group = groups[groups.length - 1];
    if (group && p.x - end < Math.max(p.h, 4) * 0.9) group.push(p);
    else groups.push([p]);
    end = group && groups[groups.length - 1] === group ? Math.max(end, p.x + p.w) : p.x + p.w;
  }
  return groups.map(g => ({ x0: g[0].x, x1: Math.max(...g.map(p => p.x + p.w)), text: joined(g) }));
}

/** The columns: the stretches of the page width that the cells of the
 *  many-celled lines cover. A strip that only a few lines cross — a heading
 *  written over two columns, say — still parts them. */
function columnsOf(lines: Cell[][]): { x0: number; x1: number }[] {
  const table = lines.filter(l => l.length > 1);
  if (table.length === 0) return [];
  const right = Math.ceil(Math.max(...table.flat().map(c => c.x1)));
  const cover = new Uint16Array(right + 2);
  for (const line of table) {
    const seen = new Uint8Array(right + 2);
    for (const c of line) for (let x = Math.floor(c.x0); x < Math.ceil(c.x1); x++) seen[Math.max(0, x)] = 1;
    seen.forEach((v, x) => { cover[x] += v; });
  }
  const enough = Math.max(1, Math.floor(table.length * 0.15));
  const cols: { x0: number; x1: number }[] = [];
  let from = -1;
  for (let x = 0; x <= right + 1; x++) {
    const on = cover[x] > enough || (table.length < 4 && cover[x] > 0);
    if (on && from < 0) from = x;
    if (!on && from >= 0) { cols.push({ x0: from, x1: x }); from = -1; }
  }
  return cols;
}

/** The pieces of a PDF as a table, row by row. */
export function piecesToGrid(pieces: PdfPiece[]): string[][] {
  const lines = linesOf(pieces);
  const cols = columnsOf(lines.map(cellsOf));
  if (cols.length < 2) return lines.map(l => cellsOf(l).map(c => c.text));
  // Each piece to the column it overlaps most; one in a blank strip to the
  // nearest column. Pieces, not cells: a heading set close to the next one
  // ("Transaktionsdag Text") is one cell but two columns.
  const columnOf = (p: PdfPiece) => {
    let best = 0;
    let bestScore = -Infinity;
    cols.forEach((col, i) => {
      const score = Math.min(p.x + p.w, col.x1) - Math.max(p.x, col.x0);
      if (score > bestScore) { bestScore = score; best = i; }
    });
    return best;
  };
  return lines.map(line => {
    const parts: PdfPiece[][] = cols.map(() => []);
    for (const p of line) parts[columnOf(p)].push(p);
    return parts.map(joined);
  });
}

/** The text of every page of a PDF, as pieces. pdf.js is loaded here, on
 *  first use, so the app does not carry it until someone chooses a PDF. */
export async function readPdfPieces(bytes: ArrayBuffer, maxPages = 50): Promise<PdfPiece[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (!pdfjs.GlobalWorkerOptions.workerSrc && !pdfjs.GlobalWorkerOptions.workerPort) {
    // Built by Vite into a .js file of its own. Its .mjs name would reach the
    // iPhone app's web view as application/octet-stream, which a module worker
    // refuses (Capacitor names the type from the extension, and iOS knows no
    // ".mjs").
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(
      new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url), { type: 'module' });
  }
  const task = pdfjs.getDocument({
    // A copy: pdf.js takes the buffer over, and the caller may still need it.
    data: new Uint8Array(bytes.slice(0)),
    // Only the text is wanted: no fonts turned into web fonts or looked up.
    disableFontFace: true,
    useSystemFonts: false,
    stopAtErrors: false,
  });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    await task.destroy();
    throw new PdfError((e as { name?: string })?.name === 'PasswordException' ? 'locked' : 'unreadable');
  }
  const pieces: PdfPiece[] = [];
  try {
    for (let n = 1; n <= Math.min(doc.numPages, maxPages); n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const [, , c, d, e, f] = item.transform as number[];
        pieces.push({ page: n, str: item.str, x: e, y: f, w: item.width, h: item.height || Math.hypot(c, d) });
      }
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  if (pieces.every(p => p.str.trim() === '')) throw new PdfError('no-text');
  return pieces;
}

/** A PDF's text as one table. */
export async function readPdfGrid(bytes: ArrayBuffer): Promise<string[][]> {
  return piecesToGrid(await readPdfPieces(bytes));
}
