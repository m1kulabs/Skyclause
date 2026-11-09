import type { GenerateText, VertexSettings } from '@skyclause/agent'
import { generateText } from 'ai'
import { log, type WorkerPart } from '../server'
import { keyTestBody, runKeyTest, type KeyTestDeps } from './test'
import { rewrapKeys } from './rewrap'

// e-byok-api's worker part: the on-demand key test (`POST /internal/ai-keys/:id/test`, Google OIDC via server.ts),
// the daily `kms:rewrap` Cloud Run job, and `modelFor` for the run orchestrator (wired in `runs`, not here).

export interface AiKeysDeps extends KeyTestDeps {
  kmsKeyId: () => string | undefined
}

function depsFromEnv(vertex?: VertexSettings): AiKeysDeps {
  return {
    generate: generateText satisfies GenerateText,
    now: () => new Date(),
    vertex,
    kmsKeyId: () => process.env.KMS_AI_KEYS_KEY
  }
}

export function createAiKeysPart(deps: AiKeysDeps): WorkerPart {
  return {
    owner: 'e-byok-api',
    internal: {
      '/ai-keys/:id/test': async (request, params) => {
        let orgId: string
        try {
          orgId = keyTestBody(await request.json()).orgId
        } catch {
          return Response.json({ ok: false, detail: 'The request needs an org_id.', tested_at: null }, { status: 400 })
        }
        const result = await runKeyTest(deps, { orgId, keyId: params.id ?? '' })
        return Response.json(result.body, { status: result.status })
      }
    },
    jobs: {
      'kms:rewrap': async () => {
        const keyId = deps.kmsKeyId()
        if (!keyId) throw new Error('kms:rewrap needs KMS_AI_KEYS_KEY')
        const { liveKms } = await import('@skyclause/config/crypto')
        const { rewrapped, skipped } = await rewrapKeys(keyId, { kms: liveKms, now: deps.now })
        log('INFO', 'kms:rewrap done', { rewrapped, skipped })
      }
    }
  }
}

const vertex =
  process.env.GCP_PROJECT && process.env.VERTEX_LOCATION
    ? { project: process.env.GCP_PROJECT, location: process.env.VERTEX_LOCATION }
    : undefined

/** Production part: the live provider call, clock and Vertex settings. */
export const aiKeys = createAiKeysPart(depsFromEnv(vertex))
