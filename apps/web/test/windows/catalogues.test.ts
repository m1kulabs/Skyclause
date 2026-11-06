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

test('the empty state matches DESIGN exactly and Malay translates the window form', () => {
  expect(t('windows.empty')).toBe('0 windows. Declare one, or import an ICS calendar.')
  expect(t('windows.declare', {}, 'ms')).toBe('Isytiharkan jendela masa')
  expect(t('windows.past', {}, 'ms')).toContain('Minta bukti')
})
