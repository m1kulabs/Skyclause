// The shared ESLint flat config (spec §1 `packages/config`); the root `eslint.config.mjs` uses it.
import js from '@eslint/js'
import next from '@next/eslint-plugin-next'
import { defineConfig } from 'eslint/config'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import tseslint from 'typescript-eslint'

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
  { files: ['apps/web/**'], ...next.configs['core-web-vitals'], settings: { next: { rootDir: 'apps/web' } } }
)
