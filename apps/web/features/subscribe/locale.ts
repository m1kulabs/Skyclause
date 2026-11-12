import { headers } from 'next/headers'
import { prefersMalay } from '../../lib/preferred-language'

/** The link's `?lang=` when it names a language, else the reader's browser preference (LOC-7). */
export async function subscribeLocale(lang: string | undefined): Promise<'en' | 'ms'> {
  if (lang === 'ms' || lang === 'en') return lang
  return prefersMalay((await headers()).get('accept-language')) ? 'ms' : 'en'
}
