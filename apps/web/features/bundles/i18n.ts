import { catalogueFiles } from '../../../../packages/i18n/src/catalogue'
import english from '../../../../packages/i18n/catalogue/en/bundles.json'
import malay from '../../../../packages/i18n/catalogue/ms/bundles.json'

// Feature-local registration keeps bundle copy outside the landing page's JavaScript budget.
catalogueFiles['../catalogue/en/bundles.json'] = { default: english }
catalogueFiles['../catalogue/ms/bundles.json'] = { default: malay }

export { t } from '@skyclause/i18n'

// Validation compares notice text with the canonical template, never expanded pseudo UI copy.
export function teachingLine(language: 'en' | 'ms'): string {
  return (language === 'ms' ? malay : english).teaching
}
