import { hasNotice, t } from '@skyclause/i18n/notices'

/**
 * A clause by the name notices give it, in the interface's language. A project's own clause, which no catalogue
 * names, reads as words: never as its key.
 */
export function clauseName(key: string, locale: 'en' | 'ms'): string {
  if (hasNotice(`clauses.${key}`)) return t(`notices.clauses.${key}`, {}, locale)
  const words = key.replaceAll('_', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
