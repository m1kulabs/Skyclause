import { catalogueFiles } from '../../../../packages/i18n/src/catalogue'
import en from '../../../../packages/i18n/catalogue/en/organisations.json'
import ms from '../../../../packages/i18n/catalogue/ms/organisations.json'

// Register on feature load, keeping organisations copy out of the marketing bundle.
catalogueFiles['../catalogue/en/organisations.json'] = { default: en }
catalogueFiles['../catalogue/ms/organisations.json'] = { default: ms }

export { t } from '@skyclause/i18n'
export type Locale = 'en' | 'ms'
