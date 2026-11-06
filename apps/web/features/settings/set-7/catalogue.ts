import { catalogueFiles } from '../../../../../packages/i18n/src/catalogue'
import en from '../../../../../packages/i18n/catalogue/en/set7.json'
import ms from '../../../../../packages/i18n/catalogue/ms/set7.json'

// Keep registration with the feature until i18n exposes a registration entry point.
catalogueFiles['../catalogue/en/set7.json'] = { default: en }
catalogueFiles['../catalogue/ms/set7.json'] = { default: ms }

export { t } from '@skyclause/i18n'
