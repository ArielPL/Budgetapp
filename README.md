# Budget – Månadsbudget 💰

A personal monthly budget. Track income, expenses and savings per month, set
savings goals, follow up what was actually spent, review the whole year, and
build a fully custom budget dashboard — in Swedish, English or Spanish.

One code base, three apps:

- **Web** (a PWA) — **live:** https://budgetapp-indol.vercel.app
- **iOS** and **Android** — the same web app inside a native shell
  ([Capacitor 8](https://capacitorjs.com)), in `ios/` and `android/`. Not in
  the App Store or Google Play yet.

No accounts, no backend, no analytics: everything stays on the device.

## Features

- **Budget** — monthly income & expense categories with per-row amounts,
  summary cards (income / expenses / remaining) and expense charts.
- **Follow-up** — what was actually spent, beside the plan. Entries are typed
  in or imported from a bank's CSV file; the import suggests categories for
  shops in several countries and learns from your corrections.
- **Savings & Investments** — savings categories with growth chart and
  per-category donuts; pension tracked separately.
- **Plan & Overview** — savings rate, savings goals (linkable to a budget row)
  with progress and deadlines, a savings plan, plus free-form notes.
- **Year** — income vs expenses vs savings across the whole year.
- **Three layouts** — Classic (tabs), Combined (everything on one page), and
  **Custom**: a block dashboard, either linked to the regular budget or as a
  separate budget of its own.
- **Theme builder**, **i18n & currency** (kr / € / $ / £ / ¥ — format only, never
  converted), **undo** for the destructive actions, and **backup** to a file.

## Where the data lives

| | Store | Backup |
|---|---|---|
| Web | the browser's `localStorage` | ⚙ → Export: a JSON file, downloaded or saved with the browser's file picker |
| iOS / Android | a SQLite database in the app (`@capacitor-community/sqlite`, not encrypted on purpose) | ⚙ → Export opens the phone's share sheet (Save to Files, Drive…). The phone's own iCloud / Google backup may also include the database — allowed by product decision, so a new phone can restore it |

Both stores hold the same keys and the same JSON values, so a backup file moves
between web and app unchanged. Key prefixes: `budget_<year>_<month>` (monthly
budget), `budget_actuals_*` (follow-up entries), `budget_custom_*` (Custom),
`budget_plan`, `budget_theme*`, `budget_lang`, `budget_currency`,
`budget_layout`, `budget_undo` (never backed up).

How the code reaches them — the files to read before touching storage:

- `src/storage.ts` — `appStorage`, the one door every read and write goes
  through, whichever store is underneath.
- `src/storageCache.ts` — in the apps, a synchronous in-memory copy over the
  asynchronous database, with one ordered write queue.
- `src/nativeStorage.ts` — the SQLite side, and the one-time move of data from
  the WebView's `localStorage` in early test builds.
- `src/storageWrite.ts` — `safeSetItem` for ordinary edits;
  `commitStorageChanges` for anything that says "done", records a step back or
  reloads: several keys as one transaction, answered **once it is stored**.

Two rules follow from the apps' write being queued:

1. **"Written" is not "stored".** In the apps a write returns before the
   database has it. Anything that tells the user a change succeeded waits for
   `commitStorageChanges` (or `settleStorage`) first.
2. **A refusal is never left looking saved.** The in-memory copy is put back
   to what the database holds, the refused change is kept for **Try again**,
   and the "could not save" banner shows until everything is stored. Backups
   are built from the database itself, never from the in-memory copy.

## Running locally

The Node version is pinned in `.nvmrc` — run `nvm use` first.

```bash
npm install
npm run dev     # dev server at http://localhost:5173
npm test        # the full suite, in one go
npm run lint
npm run build   # what Vercel runs — strict TS with noUnusedLocals
```

## The iOS and Android apps

You need, besides Node:

- **iOS:** macOS with Xcode (the project uses Swift Package Manager — no
  CocoaPods or Ruby). Deployment target iOS 15.
- **Android:** Android Studio, SDK 36 (min 24), and a **JDK 21** for Gradle
  8.14 — not the JDK bundled with Android Studio, which is newer than Gradle
  accepts. Android Studio downloads one under *Settings → Build, Execution,
  Deployment → Build Tools → Gradle → Gradle JDK*; it lands in
  `~/Library/Java/JavaVirtualMachines/`. Building from a terminal needs both
  set, because a fresh checkout has no `android/local.properties` until
  Android Studio has opened the project once:

  ```bash
  export ANDROID_HOME="$HOME/Library/Android/sdk"
  ```

  ```bash
  export JAVA_HOME="$HOME/Library/Java/JavaVirtualMachines/jbr-21.0.11/Contents/Home"
  ```

**Always sync with the script, never by hand:**

```bash
npm run native:sync
```

It builds the web app, copies it into both native projects (`npx cap sync`),
and then checks that every file of the build is byte-for-byte identical in
`ios/App/App/public` and `android/app/src/main/assets/public`. Xcode and Gradle
package whatever is in those folders and never complain when it is old — an
iOS build once shipped the web code from a commit earlier. `npm run
native:check` runs only the check.

Then build and run from the IDE (`npx cap open ios` / `npx cap open android`),
or from a terminal:

```bash
cd android && ./gradlew assembleDebug
```

```bash
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -destination 'generic/platform=iOS Simulator' build
```

Test on a **separate, empty** simulator or emulator with made-up numbers. An
install on top of an app that holds a real budget can overwrite it.

### Releasing to the stores

Not done yet; the steps it will take, in order:

1. `npm test`, `npm run lint`, then `npm run native:sync` — it must end with
   both `✓` lines.
2. Set the store version: iOS `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION`
   in Xcode, Android `versionName` / `versionCode` in `android/app/build.gradle`.
   The store versions are their own line: the first store release is **1.0
   (build 1)**, whatever the web app's version in `src/changelog.ts` is. The
   build number must go up with every upload. `native:check` prints both.
3. A **signed release** build from Xcode (Archive) and Android Studio
   (Generate Signed Bundle). A debug build is not a release.
4. Install that build on a real phone, check that a change from the current
   commit is visible, and that an entered amount survives a restart.

## Deploying the web app

Work lands on `development`, which Vercel builds as a preview
(`https://budgetapp-git-development-ariel-p-projects.vercel.app`). Merging to
`main` deploys production. Run the strict build locally first — it catches
unused-import/variable errors that dev mode ignores.

## Tech

React 19 · TypeScript · Vite · Recharts · Capacitor 8 · SQLite (apps) · CSS
custom properties (theming) — no UI framework, no state library, no backend.

## Known limitations

- Data is per device (no sync between phone and computer) — use a backup file
  to move it.
- Currency switching changes formatting only; there is no exchange-rate math.
- A separate Custom budget keeps its own numbers, apart from the regular budget.
