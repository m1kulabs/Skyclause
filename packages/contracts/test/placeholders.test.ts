/// <reference types="node" />

import { describe, expect, it } from 'vitest'
import { NotBuiltError } from '../src/not-built'

// Load workspace entrypoints at runtime: this integration check must not add reverse project references to contracts.
const packages: Array<{ name: string; owners: Record<string, string[]> }> = [
  {
    name: 'db',
    owners: {
      'c-run-orchestrator': ['requestRun'],
      'a-org-projects': ['createOrganisation'],
      'c-notifications': ['notify'],
      'd-org-api': ['listenEvents'],
      'a-subscriber-rights': ['eraseSubscriber']
    }
  },
  {
    name: 'config',
    owners: { 'e-byok-api': ['sealSecret', 'openSecret'], 'a-hardening': ['assertPublicUrl', 'safeFetch'] }
  },
  {
    name: 'forecast',
    owners: { 'b-forecast': ['baseline', 'uplift', 'periods', 'backtest', 'forecastNight'] }
  },
  {
    name: 'sources',
    owners: { 'b-adapter-listings': ['parseListingPage'] }
  }
]

describe.each(packages)('$name placeholders', ({ name, owners }) => {
  for (const [owner, exports] of Object.entries(owners)) {
    it.each(exports)('%s throws NotBuiltError with its owner', async (nameOfExport) => {
      const entrypoint = new URL(`../../${name}/src/index.ts`, import.meta.url).pathname
      const module: Record<string, unknown> = await import(entrypoint)
      const placeholder = module[nameOfExport]
      expect(placeholder).toBeTypeOf('function')
      expect(() => Reflect.apply(placeholder as (...args: unknown[]) => unknown, undefined, [])).toThrow(
        expect.objectContaining({ name: 'NotBuiltError', owner })
      )
      expect(() => Reflect.apply(placeholder as (...args: unknown[]) => unknown, undefined, [])).toThrow(NotBuiltError)
    })
  }
})
