import en from '../../../../packages/i18n/catalogue/en/onboarding.json'
import ms from '../../../../packages/i18n/catalogue/ms/onboarding.json'
import { expect, test } from 'vitest'
import { t } from '../../features/onboarding/catalogue'

test('onboarding English and Malay catalogues have the same keys and interpolation slots', () => {
  expect(Object.keys(ms).sort()).toEqual(Object.keys(en).sort())
  for (const [key, message] of Object.entries(en)) {
    const translated = t(`onboarding.${key}`, {}, 'ms')
    expect(translated, key).not.toBe('')
    expect(translated.match(/\{\w+\}/g) ?? [], key).toEqual(message.match(/\{\w+\}/g) ?? [])
  }
})
