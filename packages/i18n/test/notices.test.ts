import { expect, test } from 'vitest'
import en from '../catalogue/en/notices.json'
import ms from '../catalogue/ms/notices.json'
import { t } from '../src/notices'

// #152: notice templates in English and Malay. A missing Malay string would silently send English (t's fallback),
// so both catalogues carry the same keys with the same interpolation slots.

type Tree = { [key: string]: string | Tree }

function leaves(tree: Tree, prefix = ''): Array<[string, string]> {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [[`${prefix}${key}`, value] as [string, string]] : leaves(value, `${prefix}${key}.`)
  )
}

const slots = (message: string) => (message.match(/\{\w+\}/g) ?? []).sort()

test('the Malay notice catalogue has every English key with the same slots', () => {
  const english = leaves(en as Tree)
  expect(leaves(ms as Tree).map(([key]) => key)).toEqual(english.map(([key]) => key))
  for (const [key, message] of english) {
    const malay = t(`notices.${key}`, {}, 'ms')
    expect(malay, key).not.toBe('')
    // Pure layout ("{mode} · {window}") reads the same in both; anything with words is translated.
    if (/[a-z]{3,}/i.test(message.replace(/\{\w+\}/g, '').replace(/\bMYT\b/g, ''))) {
      expect(malay, key).not.toBe(message)
    }
    expect(slots(malay), key).toEqual(slots(message))
  }
})

test('the notices entry point loads the brand lines both languages share (NTC-3)', () => {
  expect(t('brand.not_safety_service')).toBe(
    'Skyclause is not a safety or emergency service. In an emergency, call 999.'
  )
  expect(t('brand.not_safety_service', {}, 'ms')).toBe(
    'Skyclause bukan perkhidmatan keselamatan atau kecemasan. Jika berlaku kecemasan, hubungi 999.'
  )
  expect(t('notices.teaching')).toBe(
    "Teaching mode is the lecturer's and the university's decision. Skyclause never excuses attendance."
  )
})
