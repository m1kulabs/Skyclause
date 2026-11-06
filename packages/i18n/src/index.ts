import { catalogueFor, messageAt } from './catalogue'
import { pseudo } from './pseudo'

type Locale = 'en' | 'ms'
type Variables = Record<string, string | number>

declare const process: { env: { NODE_ENV?: string; NEXT_PUBLIC_SKYCLAUSE_PSEUDO?: string } }

function interpolate(message: string, vars: Variables): string {
  return message.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (placeholder, name: string) => {
    const value = vars[name]
    return value === undefined ? placeholder : String(value)
  })
}

export function t(key: string, vars: Variables = {}, locale: Locale = 'en'): string {
  const [feature, ...segments] = key.split('.')
  const path = feature && segments.length > 0 ? segments : []
  const english = messageAt(catalogueFor('en', feature ?? ''), path)
  const localized = locale === 'en' ? english : messageAt(catalogueFor(locale, feature ?? ''), path)
  const message = localized ?? english

  if (message === undefined) {
    if (process.env.NODE_ENV === 'production') return key
    throw new Error(`Missing i18n key: ${key}`)
  }

  // Next exposes this flag only when APP_ENV=test and I18N_PSEUDO=1.
  const text = interpolate(message, vars)
  return process.env.NEXT_PUBLIC_SKYCLAUSE_PSEUDO === '1' ? pseudo(text) : text
}

export { pseudo } from './pseudo'
