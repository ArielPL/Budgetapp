# Budget app — the crew

The Budget PWA is maintained by a small team of agents. **Otto** is the lead
(the main chat / coordinator). Sub-agents can't call other sub-agents, so Otto coordinates.
The specialists are general-purpose agents in `~/.claude/agents/`; the facts below are what
they adapt to for THIS project.

## The team

| Agent | Name | Does | Call for |
|-------|------|------|----------|
| 👑 Lead / coordinator | **Otto** (this main chat) | Plans, routes, builds iterative work himself, reports | — (always on) |
| 🛠️ Feature builder | **Eddy** (`eddy`) | New features: components, state, styling | "add X", new functionality |
| 📱 Mobile / design | **Stan** (`stan`) | Responsive layout, theming, CSS | "looks off on mobile", styling/theme |
| 🐛 Bug fixer | **Buggy** (`buggy`) | Reproduce, diagnose, fix bugs | something broken / weird, fresh-eyes hunts |
| 🚀 Deploy | **Sara** (`sara`) | Commit + push (the ONLY committer) | "ship it", "push", merges |

Each track also has a chat of its own, with the model that suits it (Ariel, 2026-10-27):

| Chat | Track | Model |
|------|-------|-------|
| 👑 **Otto** – the app, and coordination | `development` | Opus |
| 🌐 **Webby** – www.yourofflinebudget.com | `website` → `main` | Sonnet |
| 🎨 **Stan** – the app's look | local, handed to Otto → `development` | Sonnet |
| 🧪 **Arty** – the offline AI assistant lab | `~/Developer/budget-ai-lab` | Opus |
| 📣 **Sofi** – social media: analysis, plan and drafts; writes no code | none | Sonnet |

## Working rules (efficiency-tuned)

1. **Spawn agents sparingly** — each spawn starts cold and re-reads the repo. Otto does
   iterative build work himself; agents are for isolated well-specified jobs (Sara's pushes),
   fresh-eyes work (Buggy), or genuinely parallel independent tasks. Sequential when they'd
   touch the same files.
2. **Verification ownership: whoever builds, verifies** (tests + strict build + live check in
   the browser preview). Sara does NOT re-run the full suite — she sanity-checks `git status`,
   commits, pushes. Vercel CI (same strict build, on Linux) is the final gate on every push.
3. **Only Sara commits & pushes**, and only after the user's explicit OK. Batch pushes: one
   push per coherent, testable chunk — not per tiny fix.
4. **Branch workflow — two tracks that never mix (Ariel, 2026-10-23):**
   - **`development` = the app.** App work lands here and is tested on its Vercel preview,
     in the simulator and emulator, and through TestFlight and Play. Native builds come
     from here. **`development` is never merged into `main` again**: that would make
     production a web app.
   - **`website` = www.yourofflinebudget.com**, meaning the homepage, privacy and support.
     It is built by `scripts/build-home.mjs` into `dist-site/` (see `vercel.json`, which
     exists on this branch only). Website work lands here, the user checks its preview,
     and it merges to `main` ONLY on the user's explicit word. That deploys production,
     which from 2 November 2026 is the website only.
   - **The app's look** (colours, themes, layout, spacing, polish) is Stan's, in a chat
     of its own, and gets **no branch on GitHub** (Ariel, 2026-10-27: branches only for
     the big things). Stan works in his local worktree on top of the latest
     `development`, commits nothing, and when a piece is done he hands it to Otto:
     which files, what changed, how he checked it. Otto takes the changes into
     `development`, reviews and verifies them like his own work, shows Ariel, and
     asks about the push as usual. Stan touches styling (`src/index.css`,
     `src/themes.ts`, component markup for layout); behaviour and data are Otto's.
   - Never push to `main` directly. `authorization` = parked accounts/cloud-sync work;
     don't touch it.
5. **Every release adds a changelog entry** in `src/changelog.ts` (sv/en/es) — that IS the
   version bump; it drives the in-app "What's new" badge (`LATEST_VERSION`).
6. Commit trailer: `Co-Authored-By:` the active Claude model. New/renamed agent files are
   picked up at next session start.

## Key project facts

- App: React 19 + Vite + TypeScript PWA. All data in localStorage
  (per device, **accountless by product decision** — no accounts/email/backend).
  i18n sv/en/es via typed `Translations` in `src/i18n.ts`; currency kr/€/$/£/¥ (format only).
- Live (production, `main`): https://www.yourofflinebudget.com (the apex redirects there;
  the old https://budgetapp-indol.vercel.app still works). Until 2 November 2026 it serves
  the web app; from then on it serves the website only (from the `website` branch).
  Preview per branch: `https://budgetapp-git-<branch>-ariel-p-projects.vercel.app`
  Both auto-build on push to GitHub `ArielPL/Budgetapp`.
- Commands are ordinary npm scripts — `npm run dev`, `npm test`, `npm run lint`,
  and `npm run build` (what Vercel runs; strict `noUnusedLocals`).
  Node version is pinned in `.nvmrc`; `nvm use` before working.
- **Money math lives in `src/metrics.ts`** (pure, unit-tested): "saved" excludes pension
  everywhere; savings rate = actual saved ÷ income. Goal↔budget-row linking is guaranteed
  solely by `ensureGoalLinkedBudgetRows` in `src/defaults.ts`.
- **Guard against month-switch data bleed:** the save effect must skip the render right after
  a month load (`skipNextSave` ref pattern in App.tsx and CustomV3.tsx).
- Conventions: `import type` for types, no `import React`, theme colors via CSS variables only,
  mobile overrides in `@media (max-width:640px)` at the END of `src/index.css`.

## ⚠️ Keep this repo out of iCloud Drive

It used to live under `~/Documents`, which macOS syncs to iCloud. iCloud evicted the contents
of `node_modules` — 13 751 files reduced to placeholders — so every read blocked while the
file was fetched back. Two workarounds grew out of that, and BOTH were misdiagnosed:

- Commands were written as `node node_modules/.bin/…` because a colon in the old folder name
  broke PATH. That folder is gone; plain npm scripts work.
- The test suite was run in batches with `--no-file-parallelism` because a full run "silently
  dropped files", blamed on vitest's fork pool. It was I/O starvation. Measured on the same
  machine, same commit: inside iCloud, 15 files / 298 tests / 4 errors / 1 228 s. Outside,
  19 files / 417 tests / 0 errors / 1.4 s. Run the suite in one go.

If tooling ever starts hanging at near-zero CPU again, check `brctl status` before believing
any explanation that blames the tool.
