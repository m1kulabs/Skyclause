import { catalogueFiles } from '../../../../packages/i18n/src/catalogue'
import en from '../../../../packages/i18n/catalogue/en/analysis.json'
import ms from '../../../../packages/i18n/catalogue/ms/analysis.json'

// App-only registration protects the marketing JavaScript budget.
catalogueFiles['../catalogue/en/analysis.json'] = { default: en }
catalogueFiles['../catalogue/ms/analysis.json'] = { default: ms }
export { t } from '@skyclause/i18n'
