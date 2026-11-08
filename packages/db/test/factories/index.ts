import type { Tx } from '../../src/client'
import { makeProject } from './project'
import { makeProjectPack } from './project_pack'

export { makeMember } from './member'
export { makeOrganization } from './organization'
export { makeProject } from './project'
export { makeProjectPack } from './project_pack'
export { makeUser } from './user'

/**
 * One row of each T table (`org_id NOT NULL`) in the transaction's organisation, keyed by table name. The
 * cross-organisation test reads the live schema and fails on a T table missing here, so #92's tables join it.
 */
export const tenantFactories: Record<string, (tx: Tx) => Promise<unknown>> = {
  project: makeProject,
  project_pack: makeProjectPack
}
