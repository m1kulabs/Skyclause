import { z } from 'zod'
import { InputState, Instant, Pack, Mode, Recommendation, SheetInput, Verdict } from '@skyclause/contracts'

// Run steps hold engine JSON, not the public snake_case DTOs. Keep engine-owned metadata in the hash.
const value = z.object({
  name: z.string(),
  value: z.union([z.number(), z.boolean(), z.string(), z.array(z.number())]).nullable(),
  unit: z.string(),
  state: InputState,
  since: Instant.nullable(),
  ageS: z.number().nonnegative().nullable(),
  sourceIds: z.array(z.string()),
  readingIds: z.array(z.string()),
  observedAt: Instant.nullable()
})
const blocked = z.object({ name: z.string(), sourceId: z.string().nullable(), state: InputState, since: Instant })
const result = z.object({
  key: z.string(),
  result: z.enum(['fired', 'not_fired', 'blocked', 'not_open']),
  blockedBy: z.array(blocked),
  span: z.object({ from: Instant, to: Instant, complete: z.boolean() }).optional(),
  inputs: z.array(value),
  cel: z.string().optional(),
  wording: z.object({ en: z.string().optional(), ms: z.string().optional() }).optional()
})
const engineVerdict = z.object({
  scope: z.object({ kind: z.enum(['site', 'window', 'night']), id: z.string().nullable() }),
  pack: Pack,
  mode: Mode.nullable(),
  watch: z.boolean(),
  noCall: z.object({ inputs: z.array(blocked) }).nullable(),
  recommendations: z.array(Recommendation),
  clauses: z.array(result),
  openFrom: Instant.nullable()
})
const verdicts = z.object({
  tEval: Instant,
  pack: Pack,
  contentHash: z.string(),
  snapshotHash: z.string(),
  site: z.array(engineVerdict),
  windows: z.array(engineVerdict),
  nights: z.array(engineVerdict),
  hash: z.string()
})
const night = z.object({
  id: z.string(),
  date: z.iso.date(),
  baseline: z.number().nullable(),
  uplift: z.number().nullable(),
  forecast: z.number().nullable(),
  band: z.object({ low: z.number(), high: z.number() }).nullable(),
  doors: Instant.nullable(),
  show: Instant.nullable(),
  arrivalStart: Instant,
  arrivalEnd: Instant.nullable(),
  exitStart: Instant.nullable(),
  exitEnd: Instant.nullable(),
  singleSource: z.boolean(),
  forecastId: z.string().nullable(),
  state: z.union([InputState, z.enum(['insufficient_baseline', 'unclassed_show', 'no_class_history', 'stale_exits'])])
})
export const FrozenWindows = z.array(
  z.object({
    id: z.string(),
    startsAt: Instant,
    endsAt: Instant,
    kind: z.enum(['class', 'event', 'commute_wave']),
    tz: z.string()
  })
)
// warningObservations is emitted by the real snapshotAt runtime in addition to the published interface.
const warning = z.object({
  observedAt: Instant,
  receivedAt: Instant,
  sourceId: z.string(),
  validFrom: Instant,
  validTo: Instant.nullable()
})
export const StoredSnapshot = z.object({
  projectId: z.string(),
  pack: Pack,
  tEval: Instant,
  inputs: z.array(blocked),
  site: z.record(z.string(), value),
  series: z.record(z.string(), z.array(z.tuple([Instant, z.number().nullable(), z.string()]))),
  nights: z.array(night),
  registryHash: z.string(),
  hash: z.string(),
  warningObservations: z.record(z.string(), warning).optional()
})
export const StoredSnapshotStep = z.object({
  snapshotId: z.string().nullable(),
  snapshot: StoredSnapshot,
  windows: FrozenWindows
})
export const StoredShadowStep = z.object({
  versionId: z.string(),
  n: z.number().int().positive(),
  sheet: SheetInput.and(
    z.object({
      contentHash: z.string(),
      registryHash: z.string(),
      registryTypes: z.record(z.string(), z.enum(['double', 'int', 'bool', 'timestamp', 'duration', 'list'])).optional()
    })
  ),
  verdicts,
  verdictHash: z.string()
})
export type StoredPreviewRun = {
  id: string
  versionId: string
  triggeredAt: string
  status: string
  windowIds: string[]
  nightIds: string[]
  snapshotId: string | null
  snapshot: z.infer<typeof StoredSnapshot>
  windows: z.infer<typeof FrozenWindows>
  verdicts: z.infer<typeof verdicts>
  sheet: z.infer<typeof StoredShadowStep>['sheet']
  version: { n: number; content: z.infer<typeof SheetInput>; contentHash: string }
  calls: Array<{ id: string; windowId: string | null; nightId: string | null; shadow: z.infer<typeof Verdict> }>
}
export class InvalidStoredPreviewRun extends Error {
  constructor(
    readonly runId: string,
    reason: string
  ) {
    super(`Run ${runId}: ${reason}`)
  }
}
