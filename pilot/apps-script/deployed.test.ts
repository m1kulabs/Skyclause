import { describe, expect, test } from 'bun:test'
import { fetchHealth, scopeGuard, staleSources } from './deployed.ts'
import type { Health, SourceHealth } from './src/health.ts'

const manifest = (oauthScopes: string[]) => JSON.stringify({ timeZone: 'Asia/Kuala_Lumpur', oauthScopes })
const SHEETS = 'https://www.googleapis.com/auth/spreadsheets'
const DRIVE = 'https://www.googleapis.com/auth/drive'
const GMAIL_SEND = 'https://www.googleapis.com/auth/gmail.send'

const source = (overrides: Partial<SourceHealth>): SourceHealth => ({
  source_id: '0232901RF',
  state: 'fresh',
  received_at: '2026-11-07T00:25:00+08:00',
  age_min: 5,
  stale_after_min: 10,
  ...overrides
})
const health = (sources: SourceHealth[]): Health => ({
  ok: true,
  sha: '498aadd0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6',
  built_at: '2026-11-06T10:00:00+08:00',
  sources
})

describe('scopeGuard', () => {
  const DEPLOYED_SHA = '2fcb76b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6'
  const guard = (deployed: string[], next: string[]) => {
    const read: string[] = []
    const result = scopeGuard({
      health: async () => ({ ...health([]), sha: DEPLOYED_SHA }),
      manifestAt: async (sha) => {
        read.push(sha)
        return manifest(deployed)
      },
      nextManifest: manifest(next)
    })
    return { read, result }
  }
  const remedy = 'check the scopes by hand, then dispatch pilot-deploy with scopes_reauthorized'

  test('passes when the manifest at the SHA health reports has the same scopes in another order', async () => {
    const { read, result } = guard([SHEETS, DRIVE], [DRIVE, SHEETS])
    expect(await result).toBeNull()
    expect(read).toEqual([DEPLOYED_SHA])
  })

  test('fails on an added or a removed scope, naming each and how to proceed', async () => {
    expect(await guard([SHEETS, DRIVE], [SHEETS, GMAIL_SEND]).result).toBe(
      `oauthScopes changed: added ${GMAIL_SEND}; removed ${DRIVE}. ` +
        'Triggers fail until the pilot owner grants them: dispatch pilot-deploy with scopes_reauthorized, ' +
        'then the owner runs setup() in the Apps Script editor straight away.'
    )
    expect(await guard([SHEETS], [SHEETS, DRIVE]).result).toStartWith(`oauthScopes changed: added ${DRIVE}. `)
  })

  test("fails when health or the deployed manifest can't be read", async () => {
    const unreachable = scopeGuard({
      health: async () => {
        throw new Error('health returned HTTP 500')
      },
      manifestAt: async () => manifest([SHEETS]),
      nextManifest: manifest([SHEETS])
    })
    expect(await unreachable).toBe(`health returned HTTP 500; ${remedy}`)
    const unknownSha = scopeGuard({
      health: async () => ({ ...health([]), sha: DEPLOYED_SHA }),
      manifestAt: async () => {
        throw new Error('fatal: invalid object name')
      },
      nextManifest: manifest([SHEETS])
    })
    expect(await unknownSha).toBe(`the deployed SHA ${DEPLOYED_SHA} isn't in this checkout; ${remedy}`)
  })
})

describe('staleSources', () => {
  test('flags a source past stale_after_min, or never polled, unless it is off hours', () => {
    const past = source({ source_id: 'apims-ws', age_min: 121, stale_after_min: 120 })
    const never = source({ source_id: 'met_warning', received_at: null, age_min: null, stale_after_min: 20 })
    const atLimit = source({ age_min: 10 })
    const offHours = source({ source_id: 'cam-1', state: 'off_hours', age_min: 600, stale_after_min: 20 })
    const unbounded = source({ source_id: 'listing', received_at: null, age_min: null, stale_after_min: null })
    expect(staleSources(health([past, never, atLimit, offHours, unbounded]))).toEqual([past, never])
  })
})

describe('fetchHealth', () => {
  const url = 'https://script.google.com/macros/s/AKfycbPilotDeployment/exec'
  const answering = (status: number, body: string) => {
    const requested: string[] = []
    const fetchDouble = async (input: string) => {
      requested.push(input)
      return new Response(body, { status })
    }
    return { requested, fetchDouble }
  }

  test('reads health=1 from the web app', async () => {
    const expected = health([source({})])
    const { requested, fetchDouble } = answering(200, JSON.stringify(expected))
    expect(await fetchHealth(url, fetchDouble)).toEqual(expected)
    expect(requested).toEqual([`${url}?health=1`])
  })

  test("fails on an HTTP error, a page that isn't JSON, or the web app's own error", async () => {
    await expect(fetchHealth(url, answering(500, 'Internal error').fetchDouble)).rejects.toThrow(
      'health returned HTTP 500'
    )
    await expect(fetchHealth(url, answering(200, '<!DOCTYPE html><title>Sign in</title>').fetchDouble)).rejects.toThrow(
      "health returned a body that isn't JSON: <!DOCTYPE html><title>Sign in</title>"
    )
    const unset = JSON.stringify({ ok: false, error: 'SHEET_ID is not set; run setup()' })
    await expect(fetchHealth(url, answering(200, unset).fetchDouble)).rejects.toThrow(
      'health failed: SHEET_ID is not set; run setup()'
    )
  })
})
