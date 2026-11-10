import { expect, test } from 'vitest'
import document from '@skyclause/sdk/openapi.json' with { type: 'json' }
import schemaGetMe from '@skyclause/sdk/openapi/schemas/getMe' with { type: 'json' }

test('@skyclause/sdk resolves through its package exports', async () => {
  const [sdk, openapi, snippets] = await Promise.all([
    import('@skyclause/sdk'),
    import('@skyclause/sdk/openapi'),
    import('@skyclause/sdk/snippets')
  ])

  expect(sdk.createSdk).toBeTypeOf('function')
  expect(openapi.openapi.openapi).toBe(document.openapi)
  expect(schemaGetMe['x-operationId']).toBe('getMe')
  expect(snippets.snippets).toBeTypeOf('function')
}, 30_000)
