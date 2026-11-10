import { catalogueFiles } from '../../../../packages/i18n/src/catalogue'
import english from '../../../../packages/i18n/catalogue/en/step-up.json'
import malay from '../../../../packages/i18n/catalogue/ms/step-up.json'

catalogueFiles['../catalogue/en/step-up.json'] = { default: english }
catalogueFiles['../catalogue/ms/step-up.json'] = { default: malay }

export { t } from '@skyclause/i18n'
