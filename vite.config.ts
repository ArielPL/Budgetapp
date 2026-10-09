import { defineConfig, type Plugin } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { stampServiceWorker } from './src/swStamp'

/**
 * Stamp dist/sw.js with this build's id and its bundles, after everything is
 * written — see src/swStamp.ts for why (full sweep 2026-10-08). The id is a
 * hash of the bundle names, which are content hashes, plus index.html: any
 * change to what is served is a new worker, and an unchanged build keeps its
 * worker and its cache.
 */
function serviceWorkerStamp(): Plugin {
  let outDir = 'dist'
  return {
    name: 'budget-sw-stamp',
    apply: 'build',
    configResolved(config) { outDir = resolve(config.root, config.build.outDir) },
    closeBundle() {
      const sw = join(outDir, 'sw.js')
      if (!existsSync(sw)) return
      const assetsDir = join(outDir, 'assets')
      const assets = existsSync(assetsDir)
        ? readdirSync(assetsDir).sort().map(f => `/assets/${f}`)
        : []
      const id = createHash('sha256')
        .update(assets.join('\n'))
        .update(readFileSync(join(outDir, 'index.html')))
        .digest('hex').slice(0, 16)
      writeFileSync(sw, stampServiceWorker(readFileSync(sw, 'utf8'), id, assets))
    },
  }
}

// https://vite.dev/config/
//
// vitest defaults to the node environment, and the one suite that needs a DOM
// opts in with `// @vitest-environment jsdom` on its first line. Importing from
// vitest/config is also what lets vite's own defineConfig accept the `test` key
// under the strict build.
export default defineConfig({
  plugins: [react(), serviceWorkerStamp()],
  test: {
    // `.claude` holds Claude Code's session worktrees — full copies of this
    // repo, whose tests would otherwise run alongside ours.
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
})
