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
  | 'personligt' | 'fritid' | 'sparande' | 'lan';

export const STANDARD_CATEGORY_IDS: readonly StandardCategoryId[] = [
  'boende', 'mat', 'transport', 'prenumerationer', 'personligt', 'fritid', 'sparande',
  'lan',
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
  // Card terminals that cannot carry Swedish letters substitute these, and the
  // bank passes the damage straight through: "AB GR@NA LUNDS" is Gröna Lund,
  // "@STERT#LJE KIOS" is Östertälje. Verified in the raw bytes of a real
  // statement — 0x40 and 0x23, not a decoding fault of ours. Folded to the same
  // letters ö and ä fold to, so a mangled row matches the rules an intact one
  // would. Only ever affects MATCHING; the text shown is the bank's own.
  //
  // ONLY where a letter follows, because both characters have an ordinary
  // meaning elsewhere: "#" is a number sign on every American descriptor
  // ("WALGREENS #5678"), and "@" separates an address. Standing before a digit
  // or a space they are punctuation, and fall to the rule below.
  s = s.replace(/@(?=[a-zåäöéèêüøæñç])/g, 'o').replace(/#(?=[a-zåäöéèêüøæñç])/g, 'a');
  s = s.replace(/[åäöéèêüøæñç]/g, c => FOLD[c] ?? c);
  // Strip the rail, possibly more than one ("Swish Zettle_*…" happens).
  for (let i = 0; i < 2 && RAILS.test(s); i++) s = s.replace(RAILS, '');
  // Card descriptors use these as glue, not as meaning.
  s = s.replace(/[*_/\\.,;:|()[\]{}#@'"`+&]/g, ' ');
  s = s.replace(/\s-\s/g, ' ').replace(/-/g, ' ');
  // Store and terminal numbers, and phone numbers. Three digits or more, so
  // "7 eleven" and "fitness24seven" keep the digits that are part of the name.
  s = s.replace(/\b\d{3,}\b/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

// ── The built-in lists ─────────────────────────────────────────────────────
//
// Matched on WHOLE WORDS, never on raw substrings: "ul" must not fire inside
// "Superultra", and "sj" must not fire inside "sjukhus". Where two rules both
// match, the longer one wins — which is how "uber eats" beats "uber" without
// depending on the order they happen to be written in here.
//
// Deliberately absent from every list: transfers, withdrawals and person-to-
// person Swish. Those are not places at all — see isTransfer below, which sends
// them to their own bucket instead of guessing a category for them.
//
// ── Nine lists, and they are NOT equally trustworthy ───────────────────────
//
// INTERNATIONAL means the same thing anywhere in Europe and beyond.
//
// SWEDEN was written against a real Swedish statement and measured: 72 of 123
// distinct places on a 471-transaction file, cold. Every entry has been seen in
// a real descriptor, including the mangled ones.
//
// UNITED_STATES and SPAIN were built from research into the largest chains in
// each country, NOT from real statements. The difference matters and is worth
// stating plainly: that Walmart and Mercadona are enormous is a fact anyone can
// check, but HOW A BANK WRITES THEM in a descriptor is not — a US card row may
// read "WAL-MART #1234" or "WM SUPERCENTER", and only a real file would say.
// So these two are a reasonable first guess for a first import, and no more.
// The second import is where the sorter is actually good, because by then it
// has learned from what the user corrected — and that works in any country.
//
// AUSTRALIA, SOUTH_AFRICA, MEXICO, JAPAN and COLOMBIA (2026-09-23) mark each
// entry as one of two kinds, and the difference is the same one as above:
//   V — the exact form was SEEN in a published statement or card record
//       (sources in CLAUDE_CODE_SORTER_FIVE_COUNTRIES_2026-09-23.md).
//   K — a real, large business in that country whose bank text has NOT been
//       seen. Kept only when the name is distinctive and collides with nothing.
// V says how one bank wrote one shop once, not how every bank writes it, and
// neither kind says what was bought.
//
// The rule for what goes in: a NAME, distinctive enough to be safe as a whole
// word. No short or ordinary words — 'dia' is a Spanish supermarket and also
// the Spanish for "day"; 'orange' is a telecom and also a fruit. Those are left
// out, or written in a longer form that cannot be mistaken.

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
  lan: [
    'affirm', 'afterpay', 'klarna',
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
    'grona lund', 'grona lunds', 'liseberg', 'kolmarden', 'skansen', 'furuvik',
    'tom tits', 'teater', 'konsert', 'operan', 'dramaten',
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
  lan: [
    // CSN writes itself several ways, and the bank cuts it at sixteen
    // characters: "CENTRALA STUDIES" is what a real statement showed.
    'csn', 'centrala studies', 'centrala studiestodsnamnden', 'studielan',
    'kronofogden', 'amortering', 'bolan', 'blancolan', 'privatlan',
    'lendo', 'sambla', 'zmarta', 'advisa', 'nordax', 'bluestep', 'marginalen',
    'collector', 'wasa kredit', 'svea ekonomi', 'qliro', 'resurs bank',
    'ikano bank', 'bank norwegian', 'avida', 'thorn',
    'sbab', 'hypoteket', 'landshypotek', 'stabelo',
  ],
};

const UNITED_STATES: Record<StandardCategoryId, string[]> = {
  mat: [
    'walmart', 'wal mart', 'kroger', 'safeway', 'albertsons', 'publix',
    'wegmans', 'h e b', 'meijer', 'winco', 'food lion', 'giant eagle',
    'harris teeter', 'sprouts', 'trader joe', 'whole foods', 'costco',
    'sams club', 'piggly wiggly', 'hy vee', 'ralphs', 'vons', 'fred meyer',
    'king soopers', 'shoprite', 'stop shop', 'wawa', 'sheetz', 'quiktrip',
    'dollar general', 'family dollar', 'dollar tree',
    'chipotle', 'panera', 'chick fil a', 'taco bell', 'wendys', 'popeyes',
    'dunkin', 'sonic drive', 'five guys', 'shake shack', 'olive garden',
    'applebees', 'dennys', 'ihop', 'cracker barrel', 'buffalo wild',
    'texas roadhouse', 'in n out', 'whataburger', 'jimmy johns',
    'panda express', 'raising canes', 'culvers', 'arbys', 'jack in the box',
    'del taco', 'papa johns', 'little caesars', 'wingstop', 'red lobster',
    'cheesecake factory', 'outback', 'chilis',
    'dutch bros', 'peets coffee', 'caribou coffee',
    'doordash', 'grubhub', 'instacart', 'postmates', 'seamless',
  ],
  transport: [
    'lyft', 'chevron', 'exxon', 'mobil', 'texaco', 'marathon', 'speedway',
    'sunoco', 'valero', 'citgo', 'arco', 'phillips 66', 'racetrac',
    'pilot flying', 'loves travel',
    'autozone', 'oreilly auto', 'advance auto', 'jiffy lube', 'discount tire',
    'amtrak', 'greyhound', 'caltrain', 'njtransit', 'metrocard',
    'e zpass', 'ezpass', 'sunpass', 'fastrak', 'parkmobile', 'spothero',
  ],
  boende: [
    'home depot', 'lowes', 'ace hardware', 'menards', 'bed bath', 'wayfair',
    'pottery barn', 'crate barrel', 'west elm', 'sherwin williams',
    'comcast', 'xfinity', 'spectrum', 'cox communications',
    'duke energy', 'con edison', 'national grid', 'dominion energy',
    'xcel energy', 'georgia power', 'ameren', 'entergy',
    'geico', 'state farm', 'allstate', 'usaa', 'liberty mutual',
  ],
  prenumerationer: [
    'verizon', 'at t', 't mobile', 'mint mobile', 'cricket wireless',
    'boost mobile', 'xfinity mobile',
    'hulu', 'peacock', 'paramount plus', 'espn plus', 'sirius xm', 'siriusxm',
    'new york times', 'nytimes', 'washington post',
    'planet fitness', 'la fitness', 'equinox', 'orangetheory',
    'crunch fitness', 'anytime fitness',
  ],
  personligt: [
    'walgreens', 'cvs', 'rite aid', 'ulta beauty', 'bath body works',
    'victorias secret', 'macys', 'nordstrom', 'kohls', 'jcpenney',
    'tj maxx', 'marshalls', 'ross stores', 'old navy', 'banana republic',
    'american eagle', 'abercrombie', 'lululemon',
    'quest diagnostics', 'labcorp',
  ],
  fritid: [
    'best buy', 'gamestop', 'barnes noble', 'dicks sporting', 'rei',
    'bass pro', 'cabelas', 'academy sports', 'michaels', 'hobby lobby',
    'joann', 'petco', 'petsmart', 'chewy',
    'amc theatres', 'regal cinemas', 'cinemark', 'stubhub',
    'six flags', 'cedar point', 'universal studios',
    'hyatt', 'wyndham', 'holiday inn', 'best western',
    'delta air', 'american airlines', 'united airlines', 'southwest airlines',
    'jetblue', 'alaska airlines', 'spirit airlines', 'frontier airlines',
    'priceline', 'vrbo', 'tripadvisor',
  ],
  sparande: [
    'fidelity', 'vanguard', 'charles schwab', 'robinhood', 'e trade', 'etrade',
    'td ameritrade', 'wealthfront', 'betterment', 'acorns',
  ],
  lan: [
    'sallie mae', 'navient', 'nelnet', 'mohela', 'great lakes',
    'lendingclub', 'upstart', 'oportun', 'avant',
  ],
};

const SPAIN: Record<StandardCategoryId, string[]> = {
  mat: [
    'mercadona', 'eroski', 'consum', 'alcampo', 'ahorramas', 'bonarea',
    'gadis', 'froiz', 'condis', 'caprabo', 'masymas', 'coviran',
    'hipercor', 'supercor', 'family cash',
    'telepizza', '100 montaditos', 'cien montaditos', 'goiko', 'rodilla',
    'pans company', 'foster hollywood', 'ginos', 'la tagliatella',
    'restaurante', 'cafeteria', 'panaderia', 'pasteleria', 'churreria',
    'marisqueria', 'cerveceria',
  ],
  transport: [
    'renfe', 'alsa', 'avanza bus', 'cabify',
    'metro madrid', 'metro bilbao', 'metro valencia',
    'repsol', 'cepsa', 'galp', 'petronor', 'ballenoil', 'plenoil',
    'aena', 'autopista', 'telepeaje', 'parkimeter', 'elparking',
  ],
  boende: [
    'iberdrola', 'endesa', 'naturgy', 'holaluz', 'som energia',
    'totalenergies', 'aqualia', 'canal isabel', 'emasesa',
    'bricomart', 'conforama', 'maisons du monde',
    'mapfre', 'mutua madrilena', 'axa', 'linea directa', 'verti',
    'generali', 'zurich seguros', 'catalana occidente', 'santalucia',
  ],
  prenumerationer: [
    'movistar', 'vodafone', 'yoigo', 'masmovil', 'pepephone', 'jazztel',
    'lowi', 'finetwork', 'simyo', 'orange espagne',
    'filmin', 'movistar plus', 'dazn',
    'basic fit', 'altafit', 'viva gym', 'synergym', 'gimnasio',
  ],
  personligt: [
    'primor', 'druni', 'perfumeria', 'farmacia', 'clinica dental',
    'sanitas', 'adeslas', 'dkv seguros', 'asisa', 'peluqueria',
    'el corte ingles', 'corte ingles', 'massimo dutti', 'oysho',
    'springfield', 'cortefiel', 'parfois',
  ],
  fritid: [
    'fnac', 'pccomponentes', 'worten', 'cinesa', 'yelmo cines', 'kinepolis',
    'ocine', 'entradas com', 'parque warner', 'portaventura',
    'iberia', 'air europa', 'volotea', 'balearia', 'trasmediterranea',
    'nh hoteles', 'melia', 'barcelo', 'riu hotels',
  ],
  sparande: [
    'myinvestor', 'indexa capital', 'renta 4', 'openbank',
  ],
  lan: [
    'cofidis', 'cetelem', 'wizink', 'younited', 'creditea', 'hipoteca',
  ],
};

const AUSTRALIA: Record<StandardCategoryId, string[]> = {
  // K. "Coles" alone is the supermarket; "Coles Express" is a fuel-station
  // shop, where the name cannot say fuel or food — see NO_OPINION.
  mat: ['coles', 'harris farm', 'red rooster'],
  transport: [],
  boende: [
    'bunnings',               // V: BUNNINGS 551000 WARRINGAH
  ],
  prenumerationer: ['telstra', 'optus'],   // K
  // K. Priceline is also an Australian pharmacy, but in UNITED_STATES it is a
  // travel site — one word cannot mean both, so it is left to the user.
  personligt: ['chemist warehouse'],
  fritid: ['qantas', 'jetstar', 'jb hi fi'],   // K
  sparande: [],
  lan: [],
};

const SOUTH_AFRICA: Record<StandardCategoryId, string[]> = {
  mat: [
    'pnp',                    // V: PNP FAM STAND (Pick n Pay Family)
    'boxer spr',              // V: BOXER SPR STA — a grocer, not Swedish Boxer TV;
                              //    two words, so it beats 'boxer' alone
    'pick n pay', 'boxer superstores', 'checkers', 'usave',   // K
    // 'shoprite' (V: SHOPRITE SCF) is already in UNITED_STATES, same category.
  ],
  transport: [
    'engen',                  // V: ENGEN TUGELA
    'gautrain',               // K
  ],
  boende: ['bradlows'],       // K
  prenumerationer: ['vodacom'],   // K
  personligt: [
    'clicks',                 // V: CLICKS STANDE
    'dis chem',               // K
  ],
  fritid: ['flysafair', 'incredible connection'],   // K
  sparande: [],
  lan: [],
};

const MEXICO: Record<StandardCategoryId, string[]> = {
  mat: [
    'chedraui',               // V: TDAS CHEDRAUI
    'soriana',                // V: SORIANA573 — the store number is welded on;
                              //    see gluedNumber below
    'oxxo',                   // V: OXXOGLORIETA — welded to the place; see GLUED_BRANDS
    'bodega aurrera',         // K
  ],
  transport: ['pemex', 'oxxo gas'],   // K; OXXO GAS is the chain's fuel brand
  boende: [],
  prenumerationer: ['telcel'],        // K
  personligt: [
    'f ahorro',               // V: F AHORRO SAVS V (Farmacias del Ahorro)
    'farmacias del ahorro',   // K
  ],
  fritid: ['cinepolis', 'cinemex', 'volaris'],   // K
  sparande: [],
  lan: [],
};

// Japanese descriptors have no spaces, so these are matched as a run of
// characters rather than as whole words — see JAPANESE_RULES. Latin names that
// appear welded to Japanese text ("KDDIリョウキン") are split off first and then
// matched as ordinary words.
const JAPAN: Record<StandardCategoryId, string[]> = {
  mat: [
    'セブンイレブン',          // V: セブン-イレブン
    'ローソン', 'ファミリーマート',   // K
  ],
  transport: [
    'イデミツ',                // V: イデミツ（アポロ シェル）, with a wide space
    'eneos', 'エネオス',        // K
  ],
  boende: ['ニトリ'],          // K
  prenumerationer: [
    'kddi',                   // V: 6カップン KDDIリョウキン, with a wide space
  ],
  personligt: ['マツモトキヨシ'],   // K
  fritid: [
    'イオンシネマ',             // V: a cinema. There is deliberately no rule for
                              //    イオン alone, so it cannot be read as food.
    'ヨドバシカメラ',           // K
  ],
  sparande: [],
  lan: [],
};

const COLOMBIA: Record<StandardCategoryId, string[]> = {
  mat: [
    // V. Éxito is never a rule by itself: the same statements show
    // "RETIRO ATM MFM EXITO SUBA", a cash withdrawal AT an Éxito.
    'compra nacional exito',  // V: COMPRA NACIONAL EXITO BUCARAMANGA
    'tienda d1',              // V: COMPRA EN TIENDA D1 — "D1" alone is too short
    'carulla',                // K
  ],
  transport: ['terpel'],      // K
  boende: [],
  prenumerationer: ['claro colombia'],   // K; "claro" alone is an ordinary word
  personligt: ['farmatodo'],  // K
  fritid: ['cine colombia', 'avianca'],   // K
  sparande: [],
  lan: [],
};

/** Every list, by name — the tests hold them all to the same rules. */
export const SEED_LISTS = {
  INTERNATIONAL, SWEDEN, UNITED_STATES, SPAIN, AUSTRALIA, SOUTH_AFRICA, MEXICO, JAPAN, COLOMBIA,
} as const;

/** Everything the sorter knows. Exported so a test can hold every list to the
 *  same rule: no place may be claimed by two different categories. */
export const SEED: Record<StandardCategoryId, string[]> = Object.fromEntries(
  STANDARD_CATEGORY_IDS.map(id => [id, Object.values(SEED_LISTS).flatMap(list => list[id])]),
) as Record<StandardCategoryId, string[]>;

export { INTERNATIONAL, SWEDEN, UNITED_STATES, SPAIN, AUSTRALIA, SOUTH_AFRICA, MEXICO, JAPAN, COLOMBIA };

/**
 * Names that must NOT get a suggestion, and must stop a shorter rule from
 * giving one. "Coles Express" is a fuel-station shop: the receipt could be
 * petrol or a sandwich, and 'coles' would otherwise call it groceries.
 * Longest match wins as usual, so these only ever silence something shorter.
 */
const NO_OPINION = ['coles express'];

/** Brands welded to the place they are in ("OXXOGLORIETA"), which no whole-
 *  word rule can reach. Deliberately a short, named list rather than a general
 *  prefix rule: that a word begins with a brand is no evidence on its own, so
 *  each needs a real sighting and its exceptions spelled out. */
const GLUED_BRANDS: { prefix: string; kind: StandardCategoryId; except: string[] }[] = [
  // OXXO GAS, written as one word, is the chain's fuel brand — not a shop.
  { prefix: 'oxxo', kind: 'mat', except: ['oxxogas'] },
];

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

/** Hiragana, katakana (incl. the long-vowel mark) and kanji. */
const JAPANESE = /[\u3005\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/;

/** The word list, flattened once and ordered so the most specific rule wins.
 *  A null kind is a NO_OPINION entry: it wins like any rule, and says nothing. */
const RULES: { words: string[]; kind: StandardCategoryId | null }[] = [
  ...Object.entries(SEED).flatMap(([kind, patterns]) => patterns
    .filter(p => !JAPANESE.test(p))
    .map(p => ({ words: p.split(' '), kind: kind as StandardCategoryId | null }))),
  ...NO_OPINION.map(p => ({ words: p.split(' '), kind: null })),
].sort((a, b) => b.words.length - a.words.length || b.words.join('').length - a.words.join('').length);

/** Japanese names, matched as a run of characters, longest first. */
const JAPANESE_RULES: { text: string; kind: StandardCategoryId }[] = Object
  .entries(SEED)
  .flatMap(([kind, patterns]) => patterns
    .filter(p => JAPANESE.test(p))
    .map(p => ({ text: p, kind: kind as StandardCategoryId })))
  .sort((a, b) => b.text.length - a.text.length);

/**
 * The words the BUILT-IN list is matched against.
 *
 * Deliberately not normalise() itself. normalise() is also the key a user's
 * correction is stored under, so changing what it returns would quietly detach
 * every correction already made. Everything here only widens what the seed list
 * can recognise:
 *
 *   · NFKC first: fullwidth ＮＥＴＦＬＩＸ and halfwidth ｾﾌﾞﾝ read as their
 *     ordinary forms, and fullwidth brackets become punctuation.
 *   · Accents the fold table does not carry (á í ó ú …) are dropped from LATIN
 *     letters only — decomposing everything would strip the voicing marks off
 *     Japanese kana and turn ブ into フ.
 *   · A Latin run welded to Japanese text is its own word ("kddiリョウキン").
 *   · A store number welded to a name ("soriana573") is dropped; standalone
 *     numbers normalise() already removes.
 */
function matchWords(text: string): string[] {
  const widened = text.normalize('NFKC')
    .replace(/[\u00c0-\u024f]/g, c => c.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  return normalise(widened).split(' ').filter(Boolean)
    .flatMap(w => w.match(/[\u3005\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]+|[^\u3005\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]+/g) ?? [w])
    .map(w => /^([a-z]{4,})\d{3,}$/.exec(w)?.[1] ?? w);
}

/**
 * Whether `needle` appears in `haystack` as a run of whole words.
 *
 * With `cut`, the LAST word of the haystack may also be a PREFIX of the rule
 * word it would have completed. Swedish card descriptors are chopped at
 * sixteen characters — 41 of 123 distinct descriptions on one real statement
 * sat exactly on that ceiling — which routinely leaves a fragment: "Do Re Mi
 * Restaur", "ANTIKA RESTAURAN", "2627705203 Nordn".
 *
 * Deliberately one-directional. The RULE word must start with the fragment,
 * never the other way round, which is what keeps "sl" from matching inside
 * "Slakthusomradet" — the exact failure whole-word matching was introduced to
 * stop. Three characters minimum, and only when the text is long enough to
 * have actually been cut.
 */
function hasWordRun(haystack: string[], needle: string[], cut = false): boolean {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      const have = haystack[i + j];
      const want = needle[j];
      if (have === want) continue;
      const atEndOfBoth = i + j === haystack.length - 1 && j === needle.length - 1;
      if (cut && atEndOfBoth && have.length >= 3 && want.startsWith(have)) continue;
      continue outer;
    }
    return true;
  }
  return false;
}

/** What the built-in list thinks this place is, or undefined if it has no
 *  opinion. No opinion is a valid and common answer. */
export function seedKind(text: string): StandardCategoryId | undefined {
  const words = matchWords(text);
  if (words.length === 0) return undefined;
  // Three passes, weakest last, and each finishes before the next begins.
  // Order is the whole design: a complete word beats a compound, and a compound
  // beats a fragment. Letting them compete was measurably wrong — "Telenor
  // Sverige" became transport because "sverige" is a prefix of "sverigetaxi",
  // and "FORNHOJDENS FRIS" became a gym because "fris" is a prefix of
  // "friskis". Both are exact matches on a better rule, and exact must win.

  // 1. Whole words. A NO_OPINION entry ends the search with no answer.
  for (const rule of RULES) {
    if (hasWordRun(words, rule.words)) return rule.kind ?? undefined;
  }

  // 1b. Japanese names, which are written without spaces. Matched inside the
  // text with the spaces taken out, so "セブン-イレブン" and "セブンイレブン"
  // agree. Longest first: a cinema must not be read as its parent's grocer.
  const joined = words.join('');
  if (JAPANESE.test(joined)) {
    for (const rule of JAPANESE_RULES) {
      if (joined.includes(rule.text)) return rule.kind;
    }
  }

  // 1c. A brand welded to where it is. Only the named ones, and never their
  // listed exceptions — which answer nothing rather than something wrong.
  for (const w of words) {
    const brand = GLUED_BRANDS.find(b => w.startsWith(b.prefix) && w.length >= b.prefix.length + 4);
    if (brand) return brand.except.some(e => w.startsWith(e)) ? undefined : brand.kind;
  }

  // 2. Swedish compounds, which weld the word to the name.
  for (const rule of SUFFIX_RULES) {
    if (words.some(w => w.length > rule.suffix.length && w.endsWith(rule.suffix))) {
      return rule.kind;
    }
  }

  // 3. A last word the bank cut short. Only for text long enough to have hit
  // the sixteen-character ceiling: a short description was not truncated and
  // gets no licence to match loosely.
  if (text.trim().length >= 15) {
    for (const rule of RULES) {
      if (hasWordRun(words, rule.words, true)) return rule.kind ?? undefined;
    }
  }
  return undefined;
}

// ── Rails: moving money, not spending it ───────────────────────────────────

/**
 * Whether a description is a RAIL rather than a place — a transfer between your
 * own accounts, a cash withdrawal, a Swish to or from a person.
 *
 * Kept apart from the category list on purpose, because the honest answer here
 * is not a category at all. Moving 5 000 kr to your own savings account is not
 * spending 5 000 kr, and counting it as an expense inflates a month's outgoings
 * by whatever you happened to shuffle between pockets — on one real statement,
 * 20 485 kr across 75 rows.
 *
 * Matched AFTER normalise, which strips the payment rail's own prefix: "Swish
 * skickad +4670…" arrives here as "skickad". That is why the words below look
 * bare — and it is also what keeps "Swish WAO Church Söder" out, since that
 * normalises to a payee rather than to a verb.
 */
const RAILS_WORDS = [
  'overforing', 'overforingar', 'skickad', 'mottagen', 'uttag', 'insattning',
  'autogiro', 'bankgiro', 'plusgiro', 'egen', 'internetoverforing',
];

/**
 * Rails that need more than one word to be safe. "Retiro" alone is also a
 * park in Madrid and a neighbourhood in Buenos Aires; "retiro atm" is a cash
 * withdrawal, and one at an Éxito ("RETIRO ATM MFM EXITO SUBA") must never be
 * read as groceries. Nequi is a Colombian wallet the user tops up themselves.
 * PSE is NOT here: it names how a bill was paid, not that money only moved.
 */
const RAIL_PHRASES = ['retiro atm', 'retiro cajero', 'transferencia a nequi'].map(p => p.split(' '));

export function isTransfer(text: string): boolean {
  const words = normalise(text).split(' ').filter(Boolean);
  if (words.length === 0) return false;
  return RAILS_WORDS.some(w => words.includes(w))
    || RAIL_PHRASES.some(p => hasWordRun(words, p));
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
