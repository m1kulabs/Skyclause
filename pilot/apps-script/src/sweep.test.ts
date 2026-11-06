// Tests for the #62 sweeper: CAL-10, LED-1, CAL-12 and CAL-3 run against fakes; live checks stay human.
import { createHash } from 'node:crypto'
import { describe, expect, test } from 'bun:test'
import {
  weekdayMorningDate,
  checkNoticeNumbers,
  crossingBody,
  crossingSubject,
  formatDelayLine,
  parseCrossingFile,
  runSweep,
  verifyLedgerChain,
  type CrossingFile,
  type RawFile,
  type SentMessage,
  type SweepPorts
} from './sweep.ts'
import type { Row } from './schema.ts'

const sha256Hex = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')

const TEAM = ['team-a@example.com', 'team-b@example.com']
const SNAPSHOT = '2026-11-02T15:05:00+08:00'
const CALL_ID = 'B-crossing-20261102-1505-W-0001'
const SUBJECT = 'Commute disruption: commute wave 15:30–15:30, Mon 2 Nov (Skyclause pilot)'
const BODY =
  'Commute disruption for commute wave 15:30–15:30, Monday 2 November 2026.\n' +
  'Why: Storm confirmed. Gauge 0232901RF logged 39.0 mm in 60 min, Lebat. Gauge 5 min old when drafted.\n' +
  'What it means: Storm confirmed at the JPS gauge (Lebat class)\n' +
  'Approved by the approver on duty at 15:19 MYT. Details: https://example.com/event?eid=1\n' +
  'Skyclause is not a safety or emergency service. In an emergency, call 999.\n' +
  'Not affiliated with APU, KPT, JPS, MET, DOE, Prasarana/Rapid KL or the stadium.\n' +
  'Reply "unsubscribe" to stop these notices.'

function crossingText(overrides?: { replay?: boolean; to?: string }): string {
  return JSON.stringify({
    crossing_id: 'X-20261102-1505-01',
    pack: 'sky',
    replay: overrides?.replay ?? false,
    t_eval: '2026-11-02T15:05:00+08:00',
    snapshot_id: SNAPSHOT,
    changes: [
      {
        scope: 'W-0001',
        window: { kind: 'commute_wave', date: '2026-11-02', start_myt: '15:30', end_myt: '15:30' },
        from: 'normal',
        to: overrides?.to ?? 'commute_disruption',
        fired: ['storm_confirmed'],
        blocked: [],
        inputs: [
          {
            name: 'w.rain_max_60m_mm',
            value: 39,
            unit: 'mm',
            source_id: '0232901RF',
            observed_at: '2026-11-02T15:00:00+08:00',
            age_min: 5,
            state: 'fresh'
          }
        ]
      }
    ]
  })
}

function callRow(overrides?: Partial<Row<'ledger'>>): Row<'ledger'> {
  return {
    entry_id: `${CALL_ID}:call_approved`,
    kind: 'call_approved',
    pack: 'sky',
    bundle_id: 'B-crossing-20261102-1505',
    call_id: CALL_ID,
    'window_id or night_id': 'W-0001',
    trigger: 'crossing',
    source_ref: 'X-20261102-1505-01',
    mode: 'commute_disruption',
    fired: JSON.stringify([{ clause: 'storm_confirmed', inputs: ['w.rain_max_60m_mm'] }]),
    agrees: 'Y',
    snapshot_id: SNAPSHOT,
    crossing_at: '2026-11-02T15:05:00+08:00',
    drafted_at: '2026-11-02T15:12:00+08:00',
    calendar_event_url: 'https://example.com/event?eid=1',
    body: JSON.stringify({
      mode: 'commute_disruption',
      recipients: ['S-1'],
      notice: { language: 'en', subject: SUBJECT, body: BODY }
    }),
    ...overrides
  }
}

interface Fake {
  ports: SweepPorts
  notifications: Row<'notifications'>[]
  ledger: Row<'ledger'>[]
  sentMails: { to: string[]; subject: string; body: string }[]
  fills: { rowIndex: number; cells: { sent_at: string; recorded_at: string; hash: string } }[]
  calendarAppends: { url: string; line: string }[]
  descriptions: Record<string, string>
}

function fake(options?: {
  now?: string
  sky?: RawFile[]
  rota?: Row<'rota'>[]
  ledger?: Row<'ledger'>[]
  indicators?: Row<'indicators'>[]
  windows?: Row<'windows'>[]
  shadow?: Row<'shadow'>[]
  sent?: SentMessage[]
  versions?: Row<'clause_versions'>[]
  replay?: RawFile[]
  descriptions?: Record<string, string>
}): Fake {
  const notifications: Row<'notifications'>[] = []
  const ledger: Row<'ledger'>[] = options?.ledger ?? []
  const sentMails: Fake['sentMails'] = []
  const fills: Fake['fills'] = []
  const calendarAppends: Fake['calendarAppends'] = []
  const descriptions: Record<string, string> = options?.descriptions ?? {}
  let mail = 0
  const ports: SweepPorts = {
    now: () => new Date(options?.now ?? '2026-11-02T15:20:00+08:00'),
    sha256Hex,
    skyFiles: () => options?.sky ?? [],
    crowdFiles: () => [],
    replayFiles: () => options?.replay ?? [],
    rota: () =>
      options?.rota ?? [
        { date: '2026-11-02', start: '14:00', end: '19:15', approver: 'A. Approver', email: 'approver@example.com' }
      ],
    notifications: () => [...notifications],
    ledger: () => ledger,
    indicators: () =>
      options?.indicators ?? [
        {
          snapshot_id: SNAPSHOT,
          scope: 'W-0001',
          name: 'w.rain_max_60m_mm',
          value: 39,
          unit: 'mm',
          observed_at: '2026-11-02T15:00:00+08:00',
          age_min: 5,
          state: 'fresh'
        }
      ],
    clauseVersions: () =>
      options?.versions ?? [
        {
          version_n: 3,
          saved_at: '2026-11-01T00:00:00+08:00',
          editor: 'owner@example.com',
          content_hash: 'abc',
          content_json: JSON.stringify({ clauses: [{ key: 'storm_confirmed', threshold: 31 }] })
        }
      ],
    windows: () =>
      options?.windows ?? [
        {
          window_id: 'W-0001',
          subscriber_id: 'S-1',
          kind: 'commute_wave',
          date: '2026-11-02',
          start_myt: '15:30',
          end_myt: '15:30',
          language: 'en',
          status: 'active'
        }
      ],
    shadow: () => options?.shadow ?? [],
    sent: () => options?.sent ?? [{ subject: SUBJECT, date: '2026-11-02T15:19:00+08:00' }],
    calendarDescription: (url) => (url in descriptions ? (descriptions[url] ?? '') : null),
    teamAlertEmails: () => [...TEAM],
    sendMail: (to, subject, body) => {
      mail += 1
      sentMails.push({ to, subject, body })
      return `msg-${mail}`
    },
    appendNotification: (row) => {
      notifications.push(row)
    },
    fillLedger: (rowIndex, cells) => {
      fills.push({ rowIndex, cells })
    },
    appendCalendarDescription: (url, line) => {
      descriptions[url] = descriptions[url] ? `${descriptions[url]}\n${line}` : line
      calendarAppends.push({ url, line })
    }
  }
  return { ports, notifications, ledger, sentMails, fills, calendarAppends, descriptions }
}

const skyFile = (text: string): RawFile[] => [{ id: 'file-1', name: 'crossing-20261102-1505-01.json', text }]

describe('CAL-10 crossing notifications', () => {
  test('a new crossing file gives one notifications row, and a second sweep adds none', () => {
    const harness = fake({ sky: skyFile(crossingText()) })
    const first = runSweep(harness.ports)
    expect(first.crossingsNotified).toEqual(['X-20261102-1505-01'])
    expect(harness.notifications).toHaveLength(1)
    expect(harness.notifications[0]).toEqual({
      at: '2026-11-02T15:20:00+08:00',
      kind: 'crossing',
      to: 'approver@example.com',
      ref: 'X-20261102-1505-01',
      gmail_message_id: 'msg-1'
    })
    expect(harness.sentMails[0]?.to).toEqual(['approver@example.com'])

    const second = runSweep(harness.ports)
    expect(second.crossingsNotified).toEqual([])
    expect(harness.notifications).toHaveLength(1)
  })

  test('the body lists the crossing ID and time and each change, and ends with the Runs-tab line', () => {
    const file = parseCrossingFile({ id: 'file-1', name: 'crossing.json', text: crossingText() }) as CrossingFile
    expect(crossingSubject(file)).toBe('Needs review: X-20261102-1505-01 at 15:05 (Skyclause pilot)')
    const body = crossingBody(file)
    expect(body).toContain('Crossing X-20261102-1505-01 at 2026-11-02T15:05:00+08:00 needs review.')
    expect(body).toContain('W-0001: normal → commute_disruption')
    expect(body).toContain('Fired: storm_confirmed')
    expect(body).toContain('w.rain_max_60m_mm 39 mm, from 0232901RF, 5 min old, fresh')
    expect(body.endsWith('Needs Review is expected in the Runs tab in about 5–10 minutes. Approve only there.')).toBe(
      true
    )
  })

  test('replays, all-Normal files and already-logged files are skipped, and nobody on duty falls back to the team', () => {
    const logged: Row<'notifications'>[] = [
      {
        at: '2026-11-02T15:10:00+08:00',
        kind: 'crossing',
        to: 'approver@example.com',
        ref: 'X-20261102-1505-01',
        gmail_message_id: 'msg-0'
      }
    ]
    const replay = fake({ sky: skyFile(crossingText({ replay: true })) })
    expect(runSweep(replay.ports).crossingsNotified).toEqual([])
    expect(replay.notifications).toHaveLength(0)

    const normal = fake({ sky: skyFile(crossingText({ to: 'normal' })) })
    expect(runSweep(normal.ports).crossingsNotified).toEqual([])
    expect(normal.notifications).toHaveLength(0)

    const seen = fake({ sky: skyFile(crossingText()) })
    seen.notifications.push(...logged)
    expect(runSweep(seen.ports).crossingsNotified).toEqual([])
    expect(seen.notifications).toHaveLength(1)

    const fallback = fake({ sky: skyFile(crossingText()), rota: [] })
    expect(runSweep(fallback.ports).crossingsNotified).toEqual(['X-20261102-1505-01'])
    expect(fallback.notifications[0]?.to).toEqual(TEAM.join(', '))
  })
})

describe('LED-1 sealing', () => {
  function sealedLedger(): Row<'ledger'>[] {
    return [
      { entry_id: 'v3:clause_version', kind: 'clause_version', pack: 'sky', snapshot_id: SNAPSHOT },
      callRow(),
      {
        ...callRow(),
        entry_id: `${CALL_ID}:notice_sent:S-1`,
        kind: 'notice_sent',
        calendar_event_url: '',
        body: JSON.stringify({ language: 'en', subject: SUBJECT, body: BODY })
      }
    ]
  }

  test('fills only the blank cells in sheet order, then verify passes on the untouched chain', () => {
    const harness = fake({ ledger: sealedLedger() })
    const result = runSweep(harness.ports)
    expect(result.sealed).toEqual([2, 3, 4])
    expect(result.waiting).toEqual([])
    expect(harness.fills).toHaveLength(3)
    for (const fill of harness.fills) {
      expect(fill.cells.recorded_at).toBe('2026-11-02T15:20:00+08:00')
      expect(fill.cells.hash).toMatch(/^[0-9a-f]{64}$/)
    }
    expect(harness.fills[1]?.cells.sent_at).toBe('2026-11-02T15:19:00+08:00')
    expect(harness.fills[0]?.cells.sent_at).toBe('')
    expect(verifyLedgerChain(harness.ledger, sha256Hex)).toEqual({ ok: true })
  })

  test('never touches a sealed row, and verify names the row after one cell is edited', () => {
    const harness = fake({ ledger: sealedLedger() })
    runSweep(harness.ports)
    expect(verifyLedgerChain(harness.ledger, sha256Hex)).toEqual({ ok: true })

    const fillsBefore = harness.fills.length
    const rerun = runSweep(harness.ports)
    expect(rerun.sealed).toEqual([])
    expect(harness.fills).toHaveLength(fillsBefore)

    const edited = harness.ledger.map((row) => ({ ...row }))
    const target = edited[1]
    if (!target) throw new Error('the call row is missing')
    edited[1] = { ...target, mode: 'normal' }
    expect(verifyLedgerChain(edited, sha256Hex)).toEqual({ ok: false, row: 3, entry_id: `${CALL_ID}:call_approved` })
  })

  test('a sent call stays unsealed until the message is found, then seals with sent_at blank after 30 minutes', () => {
    const pending = fake({ now: '2026-11-02T15:20:00+08:00', ledger: [callRow()], sent: [] })
    const first = runSweep(pending.ports)
    expect(first.waiting).toEqual([2])
    expect(first.sealed).toEqual([])
    expect(pending.fills).toHaveLength(0)

    const late = fake({ now: '2026-11-02T15:36:00+08:00', ledger: [callRow()], sent: [] })
    const second = runSweep(late.ports)
    expect(second.waiting).toEqual([])
    expect(second.sealed).toEqual([2])
    expect(late.fills[0]?.cells.sent_at).toBe('')
    expect(verifyLedgerChain(late.ledger, sha256Hex)).toEqual({ ok: true })
  })
})

describe('CAL-12 delay line', () => {
  test('formats the four times with the minutes between them', () => {
    expect(
      formatDelayLine({
        trigger: 'crossing',
        crossingAt: '2026-11-02T15:05:00+08:00',
        draftedAt: '2026-11-02T15:12:00+08:00',
        approvedAt: '2026-11-02T15:18:00+08:00',
        sentAt: '2026-11-02T15:19:00+08:00'
      })
    ).toBe('Crossing 15:05 · drafted 15:12 (+7 min) · approved 15:18 (+6 min) · sent 15:19 (+1 min)')
  })

  test('reads Trigger for schedule runs, and a blank time prints — with no minutes beside it', () => {
    expect(
      formatDelayLine({
        trigger: 'schedule',
        snapshotId: '2026-11-09T06:45:00+08:00',
        draftedAt: '',
        approvedAt: '2026-11-09T07:02:00+08:00',
        sentAt: ''
      })
    ).toBe('Trigger 06:45 · drafted — · approved 07:02 (+17 min) · sent —')
  })

  test('the line is appended once to the call entry', () => {
    const harness = fake({
      now: '2026-11-02T15:19:30+08:00',
      ledger: [callRow()],
      descriptions: { 'https://example.com/event?eid=1': '' }
    })
    runSweep(harness.ports)
    expect(harness.calendarAppends).toHaveLength(1)
    expect(harness.calendarAppends[0]?.line).toBe(
      'Crossing 15:05 · drafted 15:12 (+7 min) · approved 15:19 (+8 min) · sent 15:19 (+0 min)'
    )
    runSweep(harness.ports)
    expect(harness.calendarAppends).toHaveLength(1)
  })
})

describe('CAL-3 post-check', () => {
  test.each([2, ' 2 '])('a live crossing pins version %s saved after its snapshot', (pin) => {
    const versions: Row<'clause_versions'>[] = [
      { version_n: 1, saved_at: '2026-11-02T14:00:00+08:00', content_json: '{"threshold":71}' },
      { version_n: '2', saved_at: '2026-11-02T15:05:10+08:00', content_json: '{"threshold":83}' }
    ]
    const originalVersions = structuredClone(versions)
    const text = JSON.stringify({ ...JSON.parse(crossingText()), clause_version: pin })
    for (const [number, expected] of [
      [83, []],
      [71, [{ callId: CALL_ID, number: 71, line: 'Threshold 71' }]]
    ] as const) {
      const harness = fake({
        sky: skyFile(text),
        versions,
        ledger: [callRow({ body: JSON.stringify({ subject: SUBJECT, body: `Threshold ${number}` }) })]
      })
      expect(runSweep(harness.ports).mismatches).toEqual([...expected])
      expect(harness.ledger[0]?.snapshot_id).toBe(SNAPSHOT)
    }
    expect(versions).toEqual(originalVersions)
  })

  test.each([undefined, null])('legacy live pin %s retains timestamp version selection', (pin) => {
    const harness = fake({
      sky: skyFile(JSON.stringify({ ...JSON.parse(crossingText()), clause_version: pin })),
      versions: [
        { version_n: 1, saved_at: '2026-11-02T14:00:00+08:00', content_json: '{"threshold":71}' },
        { version_n: 2, saved_at: '2026-11-02T15:05:10+08:00', content_json: '{"threshold":83}' }
      ],
      ledger: [callRow({ body: JSON.stringify({ subject: SUBJECT, body: 'Threshold 71' }) })]
    })
    expect(runSweep(harness.ports).mismatches).toEqual([])
  })

  test.each(['', 'wrong', 0, -1, 1.5, 'Infinity', 999, false, {}])(
    'invalid or unresolved live pin %j never falls back',
    (pin) => {
      const harness = fake({
        sky: skyFile(JSON.stringify({ ...JSON.parse(crossingText()), clause_version: pin })),
        ledger: [callRow({ body: JSON.stringify({ subject: SUBJECT, body: 'Threshold 31' }) })]
      })
      expect(runSweep(harness.ports).mismatches).toEqual([{ callId: CALL_ID, number: 31, line: 'Threshold 31' }])
    }
  )

  test.each(['schedule', 'request'])('an unassociated %s call retains timestamp version selection', (trigger) => {
    const harness = fake({
      sky: skyFile(JSON.stringify({ ...JSON.parse(crossingText()), clause_version: 2 })),
      versions: [
        { version_n: 1, saved_at: '2026-11-02T14:00:00+08:00', content_json: '{"threshold":71}' },
        { version_n: 2, saved_at: '2026-11-02T15:05:10+08:00', content_json: '{"threshold":83}' }
      ],
      ledger: [
        callRow({ trigger, source_ref: 'scheduled', body: JSON.stringify({ subject: SUBJECT, body: 'Threshold 71' }) })
      ]
    })
    expect(runSweep(harness.ports).mismatches).toEqual([])
  })

  test.each([31, 180, 150, 3, 42, 43])('schema threshold cells authorize %s', (number) => {
    const harness = fake({
      versions: [
        {
          version_n: 1,
          saved_at: SNAPSHOT,
          content_json: JSON.stringify({
            clauses: [
              { key: 'storm_confirmed', threshold: ' 31 ' },
              { key: 'haze', threshold: '{"api_max":180,"api_0600":"150","days":3}' },
              { key: 'other', threshold: '[42,"43"]' }
            ]
          })
        }
      ],
      ledger: [callRow({ body: JSON.stringify({ subject: SUBJECT, body: `Threshold ${number}` }) })]
    })
    expect(runSweep(harness.ports).mismatches).toEqual([])
  })

  test.each([71, 72, 73, 74, 75, 76])('prose, IDs and malformed threshold cells cannot authorize %s', (number) => {
    const harness = fake({
      versions: [
        {
          version_n: 1,
          saved_at: SNAPSHOT,
          content_json: JSON.stringify({
            clauses: [
              { key: 'clause-71', wording_en: '72 mm', metadata: '{"threshold":73}', count: 74 },
              { threshold: '75 mm' },
              { threshold: '{"broken":76' },
              { threshold: '' },
              { threshold: ' ' },
              { threshold: true },
              { threshold: null },
              { threshold: 'Infinity' },
              { threshold: '"77"' }
            ]
          })
        }
      ],
      ledger: [callRow({ body: JSON.stringify({ subject: SUBJECT, body: `Threshold ${number}` }) })]
    })
    expect(runSweep(harness.ports).mismatches).toEqual([{ callId: CALL_ID, number, line: `Threshold ${number}` }])
  })

  test('the 2 November wording passes against the replay snapshot, and 39.5 fails naming that number', () => {
    const passing = fake({ ledger: [callRow()] })
    const first = runSweep(passing.ports)
    expect(first.mismatches).toEqual([])

    const tampered = BODY.replace('39.0 mm', '39.5 mm')
    const failing = fake({
      ledger: [
        callRow({
          body: JSON.stringify({
            mode: 'commute_disruption',
            recipients: ['S-1'],
            notice: { language: 'en', subject: SUBJECT, body: tampered }
          })
        })
      ]
    })
    const second = runSweep(failing.ports)
    expect(second.mismatches).toEqual([
      { callId: CALL_ID, number: 39.5, line: expect.stringContaining('39.5 mm') as string }
    ])
    expect(failing.notifications).toHaveLength(1)
    expect(failing.notifications[0]).toMatchObject({ kind: 'cal3_mismatch', to: TEAM.join(', '), ref: CALL_ID })
    expect(failing.sentMails[0]?.to).toEqual(TEAM)
    expect(failing.sentMails[0]?.body).toContain('39.5')

    const third = runSweep(failing.ports)
    expect(third.mismatches).toEqual([])
    expect(failing.sentMails).toHaveLength(1)
  })

  test.each([
    ['corrupt', '{'],
    ['wrong pack', JSON.stringify({ ...JSON.parse(crossingText()), pack: 'crowd' })],
    ['wrong scope', JSON.stringify({ ...JSON.parse(crossingText()), changes: [{ scope: 'W-other' }] })],
    ['wrong snapshot', JSON.stringify({ ...JSON.parse(crossingText()), snapshot_id: '2026-11-02T14:00:00+08:00' })]
  ])('recognized replay with %s content cannot use live evidence', (_case, text) => {
    const harness = fake({
      replay: [{ id: 'r1', name: 'replay.json', text }],
      versions: [{ version_n: 1, saved_at: SNAPSHOT, content_json: '{"threshold":77}' }],
      now: '2026-11-02T16:00:00+08:00',
      ledger: [
        callRow({ source_ref: 'replay.json', body: JSON.stringify({ subject: 'Notice', body: 'Threshold 77' }) })
      ]
    })
    expect(runSweep(harness.ports).mismatches).toEqual([{ callId: CALL_ID, number: 77, line: 'Threshold 77' }])
    expect(harness.notifications).toEqual([expect.objectContaining({ kind: 'cal3_mismatch', ref: CALL_ID })])
    expect(harness.sentMails[0]?.body).toContain('Number: 77')
    expect(runSweep(harness.ports).mismatches).toEqual([])
    expect(harness.sentMails).toHaveLength(1)
  })

  test('a recognized malformed replay with no checkable numbers seals without inventing a mismatch', () => {
    const harness = fake({
      replay: [{ id: 'r1', name: 'replay.json', text: '{' }],
      ledger: [
        callRow({
          source_ref: 'replay.json',
          body: JSON.stringify({ subject: 'Notice', body: 'Disruption confirmed' })
        })
      ],
      now: '2026-11-02T16:00:00+08:00'
    })
    const result = runSweep(harness.ports)
    expect(result.sealed).toEqual([2])
    expect(result.mismatches).toEqual([])
  })

  test.each([31, 47, 77])('legacy replay cannot obtain %s from live versions, windows or indicators', (number) => {
    const harness = fake({
      replay: [{ id: 'r1', name: 'replay.json', text: crossingText() }],
      windows: [{ window_id: 'W-0001', start_myt: '15:47' }],
      indicators: [{ snapshot_id: SNAPSHOT, scope: 'W-0001', value: 77 }],
      ledger: [
        callRow({ source_ref: 'replay.json', body: JSON.stringify({ subject: SUBJECT, body: `Evidence ${number}` }) })
      ]
    })
    expect(runSweep(harness.ports).mismatches).toEqual([{ callId: CALL_ID, number, line: `Evidence ${number}` }])
  })

  test('verified replay clause bytes authorize thresholds independently of changing live evidence', () => {
    const content = JSON.stringify({ clauses: [{ key: 'haze', threshold: '{"api_max":180}' }] })
    const text = JSON.stringify({
      ...JSON.parse(crossingText({ replay: true })),
      clause_version: `replay:${sha256Hex(content)}`,
      replay_clause_content_json: content
    })
    for (const liveThreshold of [71, 83]) {
      const harness = fake({
        replay: [{ id: 'r1', name: 'replay.json', text }],
        versions: [{ version_n: 1, saved_at: SNAPSHOT, content_json: JSON.stringify({ threshold: liveThreshold }) }],
        indicators: [{ snapshot_id: SNAPSHOT, scope: 'W-0001', value: liveThreshold }],
        windows: [{ window_id: 'W-0001', start_myt: `15:${liveThreshold}` }],
        ledger: [
          callRow({
            source_ref: 'replay.json',
            body: JSON.stringify({ subject: SUBJECT, body: `${BODY}\nThreshold 180` })
          })
        ]
      })
      expect(runSweep(harness.ports).mismatches).toEqual([])
    }
  })

  test.each([
    ['missing context', { clause_version: `replay:${sha256Hex('{"threshold":83}')}` }],
    [
      'nonstring context',
      { clause_version: `replay:${sha256Hex('{"threshold":83}')}`, replay_clause_content_json: { threshold: 83 } }
    ],
    ['missing pin', { replay_clause_content_json: '{"threshold":83}' }],
    ['malformed pin', { clause_version: 'replay:invalid', replay_clause_content_json: '{"threshold":83}' }],
    [
      'uppercase pin',
      {
        clause_version: `replay:${sha256Hex('{"threshold":83}').toUpperCase()}`,
        replay_clause_content_json: '{"threshold":83}'
      }
    ],
    [
      'different bytes',
      { clause_version: `replay:${sha256Hex('{"threshold":83}')}`, replay_clause_content_json: ' {"threshold":83}' }
    ],
    [
      'invalid JSON',
      { clause_version: `replay:${sha256Hex('{"threshold":83')}`, replay_clause_content_json: '{"threshold":83' }
    ]
  ])('replay with %s retains trace numbers but grants no thresholds', (_case, metadata) => {
    const text = JSON.stringify({ ...JSON.parse(crossingText()), ...metadata })
    for (const includeThreshold of [false, true]) {
      const harness = fake({
        replay: [{ id: 'r1', name: 'replay.json', text }],
        versions: [{ version_n: 1, saved_at: SNAPSHOT, content_json: '{"threshold":83}' }],
        ledger: [
          callRow({
            source_ref: 'replay.json',
            body: JSON.stringify({ subject: SUBJECT, body: `${BODY}${includeThreshold ? '\nThreshold 83' : ''}` })
          })
        ]
      })
      expect(runSweep(harness.ports).mismatches).toEqual(
        includeThreshold ? [{ callId: CALL_ID, number: 83, line: 'Threshold 83' }] : []
      )
    }
  })

  test('replay filenames route exactly when live and replay files share an X-ID', () => {
    const live = JSON.stringify({ ...JSON.parse(crossingText()), clause_version: 3 })
    const replay = JSON.stringify({
      ...JSON.parse(crossingText({ replay: true })),
      changes: [{ scope: 'W-0001', inputs: [{ name: 'rain', value: 83 }] }]
    })
    for (const [source_ref, number] of [
      ['X-20261102-1505-01', 31],
      ['replay.json', 83]
    ] as const) {
      const harness = fake({
        sky: skyFile(live),
        replay: [{ id: 'r1', name: 'replay.json', text: replay }],
        ledger: [callRow({ source_ref, body: JSON.stringify({ subject: 'Notice', body: `Value ${number}` }) })],
        now: '2026-11-02T16:00:00+08:00'
      })
      expect(runSweep(harness.ports).mismatches).toEqual([])
      expect(harness.ledger[0]?.source_ref).toBe(source_ref)
    }
  })

  test('replay site inputs are allowed without borrowing inputs from another window', () => {
    const text = JSON.stringify({
      ...JSON.parse(crossingText()),
      changes: [
        { scope: 'site', inputs: [{ name: 'site.api', value: 83 }] },
        { scope: 'W-other', inputs: [{ name: 'rain', value: 71 }] }
      ]
    })
    for (const [number, expected] of [
      [83, []],
      [71, [{ callId: CALL_ID, number: 71, line: 'Value 71' }]]
    ] as const) {
      const harness = fake({
        replay: [{ id: 'r1', name: 'replay.json', text }],
        ledger: [
          callRow({ source_ref: 'replay.json', body: JSON.stringify({ subject: 'Notice', body: `Value ${number}` }) })
        ],
        now: '2026-11-02T16:00:00+08:00'
      })
      expect(runSweep(harness.ports).mismatches).toEqual([...expected])
    }
  })

  test('legacy replay retains the original trace and rejects a changed decimal', () => {
    for (const tamper of [false, true]) {
      const harness = fake({
        replay: [{ id: 'r1', name: 'replay.json', text: crossingText() }],
        ledger: [
          callRow({
            source_ref: 'replay.json',
            body: JSON.stringify({ subject: SUBJECT, body: tamper ? BODY.replace('39.0 mm', '39.5 mm') : BODY })
          })
        ]
      })
      expect(runSweep(harness.ports).mismatches).toEqual(
        tamper ? [{ callId: CALL_ID, number: 39.5, line: expect.stringContaining('39.5 mm') as string }] : []
      )
    }
  })

  test('a replay row is checked against the replay file inputs instead of the indicators tab', () => {
    const file = crossingText()
    const row = callRow({ snapshot_id: '2026-11-02T15:05:00+08:00', source_ref: 'crossing-20261102-1505-01.json' })
    const passing = fake({
      ledger: [row],
      indicators: [],
      replay: [{ id: 'r1', name: 'crossing-20261102-1505-01.json', text: file }]
    })
    expect(runSweep(passing.ports).mismatches).toEqual([])

    const tampered = BODY.replace('5 min old when drafted', '6 min old when drafted')
    const failing = fake({
      ledger: [
        callRow({
          source_ref: 'crossing-20261102-1505-01.json',
          body: JSON.stringify({ mode: 'commute_disruption', notice: { subject: SUBJECT, body: tampered } })
        })
      ],
      indicators: [],
      replay: [{ id: 'r1', name: 'crossing-20261102-1505-01.json', text: file }]
    })
    expect(runSweep(failing.ports).mismatches).toEqual([
      { callId: CALL_ID, number: 6, line: expect.stringContaining('6 min old') as string }
    ])
  })

  test('checkNoticeNumbers leaves the fixed lines out and compares decimals', () => {
    expect(
      checkNoticeNumbers({ subject: SUBJECT, body: BODY }, new Set([15, 30, 2, 2026, 39, 60, 0, 5, 2026]))
    ).toBeNull()
    const bad = checkNoticeNumbers(
      { subject: SUBJECT, body: BODY.replace('39.0 mm', '39.5 mm') },
      new Set([15, 30, 2, 2026, 39, 60, 0, 5])
    )
    expect(bad?.number).toBe(39.5)
  })
})

describe('06:40 weekday heads-up', () => {
  test('a drifted sweep from 06:40 to before 07:00 owns the heads-up', () => {
    expect(weekdayMorningDate(new Date('2026-11-09T06:43:12+08:00'))).toBe('2026-11-09')
    expect(weekdayMorningDate(new Date('2026-11-09T06:39:59+08:00'))).toBeNull()
    expect(weekdayMorningDate(new Date('2026-11-09T07:00:00+08:00'))).toBeNull()
    expect(weekdayMorningDate(new Date('2026-11-08T06:45:00+08:00'))).toBeNull()
  })

  const windows: Row<'windows'>[] = [
    {
      window_id: 'W-0009',
      subscriber_id: 'S-1',
      kind: 'class',
      date: '2026-11-09',
      start_myt: '15:00',
      end_myt: '16:00',
      language: 'en',
      status: 'active'
    }
  ]
  const shadow: Row<'shadow'>[] = [
    { scope: 'W-0009', verdict: 'commute_disruption', snapshot_id: '2026-11-09T06:40:00+08:00' }
  ]

  test('emails the team once when shadow is non-Normal for a window dated today', () => {
    const harness = fake({ now: '2026-11-09T06:40:00+08:00', rota: [], windows, shadow })
    const first = runSweep(harness.ports)
    expect(first.morningSent).toBe(true)
    expect(harness.notifications).toHaveLength(1)
    expect(harness.notifications[0]).toMatchObject({
      kind: 'needs_review_expected',
      to: TEAM.join(', '),
      ref: '2026-11-09'
    })
    expect(harness.sentMails[0]?.subject).toContain('2026-11-09')
    expect(harness.sentMails[0]?.body).toContain('W-0009')

    const second = runSweep(harness.ports)
    expect(second.morningSent).toBe(false)
    expect(harness.notifications).toHaveLength(1)
  })

  test('stays silent off-schedule, on weekends and when shadow is Normal', () => {
    const offTime = fake({ now: '2026-11-09T07:05:00+08:00', windows, shadow })
    expect(runSweep(offTime.ports).morningSent).toBe(false)

    const weekend = fake({ now: '2026-11-08T06:40:00+08:00', windows, shadow })
    expect(runSweep(weekend.ports).morningSent).toBe(false)

    const calm = fake({
      now: '2026-11-09T06:40:00+08:00',
      windows,
      shadow: [{ scope: 'W-0009', verdict: 'normal', snapshot_id: '2026-11-09T06:40:00+08:00' }]
    })
    expect(runSweep(calm.ports).morningSent).toBe(false)
    expect(calm.notifications).toHaveLength(0)
  })
})
