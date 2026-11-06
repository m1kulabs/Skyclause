import { expect, test } from 'vitest'
import { t } from '../../features/shell/i18n'
import english from '../../../../packages/i18n/catalogue/en/app-shell.json'
import malay from '../../../../packages/i18n/catalogue/ms/app-shell.json'

test('the shell registers its English and Malay catalogues with the shared translator', () => {
  expect(Object.keys(malay)).toEqual(Object.keys(english))
  expect(t('app-shell.dashboard')).toBe('Dashboard')
  expect(t('app-shell.dashboard', {}, 'ms')).toBe('Papan pemuka')
  expect(t('app-shell.roles.approver', {}, 'ms')).toBe('Pelulus')
  expect(t('app-shell.membershipLabel', { name: 'Test', role: 'Pemilik' }, 'ms')).toBe('Test, Pemilik')
})
