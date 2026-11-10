import { readFileSync } from 'node:fs'
import { pseudo } from '../../../../packages/i18n/src/pseudo'

const messages = JSON.parse(
  readFileSync(new URL('../../../../packages/i18n/catalogue/en/probation.json', import.meta.url), 'utf8')
) as Record<string, string>

export function t(key: string, vars: Record<string, string | number> = {}) {
  const value = messages[key]
  if (typeof value !== 'string') throw new Error(`Missing probation test message: ${key}`)
  const text = value.replace(/\{(\w+)\}/g, (match, name: string) => String(vars[name] ?? match))
  return process.env.I18N_PSEUDO === '1' ? pseudo(text) : text
}
