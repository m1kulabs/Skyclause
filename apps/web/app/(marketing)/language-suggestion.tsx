import { headers } from 'next/headers'
import { LanguageSuggestion } from '../../components/language-suggestion'
import { prefersMalay } from '../../lib/preferred-language'

export async function MarketingLanguageSuggestion() {
  const acceptLanguage = (await headers()).get('accept-language')
  return prefersMalay(acceptLanguage) ? <LanguageSuggestion /> : null
}
