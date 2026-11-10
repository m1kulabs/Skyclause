import { readFileSync } from 'node:fs'
import { pseudo } from '../../../../packages/i18n/src/pseudo'

export function t(key: string, variables: Record<string, string | number> = {}, locale: 'en' | 'ms' = 'en'): string {
  const [feature, item] = key.split('.')
  const messages = JSON.parse(
    readFileSync(new URL(`../../../../packages/i18n/catalogue/${locale}/${feature}.json`, import.meta.url), 'utf8')
  ) as Record<string, string>
  const value = messages[item!]!
  if (!value) throw new Error(`Missing test message: ${key}`)
  const text = value.replace(/\{(\w+)\}/g, (match, name: string) => String(variables[name] ?? match))
  return process.env.I18N_PSEUDO === '1' ? pseudo(text) : text
}
