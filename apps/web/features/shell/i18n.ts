import { catalogueFiles } from '../../../../packages/i18n/src/catalogue'
import english from '../../../../packages/i18n/catalogue/en/app-shell.json'
import malay from '../../../../packages/i18n/catalogue/ms/app-shell.json'

// Register only when the app feature loads, keeping app copy out of the marketing bundle.
catalogueFiles['../catalogue/en/app-shell.json'] = { default: english }
catalogueFiles['../catalogue/ms/app-shell.json'] = { default: malay }

export { t } from '@skyclause/i18n'
