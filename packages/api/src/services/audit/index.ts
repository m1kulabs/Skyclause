import { z } from '@hono/zod-openapi'
import { canonicalJson } from '@skyclause/clauses'
import { Instant, type Operations } from '@skyclause/contracts'
import {
  auditExportPage,
  auditHead,
  listAudit,
  recordAudit,
  resolveActorDisplay,
  type ActorDisplay,
  type AuditCursor,
  type AuditFilters,
  type AuditRow
} from '@skyclause/db'
import { decodeCursor, page } from '../../pagination'
import { ApiError } from '../../problems'
import { instant } from '../../serialize'
import type { ServiceContext } from '../../tenancy'

// #107 a-audit-log: the organisation audit log reads (#79 §4, `audit.view`). Rows come from the transaction's
// organisation; display names and roles resolve at read time, never from stored personal data.

type ListOk = z.infer<Operations['listAuditEntries']['responses'][200]['content']['application/json']['schema']>
type ExportJsonOk = z.infer<Operations['exportAuditLog']['responses'][200]['content']['application/json']['schema']>

export type AuditListEntry = ListOk['data'][number]
export type AuditExportEntry = ExportJsonOk[number]

export interface AuditListFilters {
  action?: AuditListEntry['action']
  actor_id?: string
  target_type?: string
  target_id?: string
  project_id?: string
  from?: string
  to?: string
}

const invalidCursor = () =>
  new ApiError(422, 'validation-failed', 'The cursor is not one this API issued.', {
    errors: [{ in: 'query', pointer: '/cursor', detail: 'Invalid cursor' }]
  })

function toDbFilters(filters: AuditListFilters): AuditFilters {
  return {
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.actor_id ? { actorId: filters.actor_id } : {}),
    ...(filters.target_type ? { targetType: filters.target_type } : {}),
    ...(filters.target_id ? { targetId: filters.target_id } : {}),
    ...(filters.project_id ? { projectId: filters.project_id } : {}),
    ...(filters.from ? { from: new Date(filters.from) } : {}),
    ...(filters.to ? { to: new Date(filters.to) } : {})
  }
}

function toEntry(row: AuditRow, display: ActorDisplay | undefined): AuditListEntry {
  return {
    id: row.id,
    project_id: row.projectId,
    actor_type: row.actorType,
    actor_id: row.actorId,
    actor_name: display?.name ?? null,
    actor_role: display?.role ?? null,
    client: row.client,
    client_name: row.clientName,
    action: row.action as AuditListEntry['action'],
    target_type: row.targetType,
    target_id: row.targetId,
    before: (row.before ?? null) as AuditListEntry['before'],
    after: (row.after ?? null) as AuditListEntry['after'],
    created_at: instant(row.at)
  }
}

async function withDisplay(
  orgId: string,
  rows: AuditRow[]
): Promise<Array<{ row: AuditRow; display: ActorDisplay | undefined }>> {
  const displays = await resolveActorDisplay(
    orgId,
    rows.map((row) => ({ actorType: row.actorType, actorId: row.actorId }))
  )
  return rows.map((row) => ({ row, display: displays.get(row.actorId) }))
}

/** Newest first with cursor pagination (`limit` 1–200, default 50), every filter combinable. */
export async function listAuditEntries(
  ctx: ServiceContext,
  q: { filters: AuditListFilters; limit: number; cursor?: string }
): Promise<ListOk> {
  let cursor: AuditCursor | undefined
  if (q.cursor !== undefined) {
    const raw = decodeCursor(q.cursor)
    if (!Instant.safeParse(raw.at).success || !z.uuid().safeParse(raw.id).success) throw invalidCursor()
    cursor = { at: raw.at as string, id: raw.id as string }
  }
  const rows = await listAudit(ctx.tx, { filters: toDbFilters(q.filters), limit: q.limit, cursor })
  const { data, next_cursor } = page(rows, q.limit, (row) => ({ at: row.cursorAt, id: row.id }))
  const entries = (await withDisplay(ctx.tx.orgId!, data)).map(({ row, display }) => toEntry(row, display))
  return { data: entries, next_cursor }
}

const CSV_PAGE = 500
const CSV_COLUMNS = [
  'id',
  'project_id',
  'actor_type',
  'actor_id',
  'actor_name',
  'actor_role',
  'client',
  'client_name',
  'action',
  'target_type',
  'target_id',
  'before',
  'after',
  'created_at'
]

const csvField = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value)
const csvLine = (fields: Array<string | null>) => `${fields.map((field) => csvField(field ?? '')).join(',')}\r\n`

const cell = (entry: AuditExportEntry, column: string): string | null => {
  const value = entry[column as keyof AuditExportEntry]
  if (value === null || value === undefined) return null
  return typeof value === 'string' ? value : canonicalJson(value)
}

const entryCsv = (entry: AuditExportEntry) => csvLine(CSV_COLUMNS.map((column) => cell(entry, column)))

/** Both formats stream the same newest-first rows, bounded by the head captured for this export. */
async function exportAudit(
  ctx: ServiceContext,
  q: { filters: AuditListFilters },
  format: 'csv' | 'json',
  inTransaction: <T>(fn: (ctx: ServiceContext) => Promise<T>) => Promise<T>
): Promise<ReadableStream<Uint8Array>> {
  await recordAudit(ctx.tx, {
    action: 'export.requested',
    target: { type: 'audit_log', id: ctx.tx.orgId! }
  })
  const filters = toDbFilters(q.filters)
  const orgId = ctx.tx.orgId!
  const upto = await auditHead(ctx.tx)
  const encoder = new TextEncoder()
  let before: AuditCursor | undefined
  let first = true
  return new ReadableStream(
    {
      start(controller) {
        controller.enqueue(encoder.encode(format === 'csv' ? csvLine(CSV_COLUMNS) : '['))
      },
      async pull(controller) {
        const rows = await inTransaction((next) =>
          auditExportPage(next.tx, { filters, before, upto: upto ?? undefined, limit: CSV_PAGE })
        )
        const entries = (await withDisplay(orgId, rows)).map(({ row, display }) => toEntry(row, display))
        const text =
          format === 'csv'
            ? entries.map(entryCsv).join('')
            : `${!first && entries.length ? ',' : ''}${entries.map((entry) => JSON.stringify(entry)).join(',')}`
        if (text.length) controller.enqueue(encoder.encode(text))
        if (entries.length) first = false
        const last = rows.at(-1)
        if (last) before = { at: last.cursorAt, id: last.id }
        if (rows.length < CSV_PAGE) {
          if (format === 'json') controller.enqueue(encoder.encode(']'))
          controller.close()
        }
      }
    },
    { highWaterMark: 0 }
  )
}

export const exportAuditJson = (
  ctx: ServiceContext,
  q: { filters: AuditListFilters },
  inTransaction: <T>(fn: (ctx: ServiceContext) => Promise<T>) => Promise<T>
) => exportAudit(ctx, q, 'json', inTransaction)

export const exportAuditCsv = (
  ctx: ServiceContext,
  q: { filters: AuditListFilters },
  inTransaction: <T>(fn: (ctx: ServiceContext) => Promise<T>) => Promise<T>
) => exportAudit(ctx, q, 'csv', inTransaction)
