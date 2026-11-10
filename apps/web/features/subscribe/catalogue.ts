import { catalogueFiles } from '../../../../packages/i18n/src/catalogue'
import en from '../../../../packages/i18n/catalogue/en/subscribe.json'
import ms from '../../../../packages/i18n/catalogue/ms/subscribe.json'

catalogueFiles['../catalogue/en/subscribe.json'] = { default: en }
catalogueFiles['../catalogue/ms/subscribe.json'] = { default: ms }

export { t } from '@skyclause/i18n'
