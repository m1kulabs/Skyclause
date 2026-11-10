import { catalogueFiles } from '../../../../packages/i18n/src/catalogue'
import en from '../../../../packages/i18n/catalogue/en/channels.json'
import ms from '../../../../packages/i18n/catalogue/ms/channels.json'

catalogueFiles['../catalogue/en/channels.json'] = { default: en }
catalogueFiles['../catalogue/ms/channels.json'] = { default: ms }

export { t } from '@skyclause/i18n'
