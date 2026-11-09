// #152 c-notice-templates: /v1/projects/{id}/channels[/preview,/{channel}] on the #79 §7 test database, through
// createTestApi with the real withTenant and recordAudit. Rows come from factories only (NFR-15).
import { analyticsEvent, recordAudit, withSystem, withTenant, type Tx } from '@skyclause/db'
import {
  makeBundle,
  makeCall,
  makeMember,
  makeOrganization,
  makeProject,
  makeRun,
  makeSource,
  makeUser,
  makeWindow
} from '@skyclause/db/test/factories/index'
import { memberOf } from '@skyclause/db/test/harness/index'
import { and, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, test } from 'vitest'
import { apiRequest, asApiKey, asSession, createTestApi, crossOrgCase, testDeps, testOrg } from './harness'

const ORG = 'channels-home'
const OTHER = 'channels-other'
const { v1 } = createTestApi({ deps: testDeps({ withTenant, recordAudit }) })
const admin = asSession({ org: ORG, role: 'admin' })
let orgId: string

const inOrg = <T>(fn: (tx: Tx) => Promise<T>, org = orgId) => withTenant({ orgId: org, principal: memberOf(org) }, fn)
const newProject = (org = orgId) => inOrg(async (tx) => (await makeProject(tx, { name: 'Bukit Jalil' })).id, org)
const request = (method: string, path: string, o: { query?: Record<string, string>; body?: unknown } = {}) =>
  apiRequest(v1, { as: admin, method, path, org: ORG, ...o })

type Preview = {
  channel: string
  pack: string
  mode: string | null
  language: string
  subject: string
  text: string
  html?: string
}
type PreviewResult = {
  n: 0 | 1
  call_id: string | null
  previews: Preview[]
  replay?: { label: string; source: Record<string, string>; previews: Preview[] }
}

beforeAll(async () => {
  for (const slug of [ORG, OTHER]) await makeOrganization({ id: testOrg(slug).id, slug })
  orgId = testOrg(ORG).id
})

describe('listChannels and updateChannel', () => {
  test('every channel is listed, off until switched on', async () => {
    const id = await newProject()
    const list = await request('GET', `/v1/projects/${id}/channels`)
    expect(list.status).toBe(200)
    expect(await list.json()).toEqual({
      data: [
        { channel: 'email', enabled: false },
        { channel: 'ics', enabled: false },
        { channel: 'webhook', enabled: false },
        { channel: 'in_app', enabled: false }
      ],
      next_cursor: null
    })
    const patch = await request('PATCH', `/v1/projects/${id}/channels/ics`, { body: { enabled: true } })
    expect(patch.status).toBe(200)
    expect(await patch.json()).toEqual({ channel: 'ics', enabled: true })
    const after = (await (await request('GET', `/v1/projects/${id}/channels`)).json()) as { data: unknown[] }
    expect(after.data).toContainEqual({ channel: 'ics', enabled: true })
  })

  test('switching a channel on tracks channel_connected once per switch-on', async () => {
    const id = await newProject()
    for (const enabled of [true, true, false, true]) {
      expect((await request('PATCH', `/v1/projects/${id}/channels/email`, { body: { enabled } })).status).toBe(200)
    }
    const tracked = await withSystem('test', (tx) =>
      tx
        .select({ props: analyticsEvent.props })
        .from(analyticsEvent)
        .where(and(eq(analyticsEvent.name, 'channel_connected'), eq(analyticsEvent.projectId, id)))
    )
    expect(tracked).toEqual([{ props: { channel: 'email' } }, { props: { channel: 'email' } }])
  })
})

// NTC-7: digits a preview may print, each from the stored rows below or the replay, written out by hand: the window
// 15:30–16:30 MYT on Monday 2 November 2026, approval at 15:08 MYT, the gauge 5 min old, station 0232901RF, 39.0 mm
// in 60 min to 15:00 MYT, n=0, and the safety line's 999. Permalinks are removed first (the call ID is stored too).
const TRACEABLE = new Set(['15', '30', '16', '2', '2026', '08', '5', '0232901', '39.0', '60', '00', '0', '999'])
function expectTraceable(previews: Preview[]) {
  for (const p of previews) {
    const shown = `${p.subject}\n${p.text}\n${(p.html ?? '').replace(/<[^>]*>/g, '')}`.replace(
      /https?:\/\/\S+\/c\/[\w-]+/g,
      ''
    )
    for (const number of shown.match(/\d+(\.\d+)?/g) ?? [])
      expect(TRACEABLE, `${number} in ${p.channel} ${p.language}`).toContain(number)
  }
}

describe('previewChannels (NTC-7)', () => {
  test('with a sent call, n=1 and the call rendered as it was sent', async () => {
    const approver = await makeUser()
    await makeMember({ organizationId: orgId, userId: approver.id, role: 'admin' })
    const { id, callId } = await inOrg(async (tx) => {
      const projectId = (await makeProject(tx, { name: 'Bukit Jalil' })).id
      const gauge = await makeSource(tx, { name: 'JPS gauge 0232901RF', licenceLabel: 'JPS Infobanjir' })
      const window = await makeWindow(tx, {
        projectId,
        startsAt: new Date('2026-11-02T07:30:00Z'),
        endsAt: new Date('2026-11-02T08:30:00Z')
      })
      const bundle = await makeBundle(tx, { runId: (await makeRun(tx, { projectId })).id, approvedBy: approver.id })
      const call = await makeCall(tx, {
        bundleId: bundle.id,
        windowId: window.id,
        mode: 'commute_disruption',
        state: 'sent',
        fired: [{ clause: 'storm_confirmed', inputs: ['site.rain_60m_mm'] }],
        shadow: {
          scope: { kind: 'window', id: window.id },
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
              inputs: [{ name: 'site.rain_60m_mm', value: 39, unit: 'mm', age_s: 300, source_ids: [gauge.id] }]
            }
          ],
          open_from: null
        },
        approvedAt: new Date('2026-11-02T07:08:00Z'),
        sentAt: new Date('2026-11-02T07:08:05Z')
      })
      return { id: projectId, callId: call.id }
    })
    const response = await request('GET', `/v1/projects/${id}/channels/preview`, { query: { pack: 'sky' } })
    expect(response.status).toBe(200)
    const body = (await response.json()) as PreviewResult
    expect(body).toMatchObject({ n: 1, call_id: callId })
    expect(body.replay).toBeUndefined()
    // The feed is English (D20); email previews need the call's sent wording, which #150 stores with the call.
    const ics = body.previews.find((p) => p.channel === 'ics' && p.language === 'en')!
    expect(ics).toMatchObject({
      pack: 'sky',
      mode: 'commute_disruption',
      subject: 'Commute disruption · 15:30–16:30 MYT'
    })
    expect(ics.text).toContain('Storm confirmed (gauge 5 min old)')
    expect(ics.text).toContain('Sources: JPS gauge 0232901RF (JPS Infobanjir)')
    expect(ics.text).toMatch(new RegExp(`Details: https?://[^\\s]+/c/${callId}$`))
    // D32: the public feed never prints the gauge's value (the permalink's random ID may hold any digits).
    expect(ics.text.replace(/https?:\/\/\S+/g, '')).not.toMatch(/39|mm/)
    expectTraceable(body.previews)
  })

  // The ICS feed is English (D20), so ICS previews are English only.
  test('with no sent Sky call, n=0 and the labelled 2 November replay with every other field a placeholder', async () => {
    const id = await newProject()
    const response = await request('GET', `/v1/projects/${id}/channels/preview`)
    expect(response.status).toBe(200)
    const body = (await response.json()) as PreviewResult
    expect(body).toMatchObject({
      n: 0,
      call_id: null,
      previews: [],
      replay: {
        label: 'replay',
        source: {
          station_id: '0232901RF',
          url: 'https://infobanjirjpskl.water.gov.my/Rainfall/GetRainfallGraph/75',
          captured_at: '2026-11-05T13:12:00Z',
          observed_at: '2026-11-02T07:00:00Z'
        }
      }
    })
    expect(body.replay!.previews.map((p) => [p.channel, p.language, p.mode])).toEqual([
      ['email', 'en', 'commute_disruption'],
      ['ics', 'en', 'commute_disruption'],
      ['email', 'ms', 'commute_disruption']
    ])
    for (const p of body.replay!.previews) expect(p.text).toMatch(/^(Replay|Ulangan) .* n=0/)
    expectTraceable(body.replay!.previews)
  })

  test('the replay previews the requested Sky template; Crowd with no sent call shows n=0 only', async () => {
    const id = await newProject()
    const hybrid = (await (
      await request('GET', `/v1/projects/${id}/channels/preview`, {
        query: { pack: 'sky', mode: 'hybrid_recommended', language: 'ms', channel: 'email' }
      })
    ).json()) as PreviewResult
    expect(hybrid.replay!.previews.map((p) => [p.channel, p.language, p.mode])).toEqual([
      ['email', 'ms', 'hybrid_recommended']
    ])
    expect(hybrid.replay!.previews[0]!.text).toContain('Mod pengajaran ialah keputusan pensyarah dan universiti.')
    const crowd = await request('GET', `/v1/projects/${id}/channels/preview`, { query: { pack: 'crowd' } })
    expect(await crowd.json()).toEqual({ n: 0, call_id: null, previews: [] })
  })

  test.each<Record<string, string>>([
    { pack: 'sky', mode: 'surge_night' },
    { pack: 'crowd', mode: 'hybrid_recommended' },
    { channel: 'webhook' },
    { channel: 'in_app' }
  ])('%o has no notice template: 422', async (query) => {
    const id = await newProject()
    const response = await request('GET', `/v1/projects/${id}/channels/preview`, { query })
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ type: 'https://docs.skyclause.m1ku.tech/problems/validation-failed' })
  })
})

describe('§7: every route', () => {
  const operations = [
    { operationId: 'listChannels', method: 'GET', path: (id: string) => `/v1/projects/${id}/channels` },
    { operationId: 'previewChannels', method: 'GET', path: (id: string) => `/v1/projects/${id}/channels/preview` },
    { operationId: 'updateChannel', method: 'PATCH', path: (id: string) => `/v1/projects/${id}/channels/email` }
  ]
  const body = (method: string) => (method === 'PATCH' ? { enabled: true } : undefined)

  test.each(operations)(
    '$operationId answers 404 for another organisation’s project',
    async ({ operationId, method }) => {
      const elsewhere = await newProject(testOrg(OTHER).id)
      await crossOrgCase(operationId, {
        app: v1,
        as: admin,
        org: ORG,
        params: { id: elsewhere, channel: 'email' },
        body: body(method)
      }).run()
    }
  )

  test.each(operations)('$operationId is denied below channels.manage', async ({ method, path }) => {
    const id = await newProject()
    for (const as of [
      asSession({ org: ORG, role: 'approver' }),
      asApiKey({ org: ORG, role: 'admin', scopes: ['read'] })
    ]) {
      const response = await apiRequest(v1, { as, method, path: path(id), org: ORG, body: body(method) })
      expect(response.status).toBe(403)
    }
  })
})
