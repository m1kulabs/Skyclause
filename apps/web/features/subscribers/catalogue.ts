import { catalogueFiles } from '../../../../packages/i18n/src/catalogue'
import en from '../../../../packages/i18n/catalogue/en/subscribers.json'
import ms from '../../../../packages/i18n/catalogue/ms/subscribers.json'

catalogueFiles['../catalogue/en/subscribers.json'] = { default: en }
catalogueFiles['../catalogue/ms/subscribers.json'] = { default: ms }

export { t } from '@skyclause/i18n'
