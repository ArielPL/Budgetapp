> ## ✅ AVSLUTAD — kollad och fixad
>
> **Status: alla sex fynd är åtgärdade och verifierade.** Rättningarna ligger i
> `e620068` på `development`, som en del av v1.11.0.
>
> **Dokumentet nedan är historik. Följ inte dess instruktioner.** Texten är
> bevarad ordagrant som den skrevs 2026-09-05, vilket betyder att den fortfarande
> säger saker som "ingen rättning av appkoden är ännu godkänd" och beskriver
> buggar i presens. Det stämde då. Det stämmer inte nu.
>
> | Fynd | Åtgärdat | Verifierat med |
> |---|---|---|
> | F1 — två flikar skriver över varandra | ✅ | 8 enhetstester + två riktiga flikar, inkl. flik med öppet inmatningsfält |
> | F2 — menyn kopierar fel layout | ✅ | 2 enhetstester som monterar App + webbläsare i båda layouterna |
> | F3 — ogiltigt språk stoppar appen | ✅ | 9 enhetstester + start från skadad lagring + riktig filimport |
> | F4 — lagringsfel saknar hantering | ✅ | 10 enhetstester + **verkligt fullt localStorage** (~99 MB) med återförsök |
> | F5 — procent mot fel bas | ✅ | 4 enhetstester + webbläsare |
> | F6 — belopp klipps på mobil | ✅ | Mätt vid 320, 360 och 390 px |
>
> Utöver rapportens omfattning: `resetCurrentMonth` visade sig ha samma
> layoutsammanblandning som F2 och togs med. Långa belopp trappas ner ett steg
> under 360 px i stället för att klippas.
>
> Testsviten gick från 417 till 458 tester (19 → 25 filer). Lint och strict build
> rena.
>
> **Två saker står medvetet öppna:**
>
> - Anpassad layout ingår **inte** i F1-fixen — dess egna nycklar bevakas inte.
>   Felet reproducerades aldrig där, och användaren valde att avstå.
> - Kontroll i en **riktig mobil webbläsare** återstår. 320/360/390 px mättes i
>   en emulerad desktop-motor; iOS Safari renderar text med egna regler, och F6
>   handlar om hur bred en textsträng blir.

---

# Budgetapp – granskningsrapport och rättningsplan för Claude Code

Datum: 2026-09-05  
Projekt: `/Users/ariel/Developer/budgetapp`  
Granskad commit: `a60c0a3` – `Name a row's period once, not twice (v1.11.0)`

## Uppdrag och tillstånd

Det här dokumentet beskriver sex fynd från en ny granskning av kod, UI och UX. Det ska kunna användas utan tillgång till den tidigare konversationen.

**Användaren har beställt granskningen och detta dokument. Ingen rättning av appkoden är ännu godkänd.** Läs och verifiera fynden först. Börja implementera först när användaren uttryckligen ger tillstånd. Att dokumentet innehåller åtgärdsförslag innebär inte i sig ett sådant tillstånd.

När rättningar är godkända:

- Läs `CLAUDE.md` och eventuella aktuella projektinstruktioner. Kontrollera aktuell branch, commit och arbetskopia; fynden avser versionen ovan.
- Skydda verkliga budgetuppgifter. Testa med syntetiska data i en isolerad webbläsarprofil eller på en separat lokal origin. En origin är kombinationen protokoll, värdnamn och port; två flikar på samma origin delar normalt localStorage.
- Granska eller ändra inte Authentication/inloggning. Lämna den parkerade `authorization`-branchen utanför.
- Gör avgränsade rättningar. Undvik orelaterade ombyggnader och nya beroenden utan konkret behov.
- Radera inte användarens localStorage, säkerhetskopior eller historik som en del av en rättning. En skyddsåtgärd får inte bygga på att befintliga data nollställs.
- Commit, push, merge och publicering kräver separat uttryckligt tillstånd enligt projektets arbetsflöde. Ingen publicering ingår i denna rapport.
- Rapportera på svenska och förklara tekniska termer kortfattat.

## Projektet i korthet

Appen använder React, TypeScript, Vite och Recharts. Budgetdata ligger i webbläsarens localStorage, utan backend.

- Klassisk och kombinerad layout använder gemensamma månadsdata: `budget_<år>_<månadsindex>`. Månadsindex är 0–11, så september 2026 är `budget_2026_8`.
- Anpassad layout har separat struktur och separata månadsbelopp, bland annat `budget_custom_v3`, `budget_custom_v3_values_*` och historiska struktursnapshots i `budget_custom_v3_meta_*`.
- Budgetkopiering för klassisk/kombinerad layout avser inkomster och utgifter. Sparandeflikens belopp är saldon, inte månatliga insättningar. Kopiering får inte skapa påhittade saldoregistreringar.
- Anpassad layouts historiska klassificering får inte ändras oavsiktligt när dagens struktur redigeras.
- Språken är svenska, engelska och spanska. Valutabyte ändrar format/symbol, inte beloppens värde.

Kommandon från projektroten:

```sh
nvm use
npm test
npm run lint
npm run build
```

Node-versionen finns i `.nvmrc`. Kör testerna tillsammans enligt `CLAUDE.md`; gamla problem från projektets tidigare iCloud-plats ska inte antas gälla nu.

## Verifieringsläge vid granskningen

- 19 befintliga testfiler, **417 av 417 tester passerade**.
- `npm run lint` slutfördes utan fel.
- Produktionsbygget slutfördes utan fel. Byggresultatet skrevs till `/private/tmp/budget-audit-0905-dist` för att lämna befintlig `dist` orörd.
- Fyra ytterligare diagnostiska tester i `/private/tmp/budget-audit-0905/` slutfördes. De verifierade felutfall och en avvisad trasig JSON-sträng; de innebär inte att dessa funktioner är felfria. Tillfälliga filer kan ha försvunnit och är inget krav för att använda dokumentet.
- Webbläsartestningen gjordes på `http://127.0.0.1:5197` med påhittade uppgifter. Testservern stoppades efter granskningen.
- Datorvy samt bredderna 320, 390 och 768 pixlar inspekterades. Stickprov gjordes av språk och ljust/mörkt tema.
- Ingen projektkod ändrades under granskningen.

**Inte färdigverifierat:** exportens nedladdning, hela import-/återställningsflödet i webbläsaren, offlineinstallation, riktiga mobila webbläsare och fullständig tillgänglighetskontroll. Webbläsarverktyget bekräftade varken nedladdningen eller att den valda importfilen behandlades. Detta är en verifieringsbegränsning, inte bevis för ett produktfel.

## Prioritering

| ID | Prioritet | Fynd | Evidens |
|---|---|---|---|
| F1 | P0 – Kritiskt | Två flikar skriver över varandras sparade ändringar | Reproducerat i webbläsaren |
| F2 | P1 – Viktigt | Huvudmenyn kopierar klassisk budget när anpassad layout visas | Reproducerat i webbläsaren |
| F3 | P1 – Viktigt | Importerat ogiltigt språk godtas och stoppar nästa rendering | Riktat kod- och komponenttest |
| F4 | P1 – Viktigt | Vanlig sparning hanterar inte nekad lagringsskrivning | Riktat funktionstest; UI-konsekvens återstår |
| F5 | P2 – Bör förbättras | Diagrammets procenttext använder en annan bas än cirkeln | Webbläsare och kod |
| F6 | P2 – Bör förbättras | Sammanfattningsbelopp klipps på mobil | Visuellt verifierat vid 320 och 390 px |

P0 används för F1 enligt användarens kriterium: risk för dataförlust. Fyndet gäller det konkreta tvåfliksfallet; det innebär inte att varje vanlig sparning förlorar data. Inga separata P3-fynd ingår.

## F1 – P0: Sparade ändringar försvinner mellan två flikar

### Plats och orsak

`src/App.tsx`, framför allt sparningseffekten kring rad 382–393, och `src/defaults.ts`, `saveMonthData`.

Varje flik håller en egen kopia av månaden i minnet. När en rad ändras sparas hela månadsobjektet. En annan fliks nyare uppgifter beaktas inte i det verifierade flödet.

### Reproduktion

1. Skapa en testbudget för september 2026 med lön `30 000,50` och hyra `10 000`.
2. Öppna samma origin och månad i en andra flik. Båda ska först visa samma belopp.
3. Ändra lönen i flik A till `31 000` och avsluta redigeringen. Kontrollera att A visar det nya beloppet.
4. Ändra hyran i flik B till `11 000` och avsluta redigeringen.
5. Ladda om A.

**Observerat:** hyran är `11 000`, men lönen har återgått till `30 000,50`. Ingen konfliktvarning visades.

### Rättningsinriktning

Inför en sammanhängande strategi för flera flikar: upptäck externa ändringar och kontrollera att sparningen inte bygger på en föråldrad version. Exempelvis kan `storage`-händelser kombineras med versionskontroll och tydlig konflikthantering. Att bara läsa om data när fliken får fokus är inte i sig ett fullständigt skydd mot samtidiga skrivningar.

Bevara pågående redigeringar. Skriv inte automatiskt över ett osparat utkast när en extern ändring kommer. Undvik att uppdateringar mellan flikar utlöser en loop av nya skrivningar. Undersök samma risk i anpassad layout och plan-/måldata; där har felet inte reproducerats i denna granskning.

### Acceptanskriterier och eftertester

- Ändringar i olika fält från två flikar bevaras, alternativt stoppas den senare sparningen med en begriplig konfliktvarning före överskrivning.
- Ändringar i samma fält har en uttrycklig konfliktpolicy som inte tyst förlorar användarens redigering.
- Omladdning visar det avsedda, beständigt sparade resultatet.
- Månad A skrivs aldrig till månad B vid navigering eller extern uppdatering.
- Testa två flikar med olika fält, samma fält, olika månader och en flik med aktivt inmatningsfält. Upprepa för klassisk/kombinerad och anpassad layout.
- Lägg till regressionstester som verifierar användarresultatet, inte bara att en händelselyssnare finns i koden.

## F2 – P1: Huvudmenyn kopierar fel layout

### Plats och orsak

`src/App.tsx`: `copyFromPrevMonth`, `copyToNextMonth`, `copyToAllRemaining` och menyknapparna kring rad 1187–1194.

Huvudmenyn visas även i anpassat läge, men kopieringsfunktionerna arbetar med klassiska månadsdata. Anpassad layouts egen knapp för föregående månad är en annan funktion.

### Reproduktion

1. Skapa klassisk oktoberbudget med lön `30 000,50` och hyra `10 000`.
2. Skapa anpassad oktoberbudget med inkomst `25 000`.
3. Med anpassad layout aktiv: öppna huvudmenyn och välj nästa månad, november.
4. Kontrollera bekräftelsen och navigera till november i anpassad layout.
5. Byt därefter till klassisk layout för samma november.

**Observerat:** appen säger att kopieringen lyckades. Anpassad november visar `0`, medan klassisk november har fått `30 000,50` i inkomst och `10 000` i utgifter.

Den anpassade layoutens egen knapp ”Kopiera förra månaden” fungerade i det testade fallet september → oktober.

### Rättningsinriktning

Låt huvudmenyn följa aktiv layout, eller dölj/tydliggör de åtgärder som endast gäller klassisk/kombinerad budget. Använd inte ett lyckat meddelande för en annan datamängd än den användaren avser. Granska även huvudmenyns återställningsåtgärd för motsvarande sammanblandning; något återställningsfel är inte verifierat här.

### Acceptanskriterier och eftertester

- Källa, mål och layout är entydiga för användaren.
- En åtgärd i anpassat läge ändrar inte den klassiska budgeten utan ett uttryckligt, begripligt val.
- Bekräftelsetexten motsvarar faktiskt genomförd åtgärd.
- Befintliga målbudgetar skyddas med korrekt varning före ersättning.
- Testa föregående månad, nästa månad och alla återstående månader i alla layouter, inklusive december → januari.
- Verifiera att andra layoutens uppgifter och sparandets saldoregistreringar bevaras.

## F3 – P1: Ogiltig språkinställning i backup stoppar appen

### Plats och orsak

`src/backup.ts`, `isValidValue` kring rad 195–213, samt `src/App.tsx` kring rad 123 och uppslaget `translations[lang]`.

Kända språkinställningar godtas som godtyckliga strängar vid import. Appstarten typkonverterar det lagrade värdet till `Lang` utan att kontrollera att språket faktiskt finns. En TypeScript-typkonvertering validerar inte data vid körning.

### Reproduktion och verifieringsgräns

Följande minimala syntetiska backup reproducerar felet genom `checkBackup` → `applyBackup` → rendering av `App` i en isolerad komponenttestmiljö:

```json
{
  "app": "budget",
  "version": 1,
  "data": {
    "budget_lang": "xx",
    "budget_welcome_seen": "1"
  }
}
```

**Observerat i test:** valideringen godkänner filen, appliceringen lyckas och nästa rendering kastar `Cannot read properties of undefined (reading 'onboardBudgetTitle')`.

Hela filvalet och importen har inte verifierats i en riktig webbläsare. Använd aldrig ovanstående ersättningsbackup på verkliga användardata; den saknar budgetuppgifter.

### Rättningsinriktning

Validera kända inställningsnycklar enligt deras tillåtna värden. Lägg också ett defensivt standardvärde vid appstart så att redan skadade inställningar inte låser användaren ute. Kontrollera särskilt valuta med samma princip. Okända framtida nycklar ska inte slentrianmässigt förväxlas med kända nycklar som har ogiltiga värden.

### Acceptanskriterier och eftertester

- Ogiltigt språk avvisas före ersättning av befintliga data.
- En redan lagrad ogiltig språkinställning hindrar inte appstart och förstör inga budgetuppgifter.
- Giltiga säkerhetskopior och alla tre stödda språk fungerar fortfarande.
- Testa saknat språk, tomt språk, `sv`, `en`, `es`, `xx` och motsvarande ogiltiga valutavärden.
- Verifiera avbruten och nekad import samt en giltig export/import-rundtur i webbläsaren med isolerad testdata.

## F4 – P1: Lagringsfel saknar hantering vid vanlig sparning

### Plats och verifierat beteende

`src/defaults.ts`, `saveMonthData` kring rad 389–397, anropet i `src/App.tsx` kring rad 392 samt direkta skrivningar i `src/components/CustomV3.tsx`.

Ett funktionstest lät lagringens `setItem` kasta ett simulerat `QuotaExceededError`. `saveMonthData` förde felet vidare. Den vanliga sparvägen saknar hantering vid det aktuella anropet.

**Det är inte verifierat hur hela gränssnittet beter sig när en riktig webbläsare får full lagring.** Beskriv därför inte en blank sida eller förlust av äldre sparade data som reproducerad för detta fynd.

### Risk och rättningsinriktning

En redigerad uppgift i gränssnittet kan vara osparad. Användaren behöver ett tydligt besked och ett sätt att rädda den. Fånga sparfel, behåll osparade uppgifter i minnet och ge möjlighet att försöka igen eller exportera dem. En export av endast gamla localStorage-värden räddar inte nödvändigtvis det aktuella osparade utkastet.

I anpassat läge skrivs belopp och struktursnapshot separat. Kontrollera även fel mellan dessa skrivningar och bevara en sammanhängande historik.

### Acceptanskriterier och eftertester

- Misslyckad sparning signaleras tydligt utan att påstå att ändringen är sparad.
- Befintliga sparade uppgifter förblir intakta och osparade ändringar kan räddas.
- Återförsök fungerar när lagringen åter blir tillgänglig.
- Testa nekad skrivning, verklig kvotbegränsning i isolerad miljö, upprepade fel och återhämtning.
- Testa fel mellan anpassad layouts två skrivningar och omladdning efter detta.
- Dokumentera faktisk UI-konsekvens före och efter rättning.

## F5 – P2: Diagram och procentförklaring använder olika bas

### Plats och reproduktion

`src/components/Charts.tsx`, `ExpenseChart` och funktionen `pct` kring rad 78–88.

1. Ange ungefär `30 000` i inkomst.
2. Ange endast boendeutgiften `10 000`.
3. Läs diagrammet ”Utgiftsfördelning” och dess förklaring.

**Observerat:** boende fyller hela cirkeln men har texten `33 %`. Cirkeln visar andel av utgifterna. Texten visar andel av inkomsten när inkomsten är större än noll, annars andel av utgifterna.

### Rättningsinriktning

Välj en begriplig och konsekvent definition. För ett utgiftsfördelningsdiagram bör kategorins procent normalt räknas mot totalutgiften. Om inkomsten ska visas som separat jämförelse behöver detta uttryckligen stå i etiketten. Undvik att samma procentetikett byter betydelse beroende på om inkomsten är noll.

### Acceptanskriterier och eftertester

- En ensam utgiftskategori motsvarar 100 % av utgifterna i förklaringen, eller en separat inkomstjämförelse är otvetydigt märkt.
- Procenttextens definition överensstämmer med det visuella diagrammet eller skiljs tydligt från det.
- Testa en kategori, flera kategorier, noll inkomst, noll utgifter och underskott. Mindre avrundningsskillnader i summan av procenttal är acceptabla.
- Kontrollera de diagramtyper och layouter som återanvänder funktionen samt översättningarna.

## F6 – P2: Sammanfattningsbelopp klipps på mobil

### Plats och reproduktion

`src/index.css`, mobilregler för `.summary-cards` och `.summary-card .card-amount` kring rad 3953–3972.

1. Öppna klassisk budget vid 390 pixlars bredd.
2. Ange inkomst `30 000,50` och hyra `11 000`.
3. Läs korten högst upp. Upprepa vid 320 pixlar.

**Observerat:** belopp klipps med tre punkter, exempelvis `30 000,50…` och `+19 000,5…`. Felet kräver alltså inte extrema summor. Tre kort tvingas ligga bredvid varandra och beloppen använder `overflow: hidden` med `text-overflow: ellipsis`.

### Rättningsinriktning

Anpassa kortlayout eller beloppsvisning så att vanlig budgetinformation är direkt läsbar. Undvik att lösa problemet med mycket liten text eller enbart en hover-tooltip, eftersom pekskärmsanvändare behöver nå det fullständiga värdet. Om kompakt notation används ska den vara tydlig och det exakta beloppet lätt åtkomligt.

### Acceptanskriterier och eftertester

- Normala belopp med ören visas fullständigt, inklusive tecken och valuta, vid 320 och 390 pixlar.
- Även större belopp hanteras begripligt utan att viktiga kontroller hamnar utanför skärmen.
- Testa 320, 390, 768 pixlar och datorbredd; noll, ören, underskott och stora tillåtna belopp.
- Kontrollera svenska, engelska och spanska, valutorna samt ljust och mörkt tema.
- Kontrollera läsbarhet med textförstoring. Spara före-/efterbilder som visar samma värden och skärmstorlekar.

## Gemensam slutverifiering efter godkända rättningar

1. Kör riktade regressionstester för ändringarna, därefter hela befintliga testsamlingen, lint och produktionsbygget.
2. Testa faktisk användning i isolerad webbläsare: inmatning → avslutad redigering → navigering → omladdning → kontroll av beständigt resultat.
3. Kontrollera att felaktiga belopp fortfarande avvisas och att tomma fält följer appens avsedda nollbeteende.
4. Kontrollera att sparmålens budgetkoppling, sparandets okända saldon och historiska månadsdata bevaras.
5. Slutför export/import-rundturen. Jämför innehållet före export med återställda data; kontrollera även att avbruten import inte ändrar något.
6. Kontrollera arbetskopians diff så att bara avsedda filer ändrats. Följ projektets krav på ändringslogg inför en eventuell release.

## Förväntad slutrapport från Claude Code

Rapportera per fynd: **rättat och verifierat**, **delvis klart**, **ej reproducerat** eller **blockerat**. Ange vad som ändrades, varför, vilka filer som berördes och hur acceptanskriterierna verifierades.

Ange exakt antal slutförda tester och resultat för lint och build. Ett avbrutet test, en timeout eller ett test som inte kunde starta är inte godkänt. Skilj webbläsarverifiering från kodtester och slutsatser som endast bygger på kodläsning.

Redovisa kvarvarande risker och verifieringsbegränsningar. Gör ingen commit, push eller publicering utan det tillstånd som krävs.
