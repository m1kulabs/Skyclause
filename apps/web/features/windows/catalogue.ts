import { catalogueFiles } from '../../../../packages/i18n/src/catalogue'
import en from '../../../../packages/i18n/catalogue/en/windows.json'
import ms from '../../../../packages/i18n/catalogue/ms/windows.json'

catalogueFiles['../catalogue/en/windows.json'] = { default: en }
catalogueFiles['../catalogue/ms/windows.json'] = { default: ms }

import { t } from '@skyclause/i18n'
export { t }
export type Locale = 'en' | 'ms'

export function fieldMessage(issue: string, locale: Locale = 'en') {
  return issue.startsWith('server:')
    ? t('windows.server_message', { message: issue.slice(7) }, locale)
    : t(`windows.${issue}`, {}, locale)
}
