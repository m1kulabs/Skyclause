import { headers } from 'next/headers'
import { t } from '@skyclause/i18n'
import { LanguageSuggestion } from '../../components/language-suggestion'
import { prefersMalay } from '../../lib/preferred-language'

export async function MarketingLanguageSuggestion() {
  const acceptLanguage = (await headers()).get('accept-language')
  return prefersMalay(acceptLanguage) ? (
    <LanguageSuggestion
      privacyLabel={t('marketing.privacy_suggestion', {}, 'ms')}
      dismissLabel={t('marketing.dismiss_suggestion', {}, 'ms')}
    />
  ) : null
}
