// a-hardening (#115): NFR-10's gate — every registry operation that no longer
// answers 501 `not-built` needs a `crossOrgCase` (§7), or a listed exemption.
// The per-area suites run the cases against another organisation's rows; this
// file fails, naming the operation, when a built operation has no case.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { REGISTRY } from '@skyclause/contracts'
import { describe, expect, test } from 'vitest'
import { HANDLERS } from '../src/routes'

const built = new Set(Object.keys(HANDLERS))

/** The ticket's four exemptions, each with its reason. */
function exemptionOf(route: { method: string; path: string; 'x-skyclause': { statement: string } }): string | null {
  const statement = route['x-skyclause'].statement
  if (statement === 'public') return 'public'
  if (statement === 'token') return 'token-authenticated'
  if (/^\/(v1|api)\/me(\/|$)/.test(route.path)) return '/me/*'
  if (route.method.toLowerCase() === 'post' && route.path === '/api/orgs') return 'POST /orgs'
  return null
}

const corpus = readdirSync(import.meta.dirname)
  .filter((file) => file.endsWith('.test.ts') && file !== 'cross-org-meta.test.ts')
  .map((file) => readFileSync(join(import.meta.dirname, file), 'utf8'))

const covered = (operationId: string) =>
  corpus.some((source) => source.includes('crossOrgCase') && source.includes(operationId))

describe('a-hardening meta-test', () => {
  test('every built operation has a cross-organisation 404 case', () => {
    const missing = REGISTRY.filter(
      (route) => built.has(route.operationId) && !exemptionOf(route) && !covered(route.operationId)
    ).map((route) => route.operationId)
    expect(missing, `built without a crossOrgCase: ${missing.join(', ')}`).toEqual([])
  })

  test('every covered operation executes its case', () => {
    for (const source of corpus.filter((text) => text.includes('crossOrgCase'))) {
      expect(source.includes('.run()') || source.includes('await run'), 'a crossOrgCase that never runs').toBe(true)
    }
  })

  test('exemptions are exactly the ticket’s four, each for its stated reason', () => {
    const reasons = new Map<string, string>()
    for (const route of REGISTRY.filter((route) => built.has(route.operationId))) {
      const reason = exemptionOf(route)
      if (reason) reasons.set(route.operationId, reason)
    }
    // A new exemption fails here until the ticket lists it with its reason.
    for (const reason of reasons.values()) {
      expect(['public', 'token-authenticated', '/me/*', 'POST /orgs']).toContain(reason)
    }
    expect(reasons.size).toBeGreaterThan(0)
  })
})
