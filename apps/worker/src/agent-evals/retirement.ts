import { MODELS } from '@skyclause/agent'
import type { RegisterAuditCheck } from '@skyclause/contracts'
import { registerAuditCheck } from '../auditor/registry'

const WARN_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000
const MYT_OFFSET_MS = 8 * 60 * 60 * 1000

/** Today's MYT date as UTC midnight (Malaysia keeps no daylight saving). */
const mytDay = (instant: string) => Math.floor((Date.parse(instant) + MYT_OFFSET_MS) / DAY_MS) * DAY_MS

/**
 * TRD auditor: a pinned model within 30 days of its retirement floor (`models.ts`), one finding per model. A
 * `platform` check: the auditor (#132) emails the D30 staff list once per open key and once on recovery.
 */
export const modelRetirement: Parameters<RegisterAuditCheck>[0] = {
  name: 'model_retirement',
  scope: 'platform',
  async run(_tx, now) {
    return MODELS.filter(
      ({ retiresNoEarlierThan }) => Date.parse(retiresNoEarlierThan) - mytDay(now) <= WARN_DAYS * DAY_MS
    ).map(({ model }) => ({
      key: `model_retirement:${model}`,
      projectId: null,
      accountIds: [],
      ref: { type: 'model', id: model }
    }))
  }
}

registerAuditCheck(modelRetirement)
