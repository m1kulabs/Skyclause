/// <reference types="node" />

import { beforeAll, describe, expect, it } from 'vitest'
import { NotBuiltError } from '../src/not-built'

// Load workspace entrypoints at runtime: this integration check must not add reverse project references to contracts.
const packages: Array<{ name: string; owners: Record<string, string[]> }> = [
  {
    name: 'db',
    owners: {
      'a-org-projects': ['createOrganisation'],
      'd-guest-rules': ['budgetGate'],
      'd-org-api': ['listenEvents'],
      'a-subscriber-rights': ['eraseSubscriber']
    }
  },
  {
    name: 'config',
    owners: { 'e-byok-api': ['sealSecret', 'openSecret'] }
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
  let module: Record<string, unknown>

  // The cold import of a package entrypoint can load much of the platform; keep it out of the per-test 5 s timeout.
  beforeAll(async () => {
    const entrypoint = new URL(`../../${name}/src/index.ts`, import.meta.url).pathname
    module = await import(entrypoint)
  }, 60_000)

  for (const [owner, exports] of Object.entries(owners)) {
    it.each(exports)('%s throws NotBuiltError with its owner', (nameOfExport) => {
      const placeholder = module[nameOfExport]
      expect(placeholder).toBeTypeOf('function')
      expect(() => Reflect.apply(placeholder as (...args: unknown[]) => unknown, undefined, [])).toThrow(
        expect.objectContaining({ name: 'NotBuiltError', owner })
      )
      expect(() => Reflect.apply(placeholder as (...args: unknown[]) => unknown, undefined, [])).toThrow(NotBuiltError)
    })
  }
})
