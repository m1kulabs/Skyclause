import { readFileSync } from 'node:fs'
import { pseudo } from '../../../../packages/i18n/src/pseudo'

const messages: Record<string, string> = JSON.parse(
  readFileSync(new URL('../../../../packages/i18n/catalogue/en/windows.json', import.meta.url), 'utf8')
)
export function w(key: string, vars: Record<string, string | number> = {}) {
  const message = messages[key]!.replace(/\{(\w+)\}/g, (match, name: string) => String(vars[name] ?? match))
  return process.env.I18N_PSEUDO === '1' ? pseudo(message) : message
}
