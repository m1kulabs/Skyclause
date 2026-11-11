// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { onboardingApi } from '../../features/onboarding/operations'
import { sourcesApi, type BoundSourceView } from '../../features/sources/operations'
import Panel from '../../features/settings/project/packs/panel'

vi.mock('../../features/onboarding/operations', () => ({ onboardingApi: vi.fn() }))
vi.mock('../../features/sources/operations', () => ({ sourcesApi: vi.fn() }))
vi.mock('../../features/onboarding/first-run-progress', () => ({ FirstRunProgress: () => null }))
vi.mock('../../features/sources/source-picker', () => ({ SourcePicker: () => null }))

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

test('null evaluator state is labelled separately while persisted provider errors remain visible', async () => {
  vi.mocked(onboardingApi).mockResolvedValue({
    data: [{ id: 'project', slug: 'campus', packs: [] }],
    next_cursor: null
  } as never)
  const source: BoundSourceView = {
    id: 'source',
    kind: 'apims',
    external_id: 'CA16W',
    owner_org_id: null,
    name: 'Cheras',
    lat: null,
    lon: null,
    url: 'https://source.example.test/',
    cadence_s: 900,
    stale_after_s: 7200,
    licence_id: null,
    licence_label: 'no published terms',
    project_id: 'project',
    role: 'api_station',
    state: null,
    latest_reading: null,
    age_s: null,
    recent_errors: []
  }
  vi.mocked(sourcesApi).mockResolvedValue({
    data: [
      source,
      {
        ...source,
        id: 'error-source',
        external_id: 'error',
        state: { state: 'error', since: '2026-11-05T13:00:00Z', http_status: 503, pending_until: null }
      }
    ],
    next_cursor: null
  } as never)
  render(<Panel org="org" project="campus" />)
  expect(await screen.findByText('Not evaluated')).toBeTruthy()
  expect(screen.getByText('Error · HTTP 503')).toBeTruthy()
})
