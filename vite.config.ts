import { defineConfig, type Plugin } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { stampServiceWorker } from './src/swStamp'
import { licenseNotice, packageOf, type PackageLicense } from './src/licenseNotice'

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

const LICENSE_FILE = /^(licen[cs]e|copying)(\.|$)/i

/** Licence files up to two folders inside a package, by their folder. */
function nestedLicenses(dir: string): [string, string][] {
  const found: [string, string][] = []
  const walk = (sub: string, depth: number) => {
    for (const entry of readdirSync(join(dir, sub), { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue
      const rel = sub ? `${sub}/${entry.name}` : entry.name
      if (entry.isDirectory() && depth < 2) walk(rel, depth + 1)
      else if (entry.isFile() && sub && LICENSE_FILE.test(entry.name)) {
        found.push([sub, readFileSync(join(dir, rel), 'utf8')])
      }
    }
  }
  walk('', 0)
  return found.sort(([a], [b]) => a.localeCompare(b))
}

/**
 * Write assets/licenses.txt: the licence of every package that ends up in the
 * bundle, then the native libraries, the font and the Apache text — see
 * src/licenseNotice.ts. It goes in assets/ so the service worker caches it
 * with the bundles and "About the app" can show it offline.
 */
function openSourceLicenses(): Plugin {
  let root = process.cwd()
  return {
    name: 'budget-licenses',
    apply: 'build',
    configResolved(config) { root = config.root },
    generateBundle(_options, bundle) {
      const dirs = new Map<string, string>()
      for (const file of Object.values(bundle)) {
        if (file.type !== 'chunk') continue
        for (const id of file.moduleIds) {
          const name = packageOf(id)
          if (!name || dirs.has(name)) continue
          const path = id.split('\\').join('/')
          const at = path.lastIndexOf('/node_modules/')
          dirs.set(name, path.slice(0, at) + '/node_modules/' + name)
        }
      }
      const packages: PackageLicense[] = [...dirs].map(([name, dir]) => {
        const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
        const file = readdirSync(dir).find(f => LICENSE_FILE.test(f))
        // A package that vendors others (victory-vendor bundles d3) may carry
        // only their licences, one folder down each.
        const vendored = file ? [] : nestedLicenses(dir)
        if (!file && !vendored.length) this.warn(`${name} has no licence file; only its package.json licence is listed`)
        return {
          name,
          version: pkg.version ?? '',
          license: typeof pkg.license === 'string' ? pkg.license : '',
          text: file
            ? readFileSync(join(dir, file), 'utf8')
            : vendored.map(([sub, text]) => `${sub}:\n\n${text.trim()}`).join('\n\n'),
        }
      })
      const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
      this.emitFile({
        type: 'asset',
        fileName: 'assets/licenses.txt',
        source: licenseNotice(packages, [
          read('licenses/native.txt'),
          `Plus Jakarta Sans (the app's typeface)\n\n${read('public/fonts/OFL.txt')}`,
          `Apache License, Version 2.0 (for the Apache-licensed libraries above)\n\n${read('licenses/apache-2.0.txt')}`,
        ]),
      })
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
  plugins: [react(), openSourceLicenses(), serviceWorkerStamp()],
  test: {
    // `.claude` holds Claude Code's session worktrees — full copies of this
    // repo, whose tests would otherwise run alongside ours.
    // `outputs` is a scratch folder other tools write into, tests included —
    // a stray one there failed the app's suite (2026-10-17).
    exclude: [...configDefaults.exclude, '.claude/**', 'outputs/**'],
    // Waits and whole tests get room for a loaded machine: see src/testSetup.ts.
    setupFiles: ['./src/testSetup.ts'],
    testTimeout: 20_000,
  },
})
