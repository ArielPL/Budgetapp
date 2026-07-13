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
    date: '2026-07-13',
    title: { sv: 'Sparplan', en: 'Savings plan', es: 'Plan de ahorro' },
    items: {
      sv: [
        'Ny sparplan i Plan-fliken: ange månadssparande och förväntad avkastning',
        'Se din prognos 5 år framåt — med ränta på ränta',
        '"Plan mot verklighet": ligger du före eller efter din plan?',
      ],
      en: [
        'New savings plan in the Plan tab: set monthly saving and expected return',
        'See your 5-year projection — with compound growth',
        '"Plan vs reality": are you ahead of or behind your plan?',
      ],
      es: [
        'Nuevo plan de ahorro en Plan: define ahorro mensual y rendimiento esperado',
        'Mira tu proyección a 5 años — con interés compuesto',
        '"Plan frente a realidad": ¿vas por delante o por detrás de tu plan?',
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
