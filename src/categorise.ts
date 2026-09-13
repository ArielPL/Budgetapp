// ── The sorter ─────────────────────────────────────────────────────────────
//
// What turns 44 empty dropdowns into a handful of decisions. Two halves, and
// the second one is the one that matters in the long run:
//
//   1. A built-in list of Swedish places, below. It is what makes the FIRST
//      import useful — a list that knows ICA is food and SL is transport before
//      it knows anything about you.
//   2. What you have corrected. That is stored per user (see categoryRules.ts)
//      and always beats the built-in list, because you know where your money
//      went and this file is guessing.
//
// There is no model here and nothing is downloaded. It is a lookup table and a
// normaliser, which is the whole reason it can honour the promise in the
// welcome letter: the statement never leaves the device, so neither can the
// sorting of it.

import type { StorageLike } from './backup';

/** The seven categories a fresh budget ships with, by their stable ids. The
 *  ids are stable ACROSS MONTHS, which is what lets an entry filed in August
 *  line up with the same category in September. */
export type StandardCategoryId =
  | 'boende' | 'mat' | 'transport' | 'prenumerationer'
  | 'personligt' | 'fritid' | 'sparande';

export const STANDARD_CATEGORY_IDS: readonly StandardCategoryId[] = [
  'boende', 'mat', 'transport', 'prenumerationer', 'personligt', 'fritid', 'sparande',
];

export function isStandardCategoryId(id: string): id is StandardCategoryId {
  return (STANDARD_CATEGORY_IDS as readonly string[]).includes(id);
}

// ── Normalising a bank's description ───────────────────────────────────────
//
// Banks do not print merchant names, they print card descriptors: store
// numbers, terminal prefixes, stray asterisks, and whatever the acquirer felt
// like. "Pressbyran 40086" and "Pressbyran 42084" are the same shop and have to
// normalise to the same key, or the sorter learns each till separately.

/** Payment rails that prefix the real payee. Stripping them is what turns
 *  "Swish WAO Church Söder" into a church and "Zettle_*WE ARE O" into a shop. */
const RAILS = /^(swish|zettle|izettle|klarna|paypal|sumup|stripe|payex|viva|sqr?|nets)[\s_*]+/;

/** Å Ä Ö and friends, folded so a file written in Windows-1252 and one written
 *  in UTF-8 cannot disagree about what a place is called. */
const FOLD: Record<string, string> = {
  å: 'a', ä: 'a', ö: 'o', é: 'e', è: 'e', ê: 'e', ü: 'u', ø: 'o', æ: 'a', ñ: 'n', ç: 'c',
};

export function normalise(text: string): string {
  let s = text.toLowerCase();
  s = s.replace(/[åäöéèêüøæñç]/g, c => FOLD[c] ?? c);
  // Strip the rail, possibly more than one ("Swish Zettle_*…" happens).
  for (let i = 0; i < 2 && RAILS.test(s); i++) s = s.replace(RAILS, '');
  // Card descriptors use these as glue, not as meaning.
  s = s.replace(/[*_/\\.,;:|()[\]{}#'"`+]/g, ' ');
  s = s.replace(/\s-\s/g, ' ').replace(/-/g, ' ');
  // Store and terminal numbers, and phone numbers. Three digits or more, so
  // "7 eleven" and "fitness24seven" keep the digits that are part of the name.
  s = s.replace(/\b\d{3,}\b/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

// ── The built-in list, in two halves ───────────────────────────────────────
//
// Matched on WHOLE WORDS, never on raw substrings: "ul" must not fire inside
// "Superultra", and "sj" must not fire inside "sjukhus". Where two rules both
// match, the longer one wins — which is how "uber eats" beats "uber" without
// depending on the order they happen to be written in here.
//
// Deliberately absent from both halves: "Överföring via internet", "Swish
// skickad", "Uttag", "Kortköp". Those are rails, not places. Guessing at them
// would be inventing a fact about your money, and a wrong category costs more
// than an empty one.
//
// INTERNATIONAL is the half that means the same thing anywhere in Europe.
// Every line in it can be checked without living in the country, which is
// exactly why it is separated: it is the half that can grow honestly. A German
// or Dutch statement is already part-sorted by it today.
//
// SWEDEN is the local half — grocers, transport authorities, landlords, energy
// companies, insurers, pharmacies. It could only be written because a real
// Swedish statement was there to measure against (28 of 44 places, cold).
//
// That is the rule for every country that follows: a list is added when there
// is a real file from a real person to check it against, never from memory.
// A wrong entry is worse than a missing one, and the sorter learns your own
// corrections anyway — by the second statement it is at 44 of 44 whatever
// country you are in. The built-in list only ever improves the FIRST import.
//
// Splitting them also makes the next step mechanical: one file per country,
// loaded on demand. Today both ship together, which costs about 2 kB.

const INTERNATIONAL: Record<StandardCategoryId, string[]> = {
  mat: [
    'lidl', 'aldi', 'netto', 'spar', 'carrefour',
    'mcdonalds', 'burger king', 'subway', 'kfc', 'dominos', 'pizza hut',
    'starbucks', 'costa coffee', 'vapiano',
    'pizzeria', 'pizza', 'sushi', 'restaurant', 'kebab', 'thai', 'ramen',
    'grill', 'bistro', 'street food', 'food truck', 'cafe',
    'foodora', 'uber eats', 'wolt', 'deliveroo', 'just eat', 'glovo', 'bolt food',
    '7 eleven', 'seven eleven',
  ],
  transport: [
    'uber', 'bolt', 'free now', 'taxi',
    'voi', 'tier', 'lime', 'bird', 'dott',
    'flixbus', 'blablacar',
    'shell', 'circle k', 'st1', 'bp', 'esso', 'total',
    'easypark', 'q park', 'apcoa',
  ],
  boende: [
    'ikea', 'jysk', 'bauhaus', 'hornbach', 'obi', 'leroy merlin',
    'vattenfall', 'eon', 'e on', 'fortum', 'engie',
  ],
  prenumerationer: [
    'netflix', 'hbo', 'hbo max', 'disney', 'skyshowtime', 'paramount', 'prime video',
    'spotify', 'tidal', 'deezer', 'youtube', 'youtube premium',
    'storytel', 'audible',
    'apple com bill', 'apple services', 'itunes', 'icloud', 'apple music',
    'google', 'google storage', 'dropbox', 'microsoft', 'office', 'adobe',
    'openai', 'chatgpt', 'anthropic', 'claude', 'github', 'notion', 'canva',
    'figma', 'linkedin', 'duolingo', 'strava', 'headspace', 'calm', 'patreon',
    'nordvpn', 'proton', 'world class',
  ],
  personligt: [
    'hm', 'h m', 'zara', 'mango', 'bershka', 'pull bear', 'stradivarius',
    'uniqlo', 'primark', 'cos', 'monki', 'weekday', 'arket',
    'zalando', 'asos', 'about you', 'shein',
    'sephora', 'rituals', 'the body shop', 'douglas', 'yves rocher',
  ],
  fritid: [
    'steam', 'playstation', 'xbox', 'nintendo', 'epic games', 'blizzard',
    'mediamarkt', 'saturn', 'decathlon', 'intersport', 'toys r us',
    'ticketmaster', 'live nation', 'eventim', 'museum',
    'booking com', 'hotels com', 'airbnb', 'hostel', 'expedia',
    'hotel', 'hilton', 'marriott', 'ibis', 'novotel', 'accor', 'radisson',
    'ryanair', 'easyjet', 'lufthansa', 'klm', 'air france', 'wizz air',
    'vueling', 'eurowings', 'norwegian', 'sas', 'finnair',
    'church', 'unicef', 'wwf',
  ],
  sparande: [
    'coinbase', 'binance', 'kraken', 'trade republic', 'etoro', 'degiro',
    'interactive brokers',
  ],
};

const SWEDEN: Record<StandardCategoryId, string[]> = {
  mat: [
    'ica', 'coop', 'willys', 'hemkop', 'city gross', 'citygross', 'tempo',
    'matoppet', 'mathem', 'matdax', 'matextra', 'ostermalmshallen',
    'pressbyran', 'direkten', 'gooh',
    'espresso house', 'waynes coffee', 'condeco', 'gateau', 'fabrique',
    'brodernas', 'max burgers', 'sibylla', 'olearys', 'bastard burgers',
    'phil s burger', 'taco bar',
    'restaurang', 'salladsbar', 'krog', 'bageri', 'konditori', 'kafe', 'lunch',
    'hungrig', 'picadeli', 'systembolaget',
  ],
  transport: [
    'sl', 'vasttrafik', 'skanetrafiken', 'ostgotatrafiken', 'lanstrafiken',
    'varmlandstrafik', 'ul', 'sormlandstrafiken', 'jlt', 'dintur',
    'sj', 'snalltaget', 'mtr express', 'mtrx', 'vy', 'tagab',
    'taxi stockholm', 'taxi kurir', 'sverigetaxi', 'cabonline',
    'okq8', 'preem', 'ingo', 'tanka', 'qstar',
    'parkster', 'aimo park', 'parkering', 'p bolaget',
    'bilprovningen', 'mekonomen', 'meca', 'autoexperten', 'bilia', 'dackia',
    'trafikverket', 'transportstyrelsen',
  ],
  boende: [
    'hyra', 'bostader', 'bostad', 'fastigheter', 'fastighet', 'hsb',
    'riksbyggen', 'heimstaden', 'willhem', 'stena fastigheter', 'akelius',
    'wallenstam', 'einar mattsson', 'familjebostader', 'svenska bostader',
    'stockholmshem', 'poseidon', 'bostadsbolaget', 'mkb', 'lkf', 'uppsalahem',
    'hyresgastforeningen',
    'goteborg energi', 'ellevio', 'kraftringen', 'tekniska verken', 'jamtkraft',
    'skelleftea kraft', 'telge nat', 'telge energi', 'stockholm exergi',
    'nat ab', 'energi',
    'folksam', 'lansforsakringar', 'if skadefors', 'trygg hansa', 'trygghansa',
    'dina forsakringar', 'moderna forsakringar', 'hedvig', 'ica forsakring',
    'mio', 'em home', 'lagerhaus', 'cervera', 'duka',
    'byggmax', 'k rauta', 'beijer',
  ],
  prenumerationer: [
    'viaplay', 'tv4 play', 'cmore', 'bookbeat', 'nextory', 'readly',
    'sats', 'nordic wellness', 'friskis', 'friskis svettis', 'fitness24seven',
    'actic', 'puls trening', 'gymgrossisten',
    'telenor', 'telia', 'tele2', 'halebop', 'comviq', 'hallon', 'vimla', 'fello',
    'bahnhof', 'bredbandsbolaget', 'ownit', 'boxer', 'chilimobil',
  ],
  personligt: [
    'apotek', 'apoteket', 'apotea', 'kronans apotek', 'lloyds apotek', 'med24',
    'lindex', 'kappahl', 'gina tricot', 'dressmann', 'cubus', 'bik bok',
    'nelly', 'boozt', 'na kd', 'ellos', 'ahlens', 'mq', 'volt', 'jack jones',
    'kicks', 'lyko', 'parfym',
    'frisor', 'fris', 'barberare', 'klippning', 'salong', 'nagelsalong',
    'tandlakare', 'folktandvarden', 'vardcentral', 'capio', 'kry', 'min doktor',
    'naprapat', 'kiropraktor', 'massage', 'sjukvard', 'region',
  ],
  fritid: [
    'filmstaden', 'sf bio', 'biografen', 'bio roy', 'drafthouse',
    'webhallen', 'inet', 'komplett', 'elgiganten', 'netonnet',
    'clas ohlson', 'jula', 'biltema', 'rusta', 'ohlssons',
    'granngarden', 'plantagen', 'blomsterlandet', 'interflora',
    'nortic', 'tickster', 'billetto',
    'grona lund', 'liseberg', 'kolmarden', 'skansen', 'furuvik',
    'teater', 'konsert', 'operan', 'dramaten',
    'bokus', 'adlibris', 'akademibokhandeln', 'pocketshop', 'science fiction',
    'lekia', 'br leksaker',
    'stadium', 'xxl', 'naturkompaniet', 'addnature', 'sportamore',
    'hotell', 'scandic', 'elite hotels', 'first hotel', 'nordic choice',
    'strawberry', 'vandrarhem',
    'ving', 'tui', 'apollo', 'resia', 'fritidsresor',
    'kyrka', 'kyrkan', 'forsamling', 'missionskyrkan', 'pingstkyrkan',
    'equmenia', 'fralsningsarmen', 'stadsmissionen', 'radda barnen',
    'rode korset', 'cancerfonden', 'barncancerfonden', 'hjart lungfonden',
    'lakare utan granser', 'musikhjalpen', 'brostcancerforbundet',
    'swedavia', 'flygbussarna', 'tallink', 'viking line', 'stena line',
  ],
  sparande: [
    'nordnet', 'avanza', 'lysa', 'opti', 'savr', 'sigmastocks', 'fundler',
    'montrose', 'betterwealth', 'safello', 'btcx', 'firi',
    'pensionsmyndigheten', 'amf', 'alecta', 'folksam liv', 'skandia',
    'movestic', 'futur pension', 'spp', 'nordea liv', 'lansforsakringar liv',
  ],
};

/** Both halves, as one table. Exported so a test can hold the two to the same
 *  rule: no place may be claimed by two different categories. */
export const SEED: Record<StandardCategoryId, string[]> = Object.fromEntries(
  STANDARD_CATEGORY_IDS.map(id => [id, [...INTERNATIONAL[id], ...SWEDEN[id]]]),
) as Record<StandardCategoryId, string[]>;

export { INTERNATIONAL, SWEDEN };

/**
 * Endings, for the one thing whole-word matching cannot do: Swedish builds
 * compounds. "Södermalmskyrkan" is one word and no rule can reach the church
 * inside it; "Västtrafiken", "Skånetrafiken" and nineteen more regional
 * operators all end the same way.
 *
 * Deliberately narrow. Every entry is at least six letters and names a kind of
 * business rather than a describing word, because a short or vague ending is
 * exactly how substring matching earned its bad name — 'butiken' would swallow
 * every shop in Sweden and tell you nothing.
 */
const SEED_SUFFIX: Partial<Record<StandardCategoryId, string[]>> = {
  transport: ['trafiken'],
  fritid: ['kyrkan', 'kyrka', 'forsamlingen', 'forsamling'],
  personligt: ['salong', 'apoteket'],
  mat: ['bageri', 'konditori', 'restaurang', 'pizzeria'],
};

const SUFFIX_RULES: { suffix: string; kind: StandardCategoryId }[] = Object
  .entries(SEED_SUFFIX)
  .flatMap(([kind, endings]) =>
    (endings ?? []).map(suffix => ({ suffix, kind: kind as StandardCategoryId })))
  .sort((a, b) => b.suffix.length - a.suffix.length);

/** The list, flattened once and ordered so the most specific rule wins. */
const RULES: { words: string[]; kind: StandardCategoryId }[] = Object
  .entries(SEED)
  .flatMap(([kind, patterns]) =>
    patterns.map(p => ({ words: p.split(' '), kind: kind as StandardCategoryId })))
  .sort((a, b) => b.words.length - a.words.length || b.words.join('').length - a.words.join('').length);

/** Whether `needle` appears in `haystack` as a run of whole words. */
function hasWordRun(haystack: string[], needle: string[]): boolean {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

/** What the built-in list thinks this place is, or undefined if it has no
 *  opinion. No opinion is a valid and common answer. */
export function seedKind(text: string): StandardCategoryId | undefined {
  const words = normalise(text).split(' ').filter(Boolean);
  if (words.length === 0) return undefined;
  for (const rule of RULES) {
    if (hasWordRun(words, rule.words)) return rule.kind;
  }
  // Whole words first, always. Only when none of them matched is a compound
  // worth taking apart, so a real name can never lose to an ending.
  for (const rule of SUFFIX_RULES) {
    if (words.some(w => w.length > rule.suffix.length && w.endsWith(rule.suffix))) {
      return rule.kind;
    }
  }
  return undefined;
}

// ── What the user has taught it ────────────────────────────────────────────

/** Corrections, keyed by normalised description. */
export type LearnedRules = Record<string, string>;

export const CATEGORY_RULES_KEY = 'budget_category_rules';

function isRules(v: unknown): v is LearnedRules {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    && Object.values(v).every(x => typeof x === 'string');
}

export function loadCategoryRules(storage: StorageLike): LearnedRules {
  const raw = storage.getItem(CATEGORY_RULES_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRules(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Remember one choice. Returns the rules as they now stand so a caller can
 *  keep sorting a file without re-reading storage between groups. */
export function rememberCategoryRule(
  storage: StorageLike, text: string, categoryId: string, rules?: LearnedRules,
): LearnedRules {
  const key = normalise(text);
  if (!key) return rules ?? loadCategoryRules(storage);
  const next = { ...(rules ?? loadCategoryRules(storage)), [key]: categoryId };
  try {
    storage.setItem(CATEGORY_RULES_KEY, JSON.stringify(next));
  } catch {
    // A rule that could not be stored is a convenience lost, never data lost —
    // the import itself is written separately and must not fail over this.
  }
  return next;
}

// ── The answer the import asks for ─────────────────────────────────────────

export interface Suggestion {
  /** An existing category on this month's budget. */
  categoryId?: string;
  /** A standard category this place belongs in that the budget does not have
   *  yet — offered as something to create, never created behind your back. */
  create?: StandardCategoryId;
}

/**
 * What to propose for one description.
 *
 * What you have corrected wins over the built-in list, always. A learned rule
 * pointing at a category this month does not have is not thrown away: if it
 * names a standard category it becomes an offer to create it, and if it names
 * one of your own that is gone, the row simply waits for you — a silent
 * reassignment to something else would be worse than asking.
 */
export function suggest(
  text: string, existingIds: ReadonlySet<string>, rules: LearnedRules,
): Suggestion {
  const learned = rules[normalise(text)];
  if (learned) {
    if (existingIds.has(learned)) return { categoryId: learned };
    if (isStandardCategoryId(learned)) return { create: learned };
    return {};
  }
  const kind = seedKind(text);
  if (!kind) return {};
  return existingIds.has(kind) ? { categoryId: kind } : { create: kind };
}
