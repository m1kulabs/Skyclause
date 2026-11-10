import { GoogleAuth, IdTokenClient, Impersonated } from 'google-auth-library'
import { z } from '@hono/zod-openapi'
import type { GenerateText } from '@skyclause/agent'
import { generateText } from 'ai'
import { ApiError } from '../../problems'

// e-byok-api: the seams behind the AI key operations. The key test runs the provider built per call; a saved key's
// on-demand test runs in the worker (D39), which this service reaches over Google OIDC. Tests replace both.

export interface WorkerKeyTest {
  ok: boolean
  detail: string | null
  testedAt: string
}

export interface AiKeyPorts {
  /** The provider call behind a create-time test, over the submitted plaintext (never stored). */
  generate: GenerateText
  /** The worker's `/internal/ai-keys/{id}/test`, which alone may open a saved key. */
  testInWorker: (o: { orgId: string; keyId: string }) => Promise<WorkerKeyTest>
}

/** Ten an hour per key (ticket decision): attempts older than this stop counting. */
export const TEST_WINDOW_MS = 3_600_000
export const TEST_LIMIT = 10

async function liveTestInWorker(o: { orgId: string; keyId: string }): Promise<WorkerKeyTest> {
  const workerUrl = process.env.WORKER_URL
  const invoker = process.env.WORKER_INVOKER_SA
  if (!workerUrl) throw new Error('testInWorker needs WORKER_URL')
  if (!invoker) throw new Error('testInWorker needs WORKER_INVOKER_SA')
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] })
  const client = new IdTokenClient({
    targetAudience: workerUrl,
    idTokenProvider: new Impersonated({ sourceClient: await auth.getClient(), targetPrincipal: invoker })
  })
  const response = await client.request({
    url: `${workerUrl}/internal/ai-keys/${o.keyId}/test`,
    method: 'POST',
    data: { org_id: o.orgId },
    validateStatus: (status) => status === 200 || status === 404 || status === 429
  })
  if (response.status === 429) {
    throw new ApiError(
      429,
      'rate-limited',
      'This key was tested too many times in the last hour.',
      {},
      { 'Retry-After': '360' }
    )
  }
  if (response.status === 404) throw new ApiError(404, 'not-found', 'No such AI key.')
  const body = z
    .object({ ok: z.boolean(), detail: z.string().nullable(), tested_at: z.iso.datetime() })
    .parse(response.data)
  return { ok: body.ok, detail: body.detail, testedAt: body.tested_at }
}

let ports: AiKeyPorts = { generate: generateText, testInWorker: liveTestInWorker }

/** Tests replace the provider call, the worker call, or both (NFR-15). */
export function setAiKeyPorts(next: Partial<AiKeyPorts>): void {
  ports = { ...ports, ...next }
}

export function aiKeyPorts(): AiKeyPorts {
  return ports
}
