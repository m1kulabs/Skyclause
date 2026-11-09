import { readFileSync } from 'node:fs'
import { API_ROUTES, V1_ROUTES } from '@skyclause/contracts'
import { describe, expect, it } from 'vitest'
import { health } from '../src/health'
import { checkOpenApi, openApiDocument, openApiResponse, serializeOpenApi } from '../src/openapi'
import { unbuiltOperations } from '../src/unbuilt'

const committed = readFileSync(new URL('../openapi.json', import.meta.url), 'utf8')

describe('openapi.json', () => {
  it('is served equal to the committed file, with every /v1 operation and no /api one', async () => {
    const response = openApiResponse()
    expect(response.headers.get('Content-Type')).toMatch(/^application\/json/)
    const served = (await response.json()) as { paths: unknown }
    expect(served).toEqual(JSON.parse(committed))

    const operations = Object.entries(served.paths as Record<string, Record<string, { operationId: string }>>).flatMap(
      ([path, methods]) => Object.values(methods).map((operation) => ({ path, operationId: operation.operationId }))
    )
    expect(operations.map((o) => o.operationId).sort()).toEqual(V1_ROUTES.map((route) => route.operationId).sort())
    for (const { path } of operations) expect(path).toMatch(/^\/v1\//)
    const apiIds = new Set<string>(API_ROUTES.map((route) => route.operationId))
    expect(operations.filter((o) => apiIds.has(o.operationId))).toEqual([])
  })

  it('passes openapi:check on the committed file', () => {
    expect(checkOpenApi(committed, openApiDocument())).toEqual([])
  })

  it('fails openapi:check on an uncommitted schema change', () => {
    const changed = openApiDocument()
    changed.info.version = '2'
    expect(checkOpenApi(committed, changed)).toEqual([
      'packages/api/openapi.json is out of date: run `bun run openapi:generate` and commit it'
    ])
  })

  it('fails openapi:check on a /v1 operationId naming approval, publishing or sending', () => {
    const document = openApiDocument()
    const paths = document.paths as Record<string, Record<string, { operationId?: string }>>
    paths['/v1/bundles/{id}/approve'] = { post: { operationId: 'approveBundle' } }
    paths['/v1/notices/{id}'] = { post: { operationId: 'resendNotice' } }
    expect(checkOpenApi(serializeOpenApi(document), document)).toEqual([
      'POST /v1/bundles/{id}/approve: operationId approveBundle names approval, publishing or sending, which /v1 never offers',
      'POST /v1/notices/{id}: operationId resendNotice names approval, publishing or sending, which /v1 never offers'
    ])
  })
})

it('GET /health answers ok without touching anything else (D45)', async () => {
  const response = health()
  expect(response.status).toBe(200)
  expect(await response.text()).toBe('ok')
  expect(response.headers.get('Cache-Control')).toBe('no-store')
})

it('lists the operations without a handler, by owner, for check:unbuilt', () => {
  const unbuilt = unbuiltOperations({})
  expect(unbuilt).toHaveLength(V1_ROUTES.length + API_ROUTES.length)
  expect(unbuilt).toContainEqual({
    owner: 'b-windows-api',
    operationId: 'listWindows',
    method: 'GET',
    path: '/v1/projects/{id}/windows'
  })
  expect(unbuiltOperations({ listWindows: { handler: () => new Response() } })).not.toContainEqual(
    expect.objectContaining({ operationId: 'listWindows' })
  )
})
