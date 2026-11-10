import { catalogueFiles } from '../../../../packages/i18n/src/catalogue'
import en from '../../../../packages/i18n/catalogue/en/dashboard.json'
import ms from '../../../../packages/i18n/catalogue/ms/dashboard.json'
import '@skyclause/i18n/brand'

catalogueFiles['../catalogue/en/dashboard.json'] = { default: en }
catalogueFiles['../catalogue/ms/dashboard.json'] = { default: ms }

export { t } from '@skyclause/i18n'
