import { type SourceAdapter, type SourceKind, type PollContext } from '@skyclause/sources'
import { currentSlotBody, runSourceSlot } from './slots'
import { executeAdapter } from './execute'
import { runGroupedBackfillOnce } from './grouped-backfill'
import { runBackfillOnce } from './backfill'
import { createPollContext } from './http'
import {
  activePeriods,
  readSourcePlan,
  refreshSourcePlan,
  type SourcePlan,
  type PlannedSource,
  type PlannedBackfillGroup
} from './plan'
import { reserveGroupedSourceResults, reserveSourceResult, ResultReference, resultPath } from './pubsub'
import { receiptPath } from './ingest'
import { adapterStorage, decodeObject } from './storage'
import type { SourceClock, SourceExecutionResult, SourceObjectStore } from './types'
export interface SourceJobPorts {
  store: SourceObjectStore
  scratch: SourceObjectStore
  clock: SourceClock
  id(): string
  adapters: readonly SourceAdapter<unknown>[]
  http: typeof fetch
  userAgent: string
  repair?(): Promise<void>
  publish(result: SourceExecutionResult): Promise<void>
  database: {
    snapshot(now: Date): Promise<SourcePlan>
    catalogue(
      adapter: SourceAdapter<unknown>,
      entries: Awaited<ReturnType<NonNullable<SourceAdapter<unknown>['discover']>>>
    ): Promise<void>
  }
  log: PollContext['log']
}
export function createSourceJobs(ports: SourceJobPorts) {
  const adapterFor = (kind: string) => {
    const adapter = ports.adapters.find((a) => a.kind === kind)
    if (!adapter) throw new Error(`unregistered source adapter: ${kind}`)
    return adapter
  }
  const contextFactory =
    (
      adapter: SourceAdapter<unknown>,
      plan: Pick<SourcePlan, 'periods'>,
      transportWindow?: { start: number; end: number }
    ) =>
    (sources: PlannedSource['source'][]) =>
      createPollContext({
        kind: adapter.kind,
        transportWindow,
        family: adapter.apiFamily,
        sources,
        storage: adapterStorage(adapter.kind, ports.store, ports.scratch),
        budget: ports.store,
        http: ports.http,
        userAgent: ports.userAgent,
        periods: async () => activePeriods(plan.periods, ports.clock.now()),
        log: ports.log,
        clock: ports.clock,
        requestId: ports.id
      })
  const groupedBackfill = (
    adapter: SourceAdapter<unknown>,
    group: PlannedBackfillGroup,
    plan: SourcePlan,
    scheduledAt: string | null
  ) =>
    runGroupedBackfillOnce(
      adapter,
      group,
      plan.sources.filter((e) => group.sourceIds.includes(e.source.id)).map((e) => e.source),
      {
        store: ports.store,
        clock: ports.clock,
        id: ports.id,
        contextFactory: contextFactory(adapter, plan),
        publish: ports.publish,
        scheduledAt,
        admitGroup: (claim) => reserveGroupedSourceResults(ports.store, claim, ports.clock.now()),
        acknowledged: async (operationId) => {
          const saved = await ports.store.read(receiptPath(operationId))
          if (!saved) return false
          const ref = ResultReference.parse(decodeObject(saved.body))
          if (
            ref.operation_id !== operationId ||
            ref.kind !== adapter.kind ||
            ref.object_path !== resultPath(adapter.kind, operationId)
          )
            throw new Error('Invalid grouped backfill receipt')
          return true
        }
      }
    )
  const backfillWithCapture = async (
    entry: PlannedSource,
    plan: Pick<SourcePlan, 'periods'>,
    scheduledAt: string | null,
    completed?: (result: SourceExecutionResult) => void
  ) => {
    const adapter = adapterFor(entry.source.kind)
    if (adapter.groupedBackfill) {
      // A tenant event records intent only; global membership comes from the next authoritative plan.
      const saved = await ports.store.read('control/plan.json')
      if (!saved) return 'running' as const
      const authoritative = await readSourcePlan(ports.store)
      if (authoritative.version !== 2) return 'running' as const
      const group = authoritative.backfillGroups.find(
        (g) => g.kind === adapter.kind && g.sourceIds.includes(entry.source.id)
      )
      return group ? groupedBackfill(adapter, group, authoritative, scheduledAt) : ('running' as const)
    }
    return runBackfillOnce(adapter, entry.source, {
      store: ports.store,
      clock: ports.clock,
      id: ports.id,
      contextFactory: contextFactory(adapter, plan),
      publish: ports.publish,
      scheduledAt,
      completed,
      admit: (operationId) =>
        reserveSourceResult(ports.store, operationId, adapter.kind, ports.clock.now(), entry.source.id),
      acknowledged: async (operationId) => {
        const receipt = await ports.store.read(receiptPath(operationId))
        if (!receipt) return false
        const ref = ResultReference.parse(decodeObject(receipt.body))
        if (
          ref.operation_id !== operationId ||
          ref.kind !== adapter.kind ||
          ref.object_path !== resultPath(ref.kind, operationId)
        )
          throw new Error('Invalid backfill receipt')
        return true
      }
    })
  }
  return {
    async runAdapter(kind: string, scheduledAt: string | null): Promise<void> {
      const adapter = adapterFor(kind)
      await ports.repair?.()
      if (scheduledAt !== null && !Number.isFinite(Date.parse(scheduledAt))) throw new Error('Invalid scheduled-at')
      const plan = await readSourcePlan(ports.store),
        entries = plan.sources.filter((s) => s.source.kind === kind)
      const ready: PlannedSource[] = []
      if (adapter.groupedBackfill) {
        if (plan.version !== 2) throw new Error('Grouped backfill requires an authoritative v2 source plan')
        for (const group of plan.backfillGroups.filter((g) => g.kind === adapter.kind))
          await groupedBackfill(adapter, group, plan, scheduledAt)
        // History never removes a station from normal all-bound latest polling.
        ready.push(...entries)
      }
      for (const entry of adapter.groupedBackfill ? [] : entries) {
        let freshCapture = false
        const state = await backfillWithCapture(
          entry,
          plan,
          scheduledAt,
          adapter.batch === 'per_source'
            ? (result) => {
                // Reuse only a genuine, single-source transport capture within this source's cadence.
                // Its purpose remains backfill; it cannot establish live polling freshness.
                const request = result.requests.length === 1 ? result.requests[0] : undefined
                const capturedAt = request?.transportStartedAt
                const age = capturedAt ? ports.clock.now().getTime() - Date.parse(capturedAt) : NaN
                freshCapture =
                  result.purpose === 'backfill' &&
                  request?.sourceIds.length === 1 &&
                  request.sourceIds[0] === entry.source.id &&
                  age >= 0 &&
                  age < adapter.cadence * 1000
              }
            : undefined
        )
        if (state !== 'running' && !freshCapture) ready.push(entry)
      }
      if (!ready.length) {
        ports.log('source.adapter.complete', {
          adapter: kind,
          sources: 0,
          deferred_sources: entries.length,
          requests: 0,
          scheduled_at: scheduledAt
        })
        return
      }
      if (adapter.latestSlot && adapter.batch === 'per_source') {
        let requests = 0
        for (const entry of ready)
          requests += await runSourceSlot(adapter, entry.source, {
            ...ports,
            scheduledAt,
            contextFactory: (window) => contextFactory(adapter, plan, window)
          })
        ports.log('source.adapter.complete', {
          adapter: kind,
          sources: ready.length,
          deferred_sources: entries.length - ready.length,
          requests,
          scheduled_at: scheduledAt
        })
        return
      }
      const operationId = ports.id()
      await reserveSourceResult(ports.store, operationId, adapter.kind, ports.clock.now())
      const result = await executeAdapter(
        adapter,
        ready.map((s) => s.source),
        contextFactory(adapter, plan),
        {
          operationId,
          purpose: 'poll',
          scheduledAt,
          clock: ports.clock,
          // A fifteen-minute plan cannot prove the latest persisted body; ingestion owns deduplication.
          requestId: ports.id
        }
      )
      await ports.publish(result)
      ports.log('source.adapter.complete', {
        adapter: kind,
        sources: ready.length,
        deferred_sources: entries.length - ready.length,
        requests: result.requests.length,
        scheduled_at: scheduledAt
      })
    },
    backfill: (entry: PlannedSource, plan: Pick<SourcePlan, 'periods'>, scheduledAt: string | null) =>
      backfillWithCapture(entry, plan, scheduledAt),
    refreshSourcePlan: (now: Date) => refreshSourcePlan(now, ports.store, ports.database.snapshot),
    async catalogueSync(): Promise<void> {
      let count = 0
      for (const adapter of ports.adapters)
        if (adapter.discover) {
          // Discovery must finish before the transaction; a provider error preserves the catalogue.
          const entries = await adapter.discover()
          await ports.database.catalogue(adapter, entries)
          count++
        }
      ports.log('source.catalogue.complete', { adapters: count })
    },
    async adapterContracts(): Promise<void> {
      if (!ports.adapters.length) {
        ports.log('source.contracts.complete', { adapters: 0 })
        return
      }
      const plan = await readSourcePlan(ports.store),
        failures: string[] = []
      for (const adapter of ports.adapters) {
        const entries = plan.sources.filter((s) => s.source.kind === adapter.kind)
        if (!entries.length) {
          ports.log('source.contract.skipped', { adapter: adapter.kind, reason: 'no bound sources' })
          continue
        }
        try {
          const probe =
            adapter.batch === 'per_source'
              ? [...entries].sort((a, b) => a.source.id.localeCompare(b.source.id)).slice(0, 1)
              : entries
          if (adapter.latestSlot) {
            if (adapter.batch !== 'per_source')
              throw new Error('All-bound current-slot probes are unavailable until slot coordination is installed')
            const source = probe[0]!.source
            const body = await currentSlotBody(adapter, source, ports.store, ports.clock)
            adapter.parse(adapter.latestSlot.decode(body), [source])
            ports.log('source.contract.passed', { adapter: adapter.kind })
            continue
          }
          const result = await executeAdapter(
            adapter,
            probe.map((s) => s.source),
            contextFactory(adapter, plan),
            { operationId: ports.id(), purpose: 'poll', scheduledAt: null, clock: ports.clock, requestId: ports.id }
          )
          if (result.polls.some((p) => p.outcome === 'error'))
            throw new Error(result.polls.find((p) => p.error)?.error?.message ?? 'Contract probe failed')
          ports.log('source.contract.passed', { adapter: adapter.kind })
        } catch (error) {
          ports.log('source.contract.failed', { adapter: adapter.kind, error: String(error) })
          failures.push(adapter.kind)
        }
      }
      if (failures.length) throw new Error(`Source contracts failed: ${failures.join(', ')}`)
    },
    adapterFor: (kind: SourceKind) => ports.adapters.find((a) => a.kind === kind)
  }
}
