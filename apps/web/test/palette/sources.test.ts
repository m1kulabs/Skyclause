import { expect, test } from 'vitest'
import { paletteSources, sourcesForRole, type PaletteSource } from '../../features/palette/sources'

const sources: PaletteSource[] = [
  { id: 'read', roles: ['owner', 'admin', 'viewer'], items: [] },
  { id: 'manage', roles: ['owner', 'admin'], items: [] }
]

test('registers the dashboard source for role-aware navigation and search', () => {
  expect(paletteSources.map((source) => source.id)).toEqual(['dashboard'])
})

test('filters test-only sources by the current role and fails closed without a role', () => {
  expect(sourcesForRole(sources, 'viewer').map((source) => source.id)).toEqual(['read'])
  expect(sourcesForRole(sources, 'admin').map((source) => source.id)).toEqual(['read', 'manage'])
  expect(sourcesForRole(sources, 'guest')).toEqual([])
  expect(sourcesForRole(sources, null)).toEqual([])
})
