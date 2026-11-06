import { catalogueFiles } from '../../../../packages/i18n/src/catalogue'
import en from '../../../../packages/i18n/catalogue/en/data.json'
import ms from '../../../../packages/i18n/catalogue/ms/data.json'
import '@skyclause/i18n/brand'

// Register on feature load, keeping data copy out of the marketing bundle.
catalogueFiles['../catalogue/en/data.json'] = { default: en }
catalogueFiles['../catalogue/ms/data.json'] = { default: ms }

export { t } from '@skyclause/i18n'
