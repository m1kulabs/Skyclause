import english from '../catalogue/en/subscriber-emails.json' with { type: 'json' }
import malay from '../catalogue/ms/subscriber-emails.json' with { type: 'json' }
import './brand'
import { catalogueFiles } from './catalogue'

// c-subscribers' email copy (#157), with brand's not-a-safety-service line, registered only where emails render.
catalogueFiles['../catalogue/en/subscriber-emails.json'] = { default: english }
catalogueFiles['../catalogue/ms/subscriber-emails.json'] = { default: malay }

export { t } from './index'
