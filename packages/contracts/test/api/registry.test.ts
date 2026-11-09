import { readFileSync, readdirSync } from 'node:fs'
import { Validator } from '@seriousme/openapi-schema-validator'
import { describe, expect, expectTypeOf, it } from 'vitest'
import type { RouteConfig, z } from '@hono/zod-openapi'
import {
  API_ROUTES,
  CROSS_ORG_OPERATIONS,
  REGISTRY,
  V1_ROUTES,
  v1OpenApiDocument,
  type OperationId,
  type Operations
} from '../../src/api/registry'
import { STATEMENTS } from '../../src/auth'
import { createWindow } from '../../src/api/v1/windows'
import { OPERATIONS } from './operations'

describe('operation registry', () => {
  it('matches the expansion table in both directions and declares request and response schemas', () => {
    const actual = REGISTRY.map((route) => ({
      method: route.method,
      path: route.path,
      operationId: route.operationId,
      ...route['x-skyclause']
    }))
    const expected = OPERATIONS.map(({ method, path, operationId, owner, statement, idempotent }) => ({
      method,
      path,
      operationId,
      owner,
      statement,
      idempotent
    }))
    const byId = (a: { operationId: string }, b: { operationId: string }) => a.operationId.localeCompare(b.operationId)
    expect(actual.toSorted(byId)).toEqual(expected.toSorted(byId))

    // A keyed route retains concrete schemas for a future typed apiFetch.
    expectTypeOf<OperationId>().toEqualTypeOf<keyof Operations>()
    expectTypeOf<string>().not.toExtend<OperationId>()
    expectTypeOf<Operations['createWindow']>().toEqualTypeOf<typeof createWindow>()
    type Body = z.input<Operations['createWindow']['request']['body']['content']['application/json']['schema']>
    type Reply = z.output<Operations['createWindow']['responses'][201]['content']['application/json']['schema']>
    expectTypeOf<Body['title']>().toEqualTypeOf<string>()
    expectTypeOf<Reply['id']>().toEqualTypeOf<string>()

    for (const route of REGISTRY) {
      const config: RouteConfig = route
      expect(Object.keys(config.responses), route.operationId).not.toHaveLength(0)
      for (const response of Object.values(config.responses)) {
        if ('content' in response && response.content) {
          for (const media of Object.values(response.content)) {
            expect(media, route.operationId).toHaveProperty('schema', expect.anything())
          }
        }
      }
      if (config.method !== 'get' && config.method !== 'delete' && config.request?.body) {
        const media = Object.values(config.request.body.content)
        expect(media, route.operationId).not.toHaveLength(0)
        for (const body of media) expect(body, route.operationId).toHaveProperty('schema', expect.anything())
      }
    }
  })

  it('has unique verb-plus-resource operationIds and no v1 approval, publishing or sending operations', () => {
    expect(new Set(REGISTRY.map((route) => route.operationId)).size).toBe(REGISTRY.length)
    for (const route of REGISTRY) expect(route.operationId).toMatch(/^[a-z]+[A-Z][A-Za-z0-9]*$/)
    for (const route of V1_ROUTES) expect(route.operationId).not.toMatch(/approve|publish|send/i)
  })

  it('uses known owners and statements and declares every scoped v1 operation with a cross-organisation 404', () => {
    const owners = new Set(OPERATIONS.map((operation) => operation.owner))
    const statements = new Set<string>([
      ...STATEMENTS,
      'any',
      'session',
      'guest',
      'public',
      'token',
      'staff',
      'device',
      'labeller'
    ])
    for (const route of REGISTRY) {
      expect(owners.has(route['x-skyclause'].owner), route.operationId).toBe(true)
      expect(statements.has(route['x-skyclause'].statement), route.operationId).toBe(true)
    }
    const expected = OPERATIONS.filter((operation) => operation.surface === 'v1' && operation.crossOrg).map(
      (operation) => operation.operationId
    )
    expect([...CROSS_ORG_OPERATIONS].sort()).toEqual(expected.sort())
    for (const operationId of CROSS_ORG_OPERATIONS) {
      const route = V1_ROUTES.find((route) => route.operationId === operationId)
      expect(route?.responses, operationId).toHaveProperty('404')
    }
  })

  it('keeps the v1 and first-party lists disjoint and excludes api paths from the public document', () => {
    expect(V1_ROUTES.map((route) => route.operationId).sort()).toEqual(
      OPERATIONS.filter((operation) => operation.surface === 'v1')
        .map((operation) => operation.operationId)
        .sort()
    )
    expect(API_ROUTES.map((route) => route.operationId).sort()).toEqual(
      OPERATIONS.filter((operation) => operation.surface === 'api')
        .map((operation) => operation.operationId)
        .sort()
    )
    const paths = v1OpenApiDocument().paths ?? {}
    const v1Ids = new Set<string>(V1_ROUTES.map((route) => route.operationId))
    const v1Paths = new Set<string>(V1_ROUTES.map((route) => route.path))
    for (const route of V1_ROUTES) {
      expect(route.path).toMatch(/^\/v1\//)
      expect(paths[route.path]?.[route.method]?.operationId).toBe(route.operationId)
    }
    for (const route of API_ROUTES) {
      expect(route.path).toMatch(/^\/api\//)
      expect(v1Ids.has(route.operationId)).toBe(false)
      expect(v1Paths.has(route.path)).toBe(false)
      expect(paths).not.toHaveProperty(route.path)
    }
    expect(Object.keys(paths).sort()).toEqual([...v1Paths].sort())
  })

  it('has no z.any schemas or invented example keys in route source files', () => {
    for (const surface of ['v1', 'first-party']) {
      const directory = new URL(`../../src/api/${surface}/`, import.meta.url)
      for (const file of readdirSync(directory, { recursive: true, encoding: 'utf8' }).filter((file) =>
        file.endsWith('.ts')
      )) {
        const source = readFileSync(new URL(file, directory), 'utf8')
        expect(source, `${surface}/${file}`).not.toMatch(/\bz\s*\.\s*any\s*\(/)
        expect(source, `${surface}/${file}`).not.toMatch(/(?:\bexample\b|['"]example['"])\s*:/)
      }
    }
  })

  it('keeps one route per module: area files hold none, <area>/<name>.ts holds `name`', () => {
    for (const surface of ['v1', 'first-party']) {
      const directory = new URL(`../../src/api/${surface}/`, import.meta.url)
      for (const file of readdirSync(directory, { recursive: true, encoding: 'utf8' }).filter((file) =>
        file.endsWith('.ts')
      )) {
        const source = readFileSync(new URL(file, directory), 'utf8')
        const name = file.split('/').pop()!.replace(/\.ts$/, '')
        const routes = [...source.matchAll(/^export const (\w+) = createRoute\(/gm)].map((match) => match[1])
        const expected = file.includes('/') && name !== '_shared' ? [name] : []
        expect(routes, `${surface}/${file}`).toEqual(expected)
      }
    }
  })

  it('round-trips through zod-openapi to a valid OpenAPI 3.1 document', async () => {
    const document: ReturnType<typeof v1OpenApiDocument> = JSON.parse(JSON.stringify(v1OpenApiDocument()))
    const validator = new Validator()
    expect(Validator.supportedVersions.has('3.1')).toBe(true)
    expect(document.openapi).toBe('3.1.0')
    const result = await validator.validate({ ...document })
    expect(result.errors).toBeUndefined()
    expect(result.valid).toBe(true)
  })
})
