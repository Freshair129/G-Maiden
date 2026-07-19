import js from '@eslint/js'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'

// Flat-config migration of the former .eslintrc.cjs. This mirrors the prior
// effective ruleset (eslint:recommended + typescript-eslint recommended +
// react-hooks recommended + react-refresh's single rule) as closely as
// ESLint 9 / typescript-eslint 8 allow — it intentionally does NOT adopt
// newer stricter presets (e.g. typescript-eslint's `strict` configs or
// react-hooks' `recommended-latest` React Compiler rules).
export default [
  { ignores: ['dist'] },
  js.configs.recommended,
  ...tsPlugin.configs['flat/recommended'],
  {
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2020 },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // Same two rules @ same severities as react-hooks/recommended shipped
      // under ESLint 8 (v4) -- spelled out explicitly rather than spread
      // from the plugin's own `recommended` preset, since react-hooks v7's
      // `recommended` config now bundles additional React Compiler rules.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
]
