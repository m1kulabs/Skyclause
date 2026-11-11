import { RESERVED_SLUGS, SLUG_REGEX } from '@skyclause/contracts'
import { t } from './catalogue'

export type SlugError = 'format' | 'reserved' | 'taken' | null

const reserved = new Set<string>(RESERVED_SLUGS)

/** Live validation for the `/new` slug field, from `slugs.ts`: format and reserved names as you type. */
export function validateSlugInput(slug: string): Exclude<SlugError, 'taken'> | null {
  if (slug.length === 0) return null
  if (!SLUG_REGEX.test(slug)) return 'format'
  if (reserved.has(slug)) return 'reserved'
  return null
}

/** Suggest a slug from the name, keeping what the user already typed once they edit it. */
export function suggestSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 39)
    .replace(/-+$/, '')
}

export function slugErrorMessage(error: Exclude<SlugError, null>, slug: string): string {
  if (error === 'format') return t('organisations.create.format')
  if (error === 'reserved') return t('organisations.create.reserved', { slug })
  return t('organisations.create.taken', { slug })
}
