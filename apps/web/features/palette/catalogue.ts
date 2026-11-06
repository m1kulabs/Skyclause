import { catalogueFiles } from '../../../../packages/i18n/src/catalogue'
import en from '../../../../packages/i18n/catalogue/en/palette.json'
import ms from '../../../../packages/i18n/catalogue/ms/palette.json'

// Register on feature load so the marketing entry does not import app-only copy.
catalogueFiles['../catalogue/en/palette.json'] = { default: en }
catalogueFiles['../catalogue/ms/palette.json'] = { default: ms }

export { t } from '@skyclause/i18n'
