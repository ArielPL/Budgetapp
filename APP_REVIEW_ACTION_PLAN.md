# Budget App - UX/UI review och åtgärdsplan

Datum: 2026-07-01  
Syfte: Noggrann UX/UI-review som kan användas som konkret arbetsunderlag för Claude Code.  
Fokus: användarupplevelse, mobilflöden, visuell hierarki, interaktionsdesign, tillgänglighet, komponentstruktur och UI-testbarhet.  
Kodstatus: inga appkodändringar gjordes i samband med denna review. Endast detta dokument är uppdaterat.

## Kort sammanfattning

Budgetappen har en stark grund. Den känns redan som en riktig produkt snarare än en enkel demo. Den största styrkan är att den har flera sammanhängande arbetsytor: budget, sparande, plan, årsöversikt, teman, backup och ett eget custom-läge.

De viktigaste UX/UI-problemen är inte att appen "inte fungerar", utan att användaren ibland behöver gissa nästa steg. Det gäller särskilt första användningen, tomlägen, mobilflöden och avancerade funktioner som Custom-läget.

Prioriterad rekommendation:

1. Gör första användningen tydligare.
2. Förbättra mobilflödet för snabb inmatning.
3. Rätta till tillgängliga namn, labels och testbarhet.
4. Bygg om årsöversiktens mobilpresentation.
5. Gör backup-, meny- och custom-flöden mer fokuserade.

## Begrepp i dokumentet

- **UX**: User Experience. Hur appen känns att använda, om flöden är tydliga och om användaren förstår nästa steg.
- **UI**: User Interface. Det visuella gränssnittet: knappar, kort, färger, text, layout, avstånd och komponenter.
- **Komponent**: En återanvändbar del av gränssnittet, till exempel en knapp, ett budgetkort eller en tab.
- **Tomläge**: Hur en sida ser ut när det inte finns någon data ännu.
- **CTA**: Call To Action. Den viktigaste knappen eller handlingen användaren förväntas ta, till exempel "Kom igång".
- **Tillgänglighet**: Att appen fungerar för fler användare, inklusive skärmläsare, tangentbord och personer med nedsatt syn.
- **ARIA-label**: Ett dolt namn för hjälpmedel. Exempel: en knapp som bara visar `✎` bör ha `aria-label="Redigera kategori"`.
- **Breakpoints**: Skärmstorlekar där layouten ändras, till exempel mobil och desktop.
- **Responsive design**: Att appen anpassar sig till olika skärmstorlekar.
- **Acceptance criteria**: Konkreta krav som visar när en ändring är klar.
- **Design system**: Gemensamma regler för färger, knappar, kort, avstånd, textstorlekar och interaktioner.

## Testad miljö

- Ursprunglig appflik: `http://127.0.0.1:5173/`
- Separat UX-testinstans: `http://127.0.0.1:5175/`
- Desktop viewport: cirka 1280 x 720.
- Mobil viewport: 390 x 844.
- Testdata lades endast in i testinstansen.
- TypeScript-kontroll var tidigare godkänd.
- Webbläsarkonsolen visade inga runtime-fel under tidigare flödestest.

## Berörda nyckelfiler

- `src/App.tsx`
  - Layoutval, meny, backup, tabbläge, combined/custom-växling, starter-knappar.
- `src/components/TabNav.tsx`
  - Fliknavigation, duplicerade tillgängliga namn.
- `src/components/SummaryCards.tsx`
  - Översiktskort för inkomst, utgifter och kvar.
- `src/components/IncomeSection.tsx`
  - Inkomstrader och inmatningsflöde.
- `src/components/ExpenseCategory.tsx`
  - Utgiftskort, kategoriheader, redigering, collapse och rader.
- `src/components/EditableAmount.tsx`
  - Beloppsknappar och beloppsinmatning.
- `src/components/SavingsTab.tsx`
  - Sparflikens tomläge, summary och kategoriinmatning.
- `src/components/PlanTab.tsx`
  - Sparmål, målprogress, anteckningar och planöversikt.
- `src/components/YearTab.tsx`
  - Årsdiagram och årsdata/tabell.
- `src/components/CustomV3.tsx`
  - Custom-läge, hjälpmodal, snabbstart och egna block.
- `src/components/ThemePanel.tsx`
  - Tema, paletter, accentfärg, avancerade färgval.
- `src/components/BackupBanner.tsx`
  - Backup-påminnelse och exportknapp.
- `src/index.css`
  - Nästan all visuell layout, mobilregler, kort, paneler och knappar.

## Vad som fungerar bra idag

- Appen har tydlig produktidé: personlig månadsbudget med sparande och planering.
- Summary-korten ger snabb överblick när data finns.
- Diagrammen gör appen mer levande och hjälper användaren förstå fördelningen.
- Sparmål kopplat till budgetrad är en stark funktion.
- Temapanelen är visuellt trevlig och relativt lätt att förstå.
- Bottennavigationen på mobil sitter bra och är lätt att nå.
- Custom-snabbstarten skapar en ren och app-lik panel.
- Import/export finns, vilket är viktigt eftersom appen sparar lokalt.

## Övergripande UX-bedömning

### Styrkor

- Appen känns rik och personlig.
- Den visuella stilen är sammanhållen.
- Det finns tydliga domäner: budget, sparande, plan, år, custom.
- Mobilupplevelsen är inte en eftertanke; det finns riktig bottennav och mobila paneler.
- Appen har bra potential att senare paketeras som mobilapp.

### Svagheter

- Första användningen är inte tillräckligt guidad.
- Flera viktiga första handlingar ligger för långt ner eller ser sekundära ut.
- Mobilflödet prioriterar ofta överblick före snabb inmatning.
- Några visuella element saknar tydliga tillgängliga namn.
- Årsöversiktens tabell passar inte mobil.
- Backup-bannern är viktig men tar mycket plats och konkurrerar med overlays.
- Custom-läget är kraftfullt men presenterar för mycket information direkt.

## P1 - Gör första användningen mer guidad

### Problem

När användaren öppnar en ny månad utan data visas:

- Inkomstkort: 0 kr.
- Utgiftskort: 0 kr.
- Kvar: +0 kr.
- En inkomstsektion.
- Knappar för att lägga till rad/kategori.
- Knappen "Lägg till startkategorier".
- Ett tomt diagramområde.

Det är rent visuellt, men inte tillräckligt vägledande. Användaren måste själv förstå vad appens rekommenderade första steg är.

### Varför detta spelar roll

För en budgetapp är första minuten avgörande. Om användaren inte snabbt kommer till "aha, jag fyller i min budget här", riskerar appen att kännas tom eller ofärdig.

### Rekommenderad lösning

Skapa ett riktigt onboarding-tomläge för Budgetfliken.

Exempelstruktur:

- Rubrik: "Kom igång med din månadsbudget"
- Kort text: "Välj en färdig mall eller bygg budgeten själv."
- Primär CTA: "Använd budgetmall"
- Sekundär CTA: "Börja från tom budget"
- Tredje mindre länk: "Vad ingår i mallen?"

### UI-riktlinjer

- Placera onboarding-ytan ovanför inkomstsektionen när månaden är helt tom.
- Gör "Använd budgetmall" visuellt primär.
- Minska vikten på "Lägg till rad" i helt tomt läge.
- Visa gärna 2-3 små preview-punkter:
  - Inkomst
  - Boende, mat, transport
  - Sparande

### Berörda filer

- `src/App.tsx`
- `src/components/IncomeSection.tsx`
- `src/index.css`
- `src/i18n.ts`

### Acceptance criteria

- En ny användare ser en tydlig "Kom igång"-yta direkt.
- Primär CTA syns ovanför vikningen på mobil.
- Startmallen går fortfarande att lägga till med ett klick.
- Användaren kan fortfarande välja att börja från tom budget.

## P1 - Gör sparflikens tomläge mer handlingsdrivet

### Problem

Sparfliken visar bra summary-kort, men när det inte finns sparande hamnar "Lägg till startkategorier" som en vanlig knapp längst ner. Den viktigaste första handlingen känns sekundär.

### Rekommenderad lösning

Inför ett specifikt tomläge för sparande.

Exempel:

- Rubrik: "Kom igång med sparande"
- Text: "Lägg till en sparmall med sparkonto, ISK, fonder och pension."
- Primär knapp: "Använd sparmall"
- Sekundär knapp: "Lägg till egen kategori"

### Berörda filer

- `src/components/SavingsTab.tsx`
- `src/App.tsx`
- `src/index.css`
- `src/i18n.ts`

### Acceptance criteria

- Tom sparflik har en tydlig primär handling.
- Startmallen känns rekommenderad, inte gömd.
- Användaren kan fortfarande lägga till egna kategorier direkt.

## P1 - Prioritera snabb inmatning bättre på mobil

### Problem

På mobil visas först:

1. Backup-banner.
2. Summary-kort.
3. Diagram.
4. Inmatningssektioner långt ner.

Det är bra för överblick, men sämre för användaren som öppnar appen för att snabbt lägga in eller ändra belopp.

### Rekommenderad lösning

Skapa en mobilprioritering för Budgetfliken:

- Visa summary-kort kompakt.
- Visa en snabb "Lägg till / ändra belopp"-yta direkt efter summary.
- Flytta diagrammet efter inmatningssektionerna eller gör diagrammet hopfällbart på mobil.

Alternativ:

- Lägg till en mobil toggle:
  - "Registrera"
  - "Analysera"

Rekommendation:

- Första versionen: flytta diagrammet under budgetraderna på mobil.
- Senare version: skapa segmenterad vy "Registrera / Analysera".

### Berörda filer

- `src/App.tsx`
- `src/components/Charts.tsx`
- `src/index.css`

### Acceptance criteria

- På mobil ska användaren nå inkomst- eller utgiftsrader snabbare.
- Diagram ska inte blockera inmatningsflödet.
- Desktoplayouten kan fortsätta visa inmatning vänster och diagram höger.

## P1 - Fixa duplicerade fliknamn

### Problem

Flikarna exponeras med duplicerad text i DOM/tillgänglighetslagret:

- `BudgetBudget`
- `Sparande & InvesteringarSparande`
- `Plan & ÖversiktPlan`
- `ÅrÅr`

Orsak:

- `TabNav.tsx` renderar både lång label och kort label samtidigt.
- CSS döljer visuellt, men båda textdelarna finns kvar för hjälpmedel.

### Rekommenderad lösning

I `TabNav.tsx`:

- Sätt `aria-label` på knappen.
- Sätt `aria-hidden="true"` på rent visuella label-varianter.
- Alternativt rendera bara en label via CSS/JS beroende på breakpoint.

Exempel:

```tsx
<button aria-label={tab.accessibleName}>
  <span aria-hidden="true" className="tab-icon">{tab.icon}</span>
  <span aria-hidden="true" className="tab-label">{tab.label}</span>
  <span aria-hidden="true" className="tab-label-short">{tab.short}</span>
</button>
```

### Berörda filer

- `src/components/TabNav.tsx`
- `src/i18n.ts`

### Acceptance criteria

- Tillgängligt namn för budgetflik är bara "Budget".
- Tillgängligt namn för sparflik är bara "Sparande".
- Tillgängligt namn för planflik är bara "Plan".
- Tillgängligt namn för årsflik är bara "År".
- Visuell design ändras inte negativt.

## P1 - Ge alla ikonknappar tydliga tillgängliga namn

### Problem

Flera knappar har text som bara är symboler:

- `✎`
- `×`
- `▾`
- `▸`
- `–`
- `⚙️`

Många har `title`, men saknar `aria-label`. `title` räcker inte som stabil tillgänglighetslösning.

### Rekommenderad lösning

Lägg `aria-label` på alla ikonknappar.

Exempel:

- Meny: `aria-label="Öppna meny"`
- Redigera kategori: `aria-label="Redigera kategori: Boende"`
- Fäll ihop: `aria-label="Fäll ihop Boende"`
- Expandera: `aria-label="Visa Boende"`
- Ta bort rad: `aria-label="Ta bort rad: Internet"`
- Tomt belopp: `aria-label="Redigera belopp för Internet, nu 0 kr"`

### Berörda filer

- `src/components/MonthNav.tsx`
- `src/components/TabNav.tsx`
- `src/components/ExpenseCategory.tsx`
- `src/components/EditableAmount.tsx`
- `src/components/PlanTab.tsx`
- `src/components/CustomV3.tsx`
- `src/components/BackupBanner.tsx`
- `src/App.tsx`

### Acceptance criteria

- Alla knappar kan identifieras via `role="button"` och ett begripligt namn.
- Ingen viktig knapp exponeras bara som `✎`, `×`, `–`, `▾` eller emoji.
- UI-tester kan använda stabila role/name-selectors.

## P1 - Gör beloppsinmatning mer semantisk och testbar

### Problem

Belopp visas som knappar som blir inputfält efter klick. Det fungerar, men:

- Beloppsknappar saknar specifikt `aria-label`.
- Inputfältet saknar koppling till radens namn.
- Testautomation måste ibland använda sköra positionsselectors.
- Vid test träffade en selector radetiketten i stället för beloppet.

### Rekommenderad lösning

Uppdatera `EditableAmount` så komponenten får kontext:

- `label`
- `testId`
- `ariaLabel`

Exempel på props:

```tsx
<EditableAmount
  value={row.amount}
  onChange={...}
  color={category.color}
  label={shownName(row, lang)}
  testId={`amount-${category.id}-${row.id}`}
/>
```

Knappen bör exponera:

- `aria-label="Redigera belopp för Hyra/Bolån, nu 12 000 kr"`

Inputfältet bör exponera:

- `aria-label="Belopp för Hyra/Bolån"`

### Berörda filer

- `src/components/EditableAmount.tsx`
- `src/components/IncomeSection.tsx`
- `src/components/ExpenseCategory.tsx`
- `src/components/PlanTab.tsx`
- `src/components/CustomV3.tsx`

### Acceptance criteria

- Varje beloppsfält kan hittas med stabilt namn eller `data-testid`.
- Skärmläsare förstår vilken rad beloppet tillhör.
- Tomma belopp exponeras som `0 kr`, inte bara som streck.

## P1 - Bygg om årsöversiktens mobilvy

### Problem

Årsöversikten använder tabell även på mobil. Tabellen är bredare än skärmen:

- `clientWidth`: cirka 364 px.
- `scrollWidth`: cirka 452 px.
- Kolumnen "Kvar" ligger delvis utanför synfältet.

### Rekommenderad lösning

Byt till mobilkort under en viss breakpoint.

Exempel på mobilkort:

```text
Juli
Inkomst   37 500 kr
Utgifter  19 000 kr
Sparande  0 kr
Kvar      +18 500 kr
```

Desktop kan behålla tabellen.

### Berörda filer

- `src/components/YearTab.tsx`
- `src/index.css`

### Acceptance criteria

- På mobil syns alla värden utan horisontell scroll.
- Desktop visar fortfarande tabell.
- Årsdiagrammet ligger kvar ovanför data.
- "Kvar" ska aldrig vara gömt utanför skärmen.

## P1 - Normalisera beloppsformat och decimaler

### Problem

Appen accepterar decimaler, till exempel `970,5`, men presentationen blir inte konsekvent i alla delar. Vissa ytor rundar till hela kronor medan diagram kan visa decimal.

### Rekommenderad produktregel

För en privat budgetapp bör första versionen visa hela kronor överallt.

Regel:

- Input får acceptera `970,5`.
- Värdet sparas gärna som decimal internt.
- UI visar konsekvent `971 kr`.
- Diagram använder samma formatterare som rader och summary-kort.

### Berörda filer

- `src/i18n.ts`
- `src/components/Charts.tsx`
- `src/components/GrowthChart.tsx`
- `src/components/YearTab.tsx`
- `src/components/EditableAmount.tsx`

### Acceptance criteria

- Samma belopp visas likadant i rad, kort och diagram.
- Diagramcentrum visar inte rå decimal om resten av appen visar heltal.
- Valutaformat ändras bara visuellt, utan konvertering.

## P2 - Gör backup-bannern mindre störande

### Problem

Backup-bannern är viktig men tar stor plats, särskilt på mobil. Den visas också bakom overlays som meny och tema.

### UX-risk

Användaren kan uppleva att bannern konkurrerar med det den försöker göra:

- Budgetöversikt.
- Meny.
- Temapanel.
- Custom-introduktion.

### Rekommenderad lösning

Inför två lägen:

1. Full banner första gången.
2. Kompakt banner efter första visningen.

Exempel:

- Full: "Säkerhetskopiera dina data så du inte förlorar dem" + "Exportera nu".
- Kompakt: "Backup rekommenderas" + liten exportknapp.

När meny, tema eller modal är öppen:

- Dölj bannern visuellt bakom overlay.
- Alternativt öka overlay-dim så bannern inte konkurrerar.

### Berörda filer

- `src/components/BackupBanner.tsx`
- `src/App.tsx`
- `src/index.css`

### Acceptance criteria

- Bannern blockerar inte första intrycket på mobil.
- Bannern stör inte tema-/menypaneler.
- Export är fortfarande lätt att hitta.

## P2 - Förbättra menystruktur och farozon

### Problem

Menyn är snygg, men innehåller många olika typer av handlingar:

- Språk.
- Layout.
- Valuta.
- Tema.
- Kopiera budget.
- Export/import.
- Återställ månad.

På mobil är menyn längre än skärmen och destruktiva handlingen "Återställ månad" ligger under vikningen.

### Rekommenderad lösning

Dela menyn i tydligare grupper:

1. Visning
   - Språk
   - Valuta
   - Tema
   - Layout
2. Data
   - Exportera backup
   - Importera backup
3. Kopiera
   - Kopiera till nästa månad
   - Kopiera till resten av året
4. Farozon
   - Återställ aktuell månad

Farozonen bör:

- Ha tydligare rubrik.
- Ha röd/varnande styling.
- Kräva bekräftelse med månadsnamn.

### Berörda filer

- `src/App.tsx`
- `src/index.css`
- `src/i18n.ts`

### Acceptance criteria

- Användaren förstår skillnaden mellan ofarliga inställningar och datahandlingar.
- "Återställ månad" är visuellt separerad.
- Bekräftelsedialogen nämner exakt månad, till exempel "Juli 2026".

## P2 - Stäng meny efter layoutval

### Problem

När användaren väljer "Kombinerad" eller "Anpassad" ligger menyn kvar öppen. På mobil gör det att förändringen känns mindre direkt.

### Rekommenderad lösning

Stäng menyn automatiskt efter layoutval.

### Berörda filer

- `src/App.tsx`

### Acceptance criteria

- Efter layoutval ser användaren direkt vald layout.
- Valet känns omedelbart.

## P2 - Gör Custom-lägets introduktion lättare

### Problem

Custom-läget öppnar en lång hjälpmodal första gången. Innehållet är bra, men det är för mycket innan användaren provat.

### Rekommenderad lösning

Byt från lång introduktion till stegvis introduktion.

Första modal:

- Rubrik: "Bygg din egen budget"
- Kort text: "Skapa block för inkomster, utgifter, sparande och anteckningar."
- Primär knapp: "Snabbstart"
- Sekundär knapp: "Lägg till eget block"
- Länk: "Visa guide"

Flytta långa listan till "Så funkar det".

### Berörda filer

- `src/components/CustomV3.tsx`
- `src/index.css`
- `src/i18n.ts`

### Acceptance criteria

- Första custom-mötet kräver inte lång scroll.
- Användaren kan starta direkt.
- Full hjälp finns kvar, men är inte blockerande.

## P2 - Ge Custom-block rubrikstruktur och labels

### Problem

Custom-snabbstarten är visuellt bra, men blocken exponeras huvudsakligen som stora knappar. Det saknas tydlig rubrikstruktur i DOM efter snabbstart.

### Rekommenderad lösning

För varje custom-block:

- Använd semantisk `section`.
- Lägg synlig eller tillgänglig rubrik.
- Sätt `aria-label` på tile-knappen.
- Lägg `data-testid` på block och viktiga kontroller.

### Berörda filer

- `src/components/CustomV3.tsx`

### Acceptance criteria

- Skärmläsare kan navigera blocken som tydliga sektioner.
- Tester kan välja block via stabilt namn/test-id.

## P2 - Förbättra grafers mobilbeteende

### Problem

Diagrammen fungerar, men Recharts/SVG rapporterar intern overflow med etiketter som "Mat & Dryck". På mobil är diagrammen också ganska höga.

### Rekommenderad lösning

- Korta axis-labels på mobil.
- Visa fullständiga namn i tooltip/legend.
- Sätt mer defensiva marginaler i diagrammen.
- Överväg "visa diagram" som hopfällbar sektion på mobilbudget.

### Berörda filer

- `src/components/Charts.tsx`
- `src/components/GrowthChart.tsx`
- `src/components/YearTab.tsx`
- `src/index.css`

### Acceptance criteria

- Långa kategorinamn klipper inte viktig text.
- Mobilbudgetens diagram tar inte över inmatningsflödet.

## P2 - Förbättra kontrast för sekundär text

### Observation

Ett enklare kontrastprov visade att vissa sekundära texter ligger runt cirka 3:1 i mörkt tema. Det kan vara okej för större text, men är svagt för små labels.

Exempel:

- Custom tile titles använder dämpad text.
- Vissa stäng-/ikonknappar är mycket dämpade.
- Backup-exportknappen bör kontrolleras mot sin bakgrund i alla teman.

### Rekommenderad lösning

- Höj kontrast på små labels.
- Använd `--text-dim` hellre än `--text-muted` för viktiga små labels.
- Testa Sorbet dark/light samt Ocean/Forest/Sunset.

### Berörda filer

- `src/index.css`
- `src/themes.ts`

### Acceptance criteria

- Små labels ska vara läsbara på mobil i mörkt och ljust läge.
- Viktiga knappar ska ha tillräcklig kontrast i alla paletter.

## P2 - Lägg till fokushantering i modaler och paneler

### Problem

Paneler som meny, tema och custom-hjälp fungerar visuellt, men bör förstärkas som riktiga modaler.

### Rekommenderad lösning

- Fokus ska flyttas till panelens första relevanta kontroll när den öppnas.
- Escape ska stänga panelen.
- Fokus ska återgå till knappen som öppnade panelen.
- Bakomliggande innehåll bör inte vara tabbnavigerbart när modal är öppen.

### Berörda filer

- `src/App.tsx`
- `src/components/ThemePanel.tsx`
- `src/components/CustomV3.tsx`

### Acceptance criteria

- Meny, tema och custom-hjälp är möjliga att använda med bara tangentbord.
- Fokus försvinner inte bakom overlay.

## P3 - Uppdatera mikrocopy

### Problem

Vissa texter är funktionella men kan bli mer hjälpsamma.

Exempel:

- "Fyll i utgifter för att se diagram"
- "Lägg till startkategorier"
- "Sparat denna månad"
- "Endast symbol - belopp räknas inte om"

### Rekommenderad copy

- "Fyll i några utgifter så visas diagrammet här."
- "Använd budgetmall"
- "Sparat enligt sparfliken"
- "Byter bara symbol och format. Beloppen räknas inte om."

### Berörda filer

- `src/i18n.ts`

### Acceptance criteria

- Texten förklarar handling och konsekvens.
- Texten är kort nog för mobil.

## P3 - Gör målkort tydligare innan data finns

### Problem

Nytt mål visar ungefär:

- "Sparat - av Mål -"

Det fungerar men kräver att användaren förstår att strecken är redigerbara belopp.

### Rekommenderad lösning

- Visa `0 kr` i stället för `-`.
- Lägg helpertext eller tydligare labels:
  - "Sparat hittills"
  - "Målbelopp"

### Berörda filer

- `src/components/PlanTab.tsx`
- `src/components/EditableAmount.tsx`

### Acceptance criteria

- Ett nytt mål går att förstå utan att klicka runt.

## P3 - README och produktdokumentation

### Problem

README beskriver fortfarande mest Vite-mallen.

### Rekommenderad lösning

Skriv en riktig README:

- Vad appen är.
- Hur den startas lokalt.
- Hur data sparas.
- Hur backup fungerar.
- Hur man bygger appen.
- Kända begränsningar.

### Berörda filer

- `README.md`

### Acceptance criteria

- En ny utvecklare kan förstå och starta projektet på några minuter.

## Föreslagen ny informationsarkitektur

### Budgetflik

Prioritet:

1. Kom igång/tomläge om ingen data finns.
2. Summary-kort.
3. Snabb inmatning.
4. Kategorier.
5. Diagram/analys.

På desktop:

- Summary överst.
- Inmatning vänster.
- Diagram höger.

På mobil:

- Summary kompakt.
- Inmatning före diagram.
- Diagram hopfällbart eller längre ner.

### Sparflik

Prioritet:

1. Sparsummary.
2. Tomläge med sparmall om inga kategorier finns.
3. Sparrader.
4. Diagram.

### Planflik

Prioritet:

1. Sparkvot och målprogress.
2. Aktiva mål.
3. Anteckningar.

Förtydliga vad "Sparat denna månad" baseras på.

### Årsflik

Desktop:

- Diagram.
- Tabell.

Mobil:

- Diagram.
- Månadskort.

### Custom-läge

Första möte:

- Kort introduktion.
- Snabbstart.
- Lägg till eget block.

Efter start:

- Toolbar.
- Block.
- Redigering som sekundärt läge.

## Design system-rekommendationer

### Knapptyper

Definiera tydliga knapptier:

- Primary: viktigaste handlingen.
- Secondary: alternativ handling.
- Ghost: lågprioriterad handling.
- Danger: destruktiv handling.
- Icon: ikonknapp med fast storlek och aria-label.

### Kort

Behåll kortdesignen, men skapa tydligare regler:

- Summary-kort: hög prioritet, större belopp.
- Formkort: tydliga rader och klickbara belopp.
- Empty-state-kort: ska ha rubrik, text och primär CTA.
- Danger-kort: används bara för destruktiva åtgärder.

### Text

Rekommendation:

- Labels ska vara korta.
- Hjälptext ska förklara konsekvens.
- Stora informationsblock ska undvikas på första mötet.

### Ikoner

Emoji fungerar visuellt, men behöver stöd:

- Dekorativa emoji: `aria-hidden="true"`.
- Meningsbärande ikonknappar: `aria-label`.
- Undvik att emoji är enda informationsbäraren.

### Fokus

Alla interaktiva element bör ha:

- Synlig focus-ring.
- Minst cirka 40 x 40 px klickyta på mobil.
- Stabil tabbordning.

## UI-testplan efter förbättringar

### Test 1 - Ny användare

1. Öppna tom månad.
2. Kontrollera att onboarding syns.
3. Klicka "Använd budgetmall".
4. Kontrollera att kategorier skapas.
5. Kontrollera att nästa rekommenderade steg är att fylla i belopp.

### Test 2 - Snabb inmatning på mobil

1. Öppna budget på mobil.
2. Fyll i lön.
3. Fyll i hyra.
4. Kontrollera att summary uppdateras.
5. Kontrollera att användaren inte behöver scrolla orimligt mycket.

### Test 3 - Tillgängliga flikar

1. Läs flikknapparnas tillgängliga namn.
2. Bekräfta att de inte är duplicerade.
3. Växla flik med tangentbord.

### Test 4 - Beloppsfält

1. Hitta belopp via label eller test-id.
2. Redigera belopp.
3. Tryck Enter.
4. Kontrollera uppdaterat värde.
5. Tryck Escape vid redigering och kontrollera att värdet inte ändras.

### Test 5 - Årsöversikt mobil

1. Öppna årsfliken på mobil.
2. Kontrollera att varje månad visas som kort.
3. Kontrollera att Inkomst, Utgifter, Sparande och Kvar syns utan horisontell scroll.

### Test 6 - Meny

1. Öppna meny på mobil.
2. Kontrollera att grupper är tydliga.
3. Byt layout.
4. Kontrollera att menyn stängs.
5. Kontrollera att farozon är visuellt separerad.

### Test 7 - Tema

1. Öppna temapanel.
2. Byt palette.
3. Byt ljust/mörkt.
4. Kontrollera kontrast på små labels.
5. Kontrollera att fokus och stängning fungerar.

### Test 8 - Custom-läge

1. Välj Anpassad layout.
2. Kontrollera att första introduktionen är kort.
3. Klicka Snabbstart.
4. Kontrollera att block har labels och går att navigera.

## Rekommenderad implementationordning

### Sprint 1 - Tillgänglighet och testbarhet

- Fixa duplicerade fliknamn.
- Lägg aria-label på ikonknappar.
- Förbättra `EditableAmount` med label/test-id.
- Lägg focus-hantering på paneler.

### Sprint 2 - Tomlägen och onboarding

- Budgetflikens onboarding.
- Sparflikens onboarding.
- Mikrocopy för tomma diagram.
- Tydligare CTA-hierarki.

### Sprint 3 - Mobilflöden

- Flytta eller fäll ihop diagram på mobilbudget.
- Bygg mobilkort för årsöversikt.
- Förbättra menygrupper och farozon.

### Sprint 4 - Custom och polish

- Kortare Custom-intro.
- Bättre blocksemantik.
- Kontrastpass.
- README.

## Definition of Done

En förbättring bör räknas som klar först när:

- Den fungerar på desktop.
- Den fungerar på mobil.
- Den har tydliga tillgängliga namn.
- Den påverkar inte befintlig data negativt.
- Den är översatt i `i18n.ts` för svenska, engelska och spanska.
- Den har minst manuellt testats i relevant flöde.

## Särskilt att skydda

Dessa delar fungerar bra och bör inte råka försämras:

- Kopplingen mellan sparmål och budgetrad.
- Backup/export/import.
- Månadsväxling utan data bleed.
- Tema-systemet.
- Lokal lagring per månad.
- Pension separat från övrigt sparande.

## Slutbedömning

Appen är på en bra nivå för fortsatt utveckling. Den behöver framför allt UX-polish, bättre mobilprioritering och starkare tillgänglighet. Det är inte nödvändigt att byta teknik eller skriva om allt. De största vinsterna kommer från tydligare tomlägen, bättre labels, bättre mobilflöde och mer konsekvent designsystem.

Om målet är framtida mobilapp i App Store och Google Play bör dessa UX/UI-förbättringar prioriteras innan paketering med till exempel Capacitor. En appbutiksversion behöver kännas mer guidande och app-lik än en webbprototyp.
