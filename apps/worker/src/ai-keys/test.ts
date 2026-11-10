import { testKey, type GenerateText, type VertexSettings } from '@skyclause/agent'
import { openSecret, sealAad } from '@skyclause/config/crypto'
import {
  countAiKeyTestsSince,
  getAiKey,
  lockAiKeyTests,
  recordAiKeyTest,
  systemPrincipal,
  withTenant,
  type Tx
} from '@skyclause/db'
import { z } from 'zod'

// e-byok-api: the worker side of the on-demand key test (D39). The web request carries the plaintext before sealing;
// a saved key is opened here, where the only KMS decrypter runs.

const Body = z.object({ org_id: z.string().min(1) })

export interface KeyTestDeps {
  generate: GenerateText
  now: () => Date
  vertex?: VertexSettings
}

/** Ten an hour per key (ticket decision), counted on the fingerprint. */
export const TEST_LIMIT = 10
const TEST_WINDOW_MS = 3_600_000

export interface KeyTestResult {
  status: 200 | 404 | 429
  body: { ok: boolean; detail: string | null; tested_at: string }
}

/** Opens the saved key, runs the minimal call and records its result; nothing here returns key material. */
export async function runKeyTest(deps: KeyTestDeps, o: { orgId: string; keyId: string }): Promise<KeyTestResult> {
  const at = deps.now()
  const row = await withTenant({ orgId: o.orgId, principal: systemPrincipal('ai-key-test') }, (tx: Tx) =>
    getAiKey(tx, o.keyId)
  )
  if (!row || row.deletedAt !== null) {
    return { status: 404, body: { ok: false, detail: 'No such AI key.', tested_at: at.toISOString() } }
  }
  return withTenant(
    { orgId: o.orgId, principal: systemPrincipal('ai-key-test') },
    async (tx: Tx): Promise<KeyTestResult> => {
      await lockAiKeyTests(tx, row.fingerprint)
      const recent = await countAiKeyTestsSince(tx, {
        fingerprint: row.fingerprint,
        since: new Date(at.getTime() - TEST_WINDOW_MS)
      })
      if (recent >= TEST_LIMIT) {
        return {
          status: 429,
          body: {
            ok: false,
            detail: 'This key was tested too many times in the last hour.',
            tested_at: at.toISOString()
          }
        }
      }
      const ownerId = row.ownerType === 'account' ? (row.accountId ?? o.orgId) : o.orgId
      const apiKey = await openSecret('ai_key', { ...row }, sealAad(ownerId, row.provider, row.id))
      const result = await testKey(
        { provider: row.provider, model: row.model, apiKey, vertex: deps.vertex },
        deps.generate
      )
      await recordAiKeyTest(tx, {
        aiKeyId: row.id,
        fingerprint: row.fingerprint,
        ok: result.ok,
        detail: result.ok ? null : result.detail,
        at
      })
      return {
        status: 200,
        body: { ok: result.ok, detail: result.ok ? null : result.detail, tested_at: at.toISOString() }
      }
    }
  )
}

export function keyTestBody(raw: unknown): { orgId: string } {
  return { orgId: Body.parse(raw).org_id }
}
