import { catalogueFiles } from '../../../../packages/i18n/src/catalogue'
import en from '../../../../packages/i18n/catalogue/en/landing-hero.json'
import '@skyclause/i18n/brand'
import '@skyclause/i18n/format'

// Feature-local registration keeps landing-hero copy out of the app bundle.
catalogueFiles['../catalogue/en/landing-hero.json'] = { default: en }

export { t } from '@skyclause/i18n'
