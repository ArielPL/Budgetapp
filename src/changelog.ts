// ── Changelog — the data behind the "What's new" panel ─────────────────────
// Newest release first. Versions & dates are grounded in the real git history
// (commit clusters by day), not invented. Each release carries a version, a
// date, and a localized title + bullet list. LATEST_VERSION drives the "new
// update" dot: when budget_changelog_seen differs from it, the menu shows a
// badge until the user opens this panel.

import type { Lang } from './i18n';

export interface Release {
  version: string;
  date: string; // ISO yyyy-mm-dd (real commit date)
  title: Record<Lang, string>;
  items: Record<Lang, string[]>;
}

export const CHANGELOG: Release[] = [
  {
    version: '1.10.0',
    date: '2026-07-16',
    title: { sv: 'Sparplan', en: 'Savings plan', es: 'Plan de ahorro' },
    items: {
      sv: [
        'Ny sparplan i Plan-fliken: ange månadssparande och förväntad avkastning',
        'Se din prognos 5 år framåt — med ränta på ränta',
        '"Plan mot verklighet": ligger du före eller efter din plan?',
        '"Kvar att leva på": det som är kvar utslaget per dag och per vecka',
        'Tydligare sparande: "Totalt sparat" visar hela ditt sparkapital, och "Sparat denna månad" visar hur mycket det växte',
        'Rättat: sparkvot, årssumma och plan-jämförelsen la ihop ditt sparkapital flera gånger',
        'Rättat: en månad du inte fyllt i visade ett stort uttag — nu står det "–" tills du registrerat saldot',
        'Rättat: ett sparsaldo på 0 räknas nu som en riktig nolla i Sparande, Plan och År',
        'Rättat: sparkurvan dyker inte längre till noll för månader utan uppgifter',
        'År-fliken skiljer nu på "Sparsaldo" (per månad) och "Sparat under året" (totalen)',
        'Import av säkerhetskopia ersätter nu all data på riktigt — gamla månader blir inte kvar',
        'Import kontrollerar hela filen först och ångrar allt om något går fel',
        'Custom-blockens standardnamn följer nu med när du byter språk — dina egna namn rörs aldrig',
        'Sparplanen stoppar orimliga tal med tydliga fel, och kan nu raderas',
        'Snabbare start: appen laddar diagramkoden först när den behövs (60 % mindre)',
        'Kombinerad layout på mobil: fast snabbnavigering mellan sektionerna',
        'Fungerar bättre på smala skärmar och med mycket stora belopp (10 md kr)',
        'Bättre kontrast i diagram, dolda datatabeller för skärmläsare och låst bakgrund bakom dialoger',
      ],
      en: [
        'New savings plan in the Plan tab: set monthly saving and expected return',
        'See your 5-year projection — with compound growth',
        '"Plan vs reality": are you ahead of or behind your plan?',
        '"Left to live on": your remaining money split per day and per week',
        'Clearer savings: "Total saved" shows your whole pot, and "Saved this month" shows how much it grew',
        'Fixed: savings rate, the yearly total and the plan comparison were adding your savings pot up more than once',
        'Fixed: a month you had not filled in showed a large withdrawal — it now reads "–" until you record the balance',
        'Fixed: a savings balance of 0 now counts as a real zero in Savings, Plan and Year',
        'Fixed: the savings curve no longer dives to zero for months with no data',
        'The Year tab now separates "Savings balance" (per month) from "Saved during the year" (the total)',
        'Importing a backup now truly replaces all data — old months no longer linger',
        'Import checks the whole file first and undoes everything if anything goes wrong',
        'Custom blocks\' default names now follow your language switch — your own names are never touched',
        'The savings plan rejects impossible numbers with clear errors, and can now be deleted',
        'Faster start: chart code loads only when needed (60% smaller)',
        'Combined layout on mobile: a sticky quick-nav between sections',
        'Works better on narrow screens and with very large amounts ($10B)',
        'Better chart contrast, hidden data tables for screen readers, and a locked background behind dialogs',
      ],
      es: [
        'Nuevo plan de ahorro en Plan: define ahorro mensual y rendimiento esperado',
        'Mira tu proyección a 5 años — con interés compuesto',
        '"Plan frente a realidad": ¿vas por delante o por detrás de tu plan?',
        '"Para vivir este mes": lo que te queda repartido por día y por semana',
        'Ahorro más claro: "Ahorro total" muestra todo tu capital y "Ahorrado este mes" cuánto creció',
        'Corregido: la tasa de ahorro, el total anual y la comparación con el plan sumaban tu ahorro varias veces',
        'Corregido: un mes sin rellenar mostraba una gran retirada — ahora pone "–" hasta que registres el saldo',
        'Corregido: un saldo de ahorro de 0 ahora cuenta como un cero real en Ahorro, Plan y Año',
        'Corregido: la curva de ahorro ya no cae a cero en los meses sin datos',
        'La pestaña Año ahora distingue "Saldo de ahorro" (por mes) de "Ahorrado durante el año" (el total)',
        'Importar una copia ahora reemplaza de verdad todos los datos: los meses antiguos ya no permanecen',
        'La importación valida todo el archivo primero y lo deshace todo si algo falla',
        'Los nombres predeterminados de los bloques Custom siguen tu idioma — tus propios nombres nunca se tocan',
        'El plan de ahorro rechaza números imposibles con errores claros, y ahora se puede eliminar',
        'Inicio más rápido: el código de los gráficos se carga solo cuando hace falta (60 % menos)',
        'Diseño combinado en móvil: navegación rápida fija entre secciones',
        'Funciona mejor en pantallas estrechas y con importes muy grandes',
        'Mejor contraste en gráficos, tablas de datos ocultas para lectores de pantalla y fondo bloqueado tras los diálogos',
      ],
    },
  },
  {
    version: '1.9.1',
    date: '2026-07-12',
    title: { sv: 'Finslipning', en: 'Polish', es: 'Pulido' },
    items: {
      sv: [
        'Fungerar nu även på mycket smala mobilskärmar',
        'Ören visas alltid med två decimaler (1 200,50 kr)',
        'Sparmål kräver ett målbelopp över 0 — med tydligt felmeddelande',
      ],
      en: [
        'Now works on very narrow phone screens too',
        'Cents always show two decimals (1,200.50)',
        'Savings goals require a target above 0 — with a clear error message',
      ],
      es: [
        'Ahora funciona también en pantallas muy estrechas',
        'Los céntimos siempre muestran dos decimales (1.200,50 €)',
        'Las metas requieren un importe mayor que 0 — con un mensaje de error claro',
      ],
    },
  },
  {
    version: '1.9.0',
    date: '2026-07-09',
    title: { sv: 'Kvalitetslyft', en: 'Quality update', es: 'Mejoras de calidad' },
    items: {
      sv: [
        'Ny välkomstskärm för nya användare',
        'Tydligare siffror för sparande och sparkvot',
        'Säkrare månadsåterställning – sparmål tappas inte längre',
        'Smidigare på mobilen: snabbare inmatning och stabil meny',
        'Lättare att läsa diagram och bättre kontrast',
        'Nytt formulär för sparmål med Spara/Avbryt',
        'Belopp kan nu visas med ören',
      ],
      en: [
        'New welcome screen for first-time users',
        'Clearer savings and savings-rate numbers',
        'Safer month reset – goals are no longer lost',
        'Smoother on mobile: faster entry and a steadier menu',
        'Easier-to-read charts and better contrast',
        'New savings-goal form with Save/Cancel',
        'Amounts can now show decimals',
      ],
      es: [
        'Nueva pantalla de bienvenida',
        'Cifras de ahorro y tasa de ahorro más claras',
        'Reinicio de mes más seguro: ya no se pierden las metas',
        'Más fluido en móvil: entrada rápida y menú estable',
        'Gráficos más legibles y mejor contraste',
        'Nuevo formulario de metas con Guardar/Cancelar',
        'Los importes pueden mostrar decimales',
      ],
    },
  },
  {
    version: '1.8.1',
    date: '2026-07-03',
    title: { sv: 'Decimalfix', en: 'Decimal fix', es: 'Corrección de decimales' },
    items: {
      sv: ['Custom-läget hanterar nu decimaltecken korrekt (t.ex. 970,5)'],
      en: ['Custom mode now handles decimal separators correctly (e.g. 970.5)'],
      es: ['El modo personalizado ahora maneja bien los separadores decimales (p. ej. 970,5)'],
    },
  },
  {
    version: '1.8.0',
    date: '2026-07-02',
    title: { sv: 'Tillgänglighet', en: 'Accessibility', es: 'Accesibilidad' },
    items: {
      sv: [
        'Introduktionsguider för tomma vyer',
        'Tydligare flik- och knappnamn för skärmläsare',
        'Fler mobilförbättringar',
        'Enhetligare design',
      ],
      en: [
        'Onboarding guides for empty views',
        'Clearer tab & button names for screen readers',
        'More mobile refinements',
        'A more consistent design',
      ],
      es: [
        'Guías de introducción para vistas vacías',
        'Nombres de pestañas y botones más claros para lectores de pantalla',
        'Más mejoras en móvil',
        'Un diseño más consistente',
      ],
    },
  },
  {
    version: '1.7.0',
    date: '2026-06-30',
    title: { sv: 'Spanska, valutor & teman', en: 'Spanish, currencies & themes', es: 'Español, monedas y temas' },
    items: {
      sv: [
        'Spanska tillagt (svenska/engelska/spanska)',
        'Byt valuta: kr, €, $, £',
        'Temabyggare med paletter och mörkt/ljust läge',
        'Nya layouter: kombinerad och egen (Custom)',
      ],
      en: [
        'Spanish added (Swedish/English/Spanish)',
        'Switch currency: kr, €, $, £',
        'Theme builder with palettes and dark/light mode',
        'New layouts: combined and custom',
      ],
      es: [
        'Español añadido (sueco/inglés/español)',
        'Cambia de moneda: kr, €, $, £',
        'Creador de temas con paletas y modo claro/oscuro',
        'Nuevos diseños: combinado y personalizado',
      ],
    },
  },
  {
    version: '1.6.0',
    date: '2026-06-24',
    title: { sv: 'Pension & år', en: 'Pension & year', es: 'Pensión y año' },
    items: {
      sv: [
        'Pension redovisas som en egen långsiktig hink',
        'Sparande visas nu i årsöversikten',
      ],
      en: [
        'Pension is shown as its own long-term bucket',
        'Savings now appear in the yearly overview',
      ],
      es: [
        'La pensión se muestra como su propia partida a largo plazo',
        'El ahorro ahora aparece en el resumen anual',
      ],
    },
  },
  {
    version: '1.5.0',
    date: '2026-06-23',
    title: { sv: 'Plan & Översikt', en: 'Plan & Overview', es: 'Plan y resumen' },
    items: {
      sv: [
        'Ny flik: Plan & Översikt med sparmål',
        'Byt diagramtyp',
        'Nytt typsnitt',
        'Återställ månad-funktion',
      ],
      en: [
        'New tab: Plan & Overview with savings goals',
        'Switch chart type',
        'New typeface',
        'Reset-month option',
      ],
      es: [
        'Nueva pestaña: Plan y resumen con metas de ahorro',
        'Cambia el tipo de gráfico',
        'Nueva tipografía',
        'Opción de reiniciar el mes',
      ],
    },
  },
  {
    version: '1.4.0',
    date: '2026-06-20',
    title: { sv: 'Ny design (Sorbet)', en: 'New look (Sorbet)', es: 'Nuevo aspecto (Sorbet)' },
    items: {
      sv: [
        'Helt ny visuell design (Sorbet)',
        'Omgjord navigation',
        'Hantera sparkategorier',
        'Mobilpolering',
      ],
      en: [
        'Brand-new visual design (Sorbet)',
        'Reworked navigation',
        'Manage savings categories',
        'Mobile polish',
      ],
      es: [
        'Diseño visual completamente nuevo (Sorbet)',
        'Navegación renovada',
        'Gestiona categorías de ahorro',
        'Mejoras en móvil',
      ],
    },
  },
  {
    version: '1.3.0',
    date: '2026-06-19',
    title: { sv: 'Egna kategorier', en: 'Custom categories', es: 'Categorías propias' },
    items: {
      sv: ['Skapa egna budgetkategorier', 'Påminnelse om säkerhetskopiering'],
      en: ['Create your own budget categories', 'Backup reminder'],
      es: ['Crea tus propias categorías de presupuesto', 'Recordatorio de copia de seguridad'],
    },
  },
  {
    version: '1.2.0',
    date: '2026-06-16',
    title: { sv: 'Säkerhetskopior & översikt', en: 'Backups & overview', es: 'Copias y resumen' },
    items: {
      sv: ['Exportera och importera all data', 'Sparkvot', 'Årsöversikt'],
      en: ['Export and import all your data', 'Savings rate', 'Annual overview'],
      es: ['Exporta e importa todos tus datos', 'Tasa de ahorro', 'Resumen anual'],
    },
  },
  {
    version: '1.1.0',
    date: '2026-06-15',
    title: { sv: 'Två språk', en: 'Two languages', es: 'Dos idiomas' },
    items: {
      sv: [
        'Växla mellan svenska och engelska',
        'Inbyggda etiketter översätts automatiskt',
        'Mobil- och buggfixar',
      ],
      en: [
        'Switch between Swedish and English',
        'Built-in labels translate automatically',
        'Mobile & bug fixes',
      ],
      es: [
        'Cambia entre sueco e inglés',
        'Las etiquetas integradas se traducen automáticamente',
        'Correcciones de móvil y de errores',
      ],
    },
  },
  {
    version: '1.0.0',
    date: '2026-06-13',
    title: { sv: 'Lansering', en: 'Launch', es: 'Lanzamiento' },
    items: {
      sv: [
        'Månadsbudget med inkomster, utgifter och sparande',
        'Fungerar offline som app (PWA)',
        'All data lagras lokalt på din enhet',
      ],
      en: [
        'Monthly budget with income, expenses and savings',
        'Works offline as an app (PWA)',
        'All data stored locally on your device',
      ],
      es: [
        'Presupuesto mensual con ingresos, gastos y ahorro',
        'Funciona sin conexión como app (PWA)',
        'Todos los datos se guardan localmente en tu dispositivo',
      ],
    },
  },
];

/** The current app version — compared against budget_changelog_seen to decide
 *  whether to show the "new update" badge. */
export const LATEST_VERSION = CHANGELOG[0].version;
