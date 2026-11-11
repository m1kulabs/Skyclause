import { loadEnv } from '@skyclause/config'
import type { EmailTransport } from '@skyclause/contracts'
import {
  completeExportJob,
  failStaleExports,
  listDueOrganisations,
  loadExportDelivery,
  purgeOrganization,
  readAccountExport,
  readOrganisationExport,
  recordExportFailure,
  recordExportNoticeFailure,
  recordExportNoticeSent,
  startExportJob,
  type ExportJobRow
} from '@skyclause/db'
import { renderExportReadyEmail, requireEmailTransport } from '@skyclause/delivery'
import { log, type BatchHandler, type QueueHandler, type WorkerPart } from '../server'
import { exportFiles, createZip } from './archive'
import { cloudBucket } from './storage'

export interface DataRightsBucket {
  name: string
  write(path: string, contents: Buffer): Promise<void>
  deleteObject(path: string): Promise<void>
  deletePrefix(prefix: string): Promise<number>
}

export interface DataRightsDeps {
  exportBucket: DataRightsBucket
  orgBuckets: DataRightsBucket[]
  email: () => EmailTransport
  appOrigin: () => string
  now: () => Date
}

function productionDeps(): DataRightsDeps {
  const env = loadEnv('worker')
  const exportsBucket = env.EXPORTS_BUCKET
  if (!exportsBucket) throw new Error('EXPORTS_BUCKET is not set')
  const buckets = [env.EXPORTS_BUCKET, env.FRAMES_BUCKET, env.ARCHIVE_BUCKET, env.SCRATCH_BUCKET, env.SOURCES_BUCKET]
  if (buckets.some((name) => !name)) throw new Error('the org purge bucket set is not fully configured')
  return {
    exportBucket: cloudBucket(exportsBucket),
    orgBuckets: [...new Set(buckets)].map((name) => cloudBucket(name!)),
    email: () => requireEmailTransport('worker'),
    appOrigin: () => {
      const origin = loadEnv('worker').APP_ORIGIN
      if (!origin) throw new Error('APP_ORIGIN is not set')
      return origin
    },
    now: () => new Date()
  }
}

async function prepare(job: ExportJobRow, deps: DataRightsDeps, generatedAt: Date) {
  const data =
    job.scope === 'account' ? await readAccountExport(job.accountId!) : await readOrganisationExport(job.orgId!)
  const files = exportFiles(data as unknown as Record<string, unknown>, job.formats, generatedAt)
  const zip = createZip(files, generatedAt)
  const objectPath =
    job.scope === 'account'
      ? `accounts/${job.accountId}/exports/${job.id}.zip`
      : `orgs/${job.orgId}/exports/${job.id}.zip`
  await deps.exportBucket.write(objectPath, zip)
  const completed = await completeExportJob(job.id, objectPath, generatedAt)
  if (!completed) await deps.exportBucket.deleteObject(objectPath)
}

async function deliverReadyExport(jobId: string, deps: DataRightsDeps, now: Date) {
  const delivery = await loadExportDelivery(jobId)
  if (!delivery) return
  const origin = deps.appOrigin().replace(/\/$/, '')
  const link = `${origin}/api/exports/${encodeURIComponent(jobId)}/download`
  const { subject, text, html } = renderExportReadyEmail({
    language: delivery.notice.language,
    downloadUrl: link,
    expiresAt: delivery.job.expiresAt!
  })
  try {
    const { providerMessageId } = await deps.email().send({
      to: delivery.email,
      from: 'system',
      subject,
      text,
      html,
      category: 'export_ready',
      idempotencyKey: delivery.notice.idempotencyKey
    })
    await recordExportNoticeSent(jobId, providerMessageId, now)
  } catch (error) {
    await recordExportNoticeFailure(jobId, now)
    throw error
  }
}

function createExportHandler(deps: DataRightsDeps): QueueHandler {
  return async (task) => {
    const body = task.body && typeof task.body === 'object' ? (task.body as { export_id?: unknown }) : {}
    if (typeof body.export_id !== 'string') throw new Error('exports task requires export_id')
    const now = deps.now()
    let job: ExportJobRow | null = null
    try {
      job = await startExportJob(body.export_id, now)
      if (!job || job.status === 'failed') return
      if (job.status !== 'ready') await prepare(job, deps, now)
      await deliverReadyExport(job.id, deps, deps.now())
    } catch (error) {
      await recordExportFailure(body.export_id, error instanceof Error ? error.message : String(error), deps.now())
      throw error
    }
  }
}

async function purgeDue(deps: DataRightsDeps, now: Date) {
  const due = await listDueOrganisations(now)
  for (const org of due) {
    const objects: Record<string, number> = {}
    for (const bucket of deps.orgBuckets) objects[bucket.name] = await bucket.deletePrefix(`orgs/${org.id}/`)
    const result = await purgeOrganization(org.id, now)
    log('INFO', 'organisation data purged', { org_id: org.id, row_counts: result.counts, object_counts: objects })
  }
}

export function createDataRightsPart(deps?: DataRightsDeps): WorkerPart {
  let loaded = deps
  const get = () => (loaded ??= productionDeps())
  const queue: QueueHandler = async (task) => createExportHandler(get())(task)
  const batch: BatchHandler = async (now) => {
    await failStaleExports(now)
  }
  return {
    owner: 'a-data-rights',
    queues: { exports: queue },
    batch: { 'exports:timeout': batch },
    jobs: { 'org:purge': async () => purgeDue(get(), get().now()) }
  }
}

export const dataRights = createDataRightsPart()
