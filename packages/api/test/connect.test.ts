import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Tx } from '@skyclause/db'
import type { ApiDeps } from '../src/context'
import { apiRequest, asSession, createTestApi, testDeps } from './harness'

const targets = [
  'claude_ai',
  'claude_desktop',
  'claude_code',
  'chatgpt',
  'gemini_cli',
  'gemini_enterprise',
  'cursor',
  'vscode'
] as const

const variants: Record<(typeof targets)[number], string[]> = {
  claude_ai: ['http'],
  claude_desktop: ['http', 'stdio'],
  claude_code: ['http', 'stdio'],
  chatgpt: ['http'],
  gemini_cli: ['http', 'stdio'],
  gemini_enterprise: ['http'],
  cursor: ['http', 'stdio'],
  vscode: ['http', 'stdio']
}

const noCredential = /(?:\bsk[cgw]_[\w-]+|\bbearer\s+\S+|\bAuthorization\s*[:=]|SKYCLAUSE_API_KEY)/i

function withClientId(clientId: string | null): ApiDeps['withTenant'] {
  return async (ctx, fn) => {
    const query = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({ limit: async () => (clientId ? [{ clientId }] : []) })
          })
        })
      })
    }
    return fn({ ...ctx, ...query } as unknown as Tx)
  }
}

const connectDeps = () =>
  testDeps({
    withTenant: withClientId(null),
    config: () => ({
      appEnv: 'test',
      appOrigin: 'https://app.skyclause.m1ku.tech',
      mcpOrigin: 'https://mcp.skyclause.m1ku.tech',
      ipHashKey: 'test-only-ip-hash-key-for-the-harness'
    })
  })

afterEach(() => vi.unstubAllGlobals())

describe('connect routes', () => {
  it('returns documented, dated, key-free config variants for every supported client transport', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          authorization_endpoint: 'https://app.skyclause.m1ku.tech/oauth/authorize',
          token_endpoint: 'https://app.skyclause.m1ku.tech/oauth/token'
        })
      )
    )
    const { api } = createTestApi({ deps: connectDeps() })
    const member = asSession({ org: 'connect-configs', role: 'owner' })

    for (const target of targets) {
      const response = await apiRequest(api, {
        as: member,
        method: 'GET',
        path: `/api/connect/config?target=${target}&transport=remote`,
        org: 'connect-configs'
      })
      expect(response.status, target).toBe(200)
      const body = (await response.json()) as {
        variants: Array<{ transport: string; config: string; docs_url: string; checked_at: string }>
      }
      expect(
        body.variants.map((variant) => variant.transport),
        target
      ).toEqual(variants[target])
      for (const variant of body.variants) {
        expect(variant.docs_url).toMatch(/^https:\/\//)
        expect(variant.checked_at).toBe('2026-11-10')
        if (variant.transport === 'http') expect(variant.config).toContain('https://mcp.skyclause.m1ku.tech/mcp')
        else expect(variant.config).toMatch(/skyclause[\s\S]*mcp/)
        expect(variant.config).not.toMatch(noCredential)
      }
    }
  })

  it('returns Gemini Enterprise OAuth endpoints from live metadata and only the organisation client ID', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          authorization_endpoint: 'https://app.skyclause.m1ku.tech/oauth/authorize',
          token_endpoint: 'https://app.skyclause.m1ku.tech/oauth/token'
        })
      )
    )
    const { api } = createTestApi({ deps: connectDeps() })
    const member = asSession({ org: 'connect-enterprise', role: 'owner' })
    const response = await apiRequest(api, {
      as: member,
      method: 'GET',
      path: '/api/connect/config?target=gemini_enterprise&transport=remote',
      org: 'connect-enterprise'
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as { variants: Array<{ config: string }> }
    expect(body.variants[0]?.config).toContain('https://app.skyclause.m1ku.tech/oauth/authorize')
    expect(body.variants[0]?.config).toContain('https://app.skyclause.m1ku.tech/oauth/token')
    expect(body.variants[0]?.config).toContain('read draft')
    expect(body.variants[0]?.config).toContain('/connect-enterprise/settings/integrations')
    expect(body.variants[0]?.config).not.toMatch(noCredential)
  })

  it('returns the metadata fetch error instead of using default Gemini Enterprise endpoints', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: 'unavailable' }, { status: 503 }))
    )
    const { api } = createTestApi({ deps: connectDeps() })
    const member = asSession({ org: 'connect-metadata-error', role: 'owner' })
    const response = await apiRequest(api, {
      as: member,
      method: 'GET',
      path: '/api/connect/config?target=gemini_enterprise&transport=remote',
      org: 'connect-metadata-error'
    })

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(await response.text()).not.toContain('https://app.skyclause.m1ku.tech/oauth/authorize')
  })

  it.each([
    '/api/connect/config?target=claude_ai&transport=remote',
    '/api/connect/verifications',
    '/api/connect/activity?since=2026-11-10T00%3A00%3A00Z'
  ])('returns 403 to a guest session on %s', async (path) => {
    const { api } = createTestApi()
    const guest = asSession({ org: 'connect-guest', role: 'guest', guest: true })
    const response = await apiRequest(api, { as: guest, method: 'GET', path, org: 'connect-guest' })
    expect(response.status).toBe(403)
  })
})
