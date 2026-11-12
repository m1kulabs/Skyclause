import { catalogueFiles } from '../../../../packages/i18n/src/catalogue'
import en from '../../../../packages/i18n/catalogue/en/subscriber-rights.json'
import ms from '../../../../packages/i18n/catalogue/ms/subscriber-rights.json'

catalogueFiles['../catalogue/en/subscriber-rights.json'] = { default: en }
catalogueFiles['../catalogue/ms/subscriber-rights.json'] = { default: ms }

export { t } from '@skyclause/i18n'
