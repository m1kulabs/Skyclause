import { expect, test, vi } from 'vitest'
import type { Role } from '@skyclause/contracts'
import { dashboardPaletteSource } from '../../features/dashboard/palette-source'
import type { PaletteContext } from '../../features/palette/sources'
import { ApiProblem } from '../../lib/api-fetch'

const project = {
  id: 'project',
  org_id: 'org',
  org_name: 'Test organisation',
  org_slug: 'test-org',
  name: 'Test project',
  slug: 'test-project',
  role: 'owner' as Role,
  account_id: 'account'
}

function context(overrides: Partial<PaletteContext> = {}): PaletteContext {
  return {
    pathname: '/test-org/test-project/windows',
    org: 'test-org',
    project: 'test-project',
    memberships: [
      { account_id: 'account', org_id: 'org', org_name: 'Test organisation', org_slug: 'test-org', role: 'owner' }
    ],
    projects: [project],
    query: '',
    projectQuery: '',
    projectChoice: null,
    changeTheme: vi.fn(),
    chooseProject: vi.fn(),
    navigate: vi.fn(),
    ...overrides
  }
}

const items = (value: PaletteContext) => dashboardPaletteSource.itemsFor!(value)

test('sets the group of every item instead of leaving it to the ID', () => {
  const kinds = Object.fromEntries(items(context()).map((item) => [item.id, item.kind]))
  expect(kinds).toEqual({
    'organisation:org': 'places',
    'project:project': 'places',
    'declare-window': 'actions',
    'search-ledger': 'actions',
    'theme:light': 'appearance',
    'theme:dark': 'appearance',
    'theme:system': 'appearance'
  })
})

test('offers Declare a window and Search ledger under Suggestions', () => {
  const suggested = items(context()).filter((item) => item.suggested)
  expect(suggested.map((item) => item.id)).toEqual(['declare-window', 'search-ledger'])
})

test('the choose-a-project rows are places', () => {
  const rows = items(context({ projectChoice: 'window' })).filter((item) => item.id.startsWith('choose-'))
  expect(rows.map((item) => [item.id, item.kind])).toEqual([['choose-window:project', 'places']])
})

test('reads the organisation and project from the route, not the path', () => {
  const navigate = vi.fn()
  const declare = items(context({ pathname: '/account/appearance', navigate })).find(
    (item) => item.id === 'declare-window'
  )!
  expect(declare.keepOpen).toBeUndefined()
  declare.onSelect()
  expect(navigate).toHaveBeenCalledWith('/test-org/test-project/windows?declare=window')

  // `/new`, `/connect` and `/account/*` have no organisation in the route, whatever their first segment.
  const outside = items(context({ pathname: '/test-org/test-project/windows', org: undefined, project: undefined }))
  expect(outside.find((item) => item.id === 'declare-window')!.keepOpen).toBe(true)
})

test('search results are results', async () => {
  vi.doMock('../../features/dashboard/operations', () => ({
    allPages: async (read: (cursor?: string) => Promise<{ data: unknown[]; next_cursor: string | null }>) =>
      (await read()).data,
    paletteSearchApi: async () => ({
      data: [
        { kind: 'window', id: 'window', label: 'Window', href: '/test-org/test-project/windows', project_id: 'project' }
      ],
      next_cursor: null
    })
  }))
  const results = await dashboardPaletteSource.search!('Window', context(), new AbortController().signal)
  expect(results.map((item) => item.kind)).toEqual(['results'])
  vi.doUnmock('../../features/dashboard/operations')
})

function searchAnswers(problem: ApiProblem) {
  vi.doMock('../../features/dashboard/operations', () => ({
    allPages: async (read: (cursor?: string) => Promise<{ data: unknown[]; next_cursor: string | null }>) =>
      (await read()).data,
    paletteSearchApi: async () => {
      throw problem
    }
  }))
}

test('a search that is not available yet (501) finds nothing, so typed commands and destinations still match', async () => {
  searchAnswers(new ApiProblem(501, { title: 'Not built' }))
  try {
    const outside = context({ org: undefined, project: undefined, pathname: '/account/profile' })
    await expect(dashboardPaletteSource.search!('ledger', outside, new AbortController().signal)).resolves.toEqual([])
  } finally {
    vi.doUnmock('../../features/dashboard/operations')
  }
})

test('a search that really failed still fails, so the palette can say so and offer Retry', async () => {
  searchAnswers(new ApiProblem(503, { title: 'Unavailable' }))
  try {
    await expect(dashboardPaletteSource.search!('ledger', context(), new AbortController().signal)).rejects.toThrow(
      ApiProblem
    )
  } finally {
    vi.doUnmock('../../features/dashboard/operations')
  }
})
