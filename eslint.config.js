import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Params kept for signature compatibility use the `_name` convention.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // The app deliberately sets state inside effects for its load-on-navigation
      // pattern (month/localStorage → state, guarded by skipNextSave refs so no
      // cascade occurs). Restructuring that is out of scope for lint adoption.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    // These files co-locate shared helpers/types with their components; the only
    // cost is a full page reload instead of hot-refresh in dev, which we accept
    // over splitting files purely for HMR.
    files: ['src/components/Charts.tsx', 'src/components/CustomV3.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
