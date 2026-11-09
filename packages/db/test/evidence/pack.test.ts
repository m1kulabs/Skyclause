// #159 c-evidence: the evidence pack (LED-5) on the test database. Rows come from factories; the call views are a
// double, since #150 assembles them.
import { canonicalHash } from '@skyclause/clauses'
import type { CallView } from '@skyclause/contracts'
import fc from 'fast-check'
import { afterEach, beforeAll, describe, expect, test } from 'vitest'
import { assembleEvidencePack, setEvidenceCallViews, warningInForce, withSystem, withTenant, type Tx } from '../../src'
import { evidenceCallViews } from '../../src/placeholders/c-bundle-lifecycle'
import {
  makeApproval,
  makeBundle,
  makeCall,
  makeGrade,
  makeLedgerEntry,
  makeOrganization,
  makePoll,
  makeProject,
  makeProjectSource,
  makeReading,
  makeRun,
  makeSource,
  makeWindow
} from '../factories'
import { memberOf } from '../harness'

let orgId: string
const asMember = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal: memberOf(orgId) }, fn)
const asAdapter = <T>(fn: (tx: Tx) => Promise<T>) => withSystem('evidence-test', fn)

const from = new Date('2026-11-02T06:00:00Z')
const to = new Date('2026-11-02T08:30:00Z')
const minutes = (n: number) => new Date(from.getTime() + n * 60_000)

/** A catalogue source (as `catalogue-sync` writes it) bound to `projectId`, with one good poll. */
async function boundSource(projectId: string, kind: 'jps_rain' | 'met_warning' | 'camera' = 'jps_rain') {
  const { id, pollId } = await asAdapter(async (tx) => {
    const row = await makeSource(tx, { kind, externalId: `${kind}-${crypto.randomUUID().slice(0, 8)}` })
    return { id: row.id, pollId: (await makePoll(tx, { sourceId: row.id })).id }
  })
  const role = kind === 'jps_rain' ? 'rain_gauge' : kind === 'met_warning' ? 'warnings' : 'camera'
  await asMember((tx) => makeProjectSource(tx, { projectId, sourceId: id, role }))
  return { id, pollId }
}

const rain = (sourceId: string, pollId: string | null, at: Date, value: number, extra = {}) =>
  asAdapter((tx) => makeReading(tx, { sourceId, pollId, observedAt: at, value, ...extra }))

const pack = (projectId: string, o: { windowId?: string; callId?: string } = {}) =>
  asMember((tx) =>
    assembleEvidencePack(tx, { projectId, from, to, windowId: o.windowId ?? null, callId: o.callId ?? null })
  )

beforeAll(async () => {
  orgId = (await makeOrganization()).id
})

afterEach(() => setEvidenceCallViews(evidenceCallViews))

describe('LED-5: each value in a pack resolves to a reading ID', () => {
  test('every reading ID in a pack is a reading of a source bound to the project, and none in the span is missing', async () => {
    const offset = fc.integer({ min: -60, max: 210 })
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          bound: fc.uniqueArray(offset, { maxLength: 6 }),
          other: fc.uniqueArray(offset, { maxLength: 3 }),
          frames: fc.uniqueArray(offset, { maxLength: 3 })
        }),
        async (scene) => {
          const projectId = await asMember(async (tx) => (await makeProject(tx)).id)
          const gauge = await boundSource(projectId)
          const camera = await boundSource(projectId, 'camera')
          const unbound = await asAdapter(async (tx) => (await makeSource(tx)).id)
          const stored = new Map<string, Date>()
          for (const [i, at] of scene.bound.entries()) {
            stored.set((await rain(gauge.id, gauge.pollId, minutes(at), i)).id, minutes(at))
          }
          for (const at of scene.frames) {
            const row = await rain(camera.id, camera.pollId, minutes(at), 0, {
              metric: 'flag',
              unit: null,
              value: null,
              valueJson: {
                capture_id: 'c',
                object_path: `orgs/${orgId}/frames/${at}.jpg`,
                buffered: false,
                distance_km: 2
              }
            })
            stored.set(row.id, minutes(at))
          }
          for (const at of scene.other) await rain(unbound, null, minutes(at), 9)

          const result = await pack(projectId)
          const named = [
            ...result.readings.map((r) => r.id),
            ...result.warnings.map((w) => w.reading_id),
            ...result.frames.map((f) => f.reading_id),
            ...(result.omitted_reading_ids ?? [])
          ]
          for (const id of named) expect(stored.has(id), id).toBe(true)
          const inSpan = [...stored].filter(([, at]) => at > from && at <= to).map(([id]) => id)
          expect(new Set(named)).toEqual(new Set(inSpan))
        }
      ),
      { numRuns: 40 }
    )
  }, 120_000)

  test('a reading the contract’s Reading can’t carry is named in omitted_reading_ids, not listed or dropped', async () => {
    const projectId = await asMember(async (tx) => (await makeProject(tx)).id)
    const gauge = await boundSource(projectId)
    const listed = await rain(gauge.id, gauge.pollId, minutes(5), 1.5)
    const noPoll = await rain(gauge.id, null, minutes(10), 2)
    const result = await pack(projectId)
    expect(result.readings.map((r) => r.id)).toEqual([listed.id])
    expect(result.omitted_reading_ids).toEqual([noPoll.id])
  })
})

test('readings carry their station, source URL, source time and value, latest revision only', async () => {
  const projectId = await asMember(async (tx) => (await makeProject(tx)).id)
  const gauge = await boundSource(projectId)
  await rain(gauge.id, gauge.pollId, minutes(5), 1)
  const revised = await rain(gauge.id, gauge.pollId, minutes(5), 1.5, { revision: 1 })
  const result = await pack(projectId)
  expect(result.readings).toHaveLength(1)
  expect(result.readings[0]).toMatchObject({
    id: revised.id,
    source_id: gauge.id,
    poll_id: gauge.pollId,
    station_id: expect.stringMatching(/^jps_rain-/),
    source_url: 'https://source.example.test/',
    metric: 'rain_5m_mm',
    unit: 'mm',
    value: 1.5,
    observed_at: '2026-11-02T06:05:00Z',
    revision: '1'
  })
})

describe('warnings in force (#122’s rule, SIG-4)', () => {
  const span = { from, to }
  const warning = {
    excluded: false,
    valid_from_utc: '2026-11-02T05:00:00Z',
    valid_to_utc: '2026-11-02T09:00:00Z',
    text_en: 'Thunderstorms are expected over W.P. Kuala Lumpur',
    text_bm: 'Ribut petir dijangka di W.P. Kuala Lumpur'
  }

  test.each([
    ['overlapping and naming an area term', warning, true],
    ['excluded', { ...warning, excluded: true }, false],
    ['without validity', { ...warning, valid_to_utc: null }, false],
    ['ending before the span', { ...warning, valid_to_utc: '2026-11-02T05:59:00Z' }, false],
    ['starting after the span', { ...warning, valid_from_utc: '2026-11-02T08:31:00Z' }, false],
    ['naming no area term', { ...warning, text_en: 'Over Selangor', text_bm: 'Di Selangor' }, false]
  ])('a warning %s: %s', (_name, value, inForce) => {
    expect(warningInForce(value, span, ['kuala lumpur'])).toBe(inForce)
  })

  test('the pack quotes a warning in force verbatim (Malay, with MET’s English) under its reading ID', async () => {
    const projectId = await asMember(async (tx) => (await makeProject(tx, { warningAreaTerms: ['Kuala Lumpur'] })).id)
    const met = await boundSource(projectId, 'met_warning')
    const value = (overrides = {}) => ({
      metric: 'warning',
      unit: null,
      value: null,
      valueJson: { ...warning, ...overrides }
    })
    const inForce = await rain(met.id, met.pollId, new Date('2026-11-02T04:30:00Z'), 0, value())
    await rain(met.id, met.pollId, new Date('2026-11-02T04:30:00Z'), 0, { ...value({ excluded: true }), itemKey: 'x' })
    const result = await pack(projectId)
    expect(result.warnings).toEqual([
      {
        reading_id: inForce.id,
        text: warning.text_bm,
        gloss: warning.text_en,
        valid_from: '2026-11-02T05:00:00Z',
        valid_to: '2026-11-02T09:00:00Z'
      }
    ])
    expect(result.readings).toEqual([])
  })
})

test('calls for windows overlapping the span come with their approvals, grades and ledger entries', async () => {
  const views: string[][] = []
  setEvidenceCallViews(async (_tx, ids) => {
    views.push(ids)
    return ids.map((id) => ({ id }) as CallView)
  })
  const scene = await asMember(async (tx) => {
    const projectId = (await makeProject(tx)).id
    const inside = await makeWindow(tx, { projectId, startsAt: minutes(30), endsAt: minutes(90) })
    const outside = await makeWindow(tx, { projectId, startsAt: minutes(300), endsAt: minutes(360) })
    const bundle = await makeBundle(tx, { runId: (await makeRun(tx, { projectId })).id })
    const call = await makeCall(tx, { projectId, bundleId: bundle.id, windowId: inside.id })
    await makeCall(tx, { projectId, bundleId: bundle.id, windowId: outside.id })
    const approved = await makeApproval(tx, { projectId, bundleId: bundle.id, callId: call.id, action: 'approve' })
    const graded = await makeGrade(tx, { projectId, callId: call.id, windowId: inside.id })
    const entry = await makeLedgerEntry(tx, { projectId, kind: 'call_approved', refs: { call_id: call.id }, body: {} })
    await makeLedgerEntry(tx, { projectId, kind: 'grade', refs: { grade_id: graded.id }, body: {} })
    return { projectId, call, approved, graded, entry }
  })
  const result = await pack(scene.projectId)
  expect(views).toEqual([[scene.call.id]])
  expect(result.calls).toEqual([{ id: scene.call.id }])
  expect(result.approvals).toEqual([
    {
      id: scene.approved.id,
      call_id: scene.call.id,
      approved_by: scene.approved.actorId,
      approved_at: expect.any(String)
    }
  ])
  expect(result.grades.map((g) => g.id)).toEqual([scene.graded.id])
  expect(result.ledger.map((l) => l.kind)).toEqual(['call_approved', 'grade'])
  expect(result.ledger[0]).toMatchObject({ id: scene.entry.id, refs: { call_id: scene.call.id } })
})

test('a span without calls never asks for call views, and the same rows give the same pack and hash', async () => {
  const projectId = await asMember(async (tx) => (await makeProject(tx)).id)
  const gauge = await boundSource(projectId)
  await rain(gauge.id, gauge.pollId, minutes(5), 1)
  // The placeholder throws not-built; a span with no calls never reaches it.
  const first = await pack(projectId)
  const second = await pack(projectId)
  expect(first.calls).toEqual([])
  expect(canonicalHash(second)).toBe(canonicalHash(first))
})
