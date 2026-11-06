import { readFileSync } from 'node:fs'
import { pseudo } from '../../../../packages/i18n/src/pseudo'

interface Messages {
  [key: string]: string | Messages
}

// Playwright runs in Node, which cannot load the workspace runtime's unannotated JSON imports.
// Read the same catalogue files for assertions; the browser uses the real t().
const catalogues: Messages = Object.fromEntries(
  ['palette', 'set7'].map((feature) => [
    feature,
    JSON.parse(readFileSync(new URL(`../../../../packages/i18n/catalogue/en/${feature}.json`, import.meta.url), 'utf8'))
  ])
)

export function t(key: string, variables: Record<string, string | number> = {}): string {
  let value: string | Messages | undefined = catalogues
  for (const segment of key.split('.')) value = typeof value === 'object' ? value[segment] : undefined
  if (typeof value !== 'string') throw new Error(`Missing test message: ${key}`)
  const message = value.replace(/\{(\w+)\}/g, (match, name: string) => String(variables[name] ?? match))
  return process.env.I18N_PSEUDO === '1' ? pseudo(message) : message
}
