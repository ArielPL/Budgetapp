# Budget – Månadsbudget 💰

A personal monthly-budget PWA. Track income, expenses and savings per month, set
savings goals, review the whole year, and build a fully custom budget dashboard
from scratch — in Swedish, English or Spanish.

**Live:** https://budgetapp-indol.vercel.app

## Features

- **Budget** — monthly income & expense categories with per-row amounts,
  summary cards (income / expenses / remaining) and expense charts.
- **Savings & Investments** — savings categories with growth chart and
  per-category donuts; pension tracked separately.
- **Plan & Overview** — savings rate, savings goals (linkable to a budget row)
  with progress and deadlines, plus free-form notes.
- **Year** — income vs expenses vs savings across the whole year
  (table on desktop, month cards on mobile).
- **Three layouts** — Classic (tabs), Combined (everything on one page), and
  **Custom**: a build-from-scratch block dashboard with its own data
  (IN/OUT/SAVINGS-tagged blocks, 8 chart types, targets, notes, auto summary).
- **Theme builder** — four palettes (Sorbet / Ocean / Forest / Sunset), each in
  light & dark, plus a custom accent and full per-color overrides.
- **i18n & currency** — Swedish / English / Spanish; kr / € / $ / £
  (symbol & format only — amounts are never converted).
- **Backup** — JSON export/import from the ⚙ menu, with a periodic reminder.

## Data & privacy

All data lives in the browser's **localStorage** — there is no backend and no
account. Data is per device/browser; use **⚙ → Export** to back up or move it.
Key prefixes: `budget_<year>_<month>` (shared monthly data), `budget_custom_v3*`
(Custom layout structure + amounts), `budget_theme*`, `budget_lang`,
`budget_currency`, `budget_layout`.

## Running locally

The Node version is pinned in `.nvmrc` — run `nvm use` first.

```bash
npm install
npm run dev     # dev server
npm test        # the full suite, in one go (~1.5 s)
npm run lint
npm run build   # what Vercel runs — strict TS with noUnusedLocals
```

## Deploying

Pushing to `main` on GitHub auto-deploys to Vercel. Always run the strict build
locally first — it catches unused-import/variable errors that dev mode ignores.

## Tech

React 19 · TypeScript · Vite · Recharts · CSS custom properties (theming) —
no UI framework, no state library, no backend.

## Known limitations

- Data is per-device (no sync between phone and desktop) — use export/import.
- Currency switching changes formatting only; there is no exchange-rate math.
- The Custom layout keeps its own numbers, separate from Classic/Combined.
