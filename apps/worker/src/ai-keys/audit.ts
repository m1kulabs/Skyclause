import { listKekVersions, type KekVersionInfo } from '@skyclause/config/crypto'
import type { RegisterAuditCheck } from '@skyclause/contracts'
import { registerAuditCheck } from '../auditor/registry'

// e-byok-api: the platform auditor check (D29; #132 emails its findings to staff). The KEK rotates every 90 days
// (infra kms.tf); a version still enabled past that is flagged. Tested against the contract with a double; registered
// at worker composition, without making a KMS call at import time.

const ROTATION_MS = 90 * 24 * 60 * 60_000

export type ListKek = () => Promise<KekVersionInfo[]>

export function createKekRotationCheck(
  list: ListKek = () => listKekVersions('ai_key')
): Parameters<RegisterAuditCheck>[0] {
  return {
    name: 'kek_rotation',
    scope: 'platform',
    async run(_tx, now) {
      const at = Date.parse(now)
      return (await list())
        .filter((v) => v.enabled && at - v.createdAt.getTime() > ROTATION_MS)
        .map((v) => ({
          key: `kek_version:${v.version}`,
          projectId: null,
          accountIds: [],
          ref: { type: 'kek_version', id: v.version }
        }))
    }
  }
}

/** The production platform check; registration itself needs no credentials. */
export const kekRotation = createKekRotationCheck()
registerAuditCheck(kekRotation)
