import { describe, it, expect } from 'vitest';
import {
  decodeCsv, detectDelimiter, parseCsv, findHeaderRow,
  parseAmount, parseDate, guessColumns, rowsToParsed, headerFingerprint, groupByText,
  detectDateOrder, looksLikeData, placeholderHeader,
} from './csvImport';

const bytes = (...b: number[]) => new Uint8Array(b).buffer;

describe('decodeCsv — the quietly destructive one', () => {
  it('reads UTF-8', () => {
    const buf = new TextEncoder().encode('Datum;Café;Belopp').buffer;
    expect(decodeCsv(buf)).toBe('Datum;Café;Belopp');
  });

  it('falls back to Windows-1252, which Swedish exports often are', () => {
    // "Café" as cp1252: é is a single byte 0xE9, which is not valid UTF-8.
    // A non-strict UTF-8 decoder would not throw — it would hand back "Caf�"
    // and every å, ä and ö in the statement would be ruined without a single
    // error anywhere. That is why the first decode is strict.
    expect(decodeCsv(bytes(0x43, 0x61, 0x66, 0xE9))).toBe('Café');
  });

  it('reads Swedish letters out of Windows-1252', () => {
    // å ä ö = 0xE5 0xE4 0xF6
    expect(decodeCsv(bytes(0xE5, 0xE4, 0xF6))).toBe('åäö');
  });
});

describe('detectDelimiter', () => {
  it('finds the semicolon Swedish Excel writes', () => {
    expect(detectDelimiter('Datum;Text;Belopp\n2026-09-02;ICA;-842,00')).toBe(';');
  });

  it('finds a comma', () => {
    expect(detectDelimiter('Date,Description,Amount\n2026-09-02,ICA,-842.00')).toBe(',');
  });

  it('finds a tab', () => {
    expect(detectDelimiter('Datum\tText\tBelopp\n2026-09-02\tICA\t-842,00')).toBe('\t');
  });

  it('is not fooled by a comma inside one description', () => {
    // A single stray comma must not outvote the real column separator, or the
    // whole file parses as one field per row and nothing imports.
    const text = 'Datum;Text;Belopp\n2026-09-02;"ICA Maxi, Södertälje";-842,00\n2026-09-03;SL;-390,00';
    expect(detectDelimiter(text)).toBe(';');
  });
});

describe('parseCsv', () => {
  it('splits rows and fields', () => {
    expect(parseCsv('a;b\n1;2', ';')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('keeps a delimiter that sits inside quotes', () => {
    expect(parseCsv('a;b\n"ICA Maxi; Södertälje";-842', ';'))
      .toEqual([['a', 'b'], ['ICA Maxi; Södertälje', '-842']]);
  });

  it('unescapes a doubled quote', () => {
    expect(parseCsv('a\n"He said ""hi"""', ';')).toEqual([['a'], ['He said "hi"']]);
  });

  it('handles CRLF and drops blank lines', () => {
    expect(parseCsv('a;b\r\n1;2\r\n\r\n3;4\r\n', ';')).toEqual([['a', 'b'], ['1', '2'], ['3', '4']]);
  });
});

describe('findHeaderRow — banks put things above the table', () => {
  it('skips a preamble of account details', () => {
    // Assuming row 0 would map every column wrongly and import nonsense.
    const rows = [
      ['Kontoutdrag'],
      ['Konto', '1234 56 78901'],
      ['Period', '2026-09-01 - 2026-09-30'],
      ['Datum', 'Text', 'Belopp', 'Saldo'],
      ['2026-09-02', 'ICA', '-842,00', '12 940,50'],
      ['2026-09-03', 'SL', '-390,00', '12 550,50'],
    ];
    expect(findHeaderRow(rows)).toBe(3);
  });

  it('is row 0 when the file starts with its table', () => {
    expect(findHeaderRow([
      ['Datum', 'Text', 'Belopp'],
      ['2026-09-02', 'ICA', '-842,00'],
    ])).toBe(0);
  });
});

describe('parseAmount — every shape a bank writes a number', () => {
  it('reads the ordinary Swedish form', () => {
    expect(parseAmount('-842,00')).toBe(-842);
    expect(parseAmount('1 234,56')).toBe(1234.56);
    expect(parseAmount('842')).toBe(842);
  });

  it('reads a non-breaking space as a thousands separator', () => {
    expect(parseAmount('1 234,56')).toBe(1234.56);
    expect(parseAmount('1 234,56')).toBe(1234.56);
  });

  it('reads a dot as the decimal point when it is one', () => {
    expect(parseAmount('-842.00')).toBe(-842);
    expect(parseAmount('1234.5')).toBe(1234.5);
  });

  it('reads a dot as a thousands separator when it is one', () => {
    expect(parseAmount('1.234')).toBe(1234);
    expect(parseAmount('1.234.567')).toBe(1234567);
  });

  it('reads a trailing minus, which some exports still use', () => {
    expect(parseAmount('842,00-')).toBe(-842);
  });

  it('reads a leading plus', () => {
    expect(parseAmount('+32 596,00')).toBe(32596);
  });

  it('returns null for anything unreadable rather than zero', () => {
    // A row whose amount could not be read must be REPORTED. Importing it as
    // free would put a purchase in the budget at no cost and nobody would spot
    // it among sixty other rows.
    for (const bad of ['', '   ', 'saldo', '12,3,4', '1-2', 'kr', '-', '--5']) {
      expect(parseAmount(bad)).toBeNull();
    }
  });
});

describe('parseDate — day first, because Sweden', () => {
  it('reads ISO', () => {
    expect(parseDate('2026-09-24')).toBe('2026-09-24');
    expect(parseDate('2026/09/24')).toBe('2026-09-24');
    expect(parseDate('20260924')).toBe('2026-09-24');
  });

  it('reads day-first slash and dot forms', () => {
    expect(parseDate('24/09/2026')).toBe('2026-09-24');
    expect(parseDate('24.09.2026')).toBe('2026-09-24');
    expect(parseDate('2/9/2026')).toBe('2026-09-02');
  });

  it('takes 02/09 as the 2nd of September, not the 9th of February', () => {
    // Guessing month-first would move a purchase to another month for every day
    // below the 13th — an error that looks exactly like correct data.
    expect(parseDate('02/09/2026')).toBe('2026-09-02');
  });

  it('refuses what it cannot read', () => {
    for (const bad of ['', 'igår', '2026-13-01', '2026-09-32', '24 sep 2026', '26-09-24']) {
      expect(parseDate(bad)).toBeNull();
    }
  });
});

describe('the description column, past Swedish', () => {
  it('takes the shop over the transaction type in a German export', () => {
    // "Buchungstext" holds KARTENZAHLUNG / LASTSCHRIFT — the kind of payment.
    // "Verwendungszweck" holds the shop. Choosing the former made every German
    // row read "card payment" and collapsed the whole statement into one group.
    const header = ['Buchungstag', 'Buchungstext', 'Verwendungszweck', 'Betrag'];
    const sample = [
      ['31.08.26', 'KARTENZAHLUNG', 'LIDL DIENSTLEISTUNG', '-23,66'],
      ['28.08.26', 'LASTSCHRIFT', 'NETFLIX.COM', '-12,99'],
    ];
    const { roles } = guessColumns(header, sample);
    expect(roles[2]).toBe('text');
    expect(roles[1]).not.toBe('text');
    const { rows } = rowsToParsed(sample, { roles });
    expect(rows[0].text).toBe('LIDL DIENSTLEISTUNG');
  });

  it.each([
    [['Fecha', 'Concepto', 'Importe'], 1],
    [['Date', 'Libelle', 'Montant'], 1],
    [['Data', 'Descrizione', 'Importo'], 1],
    [['Datum', 'Omschrijving', 'Bedrag'], 1],
    [['Data operacji', 'Opis operacji', 'Kwota'], 1],
  ])('finds the description in %s', (header, want) => {
    const sample = [['31.08.2026', 'CARREFOUR MARKET', '-45,20']];
    expect(guessColumns(header as string[], sample).roles[want]).toBe('text');
  });

  it('still prefers a Swedish description over a reference', () => {
    // The original reason the two tiers exist. Must not regress.
    const header = ['Bokföringsdag', 'Referens', 'Beskrivning', 'Belopp'];
    const sample = [['2026-08-24', '', 'Lön', '32596,00']];
    const { roles } = guessColumns(header, sample);
    expect(roles[2]).toBe('text');
    expect(roles[1]).not.toBe('text');
  });

  it('still uses a column called only "Text" when nothing better is offered', () => {
    const header = ['Datum', 'Text', 'Belopp'];
    const sample = [['2026-08-24', 'ICA SUPERMARKET', '-293,95']];
    expect(guessColumns(header, sample).roles[1]).toBe('text');
  });
});

describe('amounts that carry their currency', () => {
  it.each([
    ['-45,20 PLN', -45.2],
    ['45,20 PLN', 45.2],
    ['\u20ac45,20', 45.2],
    ['-\u20ac45,20', -45.2],
    ['1 234,56 kr', 1234.56],
    ['1.234,56 CZK', 1234.56],
    ['-99 SEK', -99],
  ])('reads %s as %s', (raw, want) => {
    expect(parseAmount(raw)).toBe(want);
  });

  it('still reads the plain forms', () => {
    expect(parseAmount('1 234,56')).toBe(1234.56);
    expect(parseAmount('842,00-')).toBe(-842);
    expect(parseAmount('-23.66')).toBe(-23.66);
  });

  it('takes off a currency, never just any letters', () => {
    // The whole reason the list is explicit: this must stay unreadable, or a
    // description column of shop names and till numbers passes for amounts.
    expect(parseAmount('ICA 4521')).toBeNull();
    expect(parseAmount('TEMPO 4521')).toBeNull();
    expect(parseAmount('REF 1234')).toBeNull();
    expect(parseAmount('4521 SUPERMARKET')).toBeNull();
  });
});

describe('two-digit years', () => {
  it('reads the German short form, day first', () => {
    expect(parseDate('31.08.26')).toBe('2026-08-31');
    expect(parseDate('01.02.26')).toBe('2026-02-01');
  });

  it('reads it as this century, not the last one', () => {
    expect(parseDate('15.06.99')).toBe('2099-06-15');
  });

  it('wants exactly two digits, so a version string stays unreadable', () => {
    expect(parseDate('1.2.3')).toBeNull();
    expect(parseDate('1.2.345')).toBeNull();
  });

  it('will not touch a hyphenated short date, which is genuinely ambiguous', () => {
    // "26-09-24" is either the 24th of September 2026 written ISO-style short,
    // or the 26th written day-first. Nothing in the string decides it, so it
    // stays unreadable — a skipped row the user is told about beats a silent
    // guess that moves a purchase to another month.
    expect(parseDate('26-09-24')).toBeNull();
    expect(parseDate('01-02-03')).toBeNull();
  });

  it('still rejects an impossible date', () => {
    expect(parseDate('31.13.26')).toBeNull();
    expect(parseDate('32.01.26')).toBeNull();
    expect(parseDate('2026-02-31')).toBeNull();
    expect(parseDate('29.02.2026')).toBeNull();
    expect(parseDate('29.02.2028')).toBe('2028-02-29');
  });
});

describe('a spare date column is never mistaken for the amount', () => {
  // Found by running a German Sparkasse export through the guesser. None of
  // "Buchungstag", "Valutadatum" or "Betrag" is a word this module knows, so
  // everything fell to the value-based pass — where a dotted date parses as a
  // number. The import would have been silent and spectacularly wrong.
  const header = ['Auftragskonto', 'Buchungstag', 'Valutadatum', 'Buchungstext', 'Betrag'];
  const sample = [
    ['DE12', '31.08.2026', '31.08.2026', 'KARTENZAHLUNG', '-23,66'],
    ['DE12', '30.08.2026', '30.08.2026', 'LASTSCHRIFT', '-12,99'],
  ];

  it('reads the amount from the amount column', () => {
    const { roles } = guessColumns(header, sample);
    expect(roles[4]).toBe('amount');
  });

  it('never calls a date column the amount', () => {
    const { roles } = guessColumns(header, sample);
    expect(roles[1]).not.toBe('amount');
    expect(roles[2]).not.toBe('amount');
  });

  it('never calls a date column the description either', () => {
    const { roles } = guessColumns(header, sample);
    expect(roles[1]).not.toBe('text');
    expect(roles[2]).not.toBe('text');
    expect(roles[3]).toBe('text');
  });

  it('still reads a real row out of it', () => {
    const { roles } = guessColumns(header, sample);
    const { rows, skipped } = rowsToParsed(sample, { roles });
    expect(skipped).toHaveLength(0);
    expect(rows[0]).toEqual({ date: '2026-08-31', text: 'KARTENZAHLUNG', amount: -23.66 });
  });
});

describe('guessColumns', () => {
  const sample = [
    ['2026-09-02', 'ICA MAXI', '-842,00', '12 940,50'],
    ['2026-09-03', 'SL ACCESS', '-390,00', '12 550,50'],
  ];

  it('reads the header wording', () => {
    const { roles } = guessColumns(['Datum', 'Text', 'Belopp', 'Saldo'], sample);
    expect(roles).toEqual(['date', 'text', 'amount', 'skip']);
  });

  it('never mistakes a balance column for an amount', () => {
    // Saldo looks exactly like Belopp. Importing a running balance as purchases
    // would be spectacular nonsense, so it is excluded by name before anything
    // else is considered.
    const { roles } = guessColumns(['Datum', 'Text', 'Saldo'], [
      ['2026-09-02', 'ICA', '12 940,50'],
    ]);
    expect(roles[2]).toBe('skip');
  });

  it('recognises English headers too', () => {
    const { roles } = guessColumns(['Date', 'Description', 'Amount'], [
      ['2026-09-02', 'ICA', '-842.00'],
    ]);
    expect(roles).toEqual(['date', 'text', 'amount']);
  });

  it('recognises two columns for money in and out', () => {
    const { roles } = guessColumns(['Datum', 'Specifikation', 'Insättning', 'Uttag'], [
      ['2026-09-25', 'LÖN', '32 596,00', ''],
      ['2026-09-02', 'ICA', '', '842,00'],
    ]);
    expect(roles).toEqual(['date', 'text', 'in', 'out']);
  });

  it('falls back to what the values look like when the header says nothing', () => {
    const { roles } = guessColumns(['A', 'B', 'C'], [
      ['2026-09-02', 'ICA MAXI SÖDERTÄLJE', '-842,00'],
      ['2026-09-03', 'SL ACCESS', '-390,00'],
    ]);
    expect(roles[0]).toBe('date');
    expect(roles[2]).toBe('amount');
    expect(roles[1]).toBe('text');
  });
});

describe('rowsToParsed', () => {
  it('reads a single signed amount column', () => {
    const { rows, skipped } = rowsToParsed(
      [['2026-09-02', 'ICA', '-842,00'], ['2026-09-25', 'Lön', '32 596,00']],
      { roles: ['date', 'text', 'amount'] },
    );
    expect(skipped).toEqual([]);
    expect(rows).toEqual([
      { date: '2026-09-02', text: 'ICA', amount: -842 },
      { date: '2026-09-25', text: 'Lön', amount: 32596 },
    ]);
  });

  it('takes the direction from WHICH column held the figure', () => {
    // In a two-column export the number itself is unsigned; only the column it
    // sits in says whether money came or went.
    const { rows } = rowsToParsed(
      [['2026-09-25', 'LÖN', '32 596,00', ''], ['2026-09-02', 'ICA', '', '842,00']],
      { roles: ['date', 'text', 'in', 'out'] },
    );
    expect(rows.map(r => r.amount)).toEqual([32596, -842]);
  });

  it('reports a row it could not read instead of dropping it', () => {
    // A file that silently imports 2 of its 3 lines is worse than one that
    // refuses: the user would never learn a purchase went missing.
    const { rows, skipped } = rowsToParsed(
      [
        ['2026-09-02', 'ICA', '-842,00'],
        ['inte ett datum', 'SL', '-390,00'],
        ['2026-09-04', 'Okänd', 'saldo'],
      ],
      { roles: ['date', 'text', 'amount'] },
    );
    expect(rows).toHaveLength(1);
    expect(skipped).toEqual([
      { line: 2, reason: 'date' },
      { line: 3, reason: 'amount' },
    ]);
  });

  it('trims the description', () => {
    const { rows } = rowsToParsed([['2026-09-02', '  ICA MAXI  ', '-842,00']], { roles: ['date', 'text', 'amount'] });
    expect(rows[0].text).toBe('ICA MAXI');
  });
});

describe('headerFingerprint', () => {
  it('is the same for the same bank next month', () => {
    expect(headerFingerprint(['Datum', 'Text', 'Belopp']))
      .toBe(headerFingerprint([' datum ', 'TEXT', 'Belopp']));
  });

  it('differs between banks', () => {
    expect(headerFingerprint(['Datum', 'Text', 'Belopp']))
      .not.toBe(headerFingerprint(['Date', 'Description', 'Amount']));
  });
});

// ── End to end, on files shaped like the real thing ────────────────────────
//
// Each of these is a whole import from bytes to dated rows. They exist because
// the individual pieces can all be right while the seams between them are not.

describe('whole files', () => {
  const runFile = (buf: ArrayBuffer) => {
    const text = decodeCsv(buf);
    const rows = parseCsv(text, detectDelimiter(text));
    const h = findHeaderRow(rows);
    const map = guessColumns(rows[h], rows.slice(h + 1, h + 4));
    return { map, ...rowsToParsed(rows.slice(h + 1), map) };
  };
  const utf8 = (s: string) => new TextEncoder().encode(s).buffer;

  it('reads a semicolon file with a preamble and a balance column', () => {
    const { rows, skipped } = runFile(utf8(
      'Kontoutdrag\n' +
      'Konto;1234 56 78901\n' +
      '\n' +
      'Datum;Text;Belopp;Saldo\n' +
      '2026-09-02;ICA MAXI SÖDERTÄLJE;-842,00;12 940,50\n' +
      '2026-09-25;LÖN;32 596,00;45 536,50\n',
    ));
    expect(skipped).toEqual([]);
    expect(rows).toEqual([
      { date: '2026-09-02', text: 'ICA MAXI SÖDERTÄLJE', amount: -842 },
      { date: '2026-09-25', text: 'LÖN', amount: 32596 },
    ]);
  });

  it('reads a two-column in/out file with day-first dates', () => {
    const { rows } = runFile(utf8(
      'Bokf.dag;Specifikation;Insättning;Uttag\n' +
      '02/09/2026;ICA;;842,00\n' +
      '25/09/2026;LÖN;32596,00;\n',
    ));
    expect(rows).toEqual([
      { date: '2026-09-02', text: 'ICA', amount: -842 },
      { date: '2026-09-25', text: 'LÖN', amount: 32596 },
    ]);
  });

  it('reads a comma file in English with dotted decimals', () => {
    const { rows } = runFile(utf8(
      'Date,Description,Amount\n' +
      '2026-09-02,"ICA Maxi, Södertälje",-842.00\n',
    ));
    expect(rows).toEqual([{ date: '2026-09-02', text: 'ICA Maxi, Södertälje', amount: -842 }]);
  });

  it('reads a Windows-1252 file without ruining a single letter', () => {
    // The whole reason decodeCsv tries strictly first. Bytes below are
    // "Datum;Text;Belopp" then a row containing å, ä, ö and é in cp1252.
    const cp1252 = new Uint8Array([
      ...new TextEncoder().encode('Datum;Text;Belopp\n2026-09-02;'),
      0x41, 0xE5, 0xE4, 0xF6, 0x20, 0x43, 0x61, 0x66, 0xE9, // "Aåäö Café"
      ...new TextEncoder().encode(';-842,00\n'),
    ]).buffer;
    const { rows } = runFile(cp1252);
    expect(rows[0].text).toBe('Aåäö Café');
    expect(rows[0].text).not.toContain('�');
  });
});

// ── The shape a real Swedbank export turned out to have ────────────────────
//
// Found by running an actual statement through this module, which is the only
// way these get found. Twelve columns, three of them dates and two of them
// descriptions, a one-line preamble above the header, CRLF, comma-separated
// with dot decimals, and Windows-1252 encoding.

describe('a twelve-column export with two description columns', () => {
  const header = [
    'Radnummer', 'Clearingnummer', 'Kontonummer', 'Produkt', 'Valuta',
    'Bokföringsdag', 'Transaktionsdag', 'Valutadag',
    'Referens', 'Beskrivning', 'Belopp', 'Bokfört saldo',
  ];
  const sample = [
    ['1', '83279', '9033929762', 'Privatkonto', 'SEK', '2026-08-31', '2026-08-31', '2026-08-30', 'TEMPO', 'TEMPO', '-23.66', '8475.17'],
    ['2', '83279', '9033929762', 'Privatkonto', 'SEK', '2026-08-24', '2026-08-25', '2026-08-25', '', 'Lön', '32596.00', '33652.45'],
  ];

  it('prefers the description over the reference', () => {
    // They agree on most rows — but the salary row has an EMPTY Referens and
    // "Lön" in Beskrivning. Taking the first matching column imported the most
    // important transaction of the month with no text at all.
    const { roles } = guessColumns(header, sample);
    expect(roles[8]).not.toBe('text');
    expect(roles[9]).toBe('text');
  });

  it('takes the TRANSACTION date, not the booking date', () => {
    // Reversed on evidence, and this exact sample row is the evidence. Three
    // columns qualify. The bank BOOKS a salary on the evening of the 24th so
    // the money is there on payday the 25th — so Bokföringsdag says 24 and
    // Transaktionsdag says 25.
    //
    // On the real statement this row came from, 50 of 107 rows had the two
    // dates disagree, and exactly ONE of them crossed a pay-period boundary:
    // this one. The salary. 32 596 kr, the largest figure of the month, filed
    // one day early and therefore into the previous budget month — which made
    // every plan-versus-actual comparison wrong with nothing on screen to
    // explain why.
    //
    // The day the money moved for the user beats the day the bank wrote it down.
    const { roles } = guessColumns(header, sample);
    expect(roles[6]).toBe('date');
    expect(roles[5]).toBe('skip');
    expect(roles[7]).toBe('skip');
  });

  it('still finds a date when the file offers only a booking day', () => {
    // Most banks outside the Nordics print one date column and call it
    // whatever they like. The tiers must not make the plain case worse.
    const only = ['Buchungstag', 'Verwendungszweck', 'Betrag'];
    const rows = [['31.08.2026', 'LIDL', '-23,66']];
    expect(guessColumns(only, rows).roles[0]).toBe('date');
    expect(guessColumns(['Datum', 'Text', 'Belopp'], [['2026-08-31', 'ICA', '-23,66']]).roles[0]).toBe('date');
  });

  it('ignores the row number, account numbers and the running balance', () => {
    // Radnummer counts 1, 2, 3… and parses perfectly well as an amount.
    const { roles } = guessColumns(header, sample);
    expect(roles[0]).toBe('skip');
    expect(roles[1]).toBe('skip');
    expect(roles[2]).toBe('skip');
    expect(roles[11]).toBe('skip');
    expect(roles[10]).toBe('amount');
  });

  it('reads the whole thing end to end, preamble and CRLF included', () => {
    const text =
      '* Transaktioner Period 2026-08-01-2026-08-31\r\n' +
      header.join(',') + '\r\n' +
      sample.map(r => r.map(c => (c === 'Privatkonto' ? `"${c}"` : c)).join(',')).join('\r\n') + '\r\n';
    const rows = parseCsv(text, detectDelimiter(text));
    const h = findHeaderRow(rows);
    expect(h).toBe(1);
    const { rows: parsed, skipped } = rowsToParsed(rows.slice(h + 1), guessColumns(rows[h], rows.slice(h + 1)));
    expect(skipped).toEqual([]);
    expect(parsed).toEqual([
      { date: '2026-08-31', text: 'TEMPO', amount: -23.66 },
      // The 25th, not the 24th: the transaction day, which is payday. See the
      // date-tier test above for why this one row matters so much.
      { date: '2026-08-25', text: 'Lön', amount: 32596 },
    ]);
  });
});

describe('groupByText — a hundred rows, thirty decisions', () => {
  const row = (text: string, amount: number) => ({ date: '2026-08-01', text, amount });

  it('collapses repeats onto one place', () => {
    const gs = groupByText([row('ICA', -100), row('SL', -40), row('ICA', -250)], '(utan text)');
    const ica = gs.find(g => g.text === 'ICA')!;
    expect(ica.rows).toHaveLength(2);
    expect(ica.total).toBe(-350);
  });

  it('puts the biggest first, because that is what deserves attention', () => {
    const gs = groupByText([row('Kaffe', -39), row('Hyra', -8801), row('Lunch', -145)], '(utan text)');
    expect(gs.map(g => g.text)).toEqual(['Hyra', 'Lunch', 'Kaffe']);
  });

  it('marks a group as incoming when the money came in', () => {
    const gs = groupByText([row('Lön', 32596), row('ICA', -100)], '(utan text)');
    expect(gs.find(g => g.text === 'Lön')!.incoming).toBe(true);
    expect(gs.find(g => g.text === 'ICA')!.incoming).toBe(false);
  });

  it('keeps a refund separate from purchases at the same place', () => {
    const gs = groupByText([row('ICA', -100), row('ICA', 20)], '(utan text)');
    expect(gs).toHaveLength(2);
    expect(gs.map(g => ({ total: g.total, incoming: g.incoming })))
      .toEqual([{ total: -100, incoming: false }, { total: 20, incoming: true }]);
  });

  it('gives rows with no description somewhere to go', () => {
    // A statement can carry them, and dropping them would lose real money.
    const gs = groupByText([row('', -60)], '(utan text)');
    expect(gs[0].text).toBe('(utan text)');
    expect(gs[0].rows).toHaveLength(1);
  });
});

describe('which way round a file writes its dates', () => {
  it('settles it from a day above the twelfth', () => {
    expect(detectDateOrder(['31/12/2026', '05/01/2026'])).toBe('dmy');
  });

  it('settles it from a month that cannot exist', () => {
    // Chase writes MM/DD/YYYY. One row above the 12th in second place decides.
    expect(detectDateOrder(['09/05/2026', '08/31/2026'])).toBe('mdy');
  });

  it('says ambiguous when nothing in the column decides', () => {
    // Every American statement covering a single half-month looks like this,
    // and so does every European one. Guessing is the wrong answer.
    expect(detectDateOrder(['09/05/2026', '07/03/2026'])).toBe('ambiguous');
    expect(detectDateOrder([])).toBe('ambiguous');
  });

  it('says ambiguous rather than pick a side when the column contradicts itself', () => {
    expect(detectDateOrder(['31/12/2026', '12/31/2026'])).toBe('ambiguous');
  });

  it('ignores ISO dates, which have no ambiguity to settle', () => {
    expect(detectDateOrder(['2026-08-31', '2026-09-01'])).toBe('ambiguous');
  });

  it('reads the same string two different real ways', () => {
    // The whole reason this exists. Both are real days in real months, and
    // nothing about the row says which — so nothing about the row can warn you.
    expect(parseDate('09/05/2026', 'dmy')).toBe('2026-05-09');
    expect(parseDate('09/05/2026', 'mdy')).toBe('2026-09-05');
  });

  it('applies the order to the two-digit year form too', () => {
    expect(parseDate('09/05/26', 'mdy')).toBe('2026-09-05');
    expect(parseDate('09/05/26', 'dmy')).toBe('2026-05-09');
  });

  it('leaves ISO alone whatever the order says', () => {
    expect(parseDate('2026-08-31', 'mdy')).toBe('2026-08-31');
  });

  it('still refuses an impossible date under either reading', () => {
    expect(parseDate('31/12/2026', 'mdy')).toBeNull();   // month 31
    expect(parseDate('12/31/2026', 'dmy')).toBeNull();   // month 31
  });

  it('hands the order back with the columns, and flags a guess', () => {
    const header = ['Transaction Date', 'Description', 'Amount'];
    const american = [['09/05/2026', 'WHOLE FOODS', '-84.21'], ['08/31/2026', 'CHEVRON', '-52.40']];
    const got = guessColumns(header, american);
    expect(got.dateOrder).toBe('mdy');
    expect(got.dateOrderGuessed).toBe(false);

    const undecidable = [['09/05/2026', 'WHOLE FOODS', '-84.21']];
    const guess = guessColumns(header, undecidable);
    expect(guess.dateOrder).toBe('dmy');
    expect(guess.dateOrderGuessed).toBe(true);
  });

  it('reads an American file correctly end to end', () => {
    const header = ['Transaction Date', 'Post Date', 'Description', 'Category', 'Type', 'Amount'];
    const body = [
      ['09/05/2026', '09/06/2026', 'WHOLE FOODS MKT #123', 'Groceries', 'Sale', '-84.21'],
      ['08/31/2026', '09/01/2026', 'CHEVRON 00201234', 'Gas', 'Sale', '-52.40'],
    ];
    const map = guessColumns(header, body);
    expect(map.roles[0]).toBe('date');      // Transaction Date, not Post Date
    expect(map.roles[2]).toBe('text');      // Description, not Category
    const { rows } = rowsToParsed(body, map);
    expect(rows[0].date).toBe('2026-09-05');
    expect(rows[1].date).toBe('2026-08-31');
  });
});

describe('a file that brought no column names', () => {
  // Wells Fargo exports none. The header search then settles on the first DATA
  // row, which costs that transaction silently — never parsed, never reported.
  const rows = [
    ['09/05/2026', '-84.21', '*', '', 'WHOLE FOODS MKT 123'],
    ['09/03/2026', '-52.40', '*', '', 'CHEVRON 00201234'],
    ['09/01/2026', '3200.00', '*', '', 'PAYROLL'],
  ];

  it('knows a row of data when it sees one', () => {
    expect(looksLikeData(rows[0])).toBe(true);
    expect(looksLikeData(['Bokföringsdag', 'Beskrivning', 'Belopp'])).toBe(false);
    expect(looksLikeData(['Transaction Date', 'Description', 'Amount'])).toBe(false);
  });

  it('gives the columns placeholder names to stand in for the missing ones', () => {
    expect(placeholderHeader(3)).toEqual(['#1', '#2', '#3']);
  });

  it('keeps every row when there is no header to lose one to', () => {
    const header = placeholderHeader(rows[0].length);
    const map = guessColumns(header, rows);
    const { rows: parsed, skipped } = rowsToParsed(rows, map);
    expect(skipped).toEqual([]);
    expect(parsed).toHaveLength(3);
    expect(parsed.map(r => r.text)).toEqual([
      'WHOLE FOODS MKT 123', 'CHEVRON 00201234', 'PAYROLL',
    ]);
  });
});

describe('the order is only a question when the file could mean either', () => {
  it('does not call an ISO column a guess', () => {
    // 2026-08-31 has no second reading. Warning about it on every Swedish
    // import is how a real warning stops being read.
    const got = guessColumns(['Bokföringsdag', 'Beskrivning', 'Belopp'],
      [['2026-08-31', 'ICA', '-23,66']]);
    expect(got.dateOrderGuessed).toBe(false);
  });

  it('does call an undecidable slashed column a guess', () => {
    const got = guessColumns(['Date', 'Description', 'Amount'],
      [['09/05/2026', 'WHOLE FOODS', '-84.21']]);
    expect(got.dateOrderGuessed).toBe(true);
  });
});

// ── Buggy sweep 2026-09-19 ─────────────────────────────────────────────────

describe('the decimal point is decided by punctuation, not by nationality (finding 4)', () => {
  it('reads an American thousands comma at full value', () => {
    // This returned 1.23456 — a thousandfold error, silent, and carried into
    // the duplicate fingerprint so a corrected re-import would not replace it.
    expect(parseAmount('1,234.56')).toBe(1234.56);
    expect(parseAmount('-1,234.56')).toBe(-1234.56);
    expect(parseAmount('3,500.00')).toBe(3500);
    expect(parseAmount('1,234,567.89')).toBe(1234567.89);
  });

  it('still reads a European thousands dot', () => {
    expect(parseAmount('1.234,56')).toBe(1234.56);
    expect(parseAmount('-1.234,56')).toBe(-1234.56);
    expect(parseAmount('1.234.567,89')).toBe(1234567.89);
  });

  it('leaves the single-separator readings alone', () => {
    expect(parseAmount('1 234,56')).toBe(1234.56);   // space groups, comma decides
    expect(parseAmount('842,00')).toBe(842);         // comma is Swedish decimal
    expect(parseAmount('1234.56')).toBe(1234.56);    // dot with two digits
    expect(parseAmount('1.234')).toBe(1234);         // dot with three: grouping
    expect(parseAmount('62.10')).toBe(62.1);
  });

  it('still refuses what it cannot read rather than inventing a number', () => {
    expect(parseAmount('ICA 4521 SOLNA')).toBeNull();
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('--5')).toBeNull();
  });
});

describe('the delimiter is the one the rows agree on (finding 5)', () => {
  const swedish = [
    '"Datum";"Text";"Belopp"',
    '"2026-08-03";"ICA SUPERMARKET, SOLNA, SE";"-1 234,56"',
    '"2026-08-04";"HEMKOP";"-210,00"',
  ].join('\n');

  it('is not outvoted by commas inside a quoted description', () => {
    // Two commas in a place name plus the decimal comma used to beat two
    // semicolons, collapsing every row into one field. The dialog then said
    // "no rows we can read" about a perfectly valid statement.
    expect(detectDelimiter(swedish)).toBe(';');
    expect(parseCsv(swedish, detectDelimiter(swedish))[1]).toEqual([
      '2026-08-03', 'ICA SUPERMARKET, SOLNA, SE', '-1 234,56',
    ]);
  });

  it('is not outvoted by commas in an UNQUOTED description either', () => {
    const unquoted = [
      'Datum;Text;Belopp',
      '2026-08-03;ICA SUPERMARKET, SOLNA, SE;-1 234,56',
      '2026-08-04;HEMKOP;-210,00',
    ].join('\n');
    expect(detectDelimiter(unquoted)).toBe(';');
  });

  it('still finds a real comma file', () => {
    const american = [
      'Date,Description,Amount',
      '2026-08-03,WHOLE FOODS MKT,-84.21',
      '2026-08-04,CHEVRON,-52.00',
    ].join('\n');
    expect(detectDelimiter(american)).toBe(',');
  });

  it('still finds tabs', () => {
    const tabbed = ['Datum\tText\tBelopp', '2026-08-03\tICA\t-23,66'].join('\n');
    expect(detectDelimiter(tabbed)).toBe('\t');
  });

  it('an American file survives detection AND parsing together', () => {
    // The two findings compound: the wrong delimiter hid the wrong amount.
    const american = 'Date,Description,Amount\n2026-08-03,RENT,"-1,234.56"';
    const d = detectDelimiter(american);
    const rows = parseCsv(american, d);
    expect(parseAmount(rows[1][2])).toBe(-1234.56);
  });
});
