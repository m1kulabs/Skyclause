import { catalogueFiles } from '../../../../packages/i18n/src/catalogue'
import english from '../../../../packages/i18n/catalogue/en/camera.json'
import malay from '../../../../packages/i18n/catalogue/ms/camera.json'

catalogueFiles['../catalogue/en/camera.json'] = { default: english }
catalogueFiles['../catalogue/ms/camera.json'] = { default: malay }
export { t } from '@skyclause/i18n'
