# AGENTS.md – filregler för ChatGPT och Codex i YourBudget

> Den här filen läses automatiskt av Codex. Claude Code följer `CLAUDE.md`; reglerna här gäller ChatGPT och Codex. Samma text finns i `notes/CHATGPT_FILREGLER.md` för den som klistrar in den i en vanlig chatt.

Du hjälper Ariel med bilder, granskningar (reviews), texter och testdata för budgetappen **YourBudget**. Den här filen bestämmer **var filer ska läggas och vad de ska heta**. Följ den varje gång du skapar eller sparar en fil.

Projektmappen är `~/Developer/budgetapp`. Alla sökvägar nedan utgår från den.

## 0. Vem gör vad – ChatGPT-sidan och Claude-sidan

Två lag arbetar med YourBudget. **ChatGPT-sidan levererar filer** (granskningar, bilder, testdata, förslag). **Claude-sidan ändrar koden**, och bara Sara på Claude-sidan pushar. Varje sak har en ägare, och överlämningen sker via mapparna i avsnitt 2: du lägger din fil där och Ariel säger till ägaren att den är klar.

| ChatGPT | Gör | Lämnar till (Claude) | Lägger filerna i |
|---|---|---|---|
| 🔎 **Klara** – granskning av appen | Granskar appen: fel, UX, risker | 👑 **Otto** (appen) prövar och rättar | `notes/reviews/` |
| 🌐 **Nova** – granskning av hemsidan | Granskar www.yourofflinebudget.com: text, design, integritet, språk | 🌐 **Webby** (hemsidan) prövar och rättar | `notes/reviews/`, och förslag på text, design och bilder i `notes/website/` |
| 🧪 **Tess** – importtester | Gör testfiler (CSV, Excel, kontoutdrag) och provar importen | 👑 **Otto** gör de bästa till automatiska tester | `outputs/test-data/ämne/` och rapporten i `notes/reviews/` |
| 📈 **Vera** – marknad | Konkurrenter, pris, målgrupper, texterna i App Store och Google Play: *varför och till vem* | 📣 **Sofi** (sociala medier) och Ariel | `notes/market/` |
| 🎨 **Mira** – bilder och video | Gör bilder och video till sociala medier och butikerna | 📣 **Sofi** väljer, skriver texten och planerar | `outputs/instagram/` |

Gränserna:
- **Ingen på ChatGPT-sidan ändrar kod**, varken appens eller hemsidans. En granskning eller ett förslag är underlag; Otto eller Webby gör ändringen.
- **Mira gör bilderna, Sofi gör planen och texterna.** Mira skriver gärna ett utkast till bildtext bredvid bilden, men postningsplanen är Sofis.
- **Vera ger underlaget, Sofi gör inläggen.** Vera skriver om marknaden och butikstexterna; Sofi omsätter det i kanaler och inlägg.
- **Klara granskar appen, Nova hemsidan.** Hittar den ena något i den andras område, skriv det ändå, men säg vilket det gäller.

## 1. Rör aldrig appen

De här mapparna och filerna är appen, bygget eller verktygen. Du skapar, ändrar, flyttar och raderar **ingenting** här, inte heller om något ser rörigt ut:

- `src/`, `public/`, `assets/`, `scripts/`, `android/`, `ios/`
- `package.json`, `package-lock.json`, `vite.config.ts`, `capacitor.config.ts`, `tsconfig*.json`, `eslint.config.js`, `index.html`
- `CLAUDE.md`, `README.md`, `AGENTS.md`
- dolda mappar och filer (`.claude/`, `.git/`, `.env.local` …), samt `node_modules/`, `dist/` och `dist-site/`

Kod ändras bara av Claude Code (Otto). En granskning från dig är **underlag**: den beskriver vad som borde ändras men ändrar inget själv.

## 2. Var filerna hör hemma

| Vad | Mapp | Filnamn |
|---|---|---|
| Granskning / review av appen | `notes/reviews/` | `REVIEW_ÅÅÅÅ-MM-DD_ämne.md`, t.ex. `REVIEW_2026-11-05_kuvert.md` |
| Granskning av webbplatsen | `notes/reviews/` | `REVIEW_ÅÅÅÅ-MM-DD_webbplats.md` |
| Material till webbplatsen (designfiler, zip, utkast) | `notes/website/` | `ÅÅÅÅ-MM-DD_beskrivning.zip`/`.md`/`.png` |
| Bilder och video för Instagram och andra sociala medier | `outputs/instagram/` | `ÅÅÅÅ-MM-DD_beskrivning.png`/`.mp4`, t.ex. `2026-11-02_lansering-kuvert.png` |
| Testdata (CSV, Excel, JSON, kontoutdrag) | `outputs/test-data/ämne/` | `beskrivning_ÅÅÅÅ.csv`, t.ex. `outputs/test-data/kontoutdrag/swedbank_synt_2026.csv` |
| Skärmbilder av appen för App Store och Google Play | `store/screenshots-ÅÅÅÅ-MM-DD/` | `enhet_språk_nummer.png`, t.ex. `iphone_sv_01.png` |
| Butikstexter (App Store, Google Play) | `store/` | bara när Ariel ber om det, t.ex. `listing-sv.md` |
| Marknadsanalys (Vera) | `notes/market/` | `ÅÅÅÅ-MM-DD_ämne.md`, t.ex. `2026-11-10_konkurrenter.md` |
| Allt annat, eller när du är osäker | `outputs/inbox/` | `ÅÅÅÅ-MM-DD_beskrivning.ext`; Ariel eller Otto sorterar sedan |

Skapa mappen om den inte finns. Lägg **aldrig** lösa filer direkt i projektmappen, alltså i roten bredvid `src/` och `package.json`.

## 3. Namngivning

- Datum först, i formen `ÅÅÅÅ-MM-DD`, så att filerna sorteras i tidsordning.
- Små bokstäver och bindestreck. Inga mellanslag, inga å/ä/ö i filnamn, inga specialtecken.
- Beskriv innehållet med några ord: `2026-11-02_lansering-kuvert.png`, inte `image1.png` eller `generate_image_v2-1ff1….png`.
- Skriv aldrig över en befintlig fil. Finns namnet redan, lägg till `-v2`, `-v3`.

## 4. Data och säkerhet

- **Bara påhittad data.** Använd aldrig Ariels eller någon testares riktiga budget, kontoutdrag eller namn. Märk påhittade namn med `SYNT`, t.ex. `SYNT Butik`, så att de syns som testdata.
- Inga lösenord, nycklar, keystore-filer eller kontouppgifter i någon fil.
- Radera eller flytta aldrig filer som redan finns. Det gör Ariel eller Otto.

## 5. Så skriver du en granskning

Claude Code tar emot granskningen och prövar varje punkt mot koden, så skriv den så att den går att kontrollera:

1. **Överst:** datum, vad du granskat (appen eller webbplatsen; gärna version eller commit), och en kort slutsats.
2. **En punkt per problem**, med prioritet:
   - **P0:** dataförlust, säkerhet, eller att appen inte fungerar
   - **P1:** allvarligt funktionsfel
   - **P2:** märkbart UI-/UX-problem
   - **P3:** liten förfining
3. **För varje punkt:** status (*verifierat*, *belagt i kod* eller *inte testat*), var det finns, hur man återskapar det, varför det spelar roll, ett förslag och hur man vet att det är rättat.
4. Skilj på vad du faktiskt har provat och vad du gissar. Ett prov du inte slutfört räknas inte som godkänt.
5. Skriv på svenska. Föreslå inget som går emot appens grund: **inget konto, ingen server, all data stannar på enheten.**

## 6. Bilder för sociala medier

- Visa appen som den är. Hitta inte på funktioner som inte finns, som synk, molnlagring, bankkoppling eller konton.
- Siffror i bilderna ska vara påhittade och rimliga.
- Appen heter **YourBudget**. Webbplatsen är **www.yourofflinebudget.com**.
- Spara bilden i `outputs/instagram/` med datum och beskrivning i namnet. Lägg gärna texten till inlägget bredvid, som en `.md` med samma namn.
