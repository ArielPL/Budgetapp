import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
//
// No `test` block: vitest already defaults to the node environment, and the one
// suite that needs a DOM opts in with `// @vitest-environment jsdom` on its
// first line. Declaring it here would need vitest's own defineConfig, and the
// strict build rejects an unknown key on vite's — a config that fails to
// typecheck is a worse trade than a one-line comment per test file.
export default defineConfig({
  plugins: [react()],
})
