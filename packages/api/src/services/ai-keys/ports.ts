import { GoogleAuth } from 'google-auth-library'
import type { GenerateText } from '@skyclause/agent'
import { generateText } from 'ai'

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
  if (!workerUrl) throw new Error('testInWorker needs WORKER_URL')
  const auth = new GoogleAuth()
  const client = await auth.getIdTokenClient(workerUrl)
  const response = await client.request({
    url: `${workerUrl}/internal/ai-keys/${o.keyId}/test`,
    method: 'POST',
    data: { org_id: o.orgId }
  })
  const body = response.data as WorkerKeyTest
  if (typeof body?.ok !== 'boolean') throw new Error('testInWorker got no key-test result from the worker')
  return body
}

let ports: AiKeyPorts = { generate: generateText, testInWorker: liveTestInWorker }

/** Tests replace the provider call, the worker call, or both (NFR-15). */
export function setAiKeyPorts(next: Partial<AiKeyPorts>): void {
  ports = { ...ports, ...next }
}

export function aiKeyPorts(): AiKeyPorts {
  return ports
}
