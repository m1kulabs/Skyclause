import { z } from 'zod'
import type { Source, SourceAdapter } from '@skyclause/sources'
import type { BackfillPorts } from './backfill'
import { executeSourceStep } from './execute'
import { backfillGroupKey, PlannedBackfillGroup, SourceSchema } from './plan'
import { decodeObject, encodeObject, hasCode, loadSourceResult, saveSourceResult } from './storage'
import { parseSourceResult } from './ingest'
import type { SourceExecutionResult, SourceObjectStore } from './types'

const Child = z.strictObject({ key: z.string().min(1), operationId: z.uuid(), owner: z.uuid(), resultPath: z.string() })
const Claim = z.strictObject({
  group: PlannedBackfillGroup,
  groupByMeta: z.string().min(1),
  sources: z.array(SourceSchema).min(1),
  state: z.enum(['running', 'complete']),
  owner: z.uuid(),
  leaseExpiresAt: z.number().finite(),
  scheduledAt: z.iso.datetime().nullable(),
  children: z.array(Child).min(1)
})
export type GroupedBackfillClaim = z.infer<typeof Claim>
export type GroupRecoveryResult = SourceExecutionResult | 'resumable' | null
export interface GroupRecovery {
  type: 'group'
  key: string
  anchor: string
  sourceIds: string[]
  step: number
}
const pathFor = (key: string) => `control/grouped-backfills/${key}.json`
const childPath = (key: string, child: z.infer<typeof Child>, index: number) =>
  `control/results/grouped-backfills/${key}/${index}/${child.operationId}/${child.owner}.json`
const sameIds = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
function parseClaim(value: unknown, key: string): GroupedBackfillClaim {
  const claim = Claim.parse(value)
  if (
    claim.group.key !== key ||
    new Set(claim.group.sourceIds).size !== claim.group.sourceIds.length ||
    !sameIds(
      claim.group.sourceIds,
      claim.sources.map((s) => s.id)
    ) ||
    claim.sources.some(
      (s) =>
        s.kind !== claim.group.kind ||
        s.meta[claim.groupByMeta] === undefined ||
        backfillGroupKey(claim.group.kind, claim.groupByMeta, s.meta[claim.groupByMeta]) !== key
    ) ||
    new Set(claim.children.map((c) => c.operationId)).size !== claim.children.length ||
    new Set(claim.children.map((c) => c.key)).size !== claim.children.length ||
    claim.children.some((c, i) => c.resultPath !== childPath(key, c, i))
  )
    throw new Error('Invalid grouped backfill identity')
  return claim
}
async function loadChild(
  store: SourceObjectStore,
  claim: GroupedBackfillClaim,
  index: number,
  validate: (value: unknown) => unknown = parseSourceResult
) {
  const child = claim.children[index]!
  const result = await loadSourceResult(store, child.resultPath, validate)
  if (!result) return null
  if (
    result.operationId !== child.operationId ||
    result.kind !== claim.group.kind ||
    result.purpose !== 'backfill' ||
    result.scheduledAt !== claim.scheduledAt ||
    result.requests.length !== 1 ||
    !sameIds(result.requests[0]!.sourceIds, claim.group.sourceIds) ||
    !sameIds(
      result.polls.map((p) => p.sourceId),
      claim.group.sourceIds
    ) ||
    result.polls.some((p) => p.requestId !== result.requests[0]!.requestId)
  )
    throw new Error('Invalid saved grouped backfill identity')
  return result
}
async function publishChild(claim: GroupedBackfillClaim, index: number, ports: BackfillPorts) {
  const child = claim.children[index]!
  const result = await loadChild(ports.store, claim, index)
  if (!result) throw new Error('Grouped backfill has no durable child')
  if (!(await ports.acknowledged?.(child.operationId))) await ports.publish(result)
  ports.completed?.(result)
}
/** Saved children never refetch. Death before saving bytes retains the #79 ambiguous-GET qualification. */
export async function runGroupedBackfillOnce<Raw>(
  adapter: SourceAdapter<Raw>,
  group: PlannedBackfillGroup,
  sources: Source[],
  ports: BackfillPorts
): Promise<'running' | 'complete' | 'unsupported'> {
  const policy = adapter.groupedBackfill
  if (!policy) return 'unsupported'
  if (adapter.backfill) throw new Error('Adapter cannot declare both backfill policies')
  const { store, clock } = ports,
    path = pathFor(group.key)
  let claim: GroupedBackfillClaim, generation: string
  for (;;) {
    const saved = await store.read(path),
      previous = saved ? parseClaim(decodeObject(saved.body), group.key) : null
    if (previous && (previous.group.kind !== adapter.kind || previous.groupByMeta !== policy.groupByMeta))
      throw new Error('Invalid grouped backfill identity')
    if (previous?.state === 'complete') {
      for (let i = 0; i < previous.children.length; i++) await publishChild(previous, i, ports)
      return 'complete'
    }
    if (previous && previous.leaseExpiresAt > clock.now().getTime()) return 'running'
    if (!previous && !group.eligible) return 'complete'
    const owner = ports.id()
    if (previous) {
      claim = { ...previous, owner, leaseExpiresAt: clock.now().getTime() + 60000 }
      // Old-owner candidates may only be adopted when their immutable bytes already exist.
      // A late stale save stays at its old path and cannot replace the new owner's child.
      for (let i = 0; i < claim.children.length; i++)
        if (!(await loadChild(store, claim, i))) {
          const child = { ...claim.children[i]!, owner }
          claim.children[i] = { ...child, resultPath: childPath(group.key, child, i) }
        }
    } else {
      const frozen = structuredClone(sources).sort((a, b) => a.id.localeCompare(b.id))
      if (
        group.kind !== adapter.kind ||
        !sameIds(
          group.sourceIds,
          frozen.map((s) => s.id)
        ) ||
        frozen.some(
          (s) =>
            s.kind !== adapter.kind ||
            s.meta[policy.groupByMeta] === undefined ||
            backfillGroupKey(adapter.kind, policy.groupByMeta, s.meta[policy.groupByMeta]) !== group.key
        )
      )
        throw new Error('Invalid grouped backfill membership')
      const steps = policy.steps(frozen, group.anchor)
      if (!steps.length || new Set(steps.map((s) => s.key)).size !== steps.length)
        throw new Error('Invalid grouped backfill steps')
      claim = {
        group: structuredClone(group),
        groupByMeta: policy.groupByMeta,
        sources: frozen,
        state: 'running',
        owner,
        leaseExpiresAt: clock.now().getTime() + 60000,
        scheduledAt: ports.scheduledAt ?? null,
        children: steps.map((step, index) => {
          const child = { key: step.key, operationId: ports.id(), owner, resultPath: '' }
          return { ...child, resultPath: childPath(group.key, child, index) }
        })
      }
    }
    claim = parseClaim(claim, group.key)
    try {
      generation = await store.write(path, encodeObject(claim), saved?.generation ?? '0')
      break
    } catch (error) {
      if (!hasCode(error, 412)) throw error
    }
  }
  const steps = policy.steps(claim.sources, claim.group.anchor)
  if (steps.length !== claim.children.length || steps.some((s, i) => s.key !== claim.children[i]!.key))
    throw new Error('Changed grouped backfill steps')
  const stop = new AbortController()
  let lost = false,
    renewalError: unknown
  const active = () => !lost && claim.leaseExpiresAt > clock.now().getTime()
  const heartbeat = (async () => {
    let next = clock.monotonic() + 20000
    try {
      while (!stop.signal.aborted) {
        await clock.sleep(Math.max(0, next - clock.monotonic()), stop.signal)
        if (stop.signal.aborted) return
        if (!active()) {
          lost = true
          return
        }
        const renewed = { ...claim, leaseExpiresAt: clock.now().getTime() + 60000 }
        generation = await store.write(path, encodeObject(renewed), generation)
        claim = renewed
        next += 20000
      }
    } catch (error) {
      lost = true
      if (!hasCode(error, 412)) renewalError = error
    }
  })()
  try {
    if (ports.admitGroup) await ports.admitGroup(claim)
    else for (const child of claim.children) await ports.admit?.(child.operationId)
    for (let i = 0; i < claim.children.length; i++) {
      if (renewalError) throw renewalError
      if (!active()) return 'running'
      let result = await loadChild(store, claim, i)
      if (!result) {
        result = await executeSourceStep(
          adapter,
          claim.sources,
          steps[i]!,
          (ss, opts) => {
            const capture = ports.contextFactory(ss, opts),
              http = capture.ctx.http
            return {
              ...capture,
              ctx: {
                ...capture.ctx,
                http: (...args) => {
                  if (!active()) throw new Error('Grouped backfill lease lost before transport')
                  return http(...args)
                }
              }
            }
          },
          {
            operationId: claim.children[i]!.operationId,
            purpose: 'backfill',
            scheduledAt: claim.scheduledAt,
            clock,
            requestId: ports.id
          }
        )
        if (renewalError) throw renewalError
        if (!active()) return 'running'
        await saveSourceResult(store, claim.children[i]!.resultPath, result)
      }
      if (!active()) return 'running'
      await publishChild(claim, i, ports)
    }
    stop.abort()
    await heartbeat
    if (renewalError) throw renewalError
    if (!active()) return 'running'
    try {
      await store.write(path, encodeObject({ ...claim, state: 'complete' }), generation)
    } catch (error) {
      if (hasCode(error, 412)) return 'running'
      throw error
    }
    return 'complete'
  } finally {
    stop.abort()
    await heartbeat
  }
}
/** Recovery never starts HTTP or widens membership; partial groups remain available for their other children. */
export async function recoverSavedGroupedBackfill(options: {
  store: SourceObjectStore
  recovery: GroupRecovery
  operationId: string
  kind: SourceExecutionResult['kind']
  now: Date
  validate(value: unknown): unknown
}): Promise<GroupRecoveryResult> {
  const { store, recovery } = options
  for (;;) {
    const path = pathFor(recovery.key),
      saved = await store.read(path)
    if (!saved) return null
    const claim = parseClaim(decodeObject(saved.body), recovery.key),
      child = claim.children[recovery.step]
    if (
      !child ||
      claim.group.kind !== options.kind ||
      child.operationId !== options.operationId ||
      claim.group.anchor !== recovery.anchor ||
      !sameIds(claim.group.sourceIds, recovery.sourceIds)
    )
      throw new Error('Invalid grouped recovery identity')
    if (claim.state === 'running' && claim.leaseExpiresAt > options.now.getTime()) return 'resumable'
    const result = await loadChild(store, claim, recovery.step, options.validate)
    if (!result) return claim.state === 'running' ? 'resumable' : null
    if (claim.state === 'running') {
      const children = await Promise.all(claim.children.map((_, i) => loadChild(store, claim, i, options.validate)))
      // Fence every adopted child, even when siblings still need transport. A takeover
      // that selected another candidate must win this generation before we can publish.
      try {
        await store.write(
          path,
          encodeObject({ ...claim, state: children.every(Boolean) ? 'complete' : 'running' }),
          saved.generation
        )
      } catch (error) {
        if (hasCode(error, 412)) continue
        throw error
      }
    }
    return result
  }
}
