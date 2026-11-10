import { expect, test } from 'vitest'
import english from '../../../../packages/i18n/catalogue/en/probation.json'
import malay from '../../../../packages/i18n/catalogue/ms/probation.json'
import { t } from '../../features/probation/i18n'

test('probation Malay catalogue covers every English key and preserves interpolation', () => {
  expect(Object.keys(malay).sort()).toEqual(Object.keys(english).sort())
  for (const key of Object.keys(english) as Array<keyof typeof english>) {
    expect(malay[key].match(/\{\w+\}/g)?.sort()).toEqual(english[key].match(/\{\w+\}/g)?.sort())
    expect(t(`probation.${key}`, {}, 'ms')).toBe(malay[key])
  }
})
