import { readFileSync } from 'node:fs'
import { pseudo } from '../../../../packages/i18n/src/pseudo'

export function t(key: string, vars: Record<string, string | number> = {}, locale = 'en'): string {
  let value = JSON.parse(
    readFileSync(new URL(`../../../../packages/i18n/catalogue/${locale}/alerts.json`, import.meta.url), 'utf8')
  )
  for (const part of key.replace(/^alerts\./, '').split('.')) value = value[part]
  if (typeof value !== 'string') throw new Error(`Missing alert message: ${key}`)
  const message = value.replace(/\{(\w+)\}/g, (match, name) => String(vars[name] ?? match))
  return process.env.I18N_PSEUDO === '1' ? pseudo(message) : message
}
