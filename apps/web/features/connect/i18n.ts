import { catalogueFiles } from '../../../../packages/i18n/src/catalogue'
import english from '../../../../packages/i18n/catalogue/en/connect.json'
import malay from '../../../../packages/i18n/catalogue/ms/connect.json'

catalogueFiles['../catalogue/en/connect.json'] = { default: english }
catalogueFiles['../catalogue/ms/connect.json'] = { default: malay }

export { t } from '@skyclause/i18n'
export type Locale = 'en' | 'ms'
