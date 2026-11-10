import { catalogueFiles } from '../../../../packages/i18n/src/catalogue'
import en from '../../../../packages/i18n/catalogue/en/rota.json'
import ms from '../../../../packages/i18n/catalogue/ms/rota.json'

catalogueFiles['../catalogue/en/rota.json'] = { default: en }
catalogueFiles['../catalogue/ms/rota.json'] = { default: ms }

export { t } from '@skyclause/i18n'
export type Locale = 'en' | 'ms'
