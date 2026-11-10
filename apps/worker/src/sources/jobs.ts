import { type SourceAdapter, type SourceKind, type PollContext } from '@skyclause/sources'
import { executeAdapter } from './execute'
import { runBackfillOnce } from './backfill'
import { createPollContext } from './http'
import { activePeriods, readSourcePlan, refreshSourcePlan, type SourcePlan, type PlannedSource } from './plan'
import { reserveSourceResult, ResultReference, resultPath } from './pubsub'
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
    (adapter: SourceAdapter<unknown>, plan: Pick<SourcePlan, 'periods'>) => (sources: PlannedSource['source'][]) =>
      createPollContext({
        kind: adapter.kind,
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
  const backfill = async (entry: PlannedSource, plan: Pick<SourcePlan, 'periods'>, scheduledAt: string | null) => {
    const adapter = adapterFor(entry.source.kind)
    return runBackfillOnce(adapter, entry.source, {
      store: ports.store,
      clock: ports.clock,
      id: ports.id,
      contextFactory: contextFactory(adapter, plan),
      publish: ports.publish,
      scheduledAt,
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
      for (const entry of entries) if ((await backfill(entry, plan, scheduledAt)) !== 'running') ready.push(entry)
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
    backfill,
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
