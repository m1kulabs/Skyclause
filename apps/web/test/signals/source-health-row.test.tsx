// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { SourceHealthRow } from '../../features/data-components/source-health-row'

const source = {
  id: '019a55e0-0000-7000-8000-000000000001',
  kind: 'apims' as const,
  external_id: 'CA16W',
  owner_org_id: null,
  name: 'Cheras',
  lat: 3.11,
  lon: 101.72,
  url: 'https://eqms.doe.gov.my/api3/publicportalapims/mapcaqm',
  cadence_s: 3600,
  stale_after_s: 7200,
  licence_id: 'open-data',
  licence_label: 'Open data'
}
const lastErrorLabel = 'Last error HTTP 503 · 18:12 MYT'

test('source rows show a custom latest value, current state detail and source link', () => {
  render(
    <table>
      <tbody>
        <SourceHealthRow
          source={source}
          latest={{ value: 67, observed_at: '2026-11-05T13:00:00Z', unit: 'API' }}
          state={{ state: 'fresh', since: '2026-11-05T13:00:00Z', http_status: 200, pending_until: null }}
          ageS={720}
          latestLabel="67 API · Moderate"
          stateLabel="Fresh · Moderate"
        >
          <span>{lastErrorLabel}</span>
        </SourceHealthRow>
      </tbody>
    </table>
  )

  expect(screen.getByText('67 API · Moderate')).toBeTruthy()
  expect(screen.getAllByText('Fresh · Moderate')).toHaveLength(1)
  expect(screen.getByText(lastErrorLabel)).toBeTruthy()
  expect(screen.getByText('Open data')).toBeTruthy()
  // No ticks were passed, so no poll strip is drawn: unknown polls never render as received.
  expect(screen.queryByRole('img', { name: /polls/ })).toBeNull()
  expect(screen.getByRole('link', { name: /^Open source/ }).getAttribute('href')).toBe(source.url)
  expect(screen.getByText('CA16W').getAttribute('translate')).toBe('no')
})
