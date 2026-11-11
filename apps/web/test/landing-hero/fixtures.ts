import type { InputValue } from '@skyclause/contracts/api/shared'

export const input = (over: Partial<InputValue> = {}): InputValue => ({
  name: 'site.rain_60m_mm',
  value: 39,
  unit: 'mm',
  state: 'fresh',
  since: null,
  age_s: 300,
  source_ids: ['0232901RF'],
  source_url: 'https://example.com/gauge',
  reading_ids: [],
  observed_at: '2026-11-05T13:00:00.000Z',
  ...over
})
