import { catalogueFiles } from '../../../../packages/i18n/src/catalogue'
import english from '../../../../packages/i18n/catalogue/en/webhooks.json'
import malay from '../../../../packages/i18n/catalogue/ms/webhooks.json'

catalogueFiles['../catalogue/en/webhooks.json'] = { default: english }
catalogueFiles['../catalogue/ms/webhooks.json'] = { default: malay }

export { t } from '@skyclause/i18n'
