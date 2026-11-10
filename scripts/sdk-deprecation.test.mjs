import { expect, it, vi } from 'vitest'
import { createSdk } from '../packages/sdk/src/index'
import { deprecate } from '../packages/api/src/deprecation'
import { createTestApi } from '../packages/api/test/harness'

const deprecatedStatusHandler = (sunsetAt = '2027-05-10T00:00:00Z') => ({
  getPublicServiceStatus: {
    handler: (context) => {
      deprecate(context, {
        deprecatedAt: new Date('2026-11-10T00:00:00Z'),
        sunsetAt: new Date(sunsetAt),
        link: 'https://docs.skyclause.m1ku.tech/changelog#public-status'
      })
      return context.json({ components: [], incidents: [] })
    }
  }
})

it('forwards API Deprecation, Sunset, and Link headers to onDeprecation', async () => {
  const { v1 } = createTestApi({ handlers: deprecatedStatusHandler() })
  const onDeprecation = vi.fn()
  const sdk = createSdk({
    fetch: (input, init) =>
      v1.request(input instanceof globalThis.Request ? input : new globalThis.Request(input, init)),
    onDeprecation
  })

  await sdk.getPublicServiceStatus()

  expect(onDeprecation).toHaveBeenCalledWith({
    operationId: 'getPublicServiceStatus',
    deprecation: '@1794268800',
    sunset: 'Mon, 10 May 2027 00:00:00 GMT',
    link: '<https://docs.skyclause.m1ku.tech/changelog#public-status>; rel="deprecation"'
  })
})

it('warns once per deprecated operation by default', async () => {
  const { v1 } = createTestApi({ handlers: deprecatedStatusHandler() })
  const sdk = createSdk({
    fetch: (input, init) =>
      v1.request(input instanceof globalThis.Request ? input : new globalThis.Request(input, init))
  })
  const warn = vi.spyOn(globalThis.console, 'warn').mockImplementation(() => {})

  try {
    await sdk.getPublicServiceStatus()
    await sdk.getPublicServiceStatus()
    expect(warn).toHaveBeenCalledTimes(1)
  } finally {
    warn.mockRestore()
  }
})

it('rejects a deprecation sunset less than six months away', () => {
  expect(() =>
    deprecate(null, {
      deprecatedAt: new Date('2026-11-10T00:00:00Z'),
      sunsetAt: new Date('2027-05-09T00:00:00Z')
    })
  ).toThrow('SDK-5: a sunset must be at least six months after its deprecation')
})
