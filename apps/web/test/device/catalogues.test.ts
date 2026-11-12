import { expect, test } from 'vitest'
import english from '../../../../packages/i18n/catalogue/en/device.json'
import malay from '../../../../packages/i18n/catalogue/ms/device.json'
import { t } from '../../features/device/i18n'

test('the Malay device catalogue covers every English message and keeps the device code and login recovery text', () => {
  expect(Object.keys(malay).sort()).toEqual(Object.keys(english).sort())
  for (const key of Object.keys(english) as Array<keyof typeof english>) {
    expect(malay[key].match(/\{\w+\}/g)?.sort()).toEqual(english[key].match(/\{\w+\}/g)?.sort())
    expect(t(`device.${key}`, {}, 'ms')).toBe(malay[key])
  }
  expect(t('device.expired', { command: 'skyclause login' })).toBe('This code has expired. Run skyclause login again.')
})
