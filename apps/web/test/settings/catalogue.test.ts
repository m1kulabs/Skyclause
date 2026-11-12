import '../../features/settings/catalogue'
import { t } from '@skyclause/i18n'
import { expect, test } from 'vitest'
import { settingsSections, unlistedSettingsSections } from '../../features/settings/sections'

test('every settings area and section, listed or reached only by URL, has English and Malay copy through t()', () => {
  const scopes = Object.keys(settingsSections) as (keyof typeof settingsSections)[]
  for (const [scope, sections] of scopes.map(
    (scope) => [scope, [...settingsSections[scope], ...unlistedSettingsSections[scope]]] as const
  )) {
    for (const locale of ['en', 'ms'] as const) {
      expect(t(`settings.scopes.${scope}`, {}, locale)).not.toMatch(/^settings\./)
      for (const section of sections) {
        for (const field of ['title', 'description']) {
          expect(t(`settings.sections.${scope}.${section}.${field}`, {}, locale)).not.toMatch(/^settings\./)
        }
      }
    }
  }
  expect(t('settings.scopes.account', {}, 'ms')).toBe('Tetapan akaun')
})
