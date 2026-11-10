import english from '../catalogue/en/replies.json' with { type: 'json' }
import malay from '../catalogue/ms/replies.json' with { type: 'json' }
import './brand'
import { catalogueFiles } from './catalogue'

// c-recipient-replies' plan-feedback email copy (#163), with brand's not-a-safety-service line, registered only where
// emails render.
catalogueFiles['../catalogue/en/replies.json'] = { default: english }
catalogueFiles['../catalogue/ms/replies.json'] = { default: malay }

export { t } from './index'
