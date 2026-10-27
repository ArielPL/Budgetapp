import { describe, it, expect } from 'vitest';
import { formatYM, namedMonths, parseModelMonth, resolveMonth } from './months';

// The lab's "today": 21 October 2026. Months are 0-based.
const now = { year: 2026, month: 9 };
const past = (raw: unknown, q: string) => { const r = resolveMonth(raw, q, now, 'past'); return r && formatYM(r); };
const by = (raw: unknown, q: string) => { const r = resolveMonth(raw, q, now, 'deadline'); return r && formatYM(r); };

describe('namedMonths', () => {
  it.each([
    ['Gick jag över budgeten i juni?', 5],
    ['How much by June?', 5],
    ['¿Cuánto para junio?', 5],
    ['Quanto entro giugno?', 5],
    ['Combien pour août ?', 7],
    ['Quanto até março?', 2],
    ['Wie viel bis März?', 2],
    ['Сколько нужно к июню?', 5],
    ['Я превысил бюджет в мае?', 4],
    ['Nisana kadar 20.000 ₺', 3],
    ['Haziranda bütçemi aştım mı?', 5],
    ["Mart'a kadar ne kadar?", 2],
    ['Mayısa kadar 30.000 ₺', 4],
    ['六月我超预算了吗？', 5],
    ['要在6月前存够1万元', 5],
    ['十二月花了多少？', 11],
    ['６月までに10万円', 5],
  ])('%s', (q, m) => {
    expect(namedMonths(q).months).toEqual([m]);
  });

  it('reads holidays as December, and the Spring Festival as February', () => {
    for (const q of ['Hur mycket till jul?', 'by Christmas', 'para Navidad', 'à Noël', 'bis Weihnachten',
      'к Новому году', 'Yılbaşına kadar', '年末までに', '年底前', 'till nyår']) {
      expect(namedMonths(q)).toEqual({ months: [11], holiday: true });
    }
    expect(namedMonths('春节前我想存够3,000元').months).toEqual([1]);
  });

  it('does not take a number of months, a weekday or a name for a month', () => {
    for (const q of ['この3か月で交通費は？', '最近三个月交通花了多少？', 'Hur mycket i juli?']) {
      expect(namedMonths(q).months).not.toContain(2);
    }
    expect(namedMonths('El martes gasté 20 €').months).toEqual([]);
    expect(namedMonths('Martin owes me').months).toEqual([]);
    expect(namedMonths('May I save more?').months).toEqual([]);
    expect(namedMonths('What did I spend in May?').months).toEqual([4]);
    expect(namedMonths('Hur mycket la jag i juli?').months).toEqual([6]);
  });

  it('names nothing when there are two months', () => {
    expect(namedMonths('från juni till augusti').months).toHaveLength(2);
  });
});

describe('parseModelMonth', () => {
  it('reads YYYY-MM and the words the model writes instead', () => {
    expect(parseModelMonth('2026-06', now)).toEqual({ year: 2026, month: 5 });
    expect(parseModelMonth('this_month', now)).toEqual(now);
    expect(parseModelMonth('last_month', now)).toEqual({ year: 2026, month: 8 });
    expect(parseModelMonth('2026-13', now)).toBeNull();
    expect(parseModelMonth('juni', now)).toBeNull();
    expect(parseModelMonth(202606, now)).toBeNull();
  });
});

describe('resolveMonth', () => {
  it('fixes what the lab model got wrong', () => {
    expect(by('2027-09', 'Nisana kadar 20.000 ₺ olması için ayda ne kadar biriktirmeliyim?')).toBe('2027-04');
    expect(by('2027-01', 'Yılbaşına kadar 15.000 ₺ istiyorum, ayda ne kadar?')).toBe('2026-12');
    expect(by('2027-01', 'Хочу 30 000 ₽ к Новому году, сколько в месяц?')).toBe('2026-12');
    expect(past('2026-07', 'Haziranda bütçemi aştım mı?')).toBe('2026-06');
    expect(by('2026-06', '6月までに10万円貯めるには毎月いくら必要？')).toBe('2027-06');
    expect(past('this_month', 'Vart har pengarna tagit vägen den här månaden?')).toBe('2026-10');
  });

  it('a past month is the latest that has begun; a deadline the next to come', () => {
    expect(past(undefined, 'Höll jag budgeten i november?')).toBe('2025-11');
    expect(past(undefined, 'Höll jag budgeten i oktober?')).toBe('2026-10');
    expect(by(undefined, 'Spara till oktober')).toBe('2027-10');
    expect(by(undefined, 'Spara till november')).toBe('2026-11');
    expect(by(undefined, 'Spara till mars')).toBe('2027-03');
  });

  it('keeps the year the model chose when it agrees on the month', () => {
    expect(by('2028-06', 'Jag vill ha 50 000 till juni 2028')).toBe('2028-06');
  });

  it('a holiday deadline may be this month', () => {
    expect(formatYM(resolveMonth(undefined, 'till jul', { year: 2026, month: 11 }, 'deadline')!)).toBe('2026-12');
  });

  it('with no month in the question, keeps the model\'s month if it fits, else leaves it open', () => {
    expect(by('2028-10', 'Jag vill ha 50 000 om två år')).toBe('2028-10');
    expect(by('2026-05', 'Jag vill ha 50 000 om två år')).toBeNull();
    expect(past('2027-01', 'Höll jag budgeten förra månaden?')).toBeNull();
    expect(past('nonsense', 'Höll jag budgeten?')).toBeNull();
  });
});
