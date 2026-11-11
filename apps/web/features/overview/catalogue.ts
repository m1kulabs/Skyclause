import { catalogueFiles } from '../../../../packages/i18n/src/catalogue'
import en from '../../../../packages/i18n/catalogue/en/overview.json'
import ms from '../../../../packages/i18n/catalogue/ms/overview.json'

catalogueFiles['../catalogue/en/overview.json'] = { default: en }
catalogueFiles['../catalogue/ms/overview.json'] = { default: ms }

export { t } from '@skyclause/i18n'
