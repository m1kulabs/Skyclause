import english from '../catalogue/en/approver-alerts.json' with { type: 'json' }
import './brand'
import { catalogueFiles } from './catalogue'

// c-approver-alerts' push and email copy (#155), in English only: approver alerts follow P1's English app.
catalogueFiles['../catalogue/en/approver-alerts.json'] = { default: english }

export { t } from './index'
