import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
//
// vitest defaults to the node environment, and the one suite that needs a DOM
// opts in with `// @vitest-environment jsdom` on its first line. Importing from
// vitest/config is also what lets vite's own defineConfig accept the `test` key
// under the strict build.
export default defineConfig({
  plugins: [react()],
  test: {
    // `.claude` holds Claude Code's session worktrees — full copies of this
    // repo, whose tests would otherwise run alongside ours.
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
})
