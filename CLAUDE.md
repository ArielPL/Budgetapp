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
4. **Branch workflow:** work lands on `development` → user tests on its Vercel preview →
   merge to `main` ONLY on the user's explicit word (that deploys production). Never push to
   `main` directly. `authorization` branch = parked accounts/cloud-sync work; don't touch it.
5. **Every release adds a changelog entry** in `src/changelog.ts` (sv/en/es) — that IS the
   version bump; it drives the in-app "What's new" badge (`LATEST_VERSION`).
6. Commit trailer: `Co-Authored-By:` the active Claude model. New/renamed agent files are
   picked up at next session start.

## Key project facts

- App: React 19 + Vite + TypeScript PWA. All data in localStorage
  (per device, **accountless by product decision** — no accounts/email/backend).
  i18n sv/en/es via typed `Translations` in `src/i18n.ts`; currency kr/€/$/£ (format only).
- Live (production, `main`): https://budgetapp-indol.vercel.app
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
