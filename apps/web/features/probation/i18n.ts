import { catalogueFiles } from '../../../../packages/i18n/src/catalogue'
import english from '../../../../packages/i18n/catalogue/en/probation.json'
import malay from '../../../../packages/i18n/catalogue/ms/probation.json'

catalogueFiles['../catalogue/en/probation.json'] = { default: english }
catalogueFiles['../catalogue/ms/probation.json'] = { default: malay }

export { t } from '@skyclause/i18n'
