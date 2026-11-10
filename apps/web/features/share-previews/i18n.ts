import { catalogueFiles } from '../../../../packages/i18n/src/catalogue'
import english from '../../../../packages/i18n/catalogue/en/share-previews.json'
import malay from '../../../../packages/i18n/catalogue/ms/share-previews.json'
import { prefersMalay } from '../../lib/preferred-language'

// Request-time registration keeps share preview copy out of the marketing page bundle.
catalogueFiles['../catalogue/en/share-previews.json'] = { default: english }
catalogueFiles['../catalogue/ms/share-previews.json'] = { default: malay }

export type Locale = 'en' | 'ms'

export function previewLocale(request: Request): Locale {
  return prefersMalay(request.headers.get('accept-language')) ? 'ms' : 'en'
}

export { t } from '@skyclause/i18n/brand'
