// ── budgetImport — a budget someone already made, brought in ───────────────
//
// Ariel, 2026-10-03: people arrive with a budget in Excel, Google Sheets or
// Numbers, and typing it all in again is the reason they would not stay. This
// reads such a table — an .xlsx file, a CSV, or cells pasted straight from the
// spreadsheet — and works out what each row is.
//
// Pure, apart from DOMParser for the spreadsheet's XML. Nothing here writes;
// planImport() returns the months as they would be, and the caller stores
// them in one confirmed write.
//
// A Word document (.docx) is read for its tables: a budget typed as a table
// in Word, Pages or Google Docs and saved as .docx. One table per month, each
// under its month's name ("Januari 2026"), is put together into the same
// months-as-columns table a spreadsheet gives (2026-10-17).
//
// Two layouts cover how budgets are actually kept:
//
//   · a LIST: a name and an amount, often under headings ("Boende", "Inkomster")
//     — one month's budget, put into the month on screen;
//   · MONTHS AS COLUMNS: a name, then Jan, Feb, Mar… — each column into its
//     own month.
//
// Every row gets a PROPOSED home, never a silent one: the user sees the list
// and can change any row, or leave it out, before anything is stored. A
// heading's meaning is taken over by the rows beneath it; totals and
// "left over" lines are recognised and left out, since they are sums of rows
// already imported and would count everything twice.

import { unzipSync, strFromU8 } from 'fflate';
import { decodeCsv, detectDelimiter, parseCsv, parseAmount } from './csvImport';
import { seedKind, isStandardCategoryId, type StandardCategoryId } from './categorise';
import { starterMonthData, withStandardCategories, CATEGORY_PALETTE, CATEGORY_ICONS } from './defaults';
import type { BudgetCategory, BudgetRow, MonthData } from './types';
import { LANG_CHOICES, type Lang } from './i18n';

/** One sheet as text cells, rows of columns. */
export type Grid = string[][];

export interface Sheet {
  name: string;
  rows: Grid;
}

/** A spreadsheet larger than this is not a household budget, and reading it
 *  would only make the phone wait. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** An .xlsx is a zip, and a small zip can unpack to hundreds of megabytes.
 *  The sizes are checked from the zip's own directory BEFORE anything is
 *  unpacked — fflate unpacks into a buffer of exactly the stated size, so a
 *  file that lies about its size cannot grow past it either (Codex,
 *  2026-10-03). A real budget's sheet is a few kilobytes. */
export const MAX_PART_BYTES = 8 * 1024 * 1024;
export const MAX_UNPACKED_BYTES = 25 * 1024 * 1024;

/** The largest table a household budget plausibly is. Also stops a single
 *  cell far out ("XFD1") from padding every row with thousands of blanks. */
export const MAX_ROWS = 5000;
export const MAX_COLUMNS = 200;
export const MAX_SHEETS = 50;

// ── Reading ────────────────────────────────────────────────────────────────

/** `convert`: a format the app cannot read directly — old binary Word and
 *  Excel (.doc, .xls), Apple's Pages and Numbers files, OpenDocument — which
 *  every one of those programs can save or export as .docx, .xlsx or CSV. */
export type SpreadsheetFailure = 'too-big' | 'too-large-table' | 'unreadable' | 'empty' | 'convert';

export class SpreadsheetError extends Error {
  readonly reason: SpreadsheetFailure;
  constructor(reason: SpreadsheetFailure) {
    super(reason);
    this.reason = reason;
  }
}

/** The sheets of an .xlsx, .docx, .csv, .tsv or .txt file. */
export function readSpreadsheet(bytes: ArrayBuffer, fileName: string): Sheet[] {
  if (bytes.byteLength > MAX_FILE_BYTES) throw new SpreadsheetError('too-big');
  const u8 = new Uint8Array(bytes);
  // Old binary Office (.doc, .xls) is a compound file: D0 CF 11 E0. Read as
  // text it is noise, and the honest answer is to save it in a newer format.
  if (u8.length > 4 && u8[0] === 0xd0 && u8[1] === 0xcf && u8[2] === 0x11 && u8[3] === 0xe0) {
    throw new SpreadsheetError('convert');
  }
  // A zip file starts "PK": an .xlsx or a .docx, whatever it is called.
  const isZip = u8.length > 4 && u8[0] === 0x50 && u8[1] === 0x4b;
  const sheets = isZip ? readZip(u8, fileName) : [{ name: fileName, rows: readText(decodeCsv(bytes)) }];
  if (sheets.length > MAX_SHEETS) throw new SpreadsheetError('too-large-table');
  const kept = sheets.filter(s => s.rows.some(r => r.some(c => c.trim() !== '')));
  if (kept.length === 0) throw new SpreadsheetError('empty');
  return kept;
}

/** Cells copied from a spreadsheet and pasted: tab-separated, as every
 *  spreadsheet program copies them — or a CSV someone pasted instead. */
export function readText(text: string): Grid {
  const clean = text.replace(/^\ufeff/, '');
  const delimiter = clean.includes('\t') ? '\t' : detectDelimiter(clean);
  return checkTable(parseCsv(clean, delimiter).map(r => r.map(c => c.trim())));
}

/** The grid, or a clear refusal when it is larger than any budget. */
function checkTable(grid: Grid): Grid {
  if (grid.length > MAX_ROWS || grid.some(r => r.length > MAX_COLUMNS)) {
    throw new SpreadsheetError('too-large-table');
  }
  return grid;
}

const colIndex = (ref: string) => {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

/** A number as parseAmount reads it unambiguously: comma decimal, no grouping.
 *  "1234.567" would otherwise be read as thousands-grouped. */
const numberCell = (raw: string) => {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return (Math.round(n * 100) / 100).toString().replace('.', ',');
};

/** Elements by LOCAL name, whatever prefix the file gives them. Excel writes
 *  <sheet>; other writers write the same element as <x:sheet>, and a lookup
 *  by the plain name found nothing — a valid file answered "unreadable"
 *  (import test, 2026-10-17). */
const els = (node: Document | Element, name: string): Element[] =>
  [...node.getElementsByTagNameNS('*', name)];

/** What kind of zip this is, from the names in its directory alone. */
function readZip(u8: Uint8Array, fileName: string): Sheet[] {
  const names: string[] = [];
  try {
    unzipSync(u8, { filter: f => { names.push(f.name); return false; } });
  } catch {
    throw new SpreadsheetError('unreadable');
  }
  if (names.includes('word/document.xml')) return readDocx(u8, fileName);
  if (names.includes('xl/workbook.xml')) return readXlsx(u8);
  // Pages and Numbers (Index/*.iwa), OpenDocument (content.xml): real
  // documents, in formats the app does not read. Saying so beats "unreadable".
  if (names.some(n => n.startsWith('Index/')) || names.includes('content.xml')) {
    throw new SpreadsheetError('convert');
  }
  throw new SpreadsheetError('unreadable');
}

/** The parts of a zip that `wanted` names, with the same size limits for
 *  every format: judged from the zip's own directory, before unpacking. */
function unpack(u8: Uint8Array, wanted: (name: string) => boolean, isSheet: (name: string) => boolean): Record<string, Uint8Array> {
  let files: Record<string, Uint8Array>;
  let unpacked = 0;
  let sheetFiles = 0;
  let tooBig = false;
  let tooMany = false;
  try {
    files = unzipSync(u8, {
      filter: f => {
        if (!wanted(f.name) || tooBig || tooMany) return false;
        unpacked += f.originalSize;
        if (isSheet(f.name)) sheetFiles += 1;
        if (sheetFiles > MAX_SHEETS) { tooMany = true; return false; }
        if (f.originalSize > MAX_PART_BYTES || unpacked > MAX_UNPACKED_BYTES) { tooBig = true; return false; }
        return true;
      },
    });
  } catch {
    throw new SpreadsheetError('unreadable');
  }
  if (tooBig) throw new SpreadsheetError('too-big');
  if (tooMany) throw new SpreadsheetError('too-large-table');
  return files;
}

const parseXml = (f: Uint8Array | undefined) =>
  f ? new DOMParser().parseFromString(strFromU8(f), 'application/xml') : null;

function readXlsx(u8: Uint8Array): Sheet[] {
  // Only the parts a budget lives in; images and the like are left packed.
  const files = unpack(u8,
    name => name === 'xl/workbook.xml' || name === 'xl/sharedStrings.xml'
      || name === 'xl/_rels/workbook.xml.rels' || name.startsWith('xl/worksheets/sheet'),
    name => name.startsWith('xl/worksheets/sheet'));
  const xml = (name: string) => parseXml(files[name]);
  const workbook = xml('xl/workbook.xml');
  if (!workbook) throw new SpreadsheetError('unreadable');

  // Shared strings: a <si> is either one <t> or several rich-text runs.
  const sharedDoc = xml('xl/sharedStrings.xml');
  const shared = (sharedDoc ? els(sharedDoc, 'si') : [])
    .map(si => els(si, 't').map(t => t.textContent ?? '').join(''));

  // Sheet names, in workbook order, to their files.
  const rels = new Map<string, string>();
  const relDoc = xml('xl/_rels/workbook.xml.rels');
  for (const r of relDoc ? els(relDoc, 'Relationship') : []) {
    const target = r.getAttribute('Target') ?? '';
    rels.set(r.getAttribute('Id') ?? '', target.replace(/^\/?(xl\/)?/, 'xl/'));
  }
  const sheets: Sheet[] = [];
  for (const s of els(workbook, 'sheet')) {
    if (s.getAttribute('state') === 'hidden' || s.getAttribute('state') === 'veryHidden') continue;
    const rid = s.getAttribute('r:id') ?? s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ?? '';
    const doc = xml(rels.get(rid) ?? '');
    if (!doc) continue;
    const rows: Grid = [];
    for (const row of els(doc, 'row')) {
      if (rows.length >= MAX_ROWS) throw new SpreadsheetError('too-large-table');
      const cells: string[] = [];
      for (const c of els(row, 'c')) {
        const i = colIndex(c.getAttribute('r') ?? '');
        if (i >= MAX_COLUMNS) throw new SpreadsheetError('too-large-table');
        const type = c.getAttribute('t');
        const v = els(c, 'v')[0]?.textContent ?? '';
        let text: string;
        if (type === 's') text = shared[Number(v)] ?? '';
        else if (type === 'inlineStr') text = els(c, 't').map(t => t.textContent ?? '').join('');
        else if (type === 'str' || type === 'b' || type === 'e') text = v;
        else text = v === '' ? '' : numberCell(v);
        while (cells.length < i) cells.push('');
        cells[i] = text.trim();
      }
      rows.push(cells);
    }
    sheets.push({ name: s.getAttribute('name') ?? '', rows });
  }
  if (sheets.length === 0) throw new SpreadsheetError('unreadable');
  return sheets;
}

// ── Word documents ─────────────────────────────────────────────────────────

/** A cell's text: its paragraphs, runs and tabs. A lone dash is how a paper
 *  plan writes "nothing this month", and it means an empty cell here. */
function cellText(tc: Element): string {
  const paragraphs = els(tc, 'p').map(p => {
    let text = '';
    for (const n of els(p, '*')) {
      if (n.localName === 't') text += n.textContent ?? '';
      else if (n.localName === 'tab') text += ' ';
    }
    return text;
  });
  const text = paragraphs.join(' ').replace(/\s+/g, ' ').trim();
  return /^[-–—]$/.test(text) ? '' : text;
}

/** A table's rows as cells. Only its own rows: a table inside a cell is not
 *  read twice. */
function tableGrid(tbl: Element): Grid {
  const rows: Grid = [];
  for (const tr of [...tbl.children].filter(n => n.localName === 'tr')) {
    if (rows.length >= MAX_ROWS) throw new SpreadsheetError('too-large-table');
    const cells = [...tr.children].filter(n => n.localName === 'tc').map(cellText);
    if (cells.length > MAX_COLUMNS) throw new SpreadsheetError('too-large-table');
    rows.push(cells);
  }
  return rows;
}

const amountLike = (c: string) => c.trim() !== '' && parseAmount(c) !== null;

/**
 * The tables of a .docx, as sheets. A table that already has months as
 * columns is a sheet as it stands. A table without them that comes under a
 * month's name ("Januari 2026") is one month of a paper plan: those are put
 * together into one months-as-columns table, rows in the order they first
 * appear, each kept under its own heading so "El" under Boende in January is
 * the same row as in February. Any other table is a list.
 */
function readDocx(u8: Uint8Array, fileName: string): Sheet[] {
  const files = unpack(u8, name => name === 'word/document.xml', () => false);
  const doc = parseXml(files['word/document.xml']);
  const body = doc ? els(doc, 'body')[0] : undefined;
  if (!body) throw new SpreadsheetError('unreadable');

  let title = '';
  let monthHere: { month: number; year?: number } | null = null;
  const others: Sheet[] = [];
  // One month at a time: key → amount; and every key in first-seen order.
  const months: { month: number; year?: number; cells: Map<string, string> }[] = [];
  const order: { key: string; label: string; heading: boolean }[] = [];
  const seen = new Set<string>();

  const takeMonthTable = (grid: Grid, at: { month: number; year?: number }) => {
    // The amount column: the first that holds an amount; the label is left of it.
    const width = Math.max(0, ...grid.map(r => r.length));
    let amountCol = -1;
    for (let i = 1; i < width && amountCol < 0; i++) if (grid.some(r => amountLike(r[i] ?? ''))) amountCol = i;
    if (amountCol < 0) return false;
    const cells = new Map<string, string>();
    let heading = '';
    let prev = -1;
    grid.forEach((r, i) => {
      const label = (r[0] ?? '').trim();
      if (!label) return;
      const amount = (r[amountCol] ?? '').trim();
      // The table's own header ("Post | Budget"): before any amount, no amount in it.
      if (!amountLike(amount) && i === 0 && r.filter(c => c.trim()).length >= 2) return;
      const isHeading = amount === '';
      if (isHeading) heading = label;
      const key = isHeading ? `h\u0000${label}` : `${heading}\u0000${label}`;
      if (!seen.has(key)) {
        seen.add(key);
        // After the row it followed here, so a row new in March sits in place.
        const after = prev >= 0 ? order.findIndex(o => o.key === [...cells.keys()][prev]) : -1;
        order.splice(after >= 0 ? after + 1 : order.length, 0, { key, label, heading: isHeading });
      }
      if (!isHeading && !cells.has(key)) cells.set(key, amount);
      if (!cells.has(key)) cells.set(key, '');
      prev = [...cells.keys()].indexOf(key);
    });
    months.push({ ...at, cells });
    return true;
  };

  const walk = (node: Element) => {
    for (const child of [...node.children]) {
      if (child.localName === 'p') {
        const text = els(child, 't').map(t => t.textContent ?? '').join('').trim();
        if (!text) continue;
        if (!title) title = text;
        const hit = monthOfHeader(text);
        if (hit) monthHere = hit;
      } else if (child.localName === 'tbl') {
        const grid = tableGrid(child);
        if (grid.some(r => r.filter(c => monthOfHeader(c)).length >= 2)) {
          others.push({ name: title || fileName, rows: grid });
        } else if (!(monthHere && takeMonthTable(grid, monthHere))) {
          others.push({ name: title || fileName, rows: grid });
        }
        monthHere = null;
      } else {
        walk(child);
      }
    }
  };
  walk(body);

  const sheets: Sheet[] = [];
  if (months.length > 0) {
    const header = ['', ...months.map(m => (m.year !== undefined
      ? `${m.year}-${String(m.month + 1).padStart(2, '0')}`
      : MONTH_NAMES[m.month][1]))];
    const rows: Grid = [header];
    for (const o of order) {
      rows.push([o.label, ...months.map(m => (o.heading ? '' : m.cells.get(o.key) ?? ''))]);
    }
    sheets.push({ name: title || fileName, rows });
  }
  sheets.push(...others);
  if (sheets.length === 0) throw new SpreadsheetError('empty');
  return sheets;
}

// ── What a heading or a row is ─────────────────────────────────────────────

/** Where a row goes: income, one of the standard categories, or a category of
 *  the user's own (by name). `skip` leaves it out. */
export type Target =
  | { kind: 'income' }
  | { kind: 'standard'; id: StandardCategoryId }
  | { kind: 'custom'; name: string }
  | { kind: 'skip' };

// Letters of every script are kept. It used to keep only a–z, so a Japanese,
// Chinese or Russian name folded to "" — and "" was in DEFAULT_LABELS, under
// whichever template name was added last, so "家賃" got a category silently.
const fold = (s: string) => s.toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();

type Kind = 'income' | 'total' | 'expenses' | StandardCategoryId;

/** Words that decide a row or a heading, in Swedish, English and Spanish,
 *  folded (no accents). `prefix` entries also match the start of a word, for
 *  Swedish compounds: "hemförsäkring", "elräkning", "matkostnader". */
const WORDS: { kind: Kind; words: string[]; prefix?: string[] }[] = [
  { kind: 'total', words: ['toplam', 'kalan', 'summa', 'totalt', 'total', 'totala', 'sum', 'subtotal', 'kvar', 'over', 'overskott', 'underskott', 'saldo', 'balance', 'resultat', 'netto', 'net', 'differens', 'diff', 'left', 'remaining', 'restante', 'sobrante',
    'totale', 'rimanente', 'residuo', 'sobra', 'итого', 'всего', 'остаток'] },
  { kind: 'expenses', words: ['gider', 'giderler', 'harcamalar', 'utgifter', 'kostnader', 'expenses', 'costs', 'gastos', 'egresos', 'utgift', 'uscite', 'spese', 'despesas', 'расходы', 'траты'] },
  { kind: 'income', words: ['maas', 'gelir', 'gelirler', 'lon', 'loner', 'salary', 'salario', 'nomina', 'sueldo', 'inkomst', 'inkomster', 'income', 'ingresos', 'ingreso', 'bidrag', 'barnbidrag', 'bonus', 'arvode', 'ersattning', 'a kassa', 'akassa', 'foraldrapenning', 'sjukpenning', 'wages', 'paycheck',
    // A pension PAID OUT is income. Listed before Sparande, whose 'pension'
    // would otherwise take "Allmän pension" for pension saving (import test,
    // 2026-10-17): a retiree's income became a savings row.
    'allman pension', 'tjanstepension', 'garantipension', 'inkomstpension', 'premiepension', 'state pension', 'jubilacion',
    'stipendio', 'entrate', 'reddito', 'salario liquido', 'renda', 'receitas', 'receita', 'зарплата', 'доход', 'доходы'], prefix: ['inkomst', 'sidoinkomst'] },
  { kind: 'lan', words: ['kredi', 'krediler', 'borc', 'borclar', 'lan', 'loan', 'loans', 'prestamo', 'prestamos', 'csn', 'studielan', 'bolan', 'mortgage', 'hipoteca', 'amortering', 'ranta', 'kredit', 'krediter', 'kreditkort', 'credit', 'avbetalning', 'skuld', 'skulder', 'debt', 'debts', 'deuda', 'deudas',
    'prestito', 'prestiti', 'debiti', 'mutuo', 'emprestimo', 'emprestimos', 'divida', 'dividas', 'financiamento', 'кредит', 'кредиты', 'долг', 'долги', 'ипотека'], prefix: ['bolan', 'studielan', 'billan', 'privatlan', 'amortering', 'skuld'] },
  { kind: 'sparande', words: ['birikim', 'tasarruf', 'yatırım', 'sparande', 'spara', 'savings', 'ahorro', 'ahorros', 'buffert', 'buffer', 'isk', 'fonder', 'funds', 'aktier', 'stocks', 'pension', 'pensionssparande', 'investeringar', 'investments', 'inversiones', 'sparkonto', 'emergency',
    'risparmi', 'risparmio', 'investimenti', 'poupanca', 'investimentos', 'сбережения', 'накопления', 'инвестиции'], prefix: ['sparande', 'sparkonto', 'buffert', 'pension'] },
  { kind: 'boende', words: ['kira', 'konut', 'elektrik', 'fatura', 'aidat', 'hyra', 'rent', 'alquiler', 'el', 'elrakning', 'electricity', 'luz', 'varme', 'heating', 'calefaccion', 'internet', 'bredband', 'wifi', 'hemforsakring', 'boende', 'housing', 'vivienda', 'vatten', 'water', 'agua', 'avgift', 'manadsavgift', 'hushall', 'home', 'hogar', 'comunidad',
    'affitto', 'casa', 'bollette', 'aluguel', 'moradia', 'condominio', 'аренда', 'квартплата', 'жилье', 'коммунальные'], prefix: ['hyra', 'hemforsakr', 'elrakn', 'elavtal', 'bostad', 'boende', 'hushall'] },
  { kind: 'mat', words: ['market', 'gıda', 'yemek', 'mat', 'matvaror', 'livsmedel', 'food', 'groceries', 'grocery', 'comida', 'supermercado', 'alimentacion', 'lunch', 'luncher', 'restaurang', 'restaurant', 'restaurante', 'takeaway', 'kaffe', 'fika', 'coffee', 'cafe', 'dining', 'alkohol',
    'cibo', 'alimentari', 'ristorante', 'mercado', 'alimentacao', 'продукты', 'еда'], prefix: ['matvar', 'matkost', 'matinkop', 'livsmed', 'restaurang', 'lunch'] },
  { kind: 'transport', words: ['ulasım', 'yakıt', 'benzin', 'transport', 'transporte', 'buss', 'sl', 'kollektivtrafik', 'pendel', 'bensin', 'drivmedel', 'fuel', 'gasolina', 'gas station', 'bil', 'car', 'coche', 'parkering', 'parking', 'tag', 'train', 'tren', 'taxi', 'uber', 'cykel', 'bike', 'bilforsakring', 'forsakringar', 'metro',
    'trasporti', 'benzina', 'combustivel', 'транспорт', 'бензин'], prefix: ['bilfor', 'bilkost', 'kollektiv', 'pendel', 'parkering', 'busskort'] },
  { kind: 'prenumerationer', words: ['abonelik', 'abonelikler', 'prenumeration', 'prenumerationer', 'subscription', 'subscriptions', 'suscripcion', 'suscripciones', 'streaming', 'netflix', 'spotify', 'hbo', 'max', 'disney', 'viaplay', 'youtube', 'icloud', 'gym', 'telefon', 'mobil', 'mobilabonnemang', 'phone', 'movil', 'abonnemang', 'appar', 'apps', 'gimnasio',
    'abbonamenti', 'palestra', 'assinaturas', 'academia', 'подписки'], prefix: ['prenumer', 'abonnemang', 'mobilabon'] },
  { kind: 'personligt', words: ['personligt', 'personal', 'klader', 'clothes', 'clothing', 'ropa', 'hygien', 'hygiene', 'frisor', 'hairdresser', 'peluqueria', 'halsa', 'health', 'salud', 'medicin', 'medicine', 'apotek', 'pharmacy', 'farmacia', 'tandlakare', 'dentist', 'dentista', 'glasogon', 'smink', 'kosmetika'], prefix: ['klader', 'hygien', 'tandlak'] },
  { kind: 'fritid', words: ['fritid', 'leisure', 'ocio', 'noje', 'entertainment', 'hobby', 'hobbies', 'semester', 'vacation', 'holiday', 'vacaciones', 'resor', 'travel', 'viajes', 'bio', 'cinema', 'cine', 'konsert', 'spel', 'games', 'sport', 'traning'], prefix: ['semester', 'resor'] },
  { kind: 'givande', words: ['givande', 'giving', 'donativos', 'tionde', 'kollekt', 'offer', 'tithe', 'tithes', 'offering', 'offerings', 'diezmo', 'diezmos', 'ofrenda', 'ofrendas', 'kyrka', 'kyrkan', 'church', 'iglesia', 'forsamling', 'presenter', 'gavor', 'gifts', 'regalos', 'valgorenhet', 'charity', 'donaciones', 'donations', 'insamling', 'bistand'], prefix: ['tionde', 'kollekt', 'present', 'valgoren', 'forsamling', 'donat', 'diezm', 'ofrend'] },
];

/** What the words in `label` say it is, if anything. */
export function classifyLabel(label: string): Kind | undefined {
  const words = fold(label).split(' ').filter(Boolean);
  if (words.length === 0) return undefined;
  const text = words.join(' ');
  for (const { kind, words: list, prefix = [] } of WORDS) {
    for (const w of list) {
      if (w.includes(' ') ? ` ${text} `.includes(` ${w} `) : words.includes(w)) return kind;
    }
    for (const p of prefix) if (words.some(w => w.startsWith(p))) return kind;
  }
  return undefined;
}

/** The app's own default labels, in every language, to their category —
 *  a budget exported from this app, or typed from its template, comes home. */
const DEFAULT_LABELS: Map<string, Kind> = (() => {
  const map = new Map<string, Kind>();
  for (const [lang] of LANG_CHOICES) {
    const starter = starterMonthData(lang);
    for (const r of starter.income) map.set(fold(r.label), 'income');
    for (const c of starter.expenses) {
      if (!isStandardCategoryId(c.id)) continue;
      map.set(fold(c.name), c.id);
      for (const r of c.rows) map.set(fold(r.label), c.id);
    }
  }
  // A name that folds to nothing must never match a row that folds to nothing.
  map.delete('');
  return map;
})();

/** A row's proposed home from its own name: the app's labels, the budget
 *  words, then the sorter's shop list ("Netflix", "ICA"). */
export function proposeFor(label: string): Kind | undefined {
  return DEFAULT_LABELS.get(fold(label)) ?? classifyLabel(label) ?? seedKind(label);
}

// ── Months in a header ─────────────────────────────────────────────────────

// Folded (lower case, no accents), as fold() leaves a header: "Março" is
// "marco", "Июнь" is "июнь". Swedish, English, Spanish, French, German,
// Italian, Portuguese, Russian and Turkish ("Mayıs" keeps its dotless ı); Japanese and Chinese "1月" are read apart.
const MONTH_NAMES: string[][] = [
  ['jan', 'januari', 'january', 'ene', 'enero', 'janv', 'janvier', 'januar', 'gen', 'gennaio', 'janeiro', 'янв', 'январь', 'января', 'ocak', 'oca'],
  ['feb', 'februari', 'february', 'febrero', 'fevr', 'fevrier', 'februar', 'febbraio', 'fev', 'fevereiro', 'фев', 'февраль', 'февраля', 'subat', 'sub'],
  ['mar', 'mars', 'march', 'marzo', 'marz', 'marco', 'мар', 'март', 'марта', 'mart'],
  ['apr', 'april', 'abr', 'abril', 'avr', 'avril', 'aprile', 'апр', 'апрель', 'апреля', 'nisan', 'nis'],
  ['maj', 'may', 'mayo', 'mai', 'mag', 'maggio', 'maio', 'маи', 'мая', 'mayıs'],  // "май" folds to "маи": й loses its breve
  ['jun', 'juni', 'june', 'junio', 'juin', 'giu', 'giugno', 'junho', 'июн', 'июнь', 'июня', 'haziran', 'haz'],
  ['jul', 'juli', 'july', 'julio', 'juil', 'juillet', 'lug', 'luglio', 'julho', 'июл', 'июль', 'июля', 'temmuz', 'tem'],
  ['aug', 'augusti', 'august', 'ago', 'agosto', 'aout', 'авг', 'август', 'августа', 'agustos', 'agu'],
  ['sep', 'sept', 'september', 'septiembre', 'setiembre', 'septembre', 'set', 'settembre', 'setembro', 'сен', 'сентябрь', 'сентября', 'eylul', 'eyl'],
  ['okt', 'oct', 'oktober', 'october', 'octubre', 'octobre', 'ott', 'ottobre', 'out', 'outubro', 'окт', 'октябрь', 'октября', 'ekim', 'eki'],
  ['nov', 'november', 'noviembre', 'novembre', 'novembro', 'ноя', 'ноябрь', 'ноября', 'kasım', 'kas'],
  ['dec', 'december', 'dic', 'diciembre', 'dez', 'dezember', 'decembre', 'dicembre', 'dezembro', 'дек', 'декабрь', 'декабря', 'aralık', 'ara'],
];

/** The month a header cell names — "Jan", "januari 2026", "2026-01",
 *  "01/2026" — with its year if it says one. */
export function monthOfHeader(cell: string): { month: number; year?: number } | null {
  const s = fold(cell);
  if (!s) return null;
  // Japanese and Chinese: "1月", "2026年1月".
  const cjk = /^(?:(\d{4}) ?年 ?)?(\d{1,2}) ?月$/.exec(s);
  if (cjk && +cjk[2] >= 1 && +cjk[2] <= 12) return cjk[1] ? { month: +cjk[2] - 1, year: +cjk[1] } : { month: +cjk[2] - 1 };
  let m = /^(\d{4}) (\d{1,2})$/.exec(s) ?? /^(\d{4})(\d{2})$/.exec(s);
  if (m && +m[2] >= 1 && +m[2] <= 12) return { month: +m[2] - 1, year: +m[1] };
  m = /^(\d{1,2}) (\d{4})$/.exec(s);
  if (m && +m[1] >= 1 && +m[1] <= 12) return { month: +m[1] - 1, year: +m[2] };
  const parts = s.split(' ');
  const yearPart = parts.find(p => /^\d{4}$/.test(p) || /^\d{2}$/.test(p));
  const name = parts.filter(p => !/^\d+$/.test(p));
  if (name.length !== 1) return null;
  const month = MONTH_NAMES.findIndex(names => names.includes(name[0]));
  if (month < 0) return null;
  if (!yearPart) return { month };
  const y = +yearPart;
  return { month, year: y < 100 ? 2000 + y : y };
}

// ── The table, understood ──────────────────────────────────────────────────

export interface ImportColumn {
  index: number;
  year: number;
  month: number;
}

export interface DraftRow {
  /** Stable within one import: the row's place in the sheet. */
  key: string;
  label: string;
  /** The heading it sits under, if any. */
  section?: string;
  /** One per ImportColumn; null where the cell is empty. */
  amounts: (number | null)[];
  target: Target;
  /** A credit — a minus in a sheet whose costs are plus — taken off the row
   *  above it, month by month, so the month's total stays the source's. A
   *  budget row cannot be negative, and silently dropping the minus made
   *  April 490 kr too high (import test, 2026-10-17). `left` is what could
   *  not be taken off anywhere, and is not imported. */
  credit?: { into?: string; taken: number; left: number };
  /** A minus read as a cost ("Hyra −9 000" among plus amounts): said in the
   *  dialog, so a sign is never changed without a word. */
  negativeRead?: boolean;
  /** The user's choice: replace THIS existing row (a near name, "Hyra/Bolån"
   *  for "Hyra") instead of adding a row. Never set by the import itself. */
  into?: string;
}

export interface Draft {
  layout: 'list' | 'months';
  columns: ImportColumn[];
  /** For a list with several number columns: the others it could have used. */
  amountChoices: { index: number; header: string }[];
  rows: DraftRow[];
}

const isNumberCell = (c: string) => c.trim() !== '' && parseAmount(c) !== null;

/** A Kind as a Target. A heading or name the words do not know becomes a
 *  category of the user's own, under that name. */
function targetOf(kind: Kind | undefined, fallbackName: string): Target {
  if (kind === 'total') return { kind: 'skip' };
  if (kind === 'income') return { kind: 'income' };
  if (kind && kind !== 'expenses') return { kind: 'standard', id: kind };
  return { kind: 'custom', name: fallbackName };
}

/**
 * Understand `grid`: which layout, which columns hold amounts for which
 * months, and a proposed home for every row.
 *
 * `at` is the month on screen — where a list goes, and the year for month
 * columns that do not say one. `other` names the catch-all category for rows
 * nothing recognises ("Övrigt").
 */
export function analyse(grid: Grid, at: { year: number; month: number }, other: string, amountIndex?: number): Draft {
  const rows = grid.filter(r => r.some(c => c.trim() !== ''));
  const width = Math.max(0, ...rows.map(r => r.length));

  // The label column: the one with the most text that is not a number.
  let labelCol = 0;
  let best = -1;
  for (let i = 0; i < width; i++) {
    const n = rows.filter(r => (r[i] ?? '').trim() !== '' && !isNumberCell(r[i])).length;
    if (n > best) { best = n; labelCol = i; }
  }

  // Months as columns: a row naming two or more months is the header.
  const headerIdx = rows.findIndex(r => r.filter(c => monthOfHeader(c)).length >= 2);
  let layout: Draft['layout'] = 'list';
  let columns: ImportColumn[] = [];
  let amountChoices: Draft['amountChoices'] = [];
  let dataFrom = 0;

  if (headerIdx >= 0) {
    layout = 'months';
    dataFrom = headerIdx + 1;
    let year = at.year;
    let last = -1;
    rows[headerIdx].forEach((c, index) => {
      const hit = monthOfHeader(c);
      if (!hit || index === labelCol) return;
      if (hit.year !== undefined) year = hit.year;
      else if (last >= 0 && hit.month <= last) year += 1; // Sep … Aug: into the next year
      last = hit.month;
      columns.push({ index, year, month: hit.month });
    });
  } else {
    // A list. Its header, if it has one, is the first row with two or more
    // cells and no number in them ("Post | Belopp").
    const head = rows.findIndex(r => r.filter(c => c.trim()).length >= 2 && !r.some(isNumberCell));
    const firstData = rows.findIndex(r => r.some(isNumberCell));
    if (head >= 0 && (firstData < 0 || head < firstData)) dataFrom = head + 1;
    const header = head >= 0 && dataFrom > 0 ? rows[head] : [];
    const data = rows.slice(dataFrom);
    const numeric: number[] = [];
    for (let i = 0; i < width; i++) {
      if (i === labelCol) continue;
      if (data.filter(r => isNumberCell(r[i] ?? '')).length > 0) numeric.push(i);
    }
    amountChoices = numeric.map(index => ({ index, header: header[index] ?? '' }));
    const named = numeric.find(i => /budget|belopp|summa|amount|plan|month|manad|importe|presupuesto|cantidad/.test(fold(header[i] ?? '')));
    const chosen = amountIndex !== undefined && numeric.includes(amountIndex) ? amountIndex : (named ?? numeric[0]);
    if (chosen !== undefined) columns = [{ index: chosen, year: at.year, month: at.month }];
  }

  const out: DraftRow[] = [];
  let section: { name: string; kind: Kind | undefined } | undefined;
  rows.slice(dataFrom).forEach((r, i) => {
    const label = (r[labelCol] ?? '').trim();
    if (!label) return;
    const amounts = columns.map(c => {
      const cell = r[c.index] ?? '';
      return isNumberCell(cell) ? parseAmount(cell) : null;
    });
    // A heading: a name with no amount anywhere in the row. Except a title —
    // "Min budget 2026", "Budget for 2026" — which names the sheet, not a
    // category; taken as a heading it would file every row under it.
    if (!r.some(isNumberCell)) {
      const title = /\b(budget|budgets|presupuesto)\b|\d{4}/.test(fold(label));
      section = title ? undefined : { name: label, kind: proposeFor(label) };
      return;
    }
    const own = proposeFor(label);
    // Money in and money out never follow each other's heading: "Hyra" right
    // after the salary under "Inkomster" is an expense whose heading was
    // simply never written, and "Lön" under "Boende" is still income.
    // Except a pension under an income heading: that is a pension being paid
    // out ("Pension" under "Inkomster"), not one being saved for.
    const pensionPaid = section?.kind === 'income' && own === 'sparande' && /pension/.test(fold(label));
    const crosses = !pensionPaid && section !== undefined && own !== undefined && own !== 'total' && own !== 'expenses'
      && (section.kind === 'income') !== (own === 'income');
    let target: Target;
    if (own === 'total') target = { kind: 'skip' };
    else if (crosses) {
      target = targetOf(own, other);
      // The heading it crossed has ended; what follows is not under it.
      section = undefined;
    }
    else if (section && section.kind !== undefined && section.kind !== 'expenses' && section.kind !== 'total') {
      // Under a heading that means something, the heading decides: "El" under
      // "Boende" is housing even if the word alone could be read otherwise.
      target = targetOf(section.kind, section.name);
    } else if (section && section.kind === undefined) {
      // A heading of the user's own ("Barnen"): its rows become that category.
      target = { kind: 'custom', name: section.name };
    } else {
      target = targetOf(own, other);
    }
    out.push({ key: `r${dataFrom + i}`, label, section: section?.name, amounts, target });
  });

  settleSigns(out);
  return { layout, columns, amountChoices, rows: out };
}

/** Rows whose name says they give money back. Only these are credits: a
 *  plain "Hyra −9 000" among plus amounts is a cost written as a minus. */
const CREDIT_WORDS = ['credit note', 'creditnote', 'kreditnota', 'kreditering', 'refund', 'refunds', 'aterbetalning',
  'retur', 'rabatt', 'discount', 'avdrag', 'reembolso', 'devolucion', 'abono', 'nota de credito', 'gutschrift',
  'erstattung', 'avoir', 'remboursement', 'rimborso'];
const isCreditLabel = (label: string) => {
  const text = ` ${fold(label)} `;
  return CREDIT_WORDS.some(w => text.includes(` ${w} `));
};

/**
 * Minus signs, made into budget amounts. A sheet that keeps its costs as
 * negatives ("−9 700" for rent) means them as amounts: every sign is dropped,
 * as before. In a sheet whose costs are plus, a row named as a credit — a
 * refund, a credit note — is taken off the row above it in the same month,
 * under the same heading, so the month adds up to what the sheet says. What
 * cannot be taken off (no row above, or not enough on it) is left out. Any
 * other minus is read as a cost. Either way the dialog says so: never a minus
 * turned silently into a plus.
 */
function settleSigns(rows: DraftRow[]): void {
  const signs = rows.filter(r => r.target.kind !== 'income' && r.target.kind !== 'skip')
    .flatMap(r => r.amounts.filter((a): a is number => a !== null && a !== 0));
  const negativeCosts = signs.filter(a => a < 0).length > signs.length / 2;
  if (negativeCosts) {
    for (const r of rows) r.amounts = r.amounts.map(a => (a === null ? null : Math.abs(a)));
    return;
  }
  rows.forEach((r, i) => {
    // Totals and "left over" lines are left out anyway; a negative month
    // there is a deficit, not a credit, and must not touch any row.
    if (r.target.kind === 'skip') return;
    if (!r.amounts.some(a => a !== null && a < 0)) return;
    if (!isCreditLabel(r.label)) {
      r.amounts = r.amounts.map(a => (a === null ? null : Math.abs(a)));
      r.negativeRead = true;
      return;
    }
    // The row above under the same heading, that is not itself a credit.
    let above: DraftRow | undefined;
    for (let j = i - 1; j >= 0; j--) {
      if (rows[j].section !== r.section) break;
      if (rows[j].target.kind !== 'skip' && !rows[j].credit) { above = rows[j]; break; }
    }
    let taken = 0;
    let left = 0;
    r.amounts = r.amounts.map((a, m) => {
      if (a === null || a >= 0) return a;
      const room = above?.amounts[m] ?? 0;
      const off = Math.min(-a, Math.max(0, room));
      if (above && off > 0) above.amounts[m] = Math.round((room - off) * 100) / 100;
      taken += off;
      left += -a - off;
      return null;
    });
    r.credit = { into: taken > 0 ? above?.label : undefined, taken: Math.round(taken * 100) / 100, left: Math.round(left * 100) / 100 };
    if (r.amounts.every(a => a === null)) r.target = { kind: 'skip' };
  });
}

// ── Into the budget ────────────────────────────────────────────────────────

/** Ids the import mints, decided once so every month gets the same ones. */
export interface ImportIds {
  row: (key: string) => string;
  category: (name: string) => string;
}

const same = (a: string, b: string) => fold(a) === fold(b);

const words = (s: string) => fold(s).split(' ').filter(w => w.length >= 2);

/** Close but not the same: the names share a word ("Hyra" and "Hyra/Bolån",
 *  "El" and "El & Värme"). Only ever a QUESTION to the user — an import never
 *  merges two money rows on a guess (review 2026-10-21, P1). */
export function isNearName(a: string, b: string): boolean {
  if (same(a, b)) return false;
  const mine = new Set(words(a));
  return words(b).some(w => mine.has(w));
}

/** The rows already in the place `row` would land in `data`: the one with
 *  its exact name, which it would replace, and any with a near name. */
export function landingOf(data: MonthData, row: DraftRow): { exact?: BudgetRow; near: BudgetRow[] } {
  const t = row.target;
  const list: BudgetRow[] = t.kind === 'skip' ? []
    : t.kind === 'income' ? data.income
      : t.kind === 'standard' ? (data.expenses.find(c => c.id === t.id)?.rows ?? [])
        : (data.expenses.find(c => same(c.name, t.name))?.rows ?? []);
  return {
    exact: list.find(r => same(r.label, row.label)),
    near: list.filter(r => isNearName(r.label, row.label)),
  };
}

/** `rows` (with the amount for this month) merged into `data`. A row of the
 *  same name in the same place gets the new amount — or the row the user
 *  chose to replace (`into`); any other is added. Nothing is removed. Pure. */
export function mergeInto(
  data: MonthData,
  rows: { row: DraftRow; amount: number }[],
  ids: ImportIds,
  lang: Lang,
): MonthData {
  let out = data;
  const upsert = (list: BudgetRow[], row: DraftRow, amount: number): BudgetRow[] => {
    const chosen = row.into !== undefined ? list.findIndex(r => same(r.label, row.into!)) : -1;
    const at = chosen >= 0 ? chosen : list.findIndex(r => same(r.label, row.label));
    if (at >= 0) return list.map((r, i) => (i === at ? { ...r, amount } : r));
    return [...list, { id: ids.row(row.key), label: row.label, amount, isCustom: true, userNamed: true }];
  };
  for (const { row, amount } of rows) {
    const t = row.target;
    if (t.kind === 'skip') continue;
    if (t.kind === 'income') {
      out = { ...out, income: upsert(out.income, row, amount) };
      continue;
    }
    let cat: BudgetCategory | undefined;
    if (t.kind === 'standard') {
      const had = out.expenses.some(c => c.id === t.id);
      out = withStandardCategories(out, [t.id], lang);
      cat = out.expenses.find(c => c.id === t.id);
      // A standard category brought in fresh would carry the template's empty
      // rows; an import wants only its own.
      if (cat && !had) {
        cat = { ...cat, rows: [] };
        out = { ...out, expenses: out.expenses.map(c => (c.id === t.id ? cat! : c)) };
      }
    } else {
      cat = out.expenses.find(c => same(c.name, t.name));
      if (!cat) {
        const n = out.expenses.length;
        cat = {
          id: ids.category(t.name), name: t.name, userNamed: true,
          icon: CATEGORY_ICONS[n % CATEGORY_ICONS.length], color: CATEGORY_PALETTE[n % CATEGORY_PALETTE.length], rows: [],
        };
        out = { ...out, expenses: [...out.expenses, cat] };
      }
    }
    const id = cat!.id;
    out = { ...out, expenses: out.expenses.map(c => (c.id === id ? { ...c, rows: upsert(c.rows, row, amount) } : c)) };
  }
  return out;
}

/** Each month the draft reaches, with the rows that have an amount for it. */
export function rowsByMonth(draft: Draft): { year: number; month: number; rows: { row: DraftRow; amount: number }[] }[] {
  return draft.columns.map((c, i) => ({
    year: c.year,
    month: c.month,
    rows: draft.rows
      .filter(r => r.target.kind !== 'skip' && r.amounts[i] !== null)
      .map(r => ({ row: r, amount: r.amounts[i]! })),
  })).filter(m => m.rows.length > 0);
}
