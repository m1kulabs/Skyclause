/**
 * The account's saved language (LOC-1: an account preference, not a path), written in the browser when it is saved
 * and by sign-in's continue from the account. `proxy.ts` puts it in place of the request's Accept-Language, so every
 * page that reads that header follows it.
 */
export const LANGUAGE_COOKIE = 'skyclause-language'

/** Remembers a language the account just saved, for every request this browser makes. Browser only. */
export function rememberLanguage(language: 'en' | 'ms'): void {
  const secure = location.protocol === 'https:' ? '; secure' : ''
  document.cookie = `${LANGUAGE_COOKIE}=${language}; path=/; max-age=31536000; samesite=lax${secure}`
}

/** LOC-7: suggest Malay only when its best accepted range outranks English. Ties keep English. */
export function prefersMalay(acceptLanguage: string | null): boolean {
  let malay = 0
  let english = 0
  for (const range of (acceptLanguage ?? '').split(',')) {
    const [tag, ...parameters] = range.trim().toLowerCase().split(';')
    const quality = parameters
      .find((parameter) => parameter.trim().startsWith('q='))
      ?.trim()
      .slice(2)
    const weight = quality === undefined ? 1 : Number(quality)
    if (!Number.isFinite(weight) || weight < 0 || weight > 1) continue
    if (tag === 'ms' || tag?.startsWith('ms-')) malay = Math.max(malay, weight)
    if (tag === 'en' || tag?.startsWith('en-') || tag === '*') english = Math.max(english, weight)
  }
  return malay > english
}
