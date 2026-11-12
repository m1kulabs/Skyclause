import '@skyclause/i18n/legal'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { connection } from 'next/server'
import { brandMetadata } from '../brand/metadata'
import { originOf } from '../../lib/origins'
import { prefersMalay } from '../../lib/preferred-language'
import { t, type Locale } from './i18n'

// TRD "Open Graph and oEmbed" for the pages themselves: each public page and the sign-in pages name themselves, say
// what they are in the product's words, give their canonical URL on their own host and carry a 1200×630 card from
// the share-preview builder, served at the marketing host's `/og.png?page=…` (page-card.ts). This module is imported by
// pages, so it never loads the card builder's fonts.

export type SharedPage = 'landing' | 'privacy' | 'terms' | 'sign-in' | 'sign-up'

export const PAGES: Record<SharedPage, { surface: 'marketing' | 'app'; path: (locale: Locale) => string }> = {
  landing: { surface: 'marketing', path: () => '/' },
  privacy: { surface: 'marketing', path: (locale) => (locale === 'ms' ? '/ms/legal/privacy' : '/legal/privacy') },
  terms: { surface: 'marketing', path: () => '/legal/terms' },
  'sign-in': { surface: 'app', path: () => '/sign-in' },
  'sign-up': { surface: 'app', path: () => '/sign-up' }
}
export const isSharedPage = (value: string | null): value is SharedPage => value !== null && Object.hasOwn(PAGES, value)

/** The page's title, heading on its card, and sentence, in `locale`. */
export function copyOf(page: SharedPage, locale: Locale) {
  if (page === 'privacy' || page === 'terms')
    return {
      title: t(`legal.${page}.metadataTitle`, {}, locale),
      heading: t(`legal.${page}.title`, {}, locale),
      description: t(`legal.${page}.intro`, {}, locale)
    }
  const key = { landing: 'landing', 'sign-in': 'signIn', 'sign-up': 'signUp' }[page]
  return {
    title: t(`share-previews.pages.${key}.title`, {}, locale),
    heading: t(`share-previews.pages.${key}.heading`, {}, locale),
    description: t(`share-previews.pages.${key}.description`, {}, locale)
  }
}

/**
 * The page's metadata, read at request time: the origins are the server's runtime configuration, which a build never
 * sees. `locale` defaults to the request's language (the sign-in pages follow it); the Terms are English only.
 */
export async function pageMetadata(page: SharedPage, locale?: Locale): Promise<Metadata> {
  await connection()
  const language: Locale =
    page === 'terms' ? 'en' : (locale ?? (prefersMalay((await headers()).get('accept-language')) ? 'ms' : 'en'))
  const { title, heading, description } = copyOf(page, language)
  const own = originOf(PAGES[page].surface)
  const marketing = originOf('marketing')
  const url = own ? new URL(PAGES[page].path(language), own).toString() : undefined
  const image = marketing && new URL(`/og.png?page=${page}&lang=${language}`, marketing).toString()
  const images = image
    ? [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: t('share-previews.pages.imageAlt', { heading, description }, language)
        }
      ]
    : undefined
  return {
    ...brandMetadata,
    title,
    description,
    alternates: {
      canonical: url,
      ...(page === 'privacy' && marketing
        ? {
            languages: {
              en: new URL(PAGES.privacy.path('en'), marketing).toString(),
              ms: new URL(PAGES.privacy.path('ms'), marketing).toString()
            }
          }
        : {})
    },
    openGraph: {
      type: 'website',
      siteName: t('share-previews.pages.site', {}, language),
      title,
      description,
      url,
      locale: language === 'ms' ? 'ms_MY' : 'en_MY',
      images
    },
    twitter: { card: 'summary_large_image', title, description, images }
  }
}
