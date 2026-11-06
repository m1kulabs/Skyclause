import { readFileSync } from 'node:fs'
import { pseudo } from '../../../../packages/i18n/src/pseudo'

const messages = JSON.parse(
  readFileSync(new URL('../../../../packages/i18n/catalogue/en/connect.json', import.meta.url), 'utf8')
) as Record<string, string | Record<string, string>>

export function t(key: string, vars: Record<string, string | number> = {}) {
  let value: unknown = messages
  for (const part of key.split('.')) value = (value as Record<string, unknown>)[part]
  if (typeof value !== 'string') throw new Error(`Missing connect test message: ${key}`)
  const text = value.replace(/\{(\w+)\}/g, (match, name: string) => String(vars[name] ?? match))
  return process.env.I18N_PSEUDO === '1' ? pseudo(text) : text
}
