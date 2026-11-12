import { catalogueFiles } from '../../../../packages/i18n/src/catalogue'
import en from '../../../../packages/i18n/catalogue/en/data.json'
import ms from '../../../../packages/i18n/catalogue/ms/data.json'
import analysisEn from '../../../../packages/i18n/catalogue/en/analysis.json'
import analysisMs from '../../../../packages/i18n/catalogue/ms/analysis.json'
import '@skyclause/i18n/brand'

// Register on feature load, keeping data copy out of the marketing bundle.
catalogueFiles['../catalogue/en/data.json'] = { default: en }
catalogueFiles['../catalogue/ms/data.json'] = { default: ms }
// The metric names and the share and minute formats are the analysis screen's: one name and one reading per metric.
catalogueFiles['../catalogue/en/analysis.json'] = { default: analysisEn }
catalogueFiles['../catalogue/ms/analysis.json'] = { default: analysisMs }

export { t } from '@skyclause/i18n'
