import { expect, test, vi } from 'vitest'
import type { Role } from '@skyclause/contracts'
import { navigationPaletteSource } from '../../features/palette/navigation-source'
import type { PaletteContext } from '../../features/palette/sources'

function context(overrides: Partial<PaletteContext> & { role?: Role } = {}): PaletteContext {
  const { role = 'owner', ...rest } = overrides
  return {
    pathname: '/test-org/test-project/windows',
    org: 'test-org',
    project: 'test-project',
    memberships: [{ account_id: 'account', org_id: 'org', org_name: 'Test organisation', org_slug: 'test-org', role }],
    projects: [],
    query: '',
    projectChoice: null,
    changeTheme: vi.fn(),
    chooseProject: vi.fn(),
    navigate: vi.fn(),
    ...rest
  }
}

const ids = (value: PaletteContext) => navigationPaletteSource.itemsFor!(value).map((item) => item.id)

test('offers Review and every destination of the project and organisation, as the bar does; not webhooks', () => {
  expect(ids(context())).toEqual([
    'go:review',
    'go:windows',
    'go:signals',
    'go:calls',
    'go:ledger',
    'go:overview',
    'go:projectAnalysis',
    'go:subscribers',
    'go:projectSettings',
    'go:dashboard',
    'go:projects',
    'go:organisationAnalysis',
    'go:organisationSettings',
    'go:connect',
    'go:account'
  ])
})

test('follows the role, and suggests Review and the four core destinations', () => {
  const viewer = navigationPaletteSource.itemsFor!(context({ role: 'viewer' }))
  expect(viewer.map((item) => item.id)).not.toContain('go:subscribers')
  expect(viewer.map((item) => item.id)).not.toContain('go:organisationSettings')
  expect(viewer.filter((item) => item.suggested).map((item) => item.id)).toEqual([
    'go:review',
    'go:windows',
    'go:signals',
    'go:calls',
    'go:ledger'
  ])
  const guest = ids(context({ role: 'guest' }))
  expect(guest).toContain('go:appearance')
  expect(guest).not.toContain('go:connect')
  expect(guest).not.toContain('go:account')
})

test('outside an organisation it goes to the first membership, and navigates to the destination', () => {
  const value = context({ pathname: '/account/appearance', org: undefined, project: undefined })
  const items = navigationPaletteSource.itemsFor!(value)
  expect(items.map((item) => item.id)).toEqual([
    'go:review',
    'go:dashboard',
    'go:projects',
    'go:organisationAnalysis',
    'go:organisationSettings',
    'go:connect',
    'go:account'
  ])
  items.find((item) => item.id === 'go:review')!.onSelect()
  expect(value.navigate).toHaveBeenCalledWith('/test-org#dashboard-needs-review')
  expect(navigationPaletteSource.itemsFor!(context({ projectChoice: 'window' }))).toEqual([])
})
