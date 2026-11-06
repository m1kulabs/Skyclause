import { expect, test } from 'vitest'
import { t } from '../../features/palette/catalogue'
import '../../features/settings/set-7/catalogue'

test('feature registration makes both English and Malay copy available to shared t()', () => {
  expect(t('palette.title')).toBe('Command palette')
  expect(t('palette.title', {}, 'ms')).toBe('Palet arahan')
  expect(t('set7.type_name', { name: 'SKC' }, 'ms')).toBe('Taip “SKC” dengan tepat untuk mengesahkan.')
  expect(t('set7.cancel', {}, 'ms')).toBe('Batal')
})
