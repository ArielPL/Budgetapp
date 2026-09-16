import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalise, seedKind, suggest, isTransfer, loadCategoryRules, rememberCategoryRule,
  isStandardCategoryId, CATEGORY_RULES_KEY, SEED, INTERNATIONAL, SWEDEN,
  STANDARD_CATEGORY_IDS,
} from './categorise';
import type { StorageLike } from './backup';

const memory = (): StorageLike & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return {
    map,
    get length() { return map.size; },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
  };
};

describe('normalise', () => {
  it('folds the Swedish letters so two encodings agree', () => {
    expect(normalise('TELGE BOSTÄDER')).toBe('telge bostader');
    expect(normalise('Hemköp')).toBe('hemkop');
  });

  it('drops the payment rail so the payee is what is left', () => {
    expect(normalise('Swish WAO Church Söder')).toBe('wao church soder');
    expect(normalise('Zettle_*WE ARE O')).toBe('we are o');
  });

  it('drops a second rail behind the first', () => {
    // Real statements do stack them.
    expect(normalise('Swish Stripe Payments')).toBe('payments');
  });

  it('drops store and phone numbers, so two tills are one shop', () => {
    expect(normalise('Pressbyran 40086')).toBe('pressbyran');
    expect(normalise('Pressbyran 42084')).toBe('pressbyran');
    expect(normalise('Swish skickad +46765652291')).toBe('skickad');
  });

  it('keeps short digit runs that are part of a name', () => {
    expect(normalise('7-Eleven')).toBe('7 eleven');
    expect(normalise('Fitness24Seven')).toBe('fitness24seven');
  });

  it('turns card-descriptor punctuation into separators', () => {
    expect(normalise('ADOBE  *ADOBE')).toBe('adobe adobe');
    expect(normalise('APPLE.COM/BILL')).toBe('apple com bill');
  });
});

describe('the built-in Swedish list', () => {
  it.each([
    ['ICA SUPERMARKET', 'mat'],
    ['TEMPO FORNHOJDEN', 'mat'],
    ['Espresso House S', 'mat'],
    ['HEMKOP HANINGE C', 'mat'],
    ['TOKYO RAMEN', 'mat'],
    ['SL APP', 'transport'],
    ['OKQ8 SODERTALJE', 'transport'],
    ['TELGE BOSTÄDER A', 'boende'],
    ['Telge Nät AB', 'boende'],
    ['IF SKADEFÖRS', 'boende'],
    ['Telenor Sverige', 'prenumerationer'],
    ['ANTHROPIC* CLAUD', 'prenumerationer'],
    ['OPENAI *CHATGPT', 'prenumerationer'],
    ['ADOBE  *ADOBE', 'prenumerationer'],
    ['APPLE.COM/BILL', 'prenumerationer'],
    ['Swish Webhallen AB', 'fritid'],
    ['FILMSTADEN SERG', 'fritid'],
    ['Swish NORDNET BANK AB', 'sparande'],
    ['APOTEK HJÄRTAT', 'personligt'],
    // Added after running a real August statement through the list cold.
    ['CIZGARA GRILL S', 'mat'],
    ['FORNHOJDENS FRIS', 'personligt'],
    ['SÖDERMALMSKYRKAN', 'fritid'],
    ['Swish WAO Church Söder', 'fritid'],
  ])('reads %s as %s', (text, kind) => {
    expect(seedKind(text)).toBe(kind);
  });

  it('lets the more specific rule win regardless of where it is written', () => {
    // Both 'uber' and 'uber eats' match; the longer one decides.
    expect(seedKind('UBER *TRIP')).toBe('transport');
    expect(seedKind('UBER EATS')).toBe('mat');
    // Same shape, different pair.
    expect(seedKind('ICA SUPERMARKET')).toBe('mat');
    expect(seedKind('ICA FÖRSÄKRING')).toBe('boende');
  });

  it('matches whole words, never fragments', () => {
    // 'sl' and 'sj' are real rules and would be a menace as substrings.
    expect(seedKind('SLAKTHUSOMRADET')).toBeUndefined();
    expect(seedKind('SJUKHUSET')).toBeUndefined();
    expect(seedKind('Superultra AB')).toBeUndefined();
  });

  it('has no opinion about a payment rail, on purpose', () => {
    // These are not places. A guess here would invent a fact about the money.
    expect(seedKind('Överföring via internet')).toBeUndefined();
    expect(seedKind('Swish skickad +46765652291')).toBeUndefined();
    expect(seedKind('Uttag')).toBeUndefined();
  });

  it('has no opinion about a shop it does not know', () => {
    expect(seedKind('Zettle_*WE ARE O')).toBeUndefined();
    expect(seedKind('Atreus AB')).toBeUndefined();
    expect(seedKind('NW SODERTALJE CI')).toBeUndefined();
  });

  it('reaches inside a Swedish compound, but only through its ending', () => {
    // The one thing whole words cannot do: "kyrkan" is welded to the parish.
    expect(seedKind('SÖDERMALMSKYRKAN')).toBe('fritid');
    expect(seedKind('Filadelfiaförsamlingen')).toBe('fritid');
    // And the ending that covers every regional transport operator at once.
    expect(seedKind('Västtrafiken')).toBe('transport');
    expect(seedKind('Hallandstrafiken')).toBe('transport');
    // The ending has to be a suffix, not the whole word, or it is just a word
    // rule wearing a disguise.
    expect(seedKind('Kyrka')).toBe('fritid');       // a word rule covers this
    expect(seedKind('Trafiken AB')).toBeUndefined(); // no word rule, no compound
  });

  it('lets a whole-word rule beat an ending', () => {
    // 'friskis svettis' is a gym; 'salong' is an ending. Words are tried first.
    expect(seedKind('FRISKIS SVETTIS SALONG')).toBe('prenumerationer');
  });

  it('will not read a rule out of the middle of a longer word', () => {
    // 'thai' is a real rule. "(PARNTHAI) METHA" is one word that contains it
    // and is not a Thai restaurant as far as anyone can tell from the text.
    expect(seedKind('(PARNTHAI) METHA')).toBeUndefined();
    // 'fris' is a rule; 'friskis' is a gym and must not become a hairdresser.
    expect(seedKind('FRISKIS SVETTIS')).toBe('prenumerationer');
  });

  it('says nothing about an empty description', () => {
    expect(seedKind('')).toBeUndefined();
    expect(seedKind('   ')).toBeUndefined();
  });
});

describe('the two halves of the list', () => {
  const entries = (table: Record<string, string[]>) =>
    Object.entries(table).flatMap(([kind, ps]) => ps.map(p => [p, kind] as const));

  it('no place is claimed by two different categories', () => {
    // The rule that keeps the list honest as it grows. A place in two
    // categories means the answer depends on which one the sort happens to
    // reach first, which is not an answer at all.
    const owner = new Map<string, string>();
    const clashes: string[] = [];
    for (const [pattern, kind] of entries(SEED)) {
      const seen = owner.get(pattern);
      if (seen === undefined) owner.set(pattern, kind);
      else if (seen !== kind) clashes.push(`${pattern}: ${seen} vs ${kind}`);
    }
    expect(clashes, clashes.join('\n')).toHaveLength(0);
  });

  it('is exactly the international half plus the local one', () => {
    for (const id of STANDARD_CATEGORY_IDS) {
      expect(SEED[id]).toEqual([...INTERNATIONAL[id], ...SWEDEN[id]]);
    }
  });

  it('keeps the halves apart — nothing is in both', () => {
    for (const id of STANDARD_CATEGORY_IDS) {
      const local = new Set(SWEDEN[id]);
      expect(INTERNATIONAL[id].filter(p => local.has(p))).toEqual([]);
    }
  });

  it('carries every category in both halves, even if empty', () => {
    for (const id of STANDARD_CATEGORY_IDS) {
      expect(Array.isArray(INTERNATIONAL[id])).toBe(true);
      expect(Array.isArray(SWEDEN[id])).toBe(true);
    }
  });
});

describe('the international half, on statements from elsewhere', () => {
  it.each([
    ['ALDI SUED', 'mat'],
    ['CARREFOUR MARKET', 'mat'],
    ['LIDL DIENSTLEISTUNG', 'mat'],
    ['NETFLIX.COM', 'prenumerationer'],
    ['MEDIAMARKT ONLINE', 'fritid'],
    ['DECATHLON FRANCE', 'fritid'],
    ['RYANAIR DAC', 'fritid'],
    ['IKEA WIEN', 'boende'],
    ['ZALANDO SE', 'personligt'],
    ['UBER *TRIP HELP.UBER.COM', 'transport'],
  ])('reads %s as %s without knowing the country', (text, kind) => {
    expect(seedKind(text)).toBe(kind);
  });

  it('stays quiet about a local shop it has no business knowing', () => {
    // Dutch, Italian, German and Polish grocers. Each is ordinary at home and
    // unknowable from here — they wait for a country list written against a
    // real file, or for the user to say so once.
    expect(seedKind('Albert Heijn 1234')).toBeUndefined();
    expect(seedKind('ESSELUNGA MILANO')).toBeUndefined();
    expect(seedKind('REWE SAGT DANKE')).toBeUndefined();
    expect(seedKind('BIEDRONKA 4521')).toBeUndefined();
  });
});

describe('isStandardCategoryId', () => {
  it('knows the seven', () => {
    expect(isStandardCategoryId('mat')).toBe(true);
    expect(isStandardCategoryId('sparande')).toBe(true);
    expect(isStandardCategoryId('x7f3k1a')).toBe(false);
  });
});

describe('suggest', () => {
  const budget = new Set(['mat', 'transport']);

  it('uses the built-in list when the category is already there', () => {
    expect(suggest('ICA SUPERMARKET', budget, {})).toEqual({ categoryId: 'mat' });
  });

  it('offers to create a standard category the budget lacks', () => {
    expect(suggest('Telenor Sverige', budget, {})).toEqual({ create: 'prenumerationer' });
  });

  it('says nothing when it does not know the place', () => {
    expect(suggest('Zettle_*WE ARE O', budget, {})).toEqual({});
  });

  it('lets what you corrected beat the built-in list', () => {
    // The list says food; the user has filed this one under transport.
    const rules = { 'ica supermarket': 'transport' };
    expect(suggest('ICA SUPERMARKET', budget, rules)).toEqual({ categoryId: 'transport' });
  });

  it('applies a correction to the same shop at another till', () => {
    const rules = { pressbyran: 'transport' };
    expect(suggest('Pressbyran 99999', budget, rules)).toEqual({ categoryId: 'transport' });
  });

  it('turns a correction naming a missing standard category into an offer', () => {
    const rules = { 'cizgara grill s': 'fritid' };
    expect(suggest('CIZGARA GRILL S', budget, rules)).toEqual({ create: 'fritid' });
  });

  it('waits rather than reassigning when a correction names a category that is gone', () => {
    // One of the user's own categories, since deleted. Silently choosing
    // something else would be worse than asking again.
    const rules = { 'cizgara grill s': 'x7f3k1a' };
    expect(suggest('CIZGARA GRILL S', budget, rules)).toEqual({});
  });
});

describe('remembering corrections', () => {
  let store: ReturnType<typeof memory>;
  beforeEach(() => { store = memory(); });

  it('starts with nothing', () => {
    expect(loadCategoryRules(store)).toEqual({});
  });

  it('stores a correction under the normalised description', () => {
    rememberCategoryRule(store, 'Pressbyran 40086', 'mat');
    expect(loadCategoryRules(store)).toEqual({ pressbyran: 'mat' });
  });

  it('returns the rules as they now stand, so a caller need not re-read', () => {
    const after = rememberCategoryRule(store, 'ICA SUPERMARKET', 'mat');
    expect(after).toEqual({ 'ica supermarket': 'mat' });
    const later = rememberCategoryRule(store, 'SL APP', 'transport', after);
    expect(later).toEqual({ 'ica supermarket': 'mat', 'sl app': 'transport' });
  });

  it('lets a later correction replace an earlier one', () => {
    rememberCategoryRule(store, 'ICA SUPERMARKET', 'mat');
    rememberCategoryRule(store, 'ICA SUPERMARKET', 'personligt');
    expect(loadCategoryRules(store)).toEqual({ 'ica supermarket': 'personligt' });
  });

  it('ignores a description that normalises to nothing', () => {
    rememberCategoryRule(store, '  *** ', 'mat');
    expect(loadCategoryRules(store)).toEqual({});
  });

  it('reads corrupt storage as no rules rather than throwing', () => {
    store.setItem(CATEGORY_RULES_KEY, '{not json');
    expect(loadCategoryRules(store)).toEqual({});
  });

  it('ignores a stored value of the wrong shape', () => {
    store.setItem(CATEGORY_RULES_KEY, JSON.stringify({ ica: 42 }));
    expect(loadCategoryRules(store)).toEqual({});
  });

  it('survives storage refusing the write', () => {
    const full: StorageLike = {
      ...store,
      setItem: () => { throw new DOMException('quota', 'QuotaExceededError'); },
    };
    // A rule that cannot be stored is a convenience lost, never data lost.
    expect(() => rememberCategoryRule(full, 'ICA', 'mat')).not.toThrow();
  });
});

describe('descriptions the bank cut short', () => {
  // Swedish card descriptors stop at sixteen characters. On one real statement
  // 41 of 123 distinct descriptions sat exactly on that ceiling, so the last
  // word is routinely a fragment of the word that would have identified it.
  it.each([
    ['Do Re Mi Restaur', 'mat'],
    ['ANTIKA RESTAURAN', 'mat'],
    ['NYA BLIXTENS PIZ', 'mat'],
    ['2627705203 Nordn', 'sparande'],
  ])('reads %s as %s', (text, kind) => {
    expect(seedKind(text)).toBe(kind);
  });

  it('never lets a fragment beat a whole word', () => {
    // Measured regressions from the first attempt, kept as tests. "sverige" is
    // a prefix of "sverigetaxi" and "fris" of "friskis" — but both texts match
    // a better rule outright, and an exact match must always win.
    expect(seedKind('Telenor Sverige')).toBe('prenumerationer');
    expect(seedKind('FORNHOJDENS FRIS')).toBe('personligt');
    expect(seedKind('UBER *TRIP HELP.UBER.COM')).toBe('transport');
  });

  it('will not match a fragment the other way round', () => {
    // The rule must start with the fragment, never the fragment with the rule.
    // "sl" inside "Slakthusomradet" is the exact failure whole words fixed.
    expect(seedKind('SLAKTHUSOMRADET')).toBeUndefined();
    expect(seedKind('SJUKHUSET I LUND')).toBeUndefined();
  });

  it('gives short text no licence to match loosely', () => {
    // 14 characters: not truncated, so no prefix matching. "Nordn" alone is
    // not enough to call something a savings account.
    expect(seedKind('Nordn AB')).toBeUndefined();
  });

  it('needs at least three characters of the fragment', () => {
    expect(seedKind('EN MYCKET LANG P')).toBeUndefined();
  });
});

describe('letters a card terminal could not carry', () => {
  // Verified in the raw bytes of a real statement: 0x40 and 0x23, written by
  // the bank itself. Not a decoding fault — the terminal substituted them.
  it('reads @ as ö and # as ä', () => {
    expect(normalise('AB GR@NA LUNDS')).toBe('ab grona lunds');
    expect(normalise('@STERT#LJE KIOS')).toBe('ostertalje kios');
    expect(normalise('BERLIN D@NER SV')).toBe('berlin doner sv');
  });

  it('lets a mangled row match the rule an intact one would', () => {
    expect(seedKind('AB GR@NA LUNDS')).toBe(seedKind('AB GRÖNA LUNDS'));
    expect(seedKind('AB GR@NA LUNDS')).toBe('fritid');
  });
});

describe('isTransfer — moving money is not spending it', () => {
  it.each([
    'Överföring via internet',
    'ÖVERFÖRING',
    'Swish skickad +46765652291',
    'Swish mottagen +46764422514',
    'Uttag',
    'Insättning',
    'Autogiro Vattenfall',
  ])('knows %s is a rail', (text) => {
    expect(isTransfer(text)).toBe(true);
  });

  it.each([
    'Swish WAO Church Söder',
    'Swish NORDNET BANK AB',
    'Swish Webhallen AB',
    'ICA SUPERMARKET',
    'Zettle_*WE ARE O',
    'TELGE BOSTÄDER A',
  ])('knows %s is a place, not a rail', (text) => {
    expect(isTransfer(text)).toBe(false);
  });

  it('is the reason a payee survives the Swish prefix', () => {
    // normalise strips the rail's own prefix, so a generic Swish row keeps
    // only a verb while a real payee keeps a name. That is what separates
    // "Swish skickad" from "Swish WAO Church Söder".
    expect(normalise('Swish skickad +46765652291')).toBe('skickad');
    expect(normalise('Swish WAO Church Söder')).toBe('wao church soder');
  });

  it('says nothing about empty text', () => {
    expect(isTransfer('')).toBe(false);
    expect(isTransfer('   ')).toBe(false);
  });

  it('matches whole words, so a place is not swept up by one', () => {
    // 'egen' is a rail word. "Egenföretagarna AB" is not a transfer.
    expect(isTransfer('Egenforetagarna AB')).toBe(false);
  });
});
