import type { ChainRows, ModelEntry, ModelResolver, TxHandle } from '@skyclause/contracts'
import { PLATFORM_DEFAULT } from './providers'

// Spec §1 `ModelResolver.chain`, pure so the database seam (`packages/db` loads the rows, owning the SQL) and tests
// share it: given the organisation's enabled passing keys by priority and the account's, pick the run's model chain.
export type { ChainRows } from '@skyclause/contracts'

/** Loads one organisation's key rows for `createChainResolver`; `packages/db` owns the SQL. */
export type LoadChainRows = (
  tx: TxHandle,
  q: { orgId: string; accountId: string | null; unattended: boolean }
) => Promise<ChainRows>

/**
 * - An unattended call, a null account or `allow_member_ai_keys` off returns the organisation's keys by priority.
 * - Otherwise the account's keys come first, then the organisation's.
 * - An empty list returns the platform default (Gemini on Vertex, `keyId` null), with its declared tier.
 * - With `ai_fallback_enabled` off, only the first entry runs.
 */
export function selectChain(rows: ChainRows, q: { accountId: string | null; unattended: boolean }): ModelEntry[] {
  const personal = !q.unattended && q.accountId !== null && rows.allowMemberKeys ? rows.accountKeys : []
  const chain = [...personal, ...rows.orgKeys]
  const full = chain.length ? chain : [{ ...PLATFORM_DEFAULT }]
  return rows.fallbackEnabled ? full : full.slice(0, 1)
}

/** The `ModelResolver` the orchestrator calls, over any row loader (spec §1; `keyId` null selects platform Vertex). */
export function createChainResolver(load: LoadChainRows): ModelResolver {
  return {
    async chain(tx, q) {
      return selectChain(await load(tx, q), q)
    }
  }
}
