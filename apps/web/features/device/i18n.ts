import { catalogueFiles } from '../../../../packages/i18n/src/catalogue'
import english from '../../../../packages/i18n/catalogue/en/device.json'
import malay from '../../../../packages/i18n/catalogue/ms/device.json'

catalogueFiles['../catalogue/en/device.json'] = { default: english }
catalogueFiles['../catalogue/ms/device.json'] = { default: malay }

export { t } from '@skyclause/i18n'
