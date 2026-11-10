import { resetKmsPort, setKmsPort, type KmsPort } from '@skyclause/config/crypto'
import {
  listRewrappableKeys,
  listRewrapOrgs,
  systemPrincipal,
  updateWrappedDek,
  withSystem,
  withTenant,
  type Tx
} from '@skyclause/db'

// e-byok-api: the daily `kms:rewrap` job. KMS rotates each purpose key every 90 days (infra kms.tf); the job opens no
// provider key — it unwraps each row's DEK and wraps it again, so every row lands on the primary KEK version.

export interface RewrapDeps {
  kms: KmsPort
  now: () => Date
}

export interface RewrapResult {
  rewrapped: number
  skipped: number
}

/** Moves every sealed row off the primary KEK version onto it; returns the counts. */
export async function rewrapKeys(keyId: string, deps: RewrapDeps): Promise<RewrapResult> {
  setKmsPort(deps.kms)
  try {
    const { wrapped: probe, version: primary } = await deps.kms.wrapDek(keyId, Buffer.alloc(32))
    void probe
    const orgIds = await withSystem('kms:rewrap', (tx) => listRewrapOrgs(tx))
    let rewrapped = 0
    let skipped = 0
    for (const orgId of orgIds) {
      const rows = await withTenant({ orgId, principal: systemPrincipal('kms:rewrap') }, (tx: Tx) =>
        listRewrappableKeys(tx)
      )
      for (const row of rows) {
        if (row.kekVersion === primary) {
          skipped += 1
          continue
        }
        const dek = await deps.kms.unwrapDek(keyId, Buffer.from(row.wrappedDek, 'base64'))
        const sealed = await deps.kms.wrapDek(keyId, dek)
        await withTenant({ orgId, principal: systemPrincipal('kms:rewrap') }, (tx: Tx) =>
          updateWrappedDek(tx, row.id, sealed.wrapped.toString('base64'), sealed.version)
        )
        rewrapped += 1
      }
    }
    return { rewrapped, skipped }
  } finally {
    resetKmsPort()
  }
}
