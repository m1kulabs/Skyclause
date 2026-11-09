import english from '../catalogue/en/evidence.json'
import malay from '../catalogue/ms/evidence.json'
import { catalogueFiles } from './catalogue'

// #159: the evidence reply's plain text, registered by the code that renders it, as `brand.ts` does.
catalogueFiles['../catalogue/en/evidence.json'] = { default: english }
catalogueFiles['../catalogue/ms/evidence.json'] = { default: malay }

export { t } from './index'
