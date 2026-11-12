import { headers } from 'next/headers'
import { prefersMalay } from '../../lib/preferred-language'

/** The language a settings page is written in: Malay when the browser asks for it first, otherwise English. */
export async function settingsLocale(): Promise<'en' | 'ms'> {
  return prefersMalay((await headers()).get('accept-language')) ? 'ms' : 'en'
}
