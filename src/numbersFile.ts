// ── numbersFile — the tables of an Apple Numbers document ───────────────────
//
// Ariel, 2026-11-04: a budget kept in Numbers should come in as it is, not
// only after an export to .xlsx. Apple does not document the format, so this
// follows what others have worked out and published: SheetJS's notes on iWork
// archives and numbers-parser (MIT), which was also used to write the test
// files.
//
// A .numbers file is a zip. Index/*.iwa inside it hold the document's objects
// as protobuf messages, in Snappy-compressed chunks. A table is a
// TableModelArchive (type 6001). Its cells sit in Tile objects (6002), row by
// row, each cell a small binary record; the text of text cells is in the
// table's string list (a TableDataList, 6005 or 6201). Only what a budget
// needs is read: text, numbers, currency amounts, dates and true/false.
// Formulas come in as the value they last showed, which Numbers stores beside
// the formula.
//
// Files saved before Numbers 6 (2019) keep their cells in an older layout;
// those are refused with 'convert', and the app asks for an export instead.
//
// Pure: bytes in, tables out. The zip and its size limits are budgetImport's.

/** One table: its name and its cells as text, rows of columns. */
export interface NumbersTable {
  name: string;
  rows: string[][];
}

/** A Numbers file the app cannot read: its cells are in the pre-2019 layout,
 *  or it holds no table at all. */
export class NumbersFormatError extends Error {}

// ── Snappy ─────────────────────────────────────────────────────────────────
// Raw Snappy blocks, as iWork writes them: no stream header, no checksums.

/** One Snappy block, unpacked. `limit` stops a block that claims to unpack to
 *  more than any budget could hold. */
export function snappyDecompress(src: Uint8Array, limit: number): Uint8Array {
  let pos = 0;
  let size = 0;
  for (let shift = 0; ; shift += 7) {
    if (pos >= src.length || shift > 28) throw new NumbersFormatError('snappy length');
    const b = src[pos++];
    size += (b & 0x7f) * 2 ** shift;
    if (b < 0x80) break;
  }
  if (size > limit) throw new NumbersFormatError('snappy size');
  const out = new Uint8Array(size);
  let o = 0;
  const need = (n: number) => { if (pos + n > src.length) throw new NumbersFormatError('snappy input'); };
  while (pos < src.length) {
    const tag = src[pos++];
    const kind = tag & 3;
    if (kind === 0) {
      let len = tag >> 2;
      if (len >= 60) {
        const bytes = len - 59;
        need(bytes);
        len = 0;
        for (let i = 0; i < bytes; i++) len += src[pos + i] * 2 ** (8 * i);
        pos += bytes;
      }
      len += 1;
      need(len);
      if (o + len > size) throw new NumbersFormatError('snappy literal');
      out.set(src.subarray(pos, pos + len), o);
      pos += len;
      o += len;
      continue;
    }
    let len: number;
    let offset: number;
    if (kind === 1) {
      need(1);
      len = ((tag >> 2) & 7) + 4;
      offset = ((tag >> 5) << 8) | src[pos++];
    } else if (kind === 2) {
      need(2);
      len = (tag >> 2) + 1;
      offset = src[pos] | (src[pos + 1] << 8);
      pos += 2;
    } else {
      need(4);
      len = (tag >> 2) + 1;
      offset = (src[pos] | (src[pos + 1] << 8) | (src[pos + 2] << 16)) + src[pos + 3] * 2 ** 24;
      pos += 4;
    }
    if (offset === 0 || offset > o || o + len > size) throw new NumbersFormatError('snappy copy');
    // Byte by byte: a copy may overlap what it is writing (a run).
    for (let i = 0; i < len; i++, o++) out[o] = out[o - offset];
  }
  if (o !== size) throw new NumbersFormatError('snappy short');
  return out;
}

/** An .iwa file's chunks, unpacked and joined: 0x00, a 3-byte length, then
 *  the block. A block that is not valid Snappy is taken as it is, as
 *  numbers-parser does — some writers store small chunks uncompressed. */
export function unpackIwa(file: Uint8Array, limit: number): Uint8Array {
  const parts: Uint8Array[] = [];
  let total = 0;
  let pos = 0;
  while (pos < file.length) {
    if (file[pos] !== 0 || pos + 4 > file.length) throw new NumbersFormatError('iwa chunk');
    const len = file[pos + 1] | (file[pos + 2] << 8) | (file[pos + 3] << 16);
    const block = file.subarray(pos + 4, pos + 4 + len);
    pos += 4 + len;
    let data: Uint8Array;
    try { data = snappyDecompress(block, limit - total); } catch { data = block; }
    total += data.length;
    if (total > limit) throw new NumbersFormatError('iwa size');
    parts.push(data);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// ── Protobuf, without a schema ─────────────────────────────────────────────

interface Field { no: number; wire: number; num: number; bytes?: Uint8Array }

function readVarint(buf: Uint8Array, at: { pos: number }): number {
  let n = 0;
  for (let shift = 0; shift < 70; shift += 7) {
    if (at.pos >= buf.length) throw new NumbersFormatError('varint');
    const b = buf[at.pos++];
    n += (b & 0x7f) * 2 ** shift;
    if (b < 0x80) return n;
  }
  throw new NumbersFormatError('varint');
}

/** Every field of one message, in order. Numbers are exact up to 2^53, which
 *  covers every id and count in a budget. */
function fields(buf: Uint8Array): Field[] {
  const out: Field[] = [];
  const at = { pos: 0 };
  while (at.pos < buf.length) {
    const key = readVarint(buf, at);
    const no = Math.floor(key / 8);
    const wire = key % 8;
    if (wire === 0) out.push({ no, wire, num: readVarint(buf, at) });
    else if (wire === 2) {
      const len = readVarint(buf, at);
      if (at.pos + len > buf.length) throw new NumbersFormatError('length');
      out.push({ no, wire, num: 0, bytes: buf.subarray(at.pos, at.pos + len) });
      at.pos += len;
    } else if (wire === 1) at.pos += 8;
    else if (wire === 5) at.pos += 4;
    else throw new NumbersFormatError('wire type');
  }
  return out;
}

const all = (fs: Field[], no: number) => fs.filter(f => f.no === no);
const one = (fs: Field[], no: number) => fs.find(f => f.no === no);
const sub = (fs: Field[], no: number): Field[] => { const f = one(fs, no); return f?.bytes ? fields(f.bytes) : []; };
const text = (f: Field | undefined) => (f?.bytes ? new TextDecoder().decode(f.bytes) : '');
/** A TSP.Reference's object id. */
const ref = (fs: Field[], no: number) => one(sub(fs, no), 1)?.num;

// ── The document's objects ─────────────────────────────────────────────────

interface IwaObject { type: number; data: Uint8Array }

/** Every object in the unpacked .iwa streams, by id: each is a length-
 *  prefixed ArchiveInfo (id, and each message's type and length), then the
 *  messages. The first message is the object; any after it are patches,
 *  which a read of the values does not need. */
function objectsOf(streams: Uint8Array[]): Map<number, IwaObject> {
  const objects = new Map<number, IwaObject>();
  for (const s of streams) {
    const at = { pos: 0 };
    while (at.pos < s.length) {
      const len = readVarint(s, at);
      const info = fields(s.subarray(at.pos, at.pos + len));
      at.pos += len;
      const id = one(info, 1)?.num ?? 0;
      const messages = all(info, 2).map(m => fields(m.bytes!));
      messages.forEach((m, i) => {
        const size = one(m, 3)?.num ?? 0;
        if (i === 0) objects.set(id, { type: one(m, 1)?.num ?? 0, data: s.subarray(at.pos, at.pos + size) });
        at.pos += size;
      });
    }
  }
  return objects;
}

const TABLE_MODEL = 6001;
const DATA_LISTS = new Set([6005, 6201]);

// ── Cells ──────────────────────────────────────────────────────────────────

const CELL_NUMBER = 2;
const CELL_TEXT = 3;
const CELL_DATE = 5;
const CELL_BOOL = 6;
const CELL_CURRENCY = 10;

/** IEEE 754-2008 decimal128, little-endian: how Numbers keeps every number,
 *  so 0.1 stays 0.1. Read through a string so the exponent adds no error. */
function decimal128(b: Uint8Array, at: number): number {
  const exp = (((b[at + 15] & 0x7f) << 7) | (b[at + 14] >> 1)) - 6176;
  let mantissa = BigInt(b[at + 14] & 1);
  for (let i = 13; i >= 0; i--) mantissa = mantissa * 256n + BigInt(b[at + i]);
  const n = Number(`${mantissa}e${exp}`);
  return b[at + 15] & 0x80 ? -n : n;
}

/** A number as budgetImport's parser reads it without doubt: comma decimal,
 *  no grouping, at most two decimals. */
const numberText = (n: number) => (Math.round(n * 100) / 100).toString().replace('.', ',');

/** One cell's record: a version byte, its type, then flags saying which
 *  values follow, in a fixed order. */
function cellText(cell: Uint8Array, strings: Map<number, string>): string {
  if (cell.length < 12) return '';
  const dv = new DataView(cell.buffer, cell.byteOffset, cell.byteLength);
  const flags = dv.getUint32(8, true);
  let at = 12;
  let d128 = NaN;
  let double = NaN;
  let seconds = NaN;
  let stringId = -1;
  const room = (n: number) => at + n <= cell.length;
  if (flags & 0x1) { if (room(16)) d128 = decimal128(cell, at); at += 16; }
  if (flags & 0x2) { if (room(8)) double = dv.getFloat64(at, true); at += 8; }
  if (flags & 0x4) { if (room(8)) seconds = dv.getFloat64(at, true); at += 8; }
  if (flags & 0x8) { if (room(4)) stringId = dv.getInt32(at, true); at += 4; }
  switch (cell[1]) {
    case CELL_NUMBER:
    case CELL_CURRENCY:
      return Number.isFinite(d128) ? numberText(d128) : '';
    case CELL_TEXT:
      return strings.get(stringId) ?? '';
    case CELL_DATE: {
      if (!Number.isFinite(seconds)) return '';
      // Seconds from 1 January 2001, Apple's epoch.
      const d = new Date(Date.UTC(2001, 0, 1) + seconds * 1000);
      return d.toISOString().slice(0, 10);
    }
    case CELL_BOOL:
      return double > 0 ? 'TRUE' : 'FALSE';
    default:
      return '';
  }
}

/** The cells of one stored row: 16-bit offsets into the row's buffer, one per
 *  column, -1 where the column is empty; ×4 when the row says so. */
function rowCells(buffer: Uint8Array, offsets: Uint8Array, wide: boolean, columns: number): (Uint8Array | null)[] {
  const n = Math.min(columns, Math.floor(offsets.length / 2));
  const dv = new DataView(offsets.buffer, offsets.byteOffset, offsets.byteLength);
  const starts: number[] = [];
  for (let c = 0; c < n; c++) {
    const raw = dv.getInt16(c * 2, true);
    starts.push(raw < 0 ? -1 : wide ? raw * 4 : raw);
  }
  return starts.map((start, c) => {
    if (start < 0 || start >= buffer.length) return null;
    const next = starts.slice(c + 1).find(s => s >= 0);
    return buffer.subarray(start, next !== undefined && next > start ? next : buffer.length);
  });
}

// ── Tables ─────────────────────────────────────────────────────────────────

/**
 * Every table in the document, in the order it was made, its cells as text.
 * `files` are the zip's Index/*.iwa parts; `limit` caps how much they may
 * unpack to, all together.
 */
export function readNumbersTables(files: Uint8Array[], limit: number, maxRows: number, maxColumns: number): NumbersTable[] {
  let budget = limit;
  const streams = files.map(f => {
    const s = unpackIwa(f, budget);
    budget -= s.length;
    return s;
  });
  const objects = objectsOf(streams);
  const tables: NumbersTable[] = [];
  const ids = [...objects.keys()].filter(id => objects.get(id)!.type === TABLE_MODEL).sort((a, b) => a - b);
  for (const id of ids) {
    const model = fields(objects.get(id)!.data);
    const rowCount = one(model, 6)?.num ?? 0;
    const colCount = one(model, 7)?.num ?? 0;
    if (rowCount > maxRows || colCount > maxColumns) throw new NumbersFormatError('too large');
    const store = sub(model, 4);

    const strings = new Map<number, string>();
    const listId = ref(store, 4);
    const list = listId !== undefined ? objects.get(listId) : undefined;
    if (list && DATA_LISTS.has(list.type)) {
      for (const e of all(fields(list.data), 3)) {
        const entry = fields(e.bytes!);
        strings.set(one(entry, 1)?.num ?? -1, text(one(entry, 3)));
      }
    }

    const grid: string[][] = Array.from({ length: rowCount }, () => Array<string>(colCount).fill(''));
    const tileStore = sub(store, 3);
    const tileSize = one(tileStore, 2)?.num || 256;
    for (const t of all(tileStore, 1)) {
      const tileRef = fields(t.bytes!);
      const base = (one(tileRef, 1)?.num ?? 0) * tileSize;
      const tileId = ref(tileRef, 2);
      const tile = tileId !== undefined ? objects.get(tileId) : undefined;
      if (!tile) continue;
      const tf = fields(tile.data);
      // Field 7, last_saved_in_BNC: the cell layout of Numbers 6 and later.
      if (!one(tf, 7)?.num) throw new NumbersFormatError('pre-BNC');
      for (const info of all(tf, 5)) {
        const ri = fields(info.bytes!);
        const r = base + (one(ri, 1)?.num ?? 0);
        if (r >= rowCount) continue;
        const buffer = one(ri, 6)?.bytes;
        const offsets = one(ri, 7)?.bytes;
        if (!buffer || !offsets) continue;
        rowCells(buffer, offsets, (one(ri, 8)?.num ?? 0) > 0, colCount).forEach((cell, c) => {
          if (cell) grid[r][c] = cellText(cell, strings).trim();
        });
      }
    }
    tables.push({ name: text(one(model, 8)) || `Table ${tables.length + 1}`, rows: trimGrid(grid) });
  }
  if (tables.length === 0) throw new NumbersFormatError('no tables');
  return tables;
}

/** Without the empty rows and columns a new Numbers table is padded with. */
function trimGrid(grid: string[][]): string[][] {
  let rows = grid.length;
  while (rows > 0 && grid[rows - 1].every(c => c === '')) rows--;
  const kept = grid.slice(0, rows);
  let cols = 0;
  for (const r of kept) for (let c = r.length - 1; c >= cols; c--) if (r[c] !== '') { cols = c + 1; break; }
  return kept.map(r => r.slice(0, cols));
}
