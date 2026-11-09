import type { CallView, Operations, TxHandle } from '@skyclause/contracts'
import { and, asc, desc, eq, gt, inArray, isNull, lt, lte, ne, or, sql } from 'drizzle-orm'
import type { z } from 'zod'
import type { Tx } from '../client'
import { evidenceCallViews } from '../placeholders/c-bundle-lifecycle'
import { approval, call, grade, ledgerEntry, project, projectSource, source, window } from '../schema'
import { reading } from '../schema/partitioned'

// #159 c-evidence: the evidence pack (LED-5), assembled once at drafting from stored rows and kept on the request with
// its canonicalHash, so an approval covers exactly what was shown. Readings cover (from, to] (D12: a JPS value at T
// covers (T − 5 min, T]). Every list is sorted, so the same rows always give the same pack and hash.

type View = z.infer<Operations['getEvidenceRequest']['responses'][200]['content']['application/json']['schema']>
/** The pack as `/v1` serves it (`EvidencePack`). */
export type EvidencePack = NonNullable<View['pack']>
/** A held frame as stored: the object, whose 1-hour signed URL each read mints outside the hash. */
export interface StoredFrame {
  reading_id: string
  object_path: string
  captured_at: string
}
/** The pack as `evidence_request.pack` holds it and `pack_hash` covers it. */
export type StoredEvidencePack = Omit<EvidencePack, 'frames'> & { frames: StoredFrame[] }

/** Loads #150's call views for the pack's calls; `evidenceCallViews` until `setEvidenceCallViews` replaces it. */
export type EvidenceCallViews = (tx: TxHandle, callIds: string[]) => Promise<CallView[]>

let callViews: EvidenceCallViews = evidenceCallViews

/** Replaces the call-view loader (tests, and the composition root once #150's assembly is wired). */
export function setEvidenceCallViews(next: EvidenceCallViews) {
  callViews = next
}

const iso = (date: Date) => date.toISOString().replace('.000Z', 'Z')

// The metrics the pack lists apart from readings: MET warnings and camera frames (#122, #126 value_json).
const WARNING_METRIC = 'warning'
const FRAME_METRIC = 'flag'

interface WarningValue {
  text_en?: unknown
  text_bm?: unknown
  valid_from_utc?: unknown
  valid_to_utc?: unknown
  excluded?: unknown
}

/** The latest revision of each reading of `sourceIds` matching `where` (TRD: a changed re-fetch appends a revision). */
function latestReadings(tx: Tx, where: ReturnType<typeof and>) {
  return tx
    .selectDistinctOn([reading.sourceId, reading.metric, reading.observedAt, reading.itemKey])
    .from(reading)
    .where(where)
    .orderBy(reading.sourceId, reading.metric, reading.observedAt, reading.itemKey, desc(reading.revision))
}

/**
 * #122's in-force rule (SIG-4): a non-excluded warning whose validity overlaps the span and whose English or Malay
 * text names one of the project's warning area terms. Null validity is never in force.
 */
export function warningInForce(value: WarningValue, span: { from: Date; to: Date }, areaTerms: string[]) {
  if (value.excluded !== false) return false
  if (typeof value.valid_from_utc !== 'string' || typeof value.valid_to_utc !== 'string') return false
  if (new Date(value.valid_from_utc) > span.to || new Date(value.valid_to_utc) < span.from) return false
  const texts = [value.text_en, value.text_bm].filter((text): text is string => typeof text === 'string')
  return areaTerms.some((term) => texts.some((text) => text.toLowerCase().includes(term.toLowerCase())))
}

const byKey =
  <T>(...keys: Array<(row: T) => string>) =>
  (a: T, b: T) => {
    for (const key of keys) {
      const order = key(a).localeCompare(key(b))
      if (order) return order
    }
    return 0
  }

/** The pack for `projectId` over `(from, to]`: the project's bound sources, and the calls the span or `callId` names. */
export async function assembleEvidencePack(
  handle: TxHandle,
  q: { projectId: string; from: Date; to: Date; windowId: string | null; callId: string | null }
): Promise<StoredEvidencePack> {
  const tx = handle as Tx
  const span = { from: q.from, to: q.to }
  const [home] = await tx
    .select({ areaTerms: project.warningAreaTerms })
    .from(project)
    .where(eq(project.id, q.projectId))
  if (!home) throw new Error(`assembleEvidencePack: project ${q.projectId} isn't visible`)

  const bound = new Map(
    (
      await tx
        .select({ id: source.id, kind: source.kind, externalId: source.externalId, url: source.url })
        .from(projectSource)
        .innerJoin(source, eq(source.id, projectSource.sourceId))
        .where(eq(projectSource.projectId, q.projectId))
    ).map((row) => [row.id, row])
  )
  const ids = (kind?: string) => [...bound.values()].filter((s) => !kind || s.kind === kind).map((s) => s.id)
  const inSpan = and(gt(reading.observedAt, q.from), lte(reading.observedAt, q.to))

  const inSpanReadings = ids().length
    ? (
        await latestReadings(tx, and(inArray(reading.sourceId, ids()), inSpan, ne(reading.metric, WARNING_METRIC)))
      ).filter((row) => row.metric !== FRAME_METRIC)
    : []
  // Contract `Reading` has a non-null unit and poll, so a unitless record or a reading without a poll can't be listed;
  // the pack names those by ID instead of dropping them unseen.
  const carried = (row: (typeof inSpanReadings)[number]) => row.unit !== null && row.pollId !== null
  const readings = inSpanReadings
    .filter(carried)
    .map((row) => {
      const from = bound.get(row.sourceId)!
      return {
        id: row.id,
        source_id: row.sourceId,
        poll_id: row.pollId!,
        metric: row.metric,
        unit: row.unit!,
        observed_at: iso(row.observedAt),
        received_at: iso(row.receivedAt),
        value: row.value,
        value_text: row.valueText,
        value_json: (row.valueJson ?? null) as EvidencePack['readings'][number]['value_json'],
        device_time: row.deviceTime ? iso(row.deviceTime) : null,
        item_key: row.itemKey,
        revision: String(row.revision),
        station_id: from.externalId,
        source_url: from.url
      }
    })
    .sort(
      byKey(
        (r) => r.observed_at,
        (r) => r.station_id,
        (r) => r.metric,
        (r) => r.item_key ?? '',
        (r) => r.id
      )
    )
  const omitted = inSpanReadings
    .filter((row) => !carried(row))
    .map((row) => row.id)
    .sort()

  const warningSources = ids('met_warning')
  const warnings = warningSources.length
    ? (
        await latestReadings(
          tx,
          and(
            inArray(reading.sourceId, warningSources),
            eq(reading.metric, WARNING_METRIC),
            lte(reading.observedAt, q.to)
          )
        )
      )
        .filter((row) => warningInForce((row.valueJson ?? {}) as WarningValue, span, home.areaTerms))
        .map((row) => {
          const value = row.valueJson as Required<{ [K in keyof WarningValue]: string }>
          // LOC-3: MET's Malay as published; MET's own English beside it.
          const malay = typeof value.text_bm === 'string' && value.text_bm !== ''
          return {
            reading_id: row.id,
            text: malay ? value.text_bm : value.text_en,
            gloss: malay && typeof value.text_en === 'string' ? value.text_en : null,
            valid_from: iso(new Date(value.valid_from_utc)),
            valid_to: iso(new Date(value.valid_to_utc))
          }
        })
        .sort(
          byKey(
            (w) => w.valid_from,
            (w) => w.reading_id
          )
        )
    : []

  const cameras = ids('camera')
  const frames = cameras.length
    ? (await latestReadings(tx, and(inArray(reading.sourceId, cameras), eq(reading.metric, FRAME_METRIC), inSpan)))
        .flatMap((row) => {
          const path = (row.valueJson as { object_path?: unknown } | null)?.object_path
          return typeof path === 'string'
            ? [{ reading_id: row.id, object_path: path, captured_at: iso(row.observedAt) }]
            : []
        })
        .sort(
          byKey(
            (f) => f.captured_at,
            (f) => f.reading_id
          )
        )
    : []

  // The calls: the one asked for, and every call for a window overlapping the span.
  const callRows = await tx
    .select({ id: call.id, bundleId: call.bundleId, draftedAt: call.draftedAt })
    .from(call)
    .leftJoin(window, eq(window.id, call.windowId))
    .where(
      and(
        eq(call.projectId, q.projectId),
        or(q.callId ? eq(call.id, q.callId) : undefined, and(lt(window.startsAt, q.to), gt(window.endsAt, q.from)))
      )
    )
    .orderBy(asc(call.draftedAt), asc(call.id))
  const callIds = callRows.map((row) => row.id)
  const bundleIds = [...new Set(callRows.map((row) => row.bundleId))]
  const calls = callIds.length ? await callViews(tx, callIds) : []

  const approvals = callIds.length
    ? (
        await tx
          .select({ id: approval.id, callId: approval.callId, actorId: approval.actorId, at: approval.createdAt })
          .from(approval)
          .where(
            and(
              inArray(approval.action, ['approve', 'edit']),
              or(inArray(approval.callId, callIds), and(isNull(approval.callId), inArray(approval.bundleId, bundleIds)))
            )
          )
          .orderBy(asc(approval.createdAt), asc(approval.id))
      ).map((row) => ({ id: row.id, call_id: row.callId, approved_by: row.actorId, approved_at: iso(row.at) }))
    : []

  const grades = callIds.length
    ? (
        await tx.select().from(grade).where(inArray(grade.callId, callIds)).orderBy(asc(grade.createdAt), asc(grade.id))
      ).map((row) => ({
        id: row.id,
        call_id: row.callId,
        night_id: row.nightId,
        outcome: row.outcome,
        sheet_version_id: row.sheetVersionId,
        pack: row.pack,
        window_id: row.windowId,
        proposed_mode: row.proposedMode,
        observed_mode: row.observedMode,
        mode_diff: row.modeDiff,
        no_call: row.noCall,
        agrees: row.agrees,
        stale_inputs: row.staleInputs
      }))
    : []

  const named = [...callIds.map((id) => ['call_id', id]), ...grades.map((g) => ['grade_id', g.id])]
  const ledger = named.length
    ? (
        await tx
          .select()
          .from(ledgerEntry)
          .where(
            and(
              eq(ledgerEntry.projectId, q.projectId),
              or(...named.map(([key, id]) => sql`${ledgerEntry.refs}->>${key} = ${id}`))
            )
          )
          .orderBy(asc(ledgerEntry.seq))
      ).map((row) => ({
        id: row.id,
        project_id: row.projectId,
        seq: row.seq,
        kind: row.kind as EvidencePack['ledger'][number]['kind'],
        refs: row.refs as Record<string, string>,
        body: row.body as EvidencePack['ledger'][number]['body'],
        prev_hash: row.prevHash,
        hash: row.hash,
        // As stored, milliseconds kept, so the hash can be recomputed from the pack (D11).
        at: row.at.toISOString(),
        ...(row.corrects ? { corrects: row.corrects } : {})
      }))
    : []

  return {
    project_id: q.projectId,
    window_id: q.windowId,
    readings,
    warnings,
    calls,
    approvals,
    grades,
    ledger,
    frames,
    ...(omitted.length ? { omitted_reading_ids: omitted } : {})
  }
}
