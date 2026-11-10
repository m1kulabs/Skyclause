import { buildProvider, type VertexSettings } from '@skyclause/agent'
import { openSecret, sealAad } from '@skyclause/config/crypto'
import type { ModelEntry } from '@skyclause/contracts'
import { findAiKeyOrg, getAiKey, systemPrincipal, withSystem, withTenant, type Tx } from '@skyclause/db'
import type { LanguageModel } from 'ai'

// e-byok-api `modelFor` (spec §1): opens the key with `openSecret` and builds the AI SDK provider for that one call.
// Worker only: the worker's service account is the only KMS decrypter (infra kms.tf), so this file never ships to
// web. The entry carries no organisation, so the key's row names it (read under `withSystem`, like the rewrap sweep),
// and the open itself runs tenant-scoped.

/** Opens `entry`'s saved key and builds its one-call model. `build` is the seam tests replace (NFR-15). */
export async function modelFor(
  entry: ModelEntry,
  o: { vertex?: VertexSettings; build?: typeof buildProvider } = {}
): Promise<LanguageModel> {
  if (entry.keyId === null) throw new TypeError('modelFor: a keyId null entry needs the platform Vertex model')
  const found = await withSystem('model-for', (tx) => findAiKeyOrg(tx, entry.keyId!))
  if (!found) throw new Error(`modelFor: no such key ${entry.keyId}`)
  const row = await withTenant({ orgId: found.orgId, principal: systemPrincipal('model-for') }, (tx: Tx) =>
    getAiKey(tx, entry.keyId!)
  )
  if (!row || row.deletedAt !== null) throw new Error(`modelFor: no live key ${entry.keyId}`)
  const ownerId = row.ownerType === 'account' ? (row.accountId ?? found.orgId) : found.orgId
  const apiKey = await openSecret('ai_key', { ...row }, sealAad(ownerId, row.provider, row.id))
  return (o.build ?? buildProvider)(row.provider, { apiKey, model: entry.model, vertex: o.vertex })
}
