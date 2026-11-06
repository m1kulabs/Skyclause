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
