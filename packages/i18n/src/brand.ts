import english from '../catalogue/en/brand.json'
import malay from '../catalogue/ms/brand.json'
import { catalogueFiles } from './catalogue'

// Opt in at the feature boundary, keeping brand copy out of the landing's client bundle.
catalogueFiles['../catalogue/en/brand.json'] = { default: english }
catalogueFiles['../catalogue/ms/brand.json'] = { default: malay }

export const attribution = english.attribution
export { t } from './index'
