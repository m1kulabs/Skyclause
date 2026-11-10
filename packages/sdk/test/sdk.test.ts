import { describe, expect, it, vi } from 'vitest'
import { createSdk, OPERATION_IDS, OPERATIONS, type OperationId } from '../src/index'
import { openapi, operationSchemaPaths } from '../openapi/index'
import { snippets } from '../src/snippets'
import { runSdkRuntimeSuite } from './runtime/suite'

describe('@skyclause/sdk', () => {
  it('runs the shared Web API contract suite', async () => {
    expect(await runSdkRuntimeSuite()).toBeGreaterThan(20)
  })

  it('exposes every OpenAPI operation without approval, publishing, or sending operations', () => {
    const sdk = createSdk({ fetch: vi.fn() })
    const operationIds = [...OPERATION_IDS]
    const forbidden = /approve|publish|send/i

    expect(operationIds).toEqual(expect.arrayContaining(Object.keys(OPERATIONS) as OperationId[]))
    expect(operationIds.some((operationId) => forbidden.test(operationId))).toBe(false)
    expect(Object.keys(sdk).some((method) => forbidden.test(method))).toBe(false)
    expect(Object.values(OPERATIONS).every((operation) => operation.path.startsWith('/v1/'))).toBe(true)
    expect(operationIds.every((operationId) => typeof sdk[operationId] === 'function')).toBe(true)
    expect(Object.keys(operationSchemaPaths).sort()).toEqual([...operationIds].sort())
    expect(Object.keys(openapi.paths).every((path) => path.startsWith('/v1/'))).toBe(true)
  })

  it('ships snippets using Python standard library calls', () => {
    const output = snippets('getMe', {})
    const streamOutput = snippets('streamReadings', { params: { id: 'source-1' } })
    expect(output.curl).toContain('curl')
    expect(output.typescript).toContain('createSdk')
    expect(output.python).toContain('urllib.request')
    expect(output.python).not.toMatch(/requests|httpx|aiohttp/)
    expect(streamOutput.typescript).toContain('sdk.stream("streamReadings"')
    expect(streamOutput.typescript).toContain('for await (const event')
  })

  it('reads and exports the committed OpenAPI operation schemas', () => {
    expect(openapi).toEqual(expect.objectContaining({ openapi: '3.1.0', paths: expect.any(Object) }))
    expect(operationSchemaPaths.getProjectIndicators).toBe('@skyclause/sdk/openapi/schemas/getProjectIndicators')
  })
})
