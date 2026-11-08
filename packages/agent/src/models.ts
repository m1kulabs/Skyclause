import { createGoogleVertex } from '@ai-sdk/google-vertex'
import type { ModelEntry } from '@skyclause/contracts'
import type { LanguageModel } from 'ai'

// TRD "Model routing for the agent", pinned per release. Dates from Google's model versions page, checked 8 November
// 2026: gemini-3.8-flash released 2 September 2026, retiring "September 2, 2027 or later". No gemini-4-argon (D26).
export const MODELS = [
  {
    use: 'draft',
    provider: 'vertex',
    model: 'gemini-3.8-flash',
    releasedOn: '2026-09-02',
    retiresNoEarlierThan: '2027-09-02'
  }
] as const
export type PinnedModel = (typeof MODELS)[number]
export const DRAFT_MODEL: PinnedModel = MODELS[0]

/** `VERTEX_LOCATION` (`global`, §6) and the Google Cloud project, read by the caller and passed in. */
export interface VertexSettings {
  project: string
  location: string
}

/** A `keyId` of null is the platform's own Vertex model; nothing here reads a key or the environment. */
export function platformModel(vertex: VertexSettings): LanguageModel {
  return createGoogleVertex({ project: vertex.project, location: vertex.location })(DRAFT_MODEL.model)
}

/**
 * TRD BYOK: free-tier and unknown keys get no recipient roles. The platform's own Vertex model (`keyId` null) is paid
 * Vertex AI by construction; a key keeps roles only when declared `paid`.
 */
export function carriesRoles(entry: ModelEntry): boolean {
  return entry.keyId === null || entry.declaredTier === 'paid'
}
