import { expect, expectTypeOf, test } from 'vitest'
import type { OperationResponses } from '@skyclause/sdk'
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

test('draft response numbers are exactly null through the public package types', () => {
  type Created = OperationResponses['createClauseSheetDraft']
  type Retrieved = OperationResponses['getClauseSheetDraft']
  type Listed = OperationResponses['listClauseSheetDrafts']['data'][number]

  expectTypeOf<Created['n']>().toEqualTypeOf<null>()
  expectTypeOf<Retrieved['n']>().toEqualTypeOf<null>()
  expectTypeOf<Listed['n']>().toEqualTypeOf<null>()
  expectTypeOf<null>().toExtend<Created['n']>()
  expectTypeOf<number>().not.toExtend<Created['n']>()
  expectTypeOf<Created['base_n']>().toEqualTypeOf<number | null>()
  expectTypeOf<Created['published_by']>().toEqualTypeOf<string | null>()
})
