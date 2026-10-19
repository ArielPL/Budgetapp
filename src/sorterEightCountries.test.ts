import { describe, it, expect } from 'vitest';
import { seedKind, suggest, normalise, SEED, SEED_LISTS, STANDARD_CATEGORY_IDS } from './categorise';

// ── The sorter in eight more countries (2026-10-19) ─────────────────────────
//
// Brazil, Portugal, Russia, Turkey, Italy, France, Germany and China, from the
// brief CLAUDE_CODE_SORTER_EIGHT_COUNTRIES_2026-10-18.md. Every name is K —
// confirmed by the company, not yet seen on a bank line — so the rows below
// are CONSTRUCTED, in the shape card descriptors take: name, store number,
// town. The negative rows matter as much: a payment method, a marketplace or
// an ordinary word must not be read as a shop.

describe('one name per country, as a descriptor might carry it', () => {
  it.each([
    ['ASSAI 4521 SAO PAULO', 'mat'],
    ['DROGARIA SÃO PAULO 0231', 'personligt'],
    ['POSTO IPIRANGA 778 CAMPINAS', 'transport'],
    ['PINGO DOCE 102 LISBOA', 'mat'],
    ['VIA VERDE PORTUGAL', 'transport'],
    ['ПЯТЕРОЧКА МОСКВА', 'mat'],
    ['ЯНДЕКС ТАКСИ', 'transport'],
    ['MIGROS 123 ISTANBUL', 'mat'],
    ['ŞOK MARKETLER 4410', 'mat'],
    ['İSPARK OTOPARK', 'transport'],
    ['TÜRK TELEKOM', 'prenumerationer'],
    ['KOÇTAŞ ATAŞEHIR', 'boende'],
    ['TRENITALIA ROMA', 'transport'],
    ["AUTOSTRADE PER L'ITALIA", 'transport'],
    ['ESSELUNGA MILANO', 'mat'],
    ['SNCF CONNECT PARIS', 'transport'],
    ['UGC CINÉ CITÉ LES HALLES', 'fritid'],
    ['DEUTSCHE BAHN BERLIN', 'transport'],
    ['DM DROGERIE MARKT 1234', 'personligt'],
    ['REWE SAGT DANKE', 'mat'],
    ['盒马鲜生上海', 'mat'],
    ['大润发北京', 'mat'],
    ['老百姓大药房上海', 'personligt'],
    ['中国石化加油站 广州', 'transport'],
    ['WATSONS 0123', 'personligt'],
  ])('%s → %s', (text, kind) => {
    expect(seedKind(text)).toBe(kind);
  });
});

describe('spellings a bank may choose', () => {
  it('reads Russian ё and е as the same letter', () => {
    expect(seedKind('ПЯТЁРОЧКА МОСКВА')).toBe('mat');
    expect(seedKind('пятерочка')).toBe('mat');
  });

  it('reads Turkish dotless ı and İ', () => {
    // "ı" has no accent to strip, so matching folds it separately.
    expect(seedKind('ıspark')).toBe('transport');
    expect(seedKind('İSPARK')).toBe('transport');
  });

  it('finds a Chinese name welded to its city, but not half a name', () => {
    expect(seedKind('全家便利店南京路店')).toBe('mat');
    // "全家" is "the whole family"; "万达" and "滴滴" are groups of many businesses.
    for (const text of ['全家', '万达广场', '滴滴出行']) expect(seedKind(text), text).toBeUndefined();
  });

  it('keeps the Japanese names Japanese', () => {
    // Kanji and hanzi share a block; the Chinese names must not steal them.
    expect(seedKind('セブン-イレブン')).toBe('mat');
    expect(seedKind('イオンシネマ')).toBe('fritid');
    expect(seedKind('イオン')).toBeUndefined();
  });
});

describe('the cases the brief warned about', () => {
  it('gives a payment method no category', () => {
    for (const text of ['PIX MARIA', 'MB WAY JOAO', 'ALIPAY', '支付宝', 'WECHAT PAY']) {
      expect(seedKind(text), text).toBeUndefined();
    }
  });

  it('says nothing for ordinary words and bare short names', () => {
    for (const text of ['ORANGE', 'FREE', 'CASINO', 'DM', 'TIM', 'МАГНИТ', 'CONTINENTE', 'GRATIS', 'CULTURA', 'EDF']) {
      expect(seedKind(text), text).toBeUndefined();
    }
  });

  it('lets the long name decide, never a short part of it', () => {
    expect(seedKind('МАГНИТ КОСМЕТИК')).toBe('personligt');
    expect(seedKind('МАГНИТ')).toBeUndefined();
    expect(seedKind('METRO LISBOA')).toBe('transport');
    expect(seedKind('METRO')).toBeUndefined();
    expect(seedKind('BONDINHO PAO DE ACUCAR')).toBeUndefined();
  });

  it('reads CANAL PLUS, not yet CANAL+', () => {
    // normalise() turns "+" into a space, which leaves "canal" — too ordinary a
    // word to be a rule. Waits for a real descriptor.
    expect(seedKind('CANAL PLUS')).toBe('prenumerationer');
    expect(seedKind('CANAL+')).toBeUndefined();
  });

  it('leaves marketplaces that sell everything unsorted', () => {
    for (const text of ['TRENDYOL', 'HEPSIBURADA', 'OZON', 'WILDBERRIES', 'IFOOD', '美团', '京东']) {
      expect(seedKind(text), text).toBeUndefined();
    }
  });
});

describe('what the user has taught still wins', () => {
  it('beats the new built-in rules', () => {
    const existing = new Set(['mat', 'transport', 'fritid']);
    expect(suggest('MIGROS 123 ISTANBUL', existing, { [normalise('MIGROS 123 ISTANBUL')]: 'fritid' }))
      .toEqual({ categoryId: 'fritid' });
    expect(suggest('盒马鲜生上海', existing, { [normalise('盒马鲜生上海')]: 'fritid' }))
      .toEqual({ categoryId: 'fritid' });
  });

  it('stores corrections under the same key as before', () => {
    // ё and ı are folded for the built-in list only.
    expect(normalise('ПЯТЁРОЧКА')).toBe('пятёрочка');
    expect(normalise('ıspark')).toBe('ıspark');
  });
});

describe('the eight lists', () => {
  it('are part of the sorter', () => {
    for (const name of ['BRAZIL', 'PORTUGAL', 'RUSSIA', 'TURKEY', 'ITALY', 'FRANCE', 'GERMANY', 'CHINA'] as const) {
      expect(Object.keys(SEED_LISTS)).toContain(name);
    }
  });

  it('write Russian with е, as the matching reads it', () => {
    const withYo = STANDARD_CATEGORY_IDS.flatMap(id => SEED[id]).filter(p => /ё/.test(p));
    expect(withYo).toEqual([]);
  });
});
