import { randomBytes } from 'node:crypto'
import { pubsubPublisher } from '@skyclause/config'
import {
  boundSources,
  plannedCrowdPeriods,
  previousSourceDigest,
  upsertSourceCatalogue,
  withSystem
} from '@skyclause/db'
import { adapters, SourceKind } from '@skyclause/sources'
import { z } from 'zod'
import { onEvent } from '../events'
import { log, type EventConsumer, type WorkerPart } from '../server'
import { createSourceJobs } from './jobs'
import { drainSourceResults, ingestSourceResult, sourceIngestionDatabase } from './ingest'
import { sourceClock } from './http'
import { sourceSnapshot, SourceSchema, type PlannedSource, type SourcePlan } from './plan'
import { publishSourceResult, sourceSubscription, repairSourceResults } from './pubsub'
import { encodeObject, gcsObjectStore, hasCode } from './storage'
export function sourceConfig(env: Record<string, string | undefined> = process.env) {
  const required = (name: string) => {
    const value = env[name]
    if (!value?.trim()) throw new Error(`${name} is required for source jobs`)
    return value
  }
  return {
    bucket: required('SOURCES_BUCKET'),
    scratch: required('SCRATCH_BUCKET'),
    project: required('GCP_PROJECT'),
    userAgent: required('SOURCE_USER_AGENT'),
    subscription: required('SOURCE_RESULTS_SUBSCRIPTION')
  }
}
/** UUIDv7 without database access: a 48-bit wall clock and independent random suffix. */
function id() {
  const bytes = randomBytes(16)
  bytes.writeUIntBE(Date.now(), 0, 6)
  bytes[6] = (bytes[6]! & 15) | 112
  bytes[8] = (bytes[8]! & 63) | 128
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
function live() {
  const config = sourceConfig(),
    store = gcsObjectStore(config.bucket),
    scratch = gcsObjectStore(config.scratch)
  const resultPublisher = pubsubPublisher(config.project, 'poll-results')
  const repair = () => repairSourceResults({ store, publish: resultPublisher })
  const jobs = createSourceJobs({
    repair,
    store,
    scratch,
    clock: sourceClock,
    id,
    adapters,
    http: fetch,
    userAgent: config.userAgent,
    publish: (result) => publishSourceResult(result, { store, publish: resultPublisher }),
    database: {
      snapshot: sourceSnapshot,
      catalogue: (adapter, entries) =>
        withSystem('sources:catalogue', (tx) => upsertSourceCatalogue(tx, adapter, entries))
    },
    log: (message, fields) => log(message === 'source.contract.failed' ? 'ERROR' : 'INFO', message, fields)
  })
  return {
    jobs,
    store,
    repair,
    subscription: sourceSubscription(config.project, config.subscription),
    ingest: (data: unknown) =>
      ingestSourceResult(data, {
        store,
        ...sourceIngestionDatabase(adapters),
        publish: pubsubPublisher(config.project, 'readings-updated')
      })
  }
}
/** #125 can call this from its minute handler; it never opens a database connection. */
export const runAdapter = (kind: string, scheduledAt: string | null) => live().jobs.runAdapter(kind, scheduledAt)
export function sourceBoundConsumer(runtime: typeof live = live): EventConsumer {
  return {
    consumer: 'source-backfill',
    types: ['source.bound'],
    handler: async (raw) => {
      const ports = runtime()
      let intended: { entry: PlannedSource; periods: SourcePlan['periods'] } | undefined
      const consumer = onEvent(['source.bound'], 'source-backfill', async (event, tx) => {
        const sourceId = z.uuid().parse(event.data.source_id)
        for (const kind of SourceKind.options) {
          const bound = (await boundSources(tx, kind)).find(
            (s) =>
              s.id === sourceId && s.ownerOrgId === null && s.bindings.some((b) => b.projectId === event.project_id)
          )
          if (!bound) continue
          const adapter = ports.jobs.adapterFor(kind)
          if (!adapter?.backfill) return
          const entry: PlannedSource = {
            source: SourceSchema.parse({
              id: bound.id,
              kind: bound.kind,
              externalId: bound.externalId,
              name: bound.name,
              lat: bound.lat,
              lon: bound.lon,
              url: bound.url,
              meta: bound.meta
            }),
            bindings: bound.bindings,
            previousPollDigest: bound.previousBodySha256,
            previousBackfillDigest: await previousSourceDigest(tx, sourceId, 'backfill')
          }
          intended = { entry, periods: await plannedCrowdPeriods(tx) }
          // Durable intent before handleOnce commits; retry or the next adapter plan scan repairs missed execution.
          try {
            await ports.store.write(`control/intents/${sourceId}.json`, encodeObject(intended), '0')
          } catch (error) {
            if (!hasCode(error, 412)) throw error
          }
          return
        }
      })
      await consumer.handler(raw)
      // onEvent has returned: no fetch or nested with* scope can escape the tenant transaction.
      if (intended) await ports.jobs.backfill(intended.entry, intended, null)
    }
  }
}
export function sourcePart(runtime: typeof live = live): WorkerPart {
  return {
    owner: 'b-sources-core',
    jobs: {
      adapter: async (args) => {
        const [kind, flag, slot, ...extra] = args
        if (!kind || extra.length || (flag !== undefined && flag !== '--scheduled-at') || (flag !== undefined && !slot))
          throw new Error('usage: adapter <kind> [--scheduled-at <ISO instant>]')
        await runtime().jobs.runAdapter(kind, slot === undefined ? null : z.iso.datetime().parse(slot))
      },
      'catalogue-sync': async () => runtime().jobs.catalogueSync(),
      'adapter-contracts': async () => runtime().jobs.adapterContracts()
    },
    batch: {
      'sources-ingest': async (now) => {
        const ports = runtime()
        // Refresh even when an individual durable result fails; report failures after both operations finish.
        const failures: unknown[] = []
        try {
          await ports.repair()
        } catch (error) {
          failures.push(error)
        }
        try {
          await drainSourceResults({
            pull: ports.subscription.pullSourceResults,
            ack: ports.subscription.ackSourceResults,
            ingest: ports.ingest
          })
        } catch (error) {
          failures.push(error)
        }
        await ports.jobs.refreshSourcePlan(now)
        if (failures.length)
          throw new AggregateError(failures, `Source batch failed: ${failures.map(String).join('; ')}`)
      }
    },
    events: [sourceBoundConsumer(runtime)]
  }
}
export const sources = sourcePart()
