import type { z } from '@hono/zod-openapi'
import { canonicalJson } from '@skyclause/clauses'
import { Pack, ROLES, type LedgerKind, type Operations, type Role } from '@skyclause/contracts'
import {
  ledgerCsvPage,
  ledgerHeadSeq,
  ledgerProject,
  listLedger,
  listPilotArchive,
  verifyLedger,
  type LedgerFilters
} from '@skyclause/db'
import { decodeCursor, page } from '../pagination'
import { ApiError } from '../problems'
import { instant, toWire } from '../serialize'
import type { ServiceContext } from '../tenancy'

// #146 c-ledger-chain: the project ledger's reads (#79 §4, all `ledger.view`). Entries go out as stored: `at` with its
// milliseconds and `refs`/`body` untouched, so anyone can recompute each hash (D11) from the wire or the CSV.

export const PILOT_ARCHIVE_LABEL = 'Pilot archive (Gemini Enterprise, November 2026)'
const SIGNED_URL_MS = 15 * 60_000
const CSV_PAGE = 500

type Ok<Id extends 'listLedgerEntries' | 'verifyLedger' | 'getPilotArchive'> = z.infer<
  Operations[Id]['responses'][200]['content']['application/json']['schema']
>
type LedgerRow = Ok<'listLedgerEntries'>['data'][number]

const notFound = () => new ApiError(404, 'not-found', 'No such project, or you can’t see its ledger.')

/** The project, if this principal may read its ledger; else 404, as for another organisation's project. */
export async function ledgerProjectFor(
  ctx: ServiceContext,
  projectId: string,
  canView: (projectId: string) => boolean
) {
  const project = await ledgerProject(ctx.tx, projectId)
  if (!project || !canView(projectId)) throw notFound()
  return project
}

const isRole = (value: unknown): value is Role => (ROLES as readonly unknown[]).includes(value)

export async function listLedgerEntries(
  ctx: ServiceContext,
  q: { projectId: string; timeZone: string; filters: LedgerFilters; limit: number; cursor?: string }
): Promise<Ok<'listLedgerEntries'>> {
  let beforeSeq: number | undefined
  if (q.cursor !== undefined) {
    const { seq } = decodeCursor(q.cursor)
    if (typeof seq !== 'number') {
      throw new ApiError(422, 'validation-failed', 'The cursor is not one this API issued.', {
        errors: [{ in: 'query', pointer: '/cursor', detail: 'Invalid cursor' }]
      })
    }
    beforeSeq = seq
  }
  const { rows, total } = await listLedger(ctx.tx, { ...q, beforeSeq })
  const { data, next_cursor } = page(rows, q.limit, (row) => ({ seq: row.seq }))
  return {
    data: data.map((row): LedgerRow => {
      const body = row.body as Record<string, unknown> | null
      const pack = Pack.safeParse(body?.pack)
      return {
        id: row.id,
        project_id: row.projectId,
        seq: row.seq,
        kind: row.kind as LedgerKind,
        refs: row.refs,
        body: row.body as LedgerRow['body'],
        prev_hash: row.prevHash,
        hash: row.hash,
        at: row.at.toISOString(),
        ...(row.corrects ? { corrects: row.corrects } : {}),
        pack: pack.success ? pack.data : null,
        // CallView's notices, recipients and shadow verdict are c-bundle-lifecycle's (#150) to assemble.
        call: null,
        window: row.window ? (toWire(row.window) as LedgerRow['window']) : null,
        grade: row.grade ? (toWire(row.grade) as LedgerRow['grade']) : null,
        approver_role: isRole(body?.approver_role) ? body.approver_role : null
      }
    }),
    next_cursor,
    total
  }
}

const CSV_COLUMNS = ['seq', 'at', 'kind', 'refs', 'body', 'prev_hash', 'hash']
const csvField = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value)
const csvLine = (fields: string[]) => `${fields.map(csvField).join(',')}\r\n`

/** The CSV header and the entries up to the head `seq` read now, oldest first, one `withTenant` per page. */
export async function exportLedgerCsv(
  ctx: ServiceContext,
  q: { projectId: string; timeZone: string; filters: LedgerFilters },
  inPage: <T>(fn: (ctx: ServiceContext) => Promise<T>) => Promise<T>
): Promise<ReadableStream<Uint8Array>> {
  const uptoSeq = await ledgerHeadSeq(ctx.tx, q.projectId)
  const encoder = new TextEncoder()
  let afterSeq = 0
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(csvLine(CSV_COLUMNS)))
    },
    async pull(controller) {
      const rows = await inPage((page) => ledgerCsvPage(page.tx, { ...q, afterSeq, uptoSeq, limit: CSV_PAGE }))
      const text = rows.map((row) =>
        csvLine([
          String(row.seq),
          row.at.toISOString(),
          row.kind,
          canonicalJson(row.refs),
          canonicalJson(row.body),
          row.prevHash,
          row.hash
        ])
      )
      if (text.length) controller.enqueue(encoder.encode(text.join('')))
      afterSeq = rows.at(-1)?.seq ?? afterSeq
      if (rows.length < CSV_PAGE) controller.close()
    }
  })
}

export async function verifyLedgerChain(
  ctx: ServiceContext,
  projectId: string,
  now: Date
): Promise<Ok<'verifyLedger'>> {
  const verdict = await verifyLedger(ctx.tx, projectId)
  return {
    valid: verdict.ok,
    checked_entries: verdict.count,
    first_bad_entry_id: verdict.ok ? null : verdict.first_bad.id,
    head_hash: verdict.head_hash,
    verified_at: instant(now),
    ...(verdict.ok ? {} : { first_bad: verdict.first_bad })
  }
}

/** Signs a read URL for an object in `ARCHIVE_BUCKET` that stops working at `expiresAt`. */
export type ArchiveUrlSigner = (objectPath: string, expiresAt: Date) => Promise<string>

let storage: import('@google-cloud/storage').Storage | undefined

/** Keyless V4 signing as the running service account, which signs through itself (infra main.tf). */
const signWithCloudStorage: ArchiveUrlSigner = async (objectPath, expiresAt) => {
  const bucket = process.env.ARCHIVE_BUCKET
  if (!bucket) throw new Error('ARCHIVE_BUCKET is not set')
  if (!storage) storage = new (await import('@google-cloud/storage')).Storage()
  const [url] = await storage.bucket(bucket).file(objectPath).getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: expiresAt
  })
  return url
}

let signArchiveUrl: ArchiveUrlSigner = signWithCloudStorage

/** Replaces the Cloud Storage signer, for tests. */
export function setArchiveUrlSigner(signer: ArchiveUrlSigner) {
  signArchiveUrl = signer
}

/** LED-8: the pilot's archived files, each behind a 15-minute signed URL; never ledger entries. */
export async function getPilotArchive(
  ctx: ServiceContext,
  projectId: string,
  now: Date
): Promise<Ok<'getPilotArchive'>> {
  const files = await listPilotArchive(ctx.tx, projectId)
  const expiresAt = new Date(now.getTime() + SIGNED_URL_MS)
  return {
    data: await Promise.all(
      files.map(async (file) => ({
        project_id: projectId,
        kind: file.kind,
        url: await signArchiveUrl(file.objectPath, expiresAt),
        sha256: file.sha256,
        captured_at: instant(file.capturedAt)
      }))
    ),
    next_cursor: null,
    label: PILOT_ARCHIVE_LABEL
  }
}
