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
    version: '1.11.0',
    date: '2026-08-06',
    title: { sv: 'Ett år i Anpassad — och siffror som stämmer', en: 'A year in Custom — and figures that match', es: 'Un año en Personalizado — y cifras que coinciden' },
    items: {
      sv: [
        'Nytt: "Hämta från <förra månaden>" i menyn under Kopiera budget — samma sak som Anpassad layout redan kunde, nu även i Klassisk och Kombinerad',
        'Kopiering flyttar bara inkomster och utgifter, aldrig sparandet. Sparandet är ett registrerat saldo, så en kopia hade fått månaden att påstå ett sparande du aldrig fyllt i — Årsfliken visade "0 kr" i stället för "ej registrerat". Det gällde även "Nästa månad", som nu är rättad',
        'Har månaden redan belopp får du en fråga först, och en tom föregående månad hämtas inte alls',
        'Diagramtypen "Trend" är borttagen ur Anpassad layout. Den ritade alltid staplar, oavsett att den stod som vald. Befintliga block som använder den visas som Staplar och behåller namn, rader, färger, storlek och position',
        'Backup vägrar nu en fil med diagraminställningar appen inte kan visa, i stället för att importera dem och lämna inställningspanelen tom',
        'Nytt: Anpassad layout har en årsöversikt. Växla mellan 📋 Budget och 📅 År högst upp — hela året med in, ut, sparat och kvar, plus totaler. Tidigare såg du bara en månad i taget, eftersom Anpassad döljer flikraden',
        'I årsöversikten visas en månad du aldrig fyllt i som "–", inte som 0 kr. Sparat summeras över året, eftersom Anpassad lagrar vad du la undan varje månad',
        'Nytt: duplicera ett block med ⧉ i redigeringsläget. Kopian får samma rader, färger och diagraminställningar och hamnar direkt efter originalet — men utan belopp, så du fyller i den på nytt',
        'Nytt: färdiga block i "Lägg till block" — Boende, Mat, Transport och Sparande, med rätt typ och förnamngivna rader. De följer språkbytet precis som appens övriga standardnamn',
        'Nytt: en rad under korten som säger något om månaden i stället för att bara visa siffror — största utgiftsposten, hur mycket du la undan, eller ett underskott. Är du nära ett sparmål eller har sparandet växt flera månader i rad står det där i stället',
      ],
      en: [
        'New: "Pull from <last month>" in the menu under Copy budget — what the Custom layout could already do, now in Classic and Combined too',
        'Copying moves income and expenses only, never savings. Savings is a recorded balance, so a copy made the month claim savings you never entered — the Year tab showed "0 kr" instead of "not recorded". That applied to "Next month" too, which is now fixed',
        'If the month already has amounts you get a confirmation first, and an empty previous month is never pulled',
        'The "Trend" chart type is gone from the Custom layout. It always drew bars despite showing as selected. Existing blocks using it now display as Bars and keep their name, rows, colors, size and position',
        'Backup now refuses a file holding chart settings the app cannot display, instead of importing them and leaving the settings panel blank',
        'New: the Custom layout has a year overview. Switch between 📋 Budget and 📅 Year at the top — the whole year with in, out, saved and left, plus totals. Until now you could only ever see one month, because Custom hides the tab bar',
        'In the year overview a month you never filled in shows "–", not 0 kr. Saved is summed across the year, because Custom stores what you set aside each month',
        'New: duplicate a block with ⧉ in edit mode. The copy keeps the same rows, colors and chart settings and lands right after the original — but without amounts, so you fill it in fresh',
        'New: ready-made blocks in "Add block" — Housing, Food, Transport and Savings, with the right type and pre-named rows. They follow a language switch like every other built-in name',
        'New: a line under the summary cards that says something about the month instead of only showing figures — your largest expense, how much you set aside, or a deficit. If a goal is within reach or your savings have grown several months running, it says that instead',
      ],
      es: [
        'Nuevo: "Traer de <mes anterior>" en el menú bajo Copiar presupuesto — lo que el diseño personalizado ya hacía, ahora también en Clásico y Combinado',
        'Copiar mueve solo ingresos y gastos, nunca el ahorro. El ahorro es un saldo registrado, así que una copia hacía que el mes afirmara un ahorro que nunca introdujiste — la pestaña Año mostraba "0 kr" en lugar de "no registrado". También ocurría con "Mes siguiente", ya corregido',
        'Si el mes ya tiene importes se te pregunta primero, y un mes anterior vacío nunca se trae',
        'El tipo de gráfico "Tendencia" se ha eliminado del diseño personalizado. Siempre dibujaba barras aunque apareciera como seleccionado. Los bloques existentes se muestran como Barras y conservan nombre, filas, colores, tamaño y posición',
        'La copia de seguridad ahora rechaza un archivo con ajustes de gráfico que la app no puede mostrar, en lugar de importarlos y dejar el panel vacío',
        'Nuevo: el diseño personalizado tiene una vista anual. Cambia entre 📋 Presupuesto y 📅 Año arriba — todo el año con entradas, salidas, ahorro y resto, más totales. Hasta ahora solo podías ver un mes, porque Personalizado oculta las pestañas',
        'En la vista anual, un mes que nunca rellenaste muestra "–", no 0 kr. El ahorro se suma a lo largo del año, porque Personalizado guarda lo que apartaste cada mes',
        'Nuevo: duplica un bloque con ⧉ en modo edición. La copia conserva filas, colores y ajustes de gráfico y aparece justo después del original — pero sin importes, para que la rellenes de nuevo',
        'Nuevo: bloques listos en "Añadir bloque" — Vivienda, Comida, Transporte y Ahorro, con el tipo correcto y filas ya nombradas. Siguen el cambio de idioma como los demás nombres integrados',
        'Nuevo: una línea bajo las tarjetas que dice algo sobre el mes en vez de solo mostrar cifras — tu mayor gasto, cuánto apartaste o un déficit. Si una meta está cerca o tu ahorro ha crecido varios meses seguidos, lo dice en su lugar',
      ],
    },
  },
  {
    version: '1.10.6',
    date: '2026-07-31',
    title: { sv: 'Målbeloppet också', en: 'The target field too', es: 'También el importe objetivo' },
    items: {
      sv: [
        'Rättat: blockets målbelopp i Anpassad layout hade samma fel som beloppsfälten — "1e309" blev tyst målet 1 309 kr, och några hundra siffror gjorde att målet försvann helt',
        'Målbeloppet visar nu samma tydliga fel som övriga belopp, och ditt tidigare mål står kvar',
      ],
      en: [
        'Fixed: the block target field in Custom layout had the same bug as the amount fields — "1e309" quietly became a target of 1,309 kr, and a few hundred digits made the target disappear entirely',
        'The target field now shows the same clear error as every other amount, and your previous target stands',
      ],
      es: [
        'Corregido: el importe objetivo del bloque en el diseño personalizado tenía el mismo fallo que los importes — "1e309" se convertía silenciosamente en un objetivo de 1.309 kr, y unos cientos de dígitos hacían desaparecer el objetivo',
        'El importe objetivo muestra ahora el mismo error claro que los demás importes, y tu objetivo anterior se mantiene',
      ],
    },
  },
  {
    version: '1.10.5',
    date: '2026-07-30',
    title: { sv: 'Inga tysta ändringar', en: 'No silent changes', es: 'Sin cambios silenciosos' },
    items: {
      sv: [
        'Rättat: i Anpassad layout kunde "1e309" tyst bli 1 309 kr och sparas — appen ändrar aldrig ditt belopp längre, den säger ifrån',
        'Ogiltiga belopp i Anpassad layout visar nu samma tydliga fel som Budget, och din summa ligger kvar',
        'Rättat: säkerhetskopior godkände Custom-belopp som appen sedan nollställde vid inläsning — de avvisas nu direkt',
        'Rättat: sektionsrubriken hamnade delvis bakom snabbnavigeringen på smala mobiler',
        'Sparmål: felmeddelandet beskriver nu vad som faktiskt är fel — tomt, noll eller ogiltigt belopp',
      ],
      en: [
        'Fixed: in Custom layout "1e309" could quietly become 1,309 kr and be saved — the app never rewrites your amount now, it tells you',
        'Invalid amounts in Custom layout show the same clear error as Budget, and your total stays put',
        'Fixed: backups accepted Custom amounts the app then reset to 0 on load — they are now rejected up front',
        'Fixed: the section heading sat partly behind the quick-nav on narrow phones',
        'Savings goals: the error now describes the actual problem — blank, zero, or an invalid amount',
      ],
      es: [
        'Corregido: en el diseño personalizado "1e309" podía convertirse silenciosamente en 1.309 kr y guardarse — la app ya nunca reescribe tu importe, te avisa',
        'Los importes no válidos en el diseño personalizado muestran el mismo error claro que Presupuesto, y tu total se mantiene',
        'Corregido: las copias aceptaban importes personalizados que la app luego ponía a 0 al cargar — ahora se rechazan de entrada',
        'Corregido: el título de sección quedaba parcialmente detrás de la navegación rápida en móviles estrechos',
        'Metas de ahorro: el error ahora describe el problema real — vacío, cero o importe no válido',
      ],
    },
  },
  {
    version: '1.10.4',
    date: '2026-07-26',
    title: { sv: 'Säkrare belopp', en: 'Safer amounts', es: 'Importes más seguros' },
    items: {
      sv: [
        'Rättat: extrema tal (som 1e309 eller 400 siffror) visades som "infinity kr" och blev tyst 0 kr efter omladdning — nu avvisas de med ett tydligt fel och ditt tidigare belopp står kvar',
        'Samma beloppsregler gäller nu överallt: budget, sparmål, egen layout och import av säkerhetskopia',
        'Belopp som redan blivit trasiga i lagringen läses nu som 0 istället för att förstöra hela summan',
        'Underskott syns tydligt: eget färgläge och texten "Underskott: X kr" — inte bara en röd siffra på grön bakgrund',
        'Bättre kontrast i sammanfattningskorten (klarar WCAG AA i alla paletter och båda temana)',
        'Säkerhetskopior kontrollerar nu hela sparmålet — namn, datum och färg, inte bara beloppen',
        'Snabbnavigeringen i Kombinerad layout visar hela ordet även på de smalaste mobilerna',
        'Accentfärgerna har riktiga namn och berättar för skärmläsare vilken som är vald',
        '"Kvar att leva på" räknas nu på hela månaden och står stilla — förut växte siffran ju närmare månadsskiftet man kom',
        'Beloppen i budgetraderna är mörkare och lättare att läsa, och står nu i en rak kolumn även när raden har en ta bort-knapp',
      ],
      en: [
        'Fixed: extreme numbers (like 1e309 or 400 digits) showed as "infinity kr" and silently became 0 kr after a reload — they are now rejected with a clear error and your previous amount stands',
        'The same amount rules now apply everywhere: budget, savings goals, custom layout and backup import',
        'Amounts already corrupted in storage now read as 0 instead of poisoning the whole total',
        'Overspending is unmistakable: its own colour state and the words "Overspend: X" — not just a red number on a green card',
        'Better contrast in the summary cards (WCAG AA in every palette and both themes)',
        'Backups now validate the whole savings goal — name, deadline and colour, not just the amounts',
        'The Combined quick-nav shows the full word even on the narrowest phones',
        'Accent colours have real names and tell screen readers which one is selected',
        '"Left to live on" is now based on the whole month and stays put — the figure used to climb as the month ran out',
        'Row amounts are darker and easier to read, and now line up in a straight column even when a row has a delete button',
      ],
      es: [
        'Corregido: los números extremos (como 1e309 o 400 dígitos) se mostraban como "infinity kr" y pasaban silenciosamente a 0 kr tras recargar — ahora se rechazan con un error claro y tu importe anterior se mantiene',
        'Las mismas reglas de importe se aplican en todas partes: presupuesto, metas, diseño personalizado e importación de copias',
        'Los importes ya dañados en el almacenamiento se leen como 0 en vez de estropear todo el total',
        'El déficit se ve claramente: su propio estado de color y el texto "Déficit: X" — no solo un número rojo sobre fondo verde',
        'Mejor contraste en las tarjetas de resumen (WCAG AA en todas las paletas y ambos temas)',
        'Las copias de seguridad validan la meta completa — nombre, fecha y color, no solo los importes',
        'La navegación rápida del diseño combinado muestra la palabra completa incluso en los móviles más estrechos',
        'Los colores de acento tienen nombres reales e indican a los lectores de pantalla cuál está seleccionado',
        '"Para vivir este mes" se calcula sobre el mes completo y ya no cambia — antes la cifra subía a medida que acababa el mes',
        'Los importes de las filas son más oscuros y legibles, y ahora se alinean en columna aunque la fila tenga botón de eliminar',
      ],
    },
  },
  {
    version: '1.10.3',
    date: '2026-07-25',
    title: { sv: 'Sparmål i budgeten', en: 'Goals in the budget', es: 'Metas en el presupuesto' },
    items: {
      sv: [
        'Rättat: sparmålens rader dök upp i månader som redan passerat — avslutade månader lämnas nu orörda',
        'Rättat: att bara bläddra till en månad skriver inte längre om den; raden erbjuds men sparas först när du fyller i något',
        'Rättat: en borttagen målrad kom tillbaka med 0 kr och åt upp beloppet som stod där — nu stannar den borta och målet behåller det du sparat',
        'Städar automatiskt bort de spökrader som den gamla versionen redan hunnit spara i passerade månader — rader med pengar i behålls',
      ],
      en: [
        'Fixed: savings-goal rows appeared in months that had already ended — finished months are now left untouched',
        'Fixed: merely browsing to a month no longer rewrites it; the row is offered but only saved once you enter something',
        'Fixed: a deleted goal row came back at 0 kr and swallowed the amount that was in it — it now stays gone and the goal keeps what you saved',
        'Automatically clears the leftover rows the old version had already saved into finished months — rows with money in them are kept',
      ],
      es: [
        'Corregido: las filas de metas aparecían en meses ya terminados — los meses cerrados ahora quedan intactos',
        'Corregido: con solo abrir un mes ya no se reescribe; la fila se ofrece pero solo se guarda cuando introduces algo',
        'Corregido: una fila de meta eliminada volvía con 0 kr y se comía el importe que había — ahora no vuelve y la meta conserva lo ahorrado',
        'Limpia automáticamente las filas que la versión anterior ya había guardado en meses cerrados — las filas con dinero se conservan',
      ],
    },
  },
  {
    version: '1.10.1',
    date: '2026-07-19',
    title: { sv: 'Trygghetsfixar', en: 'Trust fixes', es: 'Correcciones de confianza' },
    items: {
      sv: [
        'Rättat: sparmallen kunde visa ett stort uttag du aldrig gjort — att skapa kategorier räknas inte längre som ett registrerat saldo',
        'Rättat: snabbnavigeringen i Kombinerad layout täckte månadsväljaren och menyn på mobil',
        'Rättat: en dold skärmläsartabell kunde göra hela sidan sidledes-scrollbar på mobil',
        'År-fliken visar nu tydligt att helårsraden är "Sparat under året" och berättar vilken decembermånad som saknas',
        'Ett skrivfel i sparplanen nollställer inte längre prognosen — grafen behåller senaste giltiga värde',
        'Säkerhetskopior kontrolleras nu med exakt samma regler som appen — en godkänd import kan inte tappa sparplanen',
        'Custom-dialoger har nu riktiga namn för skärmläsare',
        'Extremt stora kategorisummor trycker inte längre bort kategorinamnet',
      ],
      en: [
        'Fixed: the savings template could show a large withdrawal you never made — creating categories no longer counts as a recorded balance',
        'Fixed: the quick-nav in Combined layout covered the month selector and menu on mobile',
        'Fixed: a hidden screen-reader table could make the whole page scroll sideways on mobile',
        'The Year tab now clearly labels the full-year row as "Saved during the year" and tells you which December is missing',
        'A typo in the savings plan no longer zeroes the projection — the chart keeps the last valid value',
        'Backups are now checked with exactly the app\'s own rules — an approved import can\'t silently lose the savings plan',
        'Custom dialogs now have real names for screen readers',
        'Extremely large category totals no longer push out the category name',
      ],
      es: [
        'Corregido: la plantilla de ahorro podía mostrar una gran retirada que nunca hiciste — crear categorías ya no cuenta como saldo registrado',
        'Corregido: la navegación rápida del diseño combinado tapaba el selector de mes y el menú en móvil',
        'Corregido: una tabla oculta para lectores de pantalla podía hacer que toda la página se desplazara lateralmente',
        'La pestaña Año ahora etiqueta claramente la fila anual como "Ahorrado durante el año" e indica qué diciembre falta',
        'Un error al escribir en el plan de ahorro ya no pone la proyección a cero — el gráfico mantiene el último valor válido',
        'Las copias de seguridad se validan con las mismas reglas de la app — una importación aprobada no puede perder el plan',
        'Los diálogos de Custom ahora tienen nombres reales para lectores de pantalla',
        'Los importes de categoría extremadamente grandes ya no ocultan el nombre de la categoría',
      ],
    },
  },
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
