import './catalogue'
import { t } from '@skyclause/i18n'
import type { SettingsScope } from './access'
import { settingsLocale } from './locale'

/**
 * A settings page's `generateMetadata`: its tab names the section and the settings it belongs to, in the page's
 * language ("Members and roles · Organisation settings").
 */
export function settingsMetadata(scope: SettingsScope, section: string) {
  return async () => {
    const locale = await settingsLocale()
    const name = t(`settings.sections.${scope}.${section}.title`, {}, locale)
    return {
      title: t('settings.page_title', { section: name, scope: t(`settings.scopes.${scope}`, {}, locale) }, locale)
    }
  }
}
