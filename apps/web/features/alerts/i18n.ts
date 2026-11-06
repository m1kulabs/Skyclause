import { catalogueFiles } from '../../../../packages/i18n/src/catalogue'
import en from '../../../../packages/i18n/catalogue/en/alerts.json'
import ms from '../../../../packages/i18n/catalogue/ms/alerts.json'
catalogueFiles['../catalogue/en/alerts.json'] = { default: en }
catalogueFiles['../catalogue/ms/alerts.json'] = { default: ms }
export { t } from '@skyclause/i18n'
export type Locale = 'en' | 'ms'
