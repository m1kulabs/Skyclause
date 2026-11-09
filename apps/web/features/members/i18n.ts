import { catalogueFiles } from '../../../../packages/i18n/src/catalogue'
import en from '../../../../packages/i18n/catalogue/en/members.json'
import ms from '../../../../packages/i18n/catalogue/ms/members.json'

catalogueFiles['../catalogue/en/members.json'] = { default: en }
catalogueFiles['../catalogue/ms/members.json'] = { default: ms }

export { t } from '@skyclause/i18n'
export type Locale = 'en' | 'ms'
