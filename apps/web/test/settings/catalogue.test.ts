import '../../features/settings/catalogue'
import { t } from '@skyclause/i18n'
import { expect, test } from 'vitest'
import { settingsSections } from '../../features/settings/sections'

test('every settings area and section has English and Malay copy loaded through t()', () => {
  for (const [scope, sections] of Object.entries(settingsSections)) {
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
