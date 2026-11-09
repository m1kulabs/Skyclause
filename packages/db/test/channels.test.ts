// #152 c-notice-templates: the channel and notice reads behind /v1/projects/{id}/channels and LOC-4, on the test
// database. Rows come from factories only (NFR-15).
import { beforeAll, describe, expect, test } from 'vitest'
import {
  channelProject,
  latestSentCall,
  listProjectChannels,
  memberReadsMalay,
  recipientsByLanguage,
  setProjectChannel,
  withTenant,
  type Tx
} from '../src'
import {
  makeBundle,
  makeCall,
  makeMember,
  makeNight,
  makeNotice,
  makeOrganization,
  makeProject,
  makeRun,
  makeSource,
  makeSubscriber,
  makeUser,
  makeWindow
} from './factories'
import { memberOf } from './harness'

let orgId: string
let otherOrgId: string
const inOrg = <T>(fn: (tx: Tx) => Promise<T>, org = orgId) => withTenant({ orgId: org, principal: memberOf(org) }, fn)

beforeAll(async () => {
  orgId = (await makeOrganization()).id
  otherOrgId = (await makeOrganization()).id
})

const shadowCiting = (sourceIds: string[]) => ({
  scope: { kind: 'window', id: null },
  pack: 'sky',
  mode: 'commute_disruption',
  watch: false,
  no_call: null,
  recommendations: [],
  clauses: [
    {
      key: 'storm_confirmed',
      result: 'fired',
      blocked_by: [],
      inputs: [{ name: 'site.rain_60m_mm', source_ids: sourceIds }]
    }
  ],
  open_from: null
})

describe('LOC-4: recipientsByLanguage', () => {
  test("counts each subscriber of the call's notices once, by the language it was sent in", async () => {
    const counts = await inOrg(async (tx) => {
      const projectId = (await makeProject(tx)).id
      const call = await makeCall(tx, {
        bundleId: (await makeBundle(tx, { runId: (await makeRun(tx, { projectId })).id })).id
      })
      const other = await makeCall(tx, { bundleId: call.bundleId })
      const [en1, en2, ms, fellBack] = [
        await makeSubscriber(tx, { projectId, language: 'en' }),
        await makeSubscriber(tx, { projectId, language: 'en' }),
        await makeSubscriber(tx, { projectId, language: 'ms' }),
        await makeSubscriber(tx, { projectId, language: 'ms' })
      ]
      const notice = (subscriberId: string, language: string, o: Parameters<typeof makeNotice>[1] = {}) =>
        makeNotice(tx, { projectId, callId: call.id, subscriberId, language, ...o })
      await notice(en1!.id, 'en')
      await notice(en1!.id, 'en', { channel: 'push' })
      await notice(en2!.id, 'en')
      await notice(ms!.id, 'ms')
      // LOC-5: no Malay-reading approver, so this Malay subscriber's notice went in English.
      await notice(fellBack!.id, 'en')
      // Neither another call's notice nor a non-call notice counts.
      await makeNotice(tx, { projectId, callId: other.id, subscriberId: ms!.id, language: 'ms' })
      await makeNotice(tx, { projectId, callId: call.id, subscriberId: ms!.id, language: 'ms', kind: 'feedback' })
      return recipientsByLanguage(tx, call.id)
    })
    expect(counts).toEqual({ en: 3, ms: 1 })
  })
})

describe('latestSentCall', () => {
  test('the newest sent call of the pack and mode, with its span, approver role and cited sources', async () => {
    const approver = await makeUser()
    await makeMember({ organizationId: orgId, userId: approver.id, role: 'admin' })
    const made = await inOrg(async (tx) => {
      const projectId = (await makeProject(tx)).id
      const gauge = await makeSource(tx, { name: 'JPS gauge 0232901RF', licenceLabel: 'JPS Infobanjir' })
      const window = await makeWindow(tx, {
        projectId,
        startsAt: new Date('2026-11-02T07:30:00Z'),
        endsAt: new Date('2026-11-02T08:30:00Z')
      })
      const sky = await makeBundle(tx, { runId: (await makeRun(tx, { projectId })).id, approvedBy: approver.id })
      const sent = (sentAt: string, o: Parameters<typeof makeCall>[1] = {}) =>
        makeCall(tx, {
          bundleId: sky.id,
          windowId: window.id,
          state: 'sent',
          sentAt: new Date(sentAt),
          shadow: shadowCiting([gauge.id]),
          ...o
        })
      const older = await sent('2026-11-02T07:08:05Z', { mode: 'commute_disruption' })
      const newer = await sent('2026-11-03T07:08:05Z', { mode: 'hybrid_recommended' })
      await makeCall(tx, { bundleId: sky.id, mode: 'commute_disruption', state: 'approved' })
      const night = await makeNight(tx, {
        projectId,
        arrivalStart: new Date('2026-11-14T10:00:00Z'),
        exitEnd: new Date('2026-11-14T15:30:00Z')
      })
      const crowd = await makeBundle(tx, { runId: (await makeRun(tx, { projectId, pack: 'crowd' })).id, pack: 'crowd' })
      const surge = await makeCall(tx, {
        bundleId: crowd.id,
        nightId: night.id,
        mode: 'surge_night',
        state: 'sent',
        sentAt: new Date('2026-11-01T07:00:00Z')
      })
      return { projectId, older, newer, surge }
    })
    const latest = (q: { pack?: 'sky' | 'crowd'; mode?: 'commute_disruption' | 'surge_night' | 'normal' } = {}) =>
      inOrg((tx) => latestSentCall(tx, { projectId: made.projectId, ...q }))

    expect((await latest())?.call.id).toBe(made.newer.id)
    expect(await latest({ pack: 'sky', mode: 'commute_disruption' })).toMatchObject({
      call: { id: made.older.id },
      pack: 'sky',
      window: { startsAt: new Date('2026-11-02T07:30:00Z'), endsAt: new Date('2026-11-02T08:30:00Z') },
      approverRole: 'admin',
      sources: [{ name: 'JPS gauge 0232901RF', licence: 'JPS Infobanjir' }]
    })
    expect(await latest({ pack: 'crowd' })).toMatchObject({
      call: { id: made.surge.id },
      pack: 'crowd',
      window: { startsAt: new Date('2026-11-14T10:00:00Z'), endsAt: new Date('2026-11-14T15:30:00Z') },
      approverRole: null,
      sources: []
    })
    expect(await latest({ mode: 'normal' })).toBeNull()
  })
})

describe('project channels', () => {
  test('setProjectChannel upserts and reports the switch before and after', async () => {
    const projectId = await inOrg(async (tx) => (await makeProject(tx)).id)
    const set = (enabled: boolean) => inOrg((tx) => setProjectChannel(tx, { projectId, channel: 'ics', enabled }))
    expect(await set(true)).toEqual({ before: null, after: true })
    expect(await set(false)).toEqual({ before: true, after: false })
    expect(await inOrg((tx) => listProjectChannels(tx, projectId))).toEqual([{ channel: 'ics', enabled: false }])
  })

  test('channelProject names a project of the organisation, never another', async () => {
    const mine = await inOrg((tx) => makeProject(tx, { name: 'Bukit Jalil' }))
    const theirs = await inOrg((tx) => makeProject(tx), otherOrgId)
    expect(await inOrg((tx) => channelProject(tx, mine.id))).toEqual({ id: mine.id, name: 'Bukit Jalil' })
    expect(await inOrg((tx) => channelProject(tx, theirs.id))).toBeNull()
  })
})

test("memberReadsMalay reads the member's flag in the transaction's organisation", async () => {
  const reader = await makeUser()
  const other = await makeUser()
  const stranger = await makeUser()
  await makeMember({ organizationId: orgId, userId: reader.id, role: 'approver', readsMalay: true })
  await makeMember({ organizationId: orgId, userId: other.id, role: 'approver' })
  await makeMember({ organizationId: otherOrgId, userId: other.id, role: 'approver', readsMalay: true })
  expect(await inOrg((tx) => memberReadsMalay(tx, reader.id))).toBe(true)
  expect(await inOrg((tx) => memberReadsMalay(tx, other.id))).toBe(false)
  expect(await inOrg((tx) => memberReadsMalay(tx, stranger.id))).toBe(false)
})
