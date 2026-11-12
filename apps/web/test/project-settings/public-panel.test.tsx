// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { t } from '../../features/project-settings/catalogue'
import Panel from '../../features/settings/project/public/panel'

vi.mock('next/navigation', () => ({ useParams: () => ({ org: 'campus-org', project: 'bukit-jalil' }) }))

afterEach(cleanup)

test('the unbuilt notice and the way to the share links are written in the request language', () => {
  render(<Panel locale="ms" />)
  expect(screen.getByText(t('project-settings.public_body', {}, 'ms'))).toBeDefined()
  expect(
    screen.getByText(t('data.not_built.title', { thing: t('project-settings.public_page', {}, 'ms') }, 'ms'))
  ).toBeDefined()
  expect(screen.getByRole('link', { name: t('project-settings.public_share', {}, 'ms') }).getAttribute('href')).toBe(
    '/campus-org/bukit-jalil/settings/share'
  )
  expect(screen.queryByRole('button', { name: /try again/i })).toBeNull()
})
