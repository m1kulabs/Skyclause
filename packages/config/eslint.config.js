// The shared ESLint flat config (spec §1 `packages/config`); the root `eslint.config.mjs` uses it.
import js from '@eslint/js'
import next from '@next/eslint-plugin-next'
import { defineConfig } from 'eslint/config'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import tseslint from 'typescript-eslint'
import i18n from './eslint-plugin/i18n.js'

export default defineConfig(
  {
    // P0's `pilot/` keeps its own checks (D10); generated and vendored trees aren't linted.
    ignores: [
      'pilot/',
      'docs/',
      '.agents/',
      '.claude/',
      '.codex/',
      '.worktrees/',
      'graphify-out/',
      '**/dist/',
      '**/.next/',
      '**/next-env.d.ts',
      '**/test-results/',
      '**/playwright-report/'
    ]
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }
      ]
    }
  },
  { files: ['**/*.{jsx,tsx}'], ...jsxA11y.flatConfigs.recommended },
  { files: ['apps/web/**'], ...next.configs['core-web-vitals'], settings: { next: { rootDir: 'apps/web' } } },
  {
    files: ['apps/**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}', 'packages/**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}'],
    ignores: ['packages/i18n/**'],
    rules: {
      'no-restricted-properties': [
        'error',
        { property: 'toLocaleString', message: 'Use the MYT formatters from @skyclause/i18n/format.' },
        { property: 'toLocaleDateString', message: 'Use the MYT formatters from @skyclause/i18n/format.' },
        { property: 'toLocaleTimeString', message: 'Use the MYT formatters from @skyclause/i18n/format.' },
        { object: 'Intl', property: 'DateTimeFormat', message: 'Use the MYT formatters from @skyclause/i18n/format.' }
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['date-fns', 'date-fns/**', 'dayjs', 'dayjs/**', 'moment', 'moment/**', 'luxon', 'luxon/**'],
              message: 'Use the MYT formatters from @skyclause/i18n/format.'
            }
          ]
        }
      ]
    }
  },
  {
    files: ['apps/web/**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}'],
    plugins: { 'skyclause-i18n': i18n },
    rules: {
      'skyclause-i18n/no-concatenated-translation': 'error'
    }
  },
  {
    files: ['apps/web/**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}'],
    ignores: ['**/*.plant.tsx'],
    rules: { 'skyclause-i18n/no-literal-jsx': 'error' }
  }
)
