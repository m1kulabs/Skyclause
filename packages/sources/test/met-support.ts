import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect } from 'vitest'
import type { PollContext, Source } from '../src/contract'

export function capture(file: string, sha: string): Record<string, unknown>[] {
  const body = readFileSync(new URL(`./fixtures/${file}`, import.meta.url))
  expect(body).toEqual(readFileSync(new URL(`../../../docs/sources/api.data.gov.my/${file}`, import.meta.url)))
  expect(createHash('sha256').update(body).digest('hex')).toBe(sha)
  return JSON.parse(body.toString()) as Record<string, unknown>[]
}

export const warningSource: Source = {
  id: 'warning-source',
  kind: 'met_warning',
  externalId: 'met-warnings',
  name: 'MET Malaysia warnings',
  lat: null,
  lon: null,
  url: 'https://api.data.gov.my/weather/warning/',
  meta: {}
}
export const forecastSource: Source = {
  ...warningSource,
  id: 'forecast-source',
  kind: 'met_forecast',
  externalId: 'Ds058',
  name: 'Kuala Lumpur',
  url: 'https://api.data.gov.my/weather/forecast/'
}

export function context(http: PollContext['http']): PollContext {
  return {
    http,
    now: () => '2026-11-11T00:00:00Z',
    budget: {
      take: async () => {
        throw new Error('double budget')
      }
    },
    storage: { get: async () => null, put: async () => {} },
    openCrowdPeriods: async () => [],
    log: () => {}
  }
}

export function response(body: unknown, status = 200, contentType = 'application/json') {
  return {
    status,
    headers: { get: () => contentType },
    json: async () => body,
    text: async () => JSON.stringify(body),
    arrayBuffer: async () => new ArrayBuffer(0)
  }
}
