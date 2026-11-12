// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { t } from '../../features/project-settings/catalogue'
import Panel from '../../features/settings/project/public/panel'

afterEach(cleanup)

test('the public page says it is not available yet, in the request language, and offers nothing that fails', () => {
  render(<Panel locale="ms" />)
  expect(screen.getByText(t('project-settings.public_page', {}, 'ms'))).toBeDefined()
  expect(screen.getByText('Halaman projek awam belum tersedia.')).toBeDefined()
  // Share links are not available yet either, so nothing points there.
  expect(screen.queryByRole('link')).toBeNull()
  expect(screen.queryByRole('button')).toBeNull()
})
