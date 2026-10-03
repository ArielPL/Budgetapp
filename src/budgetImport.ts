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
import type { Lang } from './i18n';

/** One sheet as text cells, rows of columns. */
export type Grid = string[][];

export interface Sheet {
  name: string;
  rows: Grid;
}

/** A spreadsheet larger than this is not a household budget, and reading it
 *  would only make the phone wait. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

// ── Reading ────────────────────────────────────────────────────────────────

export type SpreadsheetFailure = 'too-big' | 'unreadable' | 'empty';

export class SpreadsheetError extends Error {
  readonly reason: SpreadsheetFailure;
  constructor(reason: SpreadsheetFailure) {
    super(reason);
    this.reason = reason;
  }
}

/** The sheets of an .xlsx, .csv, .tsv or .txt file. */
export function readSpreadsheet(bytes: ArrayBuffer, fileName: string): Sheet[] {
  if (bytes.byteLength > MAX_FILE_BYTES) throw new SpreadsheetError('too-big');
  const u8 = new Uint8Array(bytes);
  // A zip file starts "PK": an .xlsx whatever it is called.
  const isZip = u8.length > 4 && u8[0] === 0x50 && u8[1] === 0x4b;
  const sheets = isZip ? readXlsx(u8) : [{ name: fileName, rows: readText(decodeCsv(bytes)) }];
  const kept = sheets.filter(s => s.rows.some(r => r.some(c => c.trim() !== '')));
  if (kept.length === 0) throw new SpreadsheetError('empty');
  return kept;
}

/** Cells copied from a spreadsheet and pasted: tab-separated, as every
 *  spreadsheet program copies them — or a CSV someone pasted instead. */
export function readText(text: string): Grid {
  const clean = text.replace(/^\ufeff/, '');
  const delimiter = clean.includes('\t') ? '\t' : detectDelimiter(clean);
  return parseCsv(clean, delimiter).map(r => r.map(c => c.trim()));
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

function readXlsx(u8: Uint8Array): Sheet[] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(u8, {
      // Only the parts a budget lives in; images and the like are left packed.
      filter: f => f.name === 'xl/workbook.xml' || f.name === 'xl/sharedStrings.xml'
        || f.name === 'xl/_rels/workbook.xml.rels' || f.name.startsWith('xl/worksheets/sheet'),
    });
  } catch {
    throw new SpreadsheetError('unreadable');
  }
  const xml = (name: string) => {
    const f = files[name];
    return f ? new DOMParser().parseFromString(strFromU8(f), 'application/xml') : null;
  };
  const workbook = xml('xl/workbook.xml');
  if (!workbook) throw new SpreadsheetError('unreadable');

  // Shared strings: a <si> is either one <t> or several rich-text runs.
  const shared = [...(xml('xl/sharedStrings.xml')?.getElementsByTagName('si') ?? [])]
    .map(si => [...si.getElementsByTagName('t')].map(t => t.textContent ?? '').join(''));

  // Sheet names, in workbook order, to their files.
  const rels = new Map<string, string>();
  for (const r of xml('xl/_rels/workbook.xml.rels')?.getElementsByTagName('Relationship') ?? []) {
    const target = r.getAttribute('Target') ?? '';
    rels.set(r.getAttribute('Id') ?? '', target.replace(/^\/?(xl\/)?/, 'xl/'));
  }
  const sheets: Sheet[] = [];
  for (const s of workbook.getElementsByTagName('sheet')) {
    if (s.getAttribute('state') === 'hidden' || s.getAttribute('state') === 'veryHidden') continue;
    const rid = s.getAttribute('r:id') ?? s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ?? '';
    const doc = xml(rels.get(rid) ?? '');
    if (!doc) continue;
    const rows: Grid = [];
    for (const row of doc.getElementsByTagName('row')) {
      const cells: string[] = [];
      for (const c of row.getElementsByTagName('c')) {
        const i = colIndex(c.getAttribute('r') ?? '');
        const type = c.getAttribute('t');
        const v = c.getElementsByTagName('v')[0]?.textContent ?? '';
        let text: string;
        if (type === 's') text = shared[Number(v)] ?? '';
        else if (type === 'inlineStr') text = [...c.getElementsByTagName('t')].map(t => t.textContent ?? '').join('');
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

// ── What a heading or a row is ─────────────────────────────────────────────

/** Where a row goes: income, one of the standard categories, or a category of
 *  the user's own (by name). `skip` leaves it out. */
export type Target =
  | { kind: 'income' }
  | { kind: 'standard'; id: StandardCategoryId }
  | { kind: 'custom'; name: string }
  | { kind: 'skip' };

const fold = (s: string) => s.toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

type Kind = 'income' | 'total' | 'expenses' | StandardCategoryId;

/** Words that decide a row or a heading, in Swedish, English and Spanish,
 *  folded (no accents). `prefix` entries also match the start of a word, for
 *  Swedish compounds: "hemförsäkring", "elräkning", "matkostnader". */
const WORDS: { kind: Kind; words: string[]; prefix?: string[] }[] = [
  { kind: 'total', words: ['summa', 'totalt', 'total', 'totala', 'sum', 'subtotal', 'kvar', 'over', 'overskott', 'underskott', 'saldo', 'balance', 'resultat', 'netto', 'net', 'differens', 'diff', 'left', 'remaining', 'restante', 'sobrante'] },
  { kind: 'expenses', words: ['utgifter', 'kostnader', 'expenses', 'costs', 'gastos', 'egresos', 'utgift'] },
  { kind: 'income', words: ['lon', 'loner', 'salary', 'salario', 'nomina', 'sueldo', 'inkomst', 'inkomster', 'income', 'ingresos', 'ingreso', 'bidrag', 'barnbidrag', 'bonus', 'arvode', 'ersattning', 'a kassa', 'akassa', 'foraldrapenning', 'sjukpenning', 'wages', 'paycheck'], prefix: ['inkomst', 'sidoinkomst'] },
  { kind: 'lan', words: ['lan', 'loan', 'loans', 'prestamo', 'prestamos', 'csn', 'studielan', 'bolan', 'mortgage', 'hipoteca', 'amortering', 'ranta', 'kredit', 'krediter', 'kreditkort', 'credit', 'avbetalning', 'skuld', 'skulder', 'debt', 'debts', 'deuda', 'deudas'], prefix: ['bolan', 'studielan', 'billan', 'privatlan', 'amortering', 'skuld'] },
  { kind: 'sparande', words: ['sparande', 'spara', 'savings', 'ahorro', 'ahorros', 'buffert', 'buffer', 'isk', 'fonder', 'funds', 'aktier', 'stocks', 'pension', 'pensionssparande', 'investeringar', 'investments', 'inversiones', 'sparkonto', 'emergency'], prefix: ['sparande', 'sparkonto', 'buffert', 'pension'] },
  { kind: 'boende', words: ['hyra', 'rent', 'alquiler', 'el', 'elrakning', 'electricity', 'luz', 'varme', 'heating', 'calefaccion', 'internet', 'bredband', 'wifi', 'hemforsakring', 'boende', 'housing', 'vivienda', 'vatten', 'water', 'agua', 'avgift', 'manadsavgift', 'hushall', 'home', 'hogar', 'comunidad'], prefix: ['hyra', 'hemforsakr', 'elrakn', 'elavtal', 'bostad', 'boende', 'hushall'] },
  { kind: 'mat', words: ['mat', 'matvaror', 'livsmedel', 'food', 'groceries', 'grocery', 'comida', 'supermercado', 'alimentacion', 'lunch', 'luncher', 'restaurang', 'restaurant', 'restaurante', 'takeaway', 'kaffe', 'fika', 'coffee', 'cafe', 'dining', 'alkohol'], prefix: ['matvar', 'matkost', 'matinkop', 'livsmed', 'restaurang', 'lunch'] },
  { kind: 'transport', words: ['transport', 'transporte', 'buss', 'sl', 'kollektivtrafik', 'pendel', 'bensin', 'drivmedel', 'fuel', 'gasolina', 'gas station', 'bil', 'car', 'coche', 'parkering', 'parking', 'tag', 'train', 'tren', 'taxi', 'uber', 'cykel', 'bike', 'bilforsakring', 'forsakringar', 'metro'], prefix: ['bilfor', 'bilkost', 'kollektiv', 'pendel', 'parkering', 'busskort'] },
  { kind: 'prenumerationer', words: ['prenumeration', 'prenumerationer', 'subscription', 'subscriptions', 'suscripcion', 'suscripciones', 'streaming', 'netflix', 'spotify', 'hbo', 'max', 'disney', 'viaplay', 'youtube', 'icloud', 'gym', 'telefon', 'mobil', 'mobilabonnemang', 'phone', 'movil', 'abonnemang', 'appar', 'apps', 'gimnasio'], prefix: ['prenumer', 'abonnemang', 'mobilabon'] },
  { kind: 'personligt', words: ['personligt', 'personal', 'klader', 'clothes', 'clothing', 'ropa', 'hygien', 'hygiene', 'frisor', 'hairdresser', 'peluqueria', 'halsa', 'health', 'salud', 'medicin', 'medicine', 'apotek', 'pharmacy', 'farmacia', 'tandlakare', 'dentist', 'dentista', 'glasogon', 'smink', 'kosmetika'], prefix: ['klader', 'hygien', 'tandlak'] },
  { kind: 'fritid', words: ['fritid', 'leisure', 'ocio', 'noje', 'entertainment', 'hobby', 'hobbies', 'semester', 'vacation', 'holiday', 'vacaciones', 'resor', 'travel', 'viajes', 'presenter', 'gavor', 'gifts', 'regalos', 'valgorenhet', 'charity', 'bio', 'cinema', 'cine', 'konsert', 'spel', 'games', 'sport', 'traning'], prefix: ['semester', 'resor', 'present', 'valgoren'] },
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

/** The app's own default labels, in all three languages, to their category —
 *  a budget exported from this app, or typed from its template, comes home. */
const DEFAULT_LABELS: Map<string, Kind> = (() => {
  const map = new Map<string, Kind>();
  for (const lang of ['sv', 'en', 'es'] as Lang[]) {
    const starter = starterMonthData(lang);
    for (const r of starter.income) map.set(fold(r.label), 'income');
    for (const c of starter.expenses) {
      if (!isStandardCategoryId(c.id)) continue;
      map.set(fold(c.name), c.id);
      for (const r of c.rows) map.set(fold(r.label), c.id);
    }
  }
  return map;
})();

/** A row's proposed home from its own name: the app's labels, the budget
 *  words, then the sorter's shop list ("Netflix", "ICA"). */
export function proposeFor(label: string): Kind | undefined {
  return DEFAULT_LABELS.get(fold(label)) ?? classifyLabel(label) ?? seedKind(label);
}

// ── Months in a header ─────────────────────────────────────────────────────

const MONTH_NAMES: string[][] = [
  ['jan', 'januari', 'january', 'ene', 'enero'],
  ['feb', 'februari', 'february', 'febrero'],
  ['mar', 'mars', 'march', 'marzo'],
  ['apr', 'april', 'abr', 'abril'],
  ['maj', 'may', 'mayo'],
  ['jun', 'juni', 'june', 'junio'],
  ['jul', 'juli', 'july', 'julio'],
  ['aug', 'augusti', 'august', 'ago', 'agosto'],
  ['sep', 'sept', 'september', 'septiembre', 'setiembre'],
  ['okt', 'oct', 'oktober', 'october', 'octubre'],
  ['nov', 'november', 'noviembre'],
  ['dec', 'december', 'dic', 'diciembre'],
];

/** The month a header cell names — "Jan", "januari 2026", "2026-01",
 *  "01/2026" — with its year if it says one. */
export function monthOfHeader(cell: string): { month: number; year?: number } | null {
  const s = fold(cell);
  if (!s) return null;
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
      const n = isNumberCell(cell) ? parseAmount(cell) : null;
      // Expenses are often kept as negatives; a budget line is an amount.
      return n === null ? null : Math.abs(n);
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
    const crosses = section !== undefined && own !== undefined && own !== 'total' && own !== 'expenses'
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

  return { layout, columns, amountChoices, rows: out };
}

// ── Into the budget ────────────────────────────────────────────────────────

/** Ids the import mints, decided once so every month gets the same ones. */
export interface ImportIds {
  row: (key: string) => string;
  category: (name: string) => string;
}

const same = (a: string, b: string) => fold(a) === fold(b);

/** `rows` (with the amount for this month) merged into `data`. A row of the
 *  same name in the same place gets the new amount; any other is added.
 *  Nothing is removed. Pure. */
export function mergeInto(
  data: MonthData,
  rows: { row: DraftRow; amount: number }[],
  ids: ImportIds,
  lang: Lang,
): MonthData {
  let out = data;
  const upsert = (list: BudgetRow[], row: DraftRow, amount: number): BudgetRow[] => {
    const at = list.findIndex(r => same(r.label, row.label));
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
