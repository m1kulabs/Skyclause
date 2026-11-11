import { catalogueFiles } from '../../../../packages/i18n/src/catalogue'
import en from '../../../../packages/i18n/catalogue/en/signals.json'
import ms from '../../../../packages/i18n/catalogue/ms/signals.json'

catalogueFiles['../catalogue/en/signals.json'] = { default: en }
catalogueFiles['../catalogue/ms/signals.json'] = { default: ms }

export { t } from '@skyclause/i18n'
