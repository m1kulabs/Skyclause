import { expect, test } from 'vitest'
import en from '../../../../packages/i18n/catalogue/en/windows.json'
import ms from '../../../../packages/i18n/catalogue/ms/windows.json'
import { t } from '../../features/windows/catalogue'

test('windows English and Malay catalogues have the same keys and interpolation slots', () => {
  expect(Object.keys(ms).sort()).toEqual(Object.keys(en).sort())
  for (const [key, message] of Object.entries(en)) {
    const malay = t(`windows.${key}`, {}, 'ms')
    expect(malay).not.toBe('')
    expect(malay.match(/\{\w+\}/g) ?? []).toEqual(message.match(/\{\w+\}/g) ?? [])
  }
})

test('Malay translates the window form and the limits printed under its fields', () => {
  expect(t('windows.limit_end')).toBe('At most 12 hours after the start.')
  expect(t('windows.limit_end', {}, 'ms')).toContain('12 jam')
  expect(t('windows.declare', {}, 'ms')).toBe('Isytiharkan jendela masa')
  expect(t('windows.past', {}, 'ms')).toContain('Minta bukti')
})
