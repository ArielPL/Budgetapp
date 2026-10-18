import type { BudgetCategory, BudgetRow, MonthData, PlanData, SavingsGoal } from './types';
import { safeSetItem } from './storageWrite';
import type { Lang } from './i18n';
import { MONTHS_SHORT } from './i18n';
import { calculateSavingsMetrics, isRowPeriod, PENSION_CATEGORY_ID } from './metrics';
import type { StorageLike } from './backup';
import { coerceStoredMoney, isValidMoney } from './money';
import { appStorage } from './storage';

export const CATEGORY_COLORS: Record<string, string> = {
  boende: '#6366f1',
  mat: '#f59e0b',
  transport: '#10b981',
  prenumerationer: '#8b5cf6',
  personligt: '#ec4899',
  fritid: '#f97316',
  givande: '#84cc16',
  sparande: '#14b8a6',
  lan: '#f43f5e',
};

export const SAVINGS_COLORS: Record<string, string> = {
  sparkonto: '#22d3ee',
  isk: '#22c55e',
  fonder: '#a78bfa',
  pension: '#fb923c',
};

export const GOAL_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#14b8a6', '#f97316'];

// Palette offered as swatches when adding/editing a custom category
export const CATEGORY_PALETTE = [
  '#6366f1', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#f97316',
  '#14b8a6', '#f43f5e', '#22d3ee', '#22c55e', '#a78bfa', '#fb923c',
];

// Curated emoji set offered when adding/editing a custom category
export const CATEGORY_ICONS = [
  '🏠', '🛒', '🚌', '📱', '👤', '🎯', '💰', '🤲',
  '🎁', '🐶', '🚗', '✈️', '🍽️', '💊', '📚', '🎓',
  '💡', '🏥', '💳', '🎮',
];

// The four default savings categories — power the growth-chart lines and per-id
// structure, so they must always exist and never be deletable.
const DEFAULT_SAVINGS_IDS = ['sparkonto', 'isk', 'fonder', 'pension'] as const;

// Categories that must never be deletable: the one wired to the Plan tab
// (sparande) plus the four fixed savings defaults.
const PROTECTED_CATEGORY_IDS = ['sparande', ...DEFAULT_SAVINGS_IDS] as const;

export function isProtectedCategory(id: string): boolean {
  return (PROTECTED_CATEGORY_IDS as readonly string[]).includes(id);
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 9);
}

// ── Default label dictionary, keyed by language ─────────────────────
type LabelEntry = Record<Lang, string>;

const L = {
  // income
  salary: { sv: 'Lön', en: 'Salary', es: 'Salario', fr: 'Salaire', de: 'Gehalt', it: 'Stipendio', pt: 'Salário', ru: 'Зарплата', tr: 'Maaş', ja: '給与', zh: '工资' },
  sideIncome: { sv: 'Sidoinkomst', en: 'Side income', es: 'Ingreso extra', fr: 'Revenu d\'appoint', de: 'Nebeneinkommen', it: 'Entrate extra', pt: 'Renda extra', ru: 'Подработка', tr: 'Ek gelir', ja: '副収入', zh: '副业收入' },
  // "Benefits? What do you mean?" (tester, 2026-10-17): said plainly, with an example.
  benefits: { sv: 'Bidrag (t.ex. barnbidrag)', en: 'Government benefits', es: 'Ayudas y subsidios', fr: 'Prestations sociales', de: 'Staatliche Leistungen', it: 'Sussidi pubblici', pt: 'Benefícios do governo', ru: 'Пособия', tr: 'Devlet yardımları', ja: '公的給付', zh: '政府补贴' },
  // boende
  boende: { sv: 'Boende', en: 'Housing', es: 'Vivienda', fr: 'Logement', de: 'Wohnen', it: 'Casa', pt: 'Moradia', ru: 'Жильё', tr: 'Konut', ja: '住居', zh: '住房' },
  rent: { sv: 'Hyra/Bolån', en: 'Rent/Mortgage', es: 'Alquiler/Hipoteca', fr: 'Loyer/Prêt immobilier', de: 'Miete/Kredit', it: 'Affitto/mutuo', pt: 'Aluguel/financiamento', ru: 'Аренда/ипотека', tr: 'Kira/konut kredisi', ja: '家賃・住宅ローン', zh: '房租/房贷' },
  electricity: { sv: 'El & Värme', en: 'Electricity & Heating', es: 'Electricidad y calefacción', fr: 'Électricité & chauffage', de: 'Strom & Heizung', it: 'Luce e riscaldamento', pt: 'Luz e gás', ru: 'Электричество и отопление', tr: 'Elektrik ve ısınma', ja: '電気・暖房', zh: '水电暖气' },
  internet: { sv: 'Internet', en: 'Internet', es: 'Internet', fr: 'Internet', de: 'Internet', it: 'Internet', pt: 'Internet', ru: 'Интернет', tr: 'İnternet', ja: 'インターネット', zh: '网络' },
  homeInsurance: { sv: 'Hemförsäkring', en: 'Home insurance', es: 'Seguro de hogar', fr: 'Assurance habitation', de: 'Hausratversicherung', it: 'Assicurazione casa', pt: 'Seguro residencial', ru: 'Страхование жилья', tr: 'Konut sigortası', ja: '住宅保険', zh: '家庭保险' },
  // mat
  mat: { sv: 'Mat & Dryck', en: 'Food & Drink', es: 'Comida y bebida', fr: 'Alimentation', de: 'Essen & Trinken', it: 'Cibo e bevande', pt: 'Alimentação', ru: 'Еда и напитки', tr: 'Yiyecek ve içecek', ja: '食費', zh: '餐饮' },
  groceries: { sv: 'Matvaror', en: 'Groceries', es: 'Comestibles', fr: 'Courses', de: 'Lebensmittel', it: 'Spesa', pt: 'Mercado', ru: 'Продукты', tr: 'Market', ja: '食料品', zh: '日用食品' },
  restaurant: { sv: 'Restaurang & Takeaway', en: 'Restaurant & Takeaway', es: 'Restaurante y comida para llevar', fr: 'Restaurant & à emporter', de: 'Restaurant & Takeaway', it: 'Ristoranti e asporto', pt: 'Restaurantes e delivery', ru: 'Рестораны и доставка', tr: 'Restoran ve paket servis', ja: '外食・テイクアウト', zh: '餐厅与外卖' },
  coffee: { sv: 'Kaffe & Fika', en: 'Coffee & Snacks', es: 'Café y aperitivos', fr: 'Café & en-cas', de: 'Kaffee & Snacks', it: 'Caffè e snack', pt: 'Café e lanches', ru: 'Кофе и перекусы', tr: 'Kahve ve atıştırmalık', ja: 'カフェ・軽食', zh: '咖啡与零食' },
  // transport
  transport: { sv: 'Transport', en: 'Transport', es: 'Transporte', fr: 'Transport', de: 'Verkehr', it: 'Trasporti', pt: 'Transporte', ru: 'Транспорт', tr: 'Ulaşım', ja: '交通', zh: '交通' },
  publicTransit: { sv: 'SL/Kollektivtrafik', en: 'Public transit', es: 'Transporte público', fr: 'Transports en commun', de: 'ÖPNV', it: 'Trasporto pubblico', pt: 'Transporte público', ru: 'Общественный транспорт', tr: 'Toplu taşıma', ja: '公共交通', zh: '公共交通' },
  car: { sv: 'Bil', en: 'Car', es: 'Coche', fr: 'Voiture', de: 'Auto', it: 'Auto', pt: 'Carro', ru: 'Автомобиль', tr: 'Araba', ja: '車', zh: '汽车' },
  insurances: { sv: 'Försäkringar', en: 'Insurances', es: 'Seguros', fr: 'Assurances', de: 'Versicherungen', it: 'Assicurazioni', pt: 'Seguros', ru: 'Страховки', tr: 'Sigortalar', ja: '保険', zh: '保险' },
  // prenumerationer
  subscriptions: { sv: 'Prenumerationer', en: 'Subscriptions', es: 'Suscripciones', fr: 'Abonnements', de: 'Abos', it: 'Abbonamenti', pt: 'Assinaturas', ru: 'Подписки', tr: 'Abonelikler', ja: 'サブスク', zh: '订阅' },
  streaming: { sv: 'Streaming', en: 'Streaming', es: 'Streaming', fr: 'Streaming', de: 'Streaming', it: 'Streaming', pt: 'Streaming', ru: 'Стриминг', tr: 'Dijital yayın', ja: '動画・音楽配信', zh: '流媒体' },
  gym: { sv: 'Gym', en: 'Gym', es: 'Gimnasio', fr: 'Salle de sport', de: 'Fitnessstudio', it: 'Palestra', pt: 'Academia', ru: 'Спортзал', tr: 'Spor salonu', ja: 'ジム', zh: '健身房' },
  apps: { sv: 'Appar', en: 'Apps', es: 'Aplicaciones', fr: 'Applis', de: 'Apps', it: 'App', pt: 'Aplicativos', ru: 'Приложения', tr: 'Uygulamalar', ja: 'アプリ', zh: '应用' },
  // personligt
  personligt: { sv: 'Personligt', en: 'Personal', es: 'Personal', fr: 'Personnel', de: 'Persönliches', it: 'Personale', pt: 'Pessoal', ru: 'Личное', tr: 'Kişisel', ja: '個人', zh: '个人' },
  clothes: { sv: 'Kläder', en: 'Clothes', es: 'Ropa', fr: 'Vêtements', de: 'Kleidung', it: 'Abbigliamento', pt: 'Roupas', ru: 'Одежда', tr: 'Giyim', ja: '衣類', zh: '服装' },
  hygiene: { sv: 'Hygien', en: 'Hygiene', es: 'Higiene', fr: 'Hygiène', de: 'Hygiene', it: 'Igiene', pt: 'Higiene', ru: 'Гигиена', tr: 'Kişisel bakım', ja: '日用品', zh: '个人护理' },
  health: { sv: 'Hälsa', en: 'Health', es: 'Salud', fr: 'Santé', de: 'Gesundheit', it: 'Salute', pt: 'Saúde', ru: 'Здоровье', tr: 'Sağlık', ja: '健康', zh: '健康' },
  // fritid
  fritid: { sv: 'Fritid', en: 'Leisure', es: 'Ocio', fr: 'Loisirs', de: 'Freizeit', it: 'Tempo libero', pt: 'Lazer', ru: 'Досуг', tr: 'Boş zaman', ja: 'レジャー', zh: '休闲' },
  hobby: { sv: 'Hobby', en: 'Hobby', es: 'Pasatiempos', fr: 'Hobbies', de: 'Hobby', it: 'Hobby', pt: 'Hobbies', ru: 'Хобби', tr: 'Hobi', ja: '趣味', zh: '爱好' },
  // Read only: older budgets have it under Fritid. New ones give it a category
  // of its own (givande) — a tester looking for tithes did not think of Leisure.
  giftsCharity: { sv: 'Gåvor & Välgörenhet', en: 'Gifts & Charity', es: 'Regalos y donaciones', fr: 'Cadeaux & dons', de: 'Geschenke & Spenden', it: 'Regali e beneficenza', pt: 'Presentes e doações', ru: 'Подарки и благотворительность', tr: 'Hediyeler ve bağışlar', ja: '贈り物・寄付', zh: '礼物与捐赠' },
  vacation: { sv: 'Semester', en: 'Vacation', es: 'Vacaciones', fr: 'Vacances', de: 'Urlaub', it: 'Vacanze', pt: 'Férias', ru: 'Отпуск', tr: 'Tatil', ja: '旅行', zh: '度假' },
  // givande
  givande: { sv: 'Gåvor & givande', en: 'Giving', es: 'Donativos', fr: 'Dons', de: 'Geben', it: 'Donazioni', pt: 'Doações', ru: 'Пожертвования', tr: 'Bağışlar', ja: '献金・寄付', zh: '奉献与捐赠' },
  tithes: { sv: 'Tionde & kollekt', en: 'Tithes & offerings', es: 'Diezmos y ofrendas', fr: 'Dîmes & offrandes', de: 'Zehnter & Kollekte', it: 'Decime e offerte', pt: 'Dízimos e ofertas', ru: 'Десятина и пожертвования', tr: 'Ondalık ve sunular', ja: '十分の一献金・献金', zh: '什一奉献与奉献' },
  charity: { sv: 'Välgörenhet', en: 'Charity', es: 'Donaciones', fr: 'Œuvres caritatives', de: 'Spenden', it: 'Beneficenza', pt: 'Caridade', ru: 'Благотворительность', tr: 'Hayır işleri', ja: '寄付', zh: '慈善' },
  gifts: { sv: 'Presenter', en: 'Gifts', es: 'Regalos', fr: 'Cadeaux', de: 'Geschenke', it: 'Regali', pt: 'Presentes', ru: 'Подарки', tr: 'Hediyeler', ja: 'プレゼント', zh: '礼物' },
  // lån — a real budget line for most people and, until now, a missing concept:
  // a student-loan repayment fitted none of the other seven and landed in Övrigt.
  // Renamed "Lån & skulder" with the Debt tab (2026-10-03), whose debts each
  // carry a row here. The old name is still READ — see LEGACY_LABELS.
  lan: { sv: 'Lån & skulder', en: 'Loans & Debts', es: 'Préstamos y deudas', fr: 'Prêts & dettes', de: 'Kredite & Schulden', it: 'Prestiti e debiti', pt: 'Empréstimos e dívidas', ru: 'Кредиты и долги', tr: 'Krediler ve borçlar', ja: 'ローン・負債', zh: '贷款与债务' },
  studyLoan: { sv: 'Studielån (CSN)', en: 'Student loan', es: 'Préstamo estudiantil', fr: 'Prêt étudiant', de: 'Studienkredit', it: 'Prestito studentesco', pt: 'Financiamento estudantil', ru: 'Образовательный кредит', tr: 'Öğrenim kredisi', ja: '奨学金返済', zh: '助学贷款' },
  mortgage: { sv: 'Bolån & amortering', en: 'Mortgage', es: 'Hipoteca', fr: 'Prêt immobilier', de: 'Baufinanzierung', it: 'Mutuo', pt: 'Financiamento imobiliário', ru: 'Ипотека', tr: 'Konut kredisi', ja: '住宅ローン', zh: '房贷' },
  otherCredit: { sv: 'Övriga lån & krediter', en: 'Other loans & credit', es: 'Otros créditos', fr: 'Autres crédits', de: 'Sonstige Kredite', it: 'Altri prestiti', pt: 'Outros empréstimos', ru: 'Другие кредиты', tr: 'Diğer krediler', ja: 'その他のローン', zh: '其他贷款' },
  // sparande
  sparande: { sv: 'Sparande', en: 'Savings', es: 'Ahorro', fr: 'Épargne', de: 'Sparen', it: 'Risparmi', pt: 'Poupança', ru: 'Сбережения', tr: 'Birikim', ja: '貯蓄', zh: '储蓄' },
  savingsRow: { sv: 'Sparande', en: 'Savings', es: 'Ahorro', fr: 'Épargne', de: 'Sparen', it: 'Risparmi', pt: 'Poupança', ru: 'Сбережения', tr: 'Birikim', ja: '貯蓄', zh: '储蓄' },
  investments: { sv: 'Investeringar', en: 'Investments', es: 'Inversiones', fr: 'Investissements', de: 'Investitionen', it: 'Investimenti', pt: 'Investimentos', ru: 'Инвестиции', tr: 'Yatırımlar', ja: '投資', zh: '投资' },
  // savings tab
  sparkonto: { sv: 'Sparkonto', en: 'Savings account', es: 'Cuenta de ahorro', fr: 'Compte épargne', de: 'Sparkonto', it: 'Conto di risparmio', pt: 'Conta poupança', ru: 'Сберегательный счёт', tr: 'Birikim hesabı', ja: '普通預金', zh: '储蓄账户' },
  mainAccount: { sv: 'Huvudkonto', en: 'Main account', es: 'Cuenta principal', fr: 'Compte principal', de: 'Hauptkonto', it: 'Conto principale', pt: 'Conta principal', ru: 'Основной счёт', tr: 'Ana hesap', ja: 'メイン口座', zh: '主账户' },
  bufferAccount: { sv: 'Buffertkonto', en: 'Buffer account', es: 'Cuenta de reserva', fr: 'Épargne de précaution', de: 'Notgroschen', it: 'Fondo di emergenza', pt: 'Reserva de emergência', ru: 'Резервный фонд', tr: 'Acil durum fonu', ja: '予備資金', zh: '应急账户' },
  isk: { sv: 'ISK / Aktiedepå', en: 'Investment account', es: 'Cuenta de inversión', fr: 'Compte-titres', de: 'Depot', it: 'Conto titoli', pt: 'Conta de investimentos', ru: 'Брокерский счёт', tr: 'Yatırım hesabı', ja: '投資口座', zh: '投资账户' },
  stocks: { sv: 'Aktier', en: 'Stocks', es: 'Acciones', fr: 'Actions', de: 'Aktien', it: 'Azioni', pt: 'Ações', ru: 'Акции', tr: 'Hisse senetleri', ja: '株式', zh: '股票' },
  etf: { sv: 'ETF:er', en: 'ETFs', es: 'ETF', fr: 'ETF', de: 'ETFs', it: 'ETF', pt: 'ETFs', ru: 'ETF', tr: 'ETF', ja: 'ETF', zh: 'ETF' },
  fonder: { sv: 'Fonder', en: 'Funds', es: 'Fondos', fr: 'Fonds', de: 'Fonds', it: 'Fondi', pt: 'Fundos', ru: 'Фонды', tr: 'Fonlar', ja: '投資信託', zh: '基金' },
  indexFunds: { sv: 'Indexfonder', en: 'Index funds', es: 'Fondos indexados', fr: 'Fonds indiciels', de: 'Indexfonds', it: 'Fondi indicizzati', pt: 'Fundos de índice', ru: 'Индексные фонды', tr: 'Endeks fonları', ja: 'インデックスファンド', zh: '指数基金' },
  activeFunds: { sv: 'Aktivt förvaltade', en: 'Actively managed', es: 'Gestión activa', fr: 'Gestion active', de: 'Aktiv verwaltet', it: 'Gestione attiva', pt: 'Gestão ativa', ru: 'Активное управление', tr: 'Aktif yönetilen', ja: 'アクティブファンド', zh: '主动管理基金' },
  pension: { sv: 'Pension (extra)', en: 'Pension (extra)', es: 'Pensión (extra)', fr: 'Retraite (en plus)', de: 'Altersvorsorge (zusätzlich)', it: 'Pensione (integrativa)', pt: 'Previdência (extra)', ru: 'Пенсия (доп.)', tr: 'Emeklilik (ek)', ja: '年金（追加）', zh: '养老金（额外）' },
  occupationalPension: { sv: 'Tjänstepension tillägg', en: 'Occupational pension top-up', es: 'Aporte a pensión laboral', fr: 'Complément retraite pro', de: 'Betriebsrente Zusatz', it: 'Pensione aziendale integrativa', pt: 'Previdência corporativa', ru: 'Корпоративная пенсия', tr: 'İşveren emeklilik katkısı', ja: '企業年金の上乗せ', zh: '职业年金补充' },
  privatePension: { sv: 'Privat pension', en: 'Private pension', es: 'Pensión privada', fr: 'Retraite privée', de: 'Private Rente', it: 'Pensione privata', pt: 'Previdência privada', ru: 'Частная пенсия', tr: 'Bireysel emeklilik', ja: '個人年金', zh: '个人养老金' },
  // placeholders for newly added items / goals
  newGoal: { sv: 'Nytt mål', en: 'New goal', es: 'Nueva meta', fr: 'Nouvel objectif', de: 'Neues Ziel', it: 'Nuovo obiettivo', pt: 'Nova meta', ru: 'Новая цель', tr: 'Yeni hedef', ja: '新しい目標', zh: '新目标' },
  newRow: { sv: 'Ny rad', en: 'New row', es: 'Nueva fila', fr: 'Nouvelle ligne', de: 'Neue Zeile', it: 'Nuova riga', pt: 'Nova linha', ru: 'Новая строка', tr: 'Yeni satır', ja: '新しい行', zh: '新行' },
  newItem: { sv: 'Ny post', en: 'New item', es: 'Nuevo elemento', fr: 'Nouvel élément', de: 'Neuer Eintrag', it: 'Nuova voce', pt: 'Novo item', ru: 'Новый пункт', tr: 'Yeni öğe', ja: '新しい項目', zh: '新项目' },
} as const;

const tr = (entry: LabelEntry, lang: Lang) => entry[lang];

// Reverse lookup: any known default label (in any language) → its translations.
// Lets built-in labels that were SAVED as plain strings (e.g. all in Swedish) be
// re-rendered in the current language. Labels the user customized won't match and
// are returned unchanged.
const REVERSE_LABELS: Record<string, LabelEntry> = {};
for (const entry of Object.values(L)) {
  // Every language's name, so a new language cannot be left out of the lookup.
  for (const name of Object.values(entry)) REVERSE_LABELS[name] = entry;
}
// Names a default once had, as saved in older months: they show under the
// CURRENT name, so a renamed default does not leave two names in one budget.
const LEGACY_LABELS: [string, LabelEntry][] = [
  ['Lån & Krediter', L.lan], ['Loans & Credit', L.lan], ['Préstamos y créditos', L.lan],
  ['Bidrag/Ersättning', L.benefits], ['Benefits', L.benefits], ['Prestaciones', L.benefits],
];
for (const [old, entry] of LEGACY_LABELS) REVERSE_LABELS[old] = entry;

/** Translate a built-in default label to the current language; pass through custom labels. */
function displayLabel(label: string, lang: Lang): string {
  return REVERSE_LABELS[label]?.[lang] ?? label;
}

/**
 * Display name honoring the `userNamed` flag: user-named items are shown raw
 * (never reverse-translated), defaults still translate to the active language.
 * Handles both `name` (categories/goals) and `label` (rows).
 */
export function shownName(
  item: { name?: string; label?: string; userNamed?: boolean },
  lang: Lang,
): string {
  const raw = item.name ?? item.label ?? '';
  return item.userNamed ? raw : displayLabel(raw, lang);
}

function defaultIncome(lang: Lang = 'sv'): BudgetRow[] {
  return [
    { id: makeId(), label: tr(L.salary, lang), amount: 0 },
    { id: makeId(), label: tr(L.sideIncome, lang), amount: 0 },
    { id: makeId(), label: tr(L.benefits, lang), amount: 0 },
  ];
}

function defaultExpenses(lang: Lang = 'sv'): BudgetCategory[] {
  return [
    {
      id: 'boende', name: tr(L.boende, lang), icon: '🏠', color: CATEGORY_COLORS.boende,
      rows: [
        { id: makeId(), label: tr(L.rent, lang), amount: 0 },
        { id: makeId(), label: tr(L.electricity, lang), amount: 0 },
        { id: makeId(), label: tr(L.internet, lang), amount: 0 },
        { id: makeId(), label: tr(L.homeInsurance, lang), amount: 0 },
      ],
    },
    {
      id: 'mat', name: tr(L.mat, lang), icon: '🛒', color: CATEGORY_COLORS.mat,
      rows: [
        { id: makeId(), label: tr(L.groceries, lang), amount: 0 },
        { id: makeId(), label: tr(L.restaurant, lang), amount: 0 },
        { id: makeId(), label: tr(L.coffee, lang), amount: 0 },
      ],
    },
    {
      id: 'transport', name: tr(L.transport, lang), icon: '🚌', color: CATEGORY_COLORS.transport,
      rows: [
        { id: makeId(), label: tr(L.publicTransit, lang), amount: 0 },
        { id: makeId(), label: tr(L.car, lang), amount: 0 },
        { id: makeId(), label: tr(L.insurances, lang), amount: 0 },
      ],
    },
    {
      id: 'prenumerationer', name: tr(L.subscriptions, lang), icon: '📱', color: CATEGORY_COLORS.prenumerationer,
      rows: [
        { id: makeId(), label: tr(L.streaming, lang), amount: 0 },
        { id: makeId(), label: tr(L.gym, lang), amount: 0 },
        { id: makeId(), label: tr(L.apps, lang), amount: 0 },
      ],
    },
    {
      id: 'personligt', name: tr(L.personligt, lang), icon: '👤', color: CATEGORY_COLORS.personligt,
      rows: [
        { id: makeId(), label: tr(L.clothes, lang), amount: 0 },
        { id: makeId(), label: tr(L.hygiene, lang), amount: 0 },
        { id: makeId(), label: tr(L.health, lang), amount: 0 },
      ],
    },
    {
      id: 'fritid', name: tr(L.fritid, lang), icon: '🎯', color: CATEGORY_COLORS.fritid,
      rows: [
        { id: makeId(), label: tr(L.hobby, lang), amount: 0 },
        { id: makeId(), label: tr(L.vacation, lang), amount: 0 },
      ],
    },
    {
      id: 'givande', name: tr(L.givande, lang), icon: '🎁', color: CATEGORY_COLORS.givande,
      rows: [
        { id: makeId(), label: tr(L.tithes, lang), amount: 0 },
        { id: makeId(), label: tr(L.charity, lang), amount: 0 },
        { id: makeId(), label: tr(L.gifts, lang), amount: 0 },
      ],
    },
    {
      id: 'lan', name: tr(L.lan, lang), icon: '🏦', color: CATEGORY_COLORS.lan,
      rows: [
        { id: makeId(), label: tr(L.studyLoan, lang), amount: 0 },
        { id: makeId(), label: tr(L.mortgage, lang), amount: 0 },
        { id: makeId(), label: tr(L.otherCredit, lang), amount: 0 },
      ],
    },
    {
      id: 'sparande', name: tr(L.sparande, lang), icon: '💰', color: CATEGORY_COLORS.sparande,
      rows: [
        { id: makeId(), label: tr(L.savingsRow, lang), amount: 0 },
        { id: makeId(), label: tr(L.investments, lang), amount: 0 },
      ],
    },
  ];
}

function defaultSavings(lang: Lang = 'sv'): BudgetCategory[] {
  return [
    {
      id: 'sparkonto', name: tr(L.sparkonto, lang), icon: '🏦', color: SAVINGS_COLORS.sparkonto,
      rows: [
        { id: makeId(), label: tr(L.mainAccount, lang), amount: 0 },
        { id: makeId(), label: tr(L.bufferAccount, lang), amount: 0 },
      ],
    },
    {
      id: 'isk', name: tr(L.isk, lang), icon: '📈', color: SAVINGS_COLORS.isk,
      rows: [
        { id: makeId(), label: tr(L.stocks, lang), amount: 0 },
        { id: makeId(), label: tr(L.etf, lang), amount: 0 },
      ],
    },
    {
      id: 'fonder', name: tr(L.fonder, lang), icon: '💹', color: SAVINGS_COLORS.fonder,
      rows: [
        { id: makeId(), label: tr(L.indexFunds, lang), amount: 0 },
        { id: makeId(), label: tr(L.activeFunds, lang), amount: 0 },
      ],
    },
    {
      id: 'pension', name: tr(L.pension, lang), icon: '🛡️', color: SAVINGS_COLORS.pension,
      rows: [
        { id: makeId(), label: tr(L.occupationalPension, lang), amount: 0 },
        { id: makeId(), label: tr(L.privatePension, lang), amount: 0 },
      ],
    },
  ];
}

export function defaultPlanData(_lang: Lang = 'sv'): PlanData {
  return {
    goals: [],
    notes: '',
  };
}

// A brand-new / empty month starts BLANK — no auto-seeded categories. Users
// build from scratch via "+ Add category" / "+ Add goal", or one-tap the
// starter pack (starterMonthData). The lang param is kept for signature
// compatibility with existing callers.
export function defaultMonthData(_lang: Lang = 'sv'): MonthData {
  return { income: [], expenses: [], savings: [] };
}

/**
 * One of the standard expense categories, built fresh, WITH ITS STABLE ID.
 *
 * The id is the point. `createCategory` mints a random one, which is right for
 * a category the user invents and wrong for restoring a standard one: entries
 * filed under `mat` in August have to meet the same `mat` in September, and a
 * fresh random id would leave them orphaned in every other month. Used by the
 * import when it offers to create a category the month is missing.
 */
export function standardExpenseCategory(id: string, lang: Lang = 'sv'): BudgetCategory | undefined {
  return defaultExpenses(lang).find(c => c.id === id);
}

/**
 * A month's data with the named standard categories appended, skipping any it
 * already has. Pure, and returns the SAME object when nothing was missing, so a
 * caller can use identity to decide whether a write is needed at all.
 *
 * Idempotent by construction: accepting the same offer twice — two imports of
 * overlapping statements — cannot produce a duplicate category.
 */
export function withStandardCategories(
  data: MonthData, ids: readonly string[], lang: Lang = 'sv',
): MonthData {
  const have = new Set(data.expenses.map(c => c.id));
  const fresh = [...new Set(ids)]
    .filter(id => !have.has(id))
    .map(id => standardExpenseCategory(id, lang))
    .filter((c): c is BudgetCategory => c !== undefined);
  return fresh.length === 0 ? data : { ...data, expenses: [...data.expenses, ...fresh] };
}

/**
 * The month with `row` in its loans category ("Lån & skulder"): the row
 * replaced if it is there, appended if not, and the category created — with
 * that row only — if the month has none. Pure; returns the SAME object when
 * nothing would change, so a caller can tell whether a write is needed.
 *
 * How a debt in the Debt tab carries its monthly payment into the budget.
 */
export function withLoanRow(
  data: MonthData, row: { id: string; label: string; amount: number }, lang: Lang = 'sv',
): MonthData {
  const lan = data.expenses.find(c => c.id === 'lan');
  const fresh: BudgetRow = { id: row.id, label: row.label, amount: row.amount, isCustom: true, userNamed: true };
  if (!lan) {
    const base = standardExpenseCategory('lan', lang)!;
    return { ...data, expenses: [...data.expenses, { ...base, rows: [fresh] }] };
  }
  const existing = lan.rows.find(r => r.id === row.id);
  if (existing && existing.label === row.label && existing.amount === row.amount) return data;
  const rows = existing
    ? lan.rows.map(r => (r.id === row.id ? { ...r, label: row.label, amount: row.amount, userNamed: true } : r))
    : [...lan.rows, fresh];
  return { ...data, expenses: data.expenses.map(c => (c.id === 'lan' ? { ...c, rows } : c)) };
}

// The old default category set, offered as a one-tap "starter pack" so a blank
// app isn't a dead end. Not auto-applied — only when the user asks for it.
export function starterMonthData(lang: Lang = 'sv'): MonthData {
  return {
    income: defaultIncome(lang),
    expenses: defaultExpenses(lang),
    savings: defaultSavings(lang),
  };
}

// Make sure every goal that declares a linked budget row (`budgetRowId`) has a
// matching row in the in-budget "sparande" category. The UI promises this link
// survives — but a freshly reset/empty month has NO sparande category, so the
// old inline "only if the category exists" backfill silently dropped the link
// (UX review §7). This pure, immutable helper is the ONE place that guarantee
// lives; call it wherever month data is (re)built: month load, reset, import
// (via reload) and the starter template. Idempotent — re-running never adds a
// duplicate row, so month-switching / reloads can't append twice.
export function ensureGoalLinkedBudgetRows(
  month: MonthData,
  goals: SavingsGoal[],
  lang: Lang = 'sv',
): MonthData {
  const linked = goals.filter(g => g.budgetRowId);
  if (linked.length === 0) return month;

  const sparande = month.expenses.find(c => c.id === 'sparande');
  const existingRowIds = new Set(sparande?.rows.map(r => r.id) ?? []);
  const missing = linked.filter(g => !existingRowIds.has(g.budgetRowId!));
  if (missing.length === 0) return month; // every link already backed by a row

  const newRows: BudgetRow[] = missing.map(g => ({
    id: g.budgetRowId!,
    label: shownName(g, lang),
    amount: 0,
    isCustom: true,
  }));

  if (sparande) {
    // Append the missing rows to the existing category.
    return {
      ...month,
      expenses: month.expenses.map(c =>
        c.id === 'sparande' ? { ...c, rows: [...c.rows, ...newRows] } : c,
      ),
    };
  }

  // No sparande category at all (fresh/reset month) — create a minimal one so
  // the goal↔budget link the Plan tab shows actually exists in the budget.
  const created: BudgetCategory = {
    id: 'sparande',
    name: tr(L.sparande, lang),
    icon: '💰',
    color: CATEGORY_COLORS.sparande,
    rows: newRows,
  };
  return { ...month, expenses: [...month.expenses, created] };
}

export function storageKey(year: number, month: number): string {
  return `budget_${year}_${month}`;
}

/** The shape storageKey produces — the one pattern every sweep matches on, so
 *  none of them can disagree about what counts as a stored month. */
const MONTH_KEY_RE = /^budget_(\d{4})_(\d{1,2})$/;

/**
 * Is this month already over? A finished month is HISTORY: the goal↔budget
 * backfill must never reach into it and add rows the user never budgeted for.
 * Creating a goal today used to inject a 0 kr row into every earlier month the
 * user happened to browse — rows that then looked like they had always been
 * there (bug report 2026-07-19). The current month counts as open, so a goal
 * created today can still be filled in for today.
 */
export function isHistoricMonth(year: number, monthIndex: number, now = new Date()): boolean {
  const nowYM = now.getFullYear() * 12 + now.getMonth();
  return year * 12 + monthIndex < nowYM;
}

/**
 * The giving category of the first version (until June 2026): "Givande &
 * Välgörenhet", 🤲, its rows mirrored from a plan field that no longer exists.
 * Months from then may still hold it, and it stays hidden there.
 *
 * Only THAT one. The 1.13.0 template's "Gåvor & givande" (🎁) reuses the id,
 * and hiding every `givande` made the new category vanish on the next load —
 * and a later edit to the month wrote it away for good (review 2026-10-17, P0).
 */
export function isRetiredGiving(c: { id: string; icon?: string; name?: string }): boolean {
  return c.id === 'givande' && (c.icon === '🤲' || c.name === 'Givande & Välgörenhet');
}

export function loadMonthData(year: number, month: number, lang: Lang = 'sv'): MonthData {
  const key = storageKey(year, month);
  const raw = appStorage.getItem(key);
  if (!raw) return defaultMonthData(lang); // new/empty month → blank
  try {
    const parsed = JSON.parse(raw) as MonthData;
    // Preserve existing saved months EXACTLY — no auto-seeding of default
    // categories (that's now opt-in via the starter pack). Only normalize shape
    // (guard against a missing array) and hide the RETIRED giving category.
    if (!Array.isArray(parsed.income)) parsed.income = [];
    if (!Array.isArray(parsed.savings)) parsed.savings = [];
    if (!Array.isArray(parsed.expenses)) parsed.expenses = [];
    else parsed.expenses = parsed.expenses.filter(c => !isRetiredGiving(c));
    // Defensive read: a build before the shared money validation could store an
    // amount as `null` (JSON.stringify's rendering of Infinity/NaN). One null
    // would turn every total that touched it into NaN, so amounts are coerced
    // on the way in. This does NOT rewrite storage — the month is only written
    // back when the user edits it.
    parsed.income = parsed.income.map(normalizeRow);
    parsed.expenses = parsed.expenses.map(normalizeCategory);
    parsed.savings = parsed.savings.map(normalizeCategory);
    return parsed;
  } catch {
    return defaultMonthData(lang);
  }
}

const normalizeRow = (r: BudgetRow): BudgetRow => {
  const amount = isValidMoney(r?.amount) ? r.amount : coerceStoredMoney(r?.amount);
  // Backup import is strict about `period`, but data read straight out of
  // localStorage never passes through it — an older build, a hand edit or a
  // half-written record could carry `period: "week"`. Anything unrecognised is
  // dropped here so it can never reach the arithmetic. Storage itself is left
  // alone; this is a defensive READ, not a migration.
  const period = isRowPeriod(r?.period) ? r.period : undefined;
  if (amount === r?.amount && period === r?.period) return r;
  return { ...r, amount, period };
};

const normalizeCategory = (c: BudgetCategory): BudgetCategory =>
  Array.isArray(c?.rows) ? { ...c, rows: c.rows.map(normalizeRow) } : { ...c, rows: [] };

/** Returns whether the month was written. False means the edit is still only
 *  on screen — the caller must say so rather than imply it was saved (F4). */
export function saveMonthData(year: number, month: number, data: MonthData): boolean {
  const key = storageKey(year, month);
  // Don't CREATE a key for a brand-new, completely empty month — that just
  // litters localStorage with blank entries while navigating (e.g. in Custom
  // mode). An already-saved month is still updated (so clearing it persists).
  // A hand-written period label is content too. Without this, typing one on an
  // otherwise-untouched month looked like it worked and was gone on reload —
  // the label was the month's ONLY content, and this guard dropped it.
  const empty = data.income.length === 0 && data.expenses.length === 0
    && data.savings.length === 0 && !data.periodLabel;
  // Nothing to write is not a failure: the month legitimately stays absent.
  if (empty && appStorage.getItem(key) === null) return true;
  return safeSetItem(appStorage, key, JSON.stringify(data));
}

/**
 * One-time repair for months the OLD backfill already polluted.
 *
 * Before isHistoricMonth existed, opening a finished month planted a 0 kr row
 * for every goal and saved it there. Blocking new writes doesn't undo that —
 * the rows are already on disk, which is why the bug looked unfixed. This
 * removes exactly those rows, and nothing else:
 *
 *   • only months that are already over (the current/future offer stays),
 *   • only rows whose id IS a goal's budgetRowId — an id the app generated for
 *     the link, never one a user-created row can have,
 *   • only rows still at 0 kr — a row with real money in it is budget history
 *     and survives, same rule as everywhere else.
 *
 * Idempotent, but see runHistoricGoalRowMigration: this must NOT keep running
 * on every start, or a zero a user deliberately records in a past month would
 * later match the rule and be swept away.
 */
export function cleanupHistoricGoalRows(
  goals: SavingsGoal[],
  now = new Date(),
  // Injected so the repair is unit-testable without a browser, same port style
  // as backup.ts. Defaults to the real thing in the app.
  storage: StorageLike = appStorage,
): number {
  const linkedIds = new Set(goals.map(g => g.budgetRowId).filter((id): id is string => !!id));
  if (linkedIds.size === 0) return 0;

  let cleaned = 0;
  // Snapshot the keys first: writing while iterating localStorage by index can
  // shift the indices under us.
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k) keys.push(k);
  }

  for (const key of keys) {
    const match = MONTH_KEY_RE.exec(key);
    if (!match) continue;
    const year = Number(match[1]);
    const monthIndex = Number(match[2]);
    if (monthIndex > 11 || !isHistoricMonth(year, monthIndex, now)) continue;

    try {
      const month = JSON.parse(storage.getItem(key)!) as MonthData;
      const sparande = month.expenses?.find(c => c.id === 'sparande');
      if (!sparande) continue;
      const kept = sparande.rows.filter(r => !(linkedIds.has(r.id) && (r.amount || 0) === 0));
      if (kept.length === sparande.rows.length) continue;

      // A sparande category left with nothing is just clutter — drop it too.
      const expenses = kept.length > 0
        ? month.expenses.map(c => (c.id === 'sparande' ? { ...c, rows: kept } : c))
        : month.expenses.filter(c => c.id !== 'sparande');
      // safeSetItem inside the try on purpose: the catch is for a malformed
      // blob, and it used to absorb a refused write as well, so a repair that
      // never happened still counted itself as done (finding 19).
      if (safeSetItem(storage, key, JSON.stringify({ ...month, expenses }))) {
        cleaned += sparande.rows.length - kept.length;
      }
    } catch {
      // Malformed month blob — leave it alone rather than risk data.
    }
  }
  return cleaned;
}

/**
 * Apply a goal's deletion or rename to every stored month except `skipKey`.
 *
 * The month-load effect backfills a goal's linked row into EVERY month the
 * user visits, so a change to the goal has to reach all of them or the months
 * drift apart:
 *
 *   · DELETING a goal must sweep its row out, or each month keeps an orphaned
 *     0 kr row forever. Rows holding real money are budget history and stay —
 *     the same conservation rule cleanupHistoricGoalRows uses.
 *   · RENAMING one must relabel its row. This used to happen only in the month
 *     on screen, so renaming "Resa" to "Japan 2027" in September left August
 *     still reading "Resa": the link held while the two names disagreed for as
 *     long as the history lasted.
 *
 * Returns false if any write was refused, so the caller can tell the user.
 * Pure but for the injected storage, which is what makes it testable without
 * driving the whole app.
 */
export function sweepGoalRows(
  storage: StorageLike,
  deletedRowIds: ReadonlySet<string>,
  renamedRows: ReadonlyMap<string, string>,
  skipKey?: string,
): boolean {
  if (deletedRowIds.size === 0 && renamedRows.size === 0) return true;
  let ok = true;
  for (let i = storage.length - 1; i >= 0; i--) {
    const key = storage.key(i);
    if (!key || !MONTH_KEY_RE.test(key) || key === skipKey) continue;
    // The write is computed inside the try and performed OUTSIDE it. The catch
    // is for a malformed month blob, which is a reason to skip the month; it
    // must not also absorb a refused write, or a full quota would leave the
    // months half-swept in silence.
    let write: string | null = null;
    try {
      const raw = storage.getItem(key);
      if (raw === null) continue;
      const month = JSON.parse(raw) as MonthData;
      const sparande = month.expenses?.find(c => c.id === 'sparande');
      if (!sparande) continue;
      const kept = sparande.rows.filter(r => !(deletedRowIds.has(r.id) && (r.amount || 0) === 0));
      const removedAny = kept.length !== sparande.rows.length;
      let renamedAny = false;
      const rows = kept.map(r => {
        const label = renamedRows.get(r.id);
        if (label === undefined || r.label === label) return r;
        renamedAny = true;
        return { ...r, label };
      });
      if (!removedAny && !renamedAny) continue;
      // A sparande category left with nothing is just clutter — drop it too.
      const expenses = rows.length > 0
        ? month.expenses.map(c => (c.id === 'sparande' ? { ...c, rows } : c))
        : month.expenses.filter(c => c.id !== 'sparande');
      write = JSON.stringify({ ...month, expenses });
    } catch {
      // Malformed month blob — leave it untouched rather than risk data.
    }
    if (write !== null && !safeSetItem(storage, key, write)) ok = false;
  }
  return ok;
}

/** Marks the historic-goal-row repair as done. Versioned in the name so a
 *  future, differently-scoped repair can ship without disturbing this one. */
export const HISTORIC_GOAL_ROWS_MIGRATION = 'budget_migration_historic_goal_rows_v1';

/**
 * Run the historic-goal-row repair ONCE per device.
 *
 * The repair is idempotent, so re-running it was harmless for the rows it was
 * written for — but not for the user: its rule ("a goal-linked row at exactly
 * 0 in a finished month") also matches a zero someone deliberately records
 * later, and running on every start would quietly delete that (main review §8).
 * The marker is written only after the sweep finishes, so an interrupted first
 * run simply tries again next time.
 */
export function runHistoricGoalRowMigration(
  goals: SavingsGoal[],
  now = new Date(),
  storage: StorageLike = appStorage,
): number {
  if (storage.getItem(HISTORIC_GOAL_ROWS_MIGRATION)) return 0;
  const cleaned = cleanupHistoricGoalRows(goals, now, storage);
  storage.setItem(HISTORIC_GOAL_ROWS_MIGRATION, new Date().toISOString());
  return cleaned;
}

export function loadPlanData(lang: Lang = 'sv'): PlanData {
  const raw = appStorage.getItem('budget_plan');
  if (!raw) return defaultPlanData(lang);
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return defaultPlanData(lang);
    const obj = parsed as Partial<PlanData>;
    // A blind `as PlanData` cast used to be enough to make a malformed plan
    // look like app data. Shape and amounts are checked instead: a goal whose
    // amount was stored as `null` reads as 0 rather than making every
    // progress bar NaN, and a non-object goal is dropped instead of crashing.
    const goals = Array.isArray(obj.goals)
      ? obj.goals
        .filter((g): g is SavingsGoal => !!g && typeof g === 'object' && typeof g.id === 'string')
        .map(g => ({
          ...g,
          name: typeof g.name === 'string' ? g.name : '',
          targetAmount: coerceStoredMoney(g.targetAmount),
          currentAmount: coerceStoredMoney(g.currentAmount),
        }))
      : [];
    return { ...defaultPlanData(lang), ...obj, goals };
  } catch {
    return defaultPlanData(lang);
  }
}

/** Returns whether the plan was written — see saveMonthData. */
export function savePlanData(data: PlanData): boolean {
  return safeSetItem(appStorage, 'budget_plan', JSON.stringify(data));
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}

// Create a brand-new user category with one starter row.
export function createCategory(name: string, icon: string, color: string, starterRowLabel: string): BudgetCategory {
  return {
    id: generateId(),
    name,
    icon,
    color,
    rows: [{ id: generateId(), label: starterRowLabel, amount: 0, isCustom: true }],
  };
}

export function makeGoalColor(index: number): string {
  return GOAL_COLORS[index % GOAL_COLORS.length];
}

// Read savings totals for every month in a year, for the growth chart
export function loadYearSavingsTotals(year: number, lang: Lang = 'sv'): { month: string; total: number; hasSnapshot: boolean; byCategory: Record<string, number>; categories: { id: string; name: string; color: string }[] }[] {
  return Array.from({ length: 12 }, (_, m) => {
    const data = loadMonthData(year, m, lang);
    const byCategory: Record<string, number> = {};
    const categories: { id: string; name: string; color: string }[] = [];
    for (const cat of data.savings) {
      byCategory[cat.id] = cat.rows.reduce((s, r) => s + r.amount, 0);
      if (cat.id !== PENSION_CATEGORY_ID) {
        categories.push({ id: cat.id, name: cat.name, color: cat.color });
      }
    }
    // `hasSnapshot: false` = the month was never filled in, so callers must plot
    // a gap rather than a 0 (which draws the pot crashing to the axis).
    // Sourced from metrics so there's exactly one definition of "recorded" —
    // and `total` now comes from the same place, because it used to sum the
    // savings categories by hand WITH pension folded in, two lines under that
    // very comment (finding 14). `byCategory` still carries pension, so that a
    // caller which wants it can ask for it by name.
    const metrics = calculateSavingsMetrics(data);
    return {
      month: MONTHS_SHORT[lang][m],
      total: metrics.balance,
      hasSnapshot: metrics.hasSnapshot,
      byCategory,
      categories,
    };
  });
}
