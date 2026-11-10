import { catalogueFiles } from '../../../../packages/i18n/src/catalogue'
import english from '../../../../packages/i18n/catalogue/en/calls.json'
import malay from '../../../../packages/i18n/catalogue/ms/calls.json'

catalogueFiles['../catalogue/en/calls.json'] = { default: english }
catalogueFiles['../catalogue/ms/calls.json'] = { default: malay }

export { t } from '@skyclause/i18n'
