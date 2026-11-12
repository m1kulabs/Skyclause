import { catalogueFiles } from '../../../../packages/i18n/src/catalogue'
import english from '../../../../packages/i18n/catalogue/en/sign-in.json'
import malay from '../../../../packages/i18n/catalogue/ms/sign-in.json'

catalogueFiles['../catalogue/en/sign-in.json'] = { default: english }
catalogueFiles['../catalogue/ms/sign-in.json'] = { default: malay }

export { t } from '@skyclause/i18n'
export type Locale = 'en' | 'ms'
