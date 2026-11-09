import { listKekVersions, type KekVersionInfo } from '@skyclause/config/crypto'
import type { RegisterAuditCheck } from '@skyclause/contracts'

// e-byok-api: the platform auditor check (D29; #132 emails its findings to staff). The KEK rotates every 90 days
// (infra kms.tf); a version still enabled past that is flagged. Tested against the contract with a double; registered
// once #132 replaces `registerAuditCheck`'s placeholder, which would throw at worker start.

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

/** For #132: `registerAuditCheck(kekRotation)`. */
export const kekRotation = createKekRotationCheck()
