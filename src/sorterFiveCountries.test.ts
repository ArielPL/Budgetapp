import { describe, it, expect } from 'vitest';
import { seedKind, isTransfer, suggest, normalise, SEED_LISTS } from './categorise';
import { decodeCsv, parseCsv, detectDelimiter, CsvEncodingError } from './csvImport';

// ── The sorter in five more countries (2026-09-23) ──────────────────────────
//
// Australia, South Africa, Mexico, Japan and Colombia, from the brief in
// CLAUDE_CODE_SORTER_FIVE_COUNTRIES_2026-09-23.md. Each "V" row below is a
// description SEEN in a published statement; the shop names only — no account
// numbers, amounts or names were copied. The negative rows matter as much:
// they are the places where a confident wrong answer would cost the user.

describe('rows seen in real statements get their category', () => {
  it.each([
    // Australia
    ['BUNNINGS 551000 WARRINGAH', 'boende'],
    // South Africa
    ['SHOPRITE SCF', 'mat'],
    ['PNP FAM STAND', 'mat'],
    ['BOXER SPR STA', 'mat'],
    ['ENGEN TUGELA', 'transport'],
    ['CLICKS STANDE', 'personligt'],
    // Mexico
    ['TDAS CHEDRAUI', 'mat'],
    ['SORIANA573', 'mat'],
    ['OXXOGLORIETA', 'mat'],
    ['F AHORRO SAVS V', 'personligt'],
    // Japan
    ['セブン-イレブン', 'mat'],
    ['イデミツ（アポロ　シェル）', 'transport'],
    ['6カップン　KDDIリョウキン', 'prenumerationer'],
    ['イオンシネマ', 'fritid'],
    // Colombia
    ['COMPRA NACIONAL EXITO BUCARAMANGA', 'mat'],
    ['COMPRA EN TIENDA D1', 'mat'],
  ])('%s → %s', (text, kind) => {
    expect(seedKind(text)).toBe(kind);
  });
});

describe('the collisions the brief warned about', () => {
  it('keeps Swedish Boxer a subscription while the South African grocer is food', () => {
    expect(seedKind('BOXER')).toBe('prenumerationer');
    expect(seedKind('BOXER SPR STA')).toBe('mat');
  });

  it('gives Coles Express no answer — fuel or a sandwich cannot be told apart', () => {
    expect(seedKind('COLES EXPRESS 1561 WATERLOO')).toBeUndefined();
    expect(seedKind('COLES 0712 BONDI')).toBe('mat');
  });

  it('never reads a cash withdrawal at an Éxito as groceries', () => {
    expect(isTransfer('RETIRO ATM MFM EXITO SUBA')).toBe(true);
    expect(seedKind('RETIRO ATM MFM EXITO SUBA')).toBeUndefined();
    expect(seedKind('EXITO')).toBeUndefined();
  });

  it('knows a top-up of your own wallet is not spending', () => {
    expect(isTransfer('TRANSFERENCIA A NEQUI')).toBe(true);
  });

  it('does not take "retiro" alone for a withdrawal — it is also a park in Madrid', () => {
    expect(isTransfer('CAFETERIA EL RETIRO')).toBe(false);
  });

  it('gives a payment method, or a bare "goods", no invented category', () => {
    for (const text of ['PAGO PSE Mercadopago Colombia', 'MERCADOPAGO', '物販', 'COMPRA NACIONAL']) {
      expect(seedKind(text), text).toBeUndefined();
    }
    expect(isTransfer('PAGO PSE Mercadopago Colombia')).toBe(false);
  });

  it('does not let a cinema inherit a grocer’s category', () => {
    expect(seedKind('イオンシネマ')).toBe('fritid');
    expect(seedKind('イオン')).toBeUndefined();
  });

  it('leaves shops it has never seen unsorted', () => {
    for (const text of ['ALMACEN LA ESQUINA', 'TOKO BUDI', 'たなか商店']) {
      expect(seedKind(text), text).toBeUndefined();
    }
  });
});

describe('welded names are read narrowly', () => {
  it('drops a store number welded to a known name, and nothing else', () => {
    expect(seedKind('SORIANA573')).toBe('mat');
    expect(seedKind('SORIANA 573 CENTRO')).toBe('mat');
    // The name has to be the whole word once the number is gone.
    expect(seedKind('MISORIANA573')).toBeUndefined();
    expect(seedKind('SORIANAS')).toBeUndefined();
  });

  it('reads OXXO welded to its place, but not its fuel brand as a shop', () => {
    expect(seedKind('OXXOGLORIETA')).toBe('mat');
    expect(seedKind('OXXO GAS SUCURSAL')).toBe('transport');
    expect(seedKind('OXXOGAS')).toBeUndefined();
    // Too short to be a brand plus a place.
    expect(seedKind('OXXOS')).toBeUndefined();
  });
});

describe('Japanese text, as banks actually write it', () => {
  it('matches with or without the separator', () => {
    expect(seedKind('セブンイレブン')).toBe('mat');
    expect(seedKind('セブン－イレブン 新宿店')).toBe('mat');
  });

  it('reads halfwidth katakana and fullwidth letters as the same names', () => {
    expect(seedKind('ｾﾌﾞﾝｲﾚﾌﾞﾝ')).toBe('mat');
    expect(seedKind('ＫＤＤＩ　ご利用料金')).toBe('prenumerationer');
  });

  it('splits a Latin name off the Japanese it is welded to', () => {
    expect(seedKind('KDDIリョウキン')).toBe('prenumerationer');
  });

  it('keeps the voicing marks — ブ is not フ', () => {
    // Stripping accents from Latin letters must not touch kana: decomposed and
    // stripped, ブ would become フ and a real name would stop matching.
    expect(seedKind('ヨドバシカメラ')).toBe('fritid');
  });
});

describe('accents the old fold table did not carry', () => {
  it('reads á, í, ó and ú on Latin letters for the built-in list', () => {
    expect(seedKind('BODEGA AURRERÁ')).toBe('mat');
    expect(seedKind('CINÉPOLIS PERISUR')).toBe('fritid');
  });
});

describe('what the user has taught still wins, and still finds its rule', () => {
  it('beats every new built-in rule', () => {
    const existing = new Set(['mat', 'prenumerationer', 'fritid']);
    expect(suggest('BOXER SPR STA', existing, { [normalise('BOXER SPR STA')]: 'fritid' }))
      .toEqual({ categoryId: 'fritid' });
    expect(suggest('イオンシネマ', existing, { [normalise('イオンシネマ')]: 'mat' }))
      .toEqual({ categoryId: 'mat' });
  });

  it('stores rules under the same key as before', () => {
    // The widening (NFKC, accents, welded numbers) is for the built-in list
    // only. Changing normalise() itself would detach every correction a user
    // has already made.
    expect(normalise('SORIANA573')).toBe('soriana573');
    expect(normalise('BODEGA AURRERÁ')).toBe('bodega aurrerá');
    expect(normalise('ＫＤＤＩ')).toBe('ｋｄｄｉ');
  });
});

describe('each new list says where its knowledge comes from', () => {
  it('keeps every new country apart from the lists that were already there', () => {
    // Covered in general by categorise.test.ts; named here so the five are
    // visibly part of it.
    for (const name of ['AUSTRALIA', 'SOUTH_AFRICA', 'MEXICO', 'JAPAN', 'COLOMBIA'] as const) {
      expect(Object.keys(SEED_LISTS)).toContain(name);
    }
  });
});

// ── Reading the file at all ─────────────────────────────────────────────────
// Byte fixtures written by Python's own encoders (cp932, cp1252, euc_jp) from
// synthetic rows, so the test holds real encoded bytes rather than our idea of
// them.
const bytes = (hex: string) => new Uint8Array(hex.match(/../g)!.map(h => parseInt(h, 16))).buffer;

/** 日付,金額,摘要 / セブン-イレブン / イオンシネマ / 6カップン KDDIリョウキン (wide space) — CP932. */
const JP_HEADER = bytes('93fa95742c8be08a7a2c934597760a323032362f30392f30352c313230302c835a837583932d8343838c837583930a323032362f30392f30362c333030302c8343834983938356836c837d0a323032362f30392f30372c353530302c36834a83628376839381404b444449838a83878345834c83930a');
/** No header; ｾﾌﾞﾝｲﾚﾌﾞﾝ (halfwidth) / ローソン / ファミリーマート — CP932. */
const JP_NO_HEADER = bytes('323032362f30392f30352c313230302cbeccdeddb2daccdedd0a323032362f30392f30362c3830302c838d815b835c83930a323032362f30392f30372c3530302c83748340837e838a815b837d815b83670a');
/** Hemköp Gärdet / Pressbyrån Åre / ÖoB Västerås / Café Ängsö — Windows-1252. */
const SV_1252 = bytes('446174756d3b42656c6f70703b546578740a323032362d30392d30353b2d3132303b48656d6bf6702047e4726465740a323032362d30392d30363b2d34353b5072657373627972e56e20c572650a323032362d30392d30373b2d3330303bd66f422056e473746572e5730a323032362d30392d30383b2d38393b436166e920c46e6773f60a');
/** Hemköp Gärdet / Pressbyrån Åre / ÖoB Västerås / Äppelträdgården Öland —
 *  Windows-1252 that Shift-JIS ALSO decodes without error ("G舐det"). Its ö
 *  lands in the private-use area, which is what gives it away. */
const SV_READS_AS_SJIS = bytes('446174756d3b42656c6f70703b546578740a323032362d30392d30353b2d3132303b48656d6bf6702047e4726465740a323032362d30392d30363b2d34353b5072657373627972e56e20c572650a323032362d30392d30373b2d3330303bd66f422056e473746572e5730a323032362d30392d30383b2d36303bc47070656c7472e46467e57264656e20d66c616e640a');
/** Gärdets Bageri / Pressbyrån Åre / Västerås Centrum / Äppelträdgården Åsa —
 *  Windows-1252 that Shift-JIS decodes cleanly into kanji with NO private-use
 *  character. Only the absence of kana and Japanese column names tells. */
const SV_READS_AS_KANJI = bytes('446174756d3b42656c6f70703b546578740a323032362d30392d30353b2d3132303b47e47264657473204261676572690a323032362d30392d30363b2d34353b5072657373627972e56e20c572650a323032362d30392d30373b2d3330303b56e473746572e5732043656e7472756d0a323032362d30392d30383b2d36303bc47070656c7472e46467e57264656e20c573610a');
/** Panadería Muñoz / Farmacia Peñalver / Cafetería Ñandú — Windows-1252. */
const ES_1252 = bytes('46656368613b496d706f7274653b436f6e636570746f0a30352f30392f323032363b2d31322c35303b50616e61646572ed61204d75f16f7a0a30362f30392f323032363b2d33302c30303b4661726d61636961205065f1616c7665720a30372f30392f323032363b2d382c32303b43616665746572ed6120d1616e64fa0a');
/** The Japanese header file again, in EUC-JP — an encoding the app does not read. */
const JP_EUC = bytes('c6fcc9d52cb6e2b3db2cc5a6cdd70a323032362f30392f30352c313230302ca5bba5d6a5f3a5a4a5eca5d6a5f30a323032362f30392f30362c333030302ca5a4a5aaa5f3a5b7a5cda5de0a323032362f30392f30372c3830302ca5eda1bca5bda5f30a');

describe('decoding a Japanese bank file', () => {
  it('reads Shift-JIS with Japanese column names', () => {
    const text = decodeCsv(JP_HEADER);
    expect(text.startsWith('日付,金額,摘要')).toBe(true);
    expect(text).toContain('セブン-イレブン');
    expect(text).toContain('KDDIリョウキン');
  });

  it('reads Shift-JIS with no header, halfwidth katakana included', () => {
    const text = decodeCsv(JP_NO_HEADER);
    expect(text).toContain('ｾﾌﾞﾝｲﾚﾌﾞﾝ');
    expect(text).toContain('ファミリーマート');
  });

  it('sorts the rows it read, end to end', () => {
    const text = decodeCsv(JP_HEADER);
    const rows = parseCsv(text, detectDelimiter(text)).slice(1);
    expect(rows.map(r => seedKind(r[2]))).toEqual(['mat', 'fritid', 'prenumerationer']);
  });

  it('refuses an encoding it cannot read instead of importing noise', () => {
    expect(() => decodeCsv(JP_EUC)).toThrow(CsvEncodingError);
  });
});

describe('decoding is unchanged for the files it already read', () => {
  it('still reads a Swedish Windows-1252 file as Swedish, not as Japanese', () => {
    // Shift-JIS "succeeds" on these bytes — Å is a halfwidth katakana there and
    // "ä" + a letter is a kanji. It must not win.
    const text = decodeCsv(SV_1252);
    expect(text).toContain('Hemköp Gärdet');
    expect(text).toContain('Pressbyrån Åre');
    expect(text).toContain('ÖoB Västerås');
    expect(text).toContain('Café Ängsö');
  });

  it('is not fooled by a Swedish file that also decodes as Shift-JIS', () => {
    // The dangerous case: the Japanese decoder succeeds on these bytes.
    expect(() => new TextDecoder('shift_jis', { fatal: true }).decode(SV_READS_AS_SJIS)).not.toThrow();
    expect(() => new TextDecoder('shift_jis', { fatal: true }).decode(SV_READS_AS_KANJI)).not.toThrow();
    expect(decodeCsv(SV_READS_AS_SJIS)).toContain('Hemköp Gärdet');
    expect(decodeCsv(SV_READS_AS_KANJI)).toContain('Gärdets Bageri');
    expect(decodeCsv(SV_READS_AS_KANJI)).toContain('Äppelträdgården Åsa');
  });

  it('still reads a Spanish Windows-1252 file', () => {
    const text = decodeCsv(ES_1252);
    expect(text).toContain('Panadería Muñoz');
    expect(text).toContain('Cafetería Ñandú');
  });

  it('still reads UTF-8 first', () => {
    const utf8 = new TextEncoder().encode('Datum;Text\n2026-09-05;Hemköp\n2026-09-06;イオンシネマ\n');
    expect(decodeCsv(utf8.buffer)).toContain('イオンシネマ');
  });
});
