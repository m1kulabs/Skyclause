import { catalogueFiles } from '../../../../packages/i18n/src/catalogue'
import english from '../../../../packages/i18n/catalogue/en/share-previews.json'

// Cards, alt text and oEmbed are English: a preview URL carries no language.
catalogueFiles['../catalogue/en/share-previews.json'] = { default: english }
export { t } from '@skyclause/i18n/brand'
