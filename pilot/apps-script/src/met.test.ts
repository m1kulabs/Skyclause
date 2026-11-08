import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  decodeMetReceipt,
  runMetHandler,
  runMetPoll,
  verifyMetWarningText,
  type MetPollPorts,
  type MetRawBody,
  type MetReceipt
} from './met.ts'
import { MET_FORECAST_ENDPOINT, MET_WARNING_ENDPOINT, parseMetWarnings, type MetKind } from './met-parser.ts'
import type { Row } from './schema.ts'

const warningText = readFileSync(join(import.meta.dir, '../../fixtures/weather-warning-20261105T1313Z.json'), 'utf8')
const forecastText = readFileSync(
  join(import.meta.dir, '../../fixtures/weather-forecast-kl-20261108T014413Z.json'),
  'utf8'
)
const body = (text: string): MetRawBody => ({ text, bytes: [...Buffer.from(text)] })
const hash = (bytes: number[]) => createHash('sha256').update(Buffer.from(bytes)).digest('hex')
const glossary = [
  ['Amaran Ribut Petir', 'Thunderstorms Warning'],
  [
    'Ribut petir, hujan lebat dan angin kencang dijangka di negeri …',
    'Thunderstorms, heavy rain and strong winds are expected over the states of …'
  ],
  ['menyeluruh', 'widespread'],
  ['di kebanyakan tempat', 'in most places'],
  ['Lebat', 'heavy, 31–60 mm in an hour'],
  ['jerebu', 'haze']
].map(([ms_phrase, en_gloss]) => ({ ms_phrase, en_gloss }))
function harness(kind: MetKind = 'warning') {
  const state = {
    sources: [] as Row<'sources'>[],
    glossary: [] as Row<'glossary'>[],
    warnings: [] as Row<'warnings'>[],
    forecast: [] as Row<'forecast'>[],
    polls: [] as Row<'polls'>[],
    raw: new Map<string, MetRawBody>(),
    pending: null as MetReceipt | null,
    response: { status: 200, ...body(kind === 'warning' ? warningText : forecastText) },
    names: [] as string[],
    events: [] as string[],
    fetches: [] as string[],
    now: Date.parse('2026-11-05T13:13:00Z'),
    nextId: 0,
    fail: '',
    after: false,
    partial: false,
    throwFetch: false,
    evaluations: 0,
    rawReads: 0
  }
  const operation = (name: string, fn: () => void) => {
    state.events.push(name)
    if (state.fail === name && !state.after) {
      state.fail = ''
      throw new Error(`storage ${name}`)
    }
    fn()
    if (state.fail === name) {
      state.fail = ''
      throw new Error(`storage ${name}`)
    }
  }
  const ports: MetPollPorts = {
    now: () => new Date(state.now),
    newPollId: () => `poll-${++state.nextId}`,
    fetch: (url) => {
      state.fetches.push(url)
      if (state.throwFetch) throw new Error('transport')
      return structuredClone(state.response)
    },
    readSources: () => structuredClone(state.sources),
    appendSources: (rows) => operation('sources', () => state.sources.push(...structuredClone(rows))),
    readGlossary: () => structuredClone(state.glossary),
    appendGlossary: (rows) => operation('glossary', () => state.glossary.push(...structuredClone(rows))),
    readWarnings: () => structuredClone(state.warnings).map((row, i) => ({ rowNumber: i + 2, row })),
    appendWarnings: (rows) =>
      operation('warnings', () => {
        state.warnings.push(...structuredClone(state.partial ? rows.slice(0, 1) : rows))
        if (state.partial) {
          state.partial = false
          throw new Error('partial append')
        }
      }),
    updateLastSeen: (rowNumber, at) =>
      operation('touch', () => {
        state.warnings[rowNumber - 2]!.last_seen_at = at
      }),
    readForecast: () => structuredClone(state.forecast),
    appendForecast: (rows) => operation('forecast', () => state.forecast.push(...structuredClone(rows))),
    readPolls: () => structuredClone(state.polls),
    appendPoll: (row) => operation('poll', () => state.polls.push(structuredClone(row))),
    readRaw: (id) => {
      state.rawReads++
      const raw = state.raw.get(id)
      if (!raw) throw new Error('missing raw')
      return structuredClone(raw)
    },
    createRaw: (name, bytes) => {
      const id = `raw-${state.raw.size + 1}`
      operation('archive', () => {
        state.names.push(name)
        state.raw.set(id, { bytes: [...bytes], text: Buffer.from(bytes).toString('utf8') })
      })
      return id
    },
    hashBytes: hash,
    readPending: () => structuredClone(state.pending),
    savePending: (_kind, value) =>
      operation('receipt', () => {
        state.pending = structuredClone(value)
      }),
    clearPending: () =>
      operation('clear', () => {
        state.pending = null
      }),
    evaluate: () => {
      state.evaluations++
    }
  }
  return {
    state,
    ports,
    run: () => runMetPoll(kind, ports),
    advance: () => {
      state.now += 600000
    },
    set: (text: string) => {
      state.response = { status: 200, ...body(text) }
    }
  }
}
function changedWarning(text = 'changed'): string {
  const rows = JSON.parse(warningText)
  rows[0].text_en = text
  return JSON.stringify(rows)
}
function changedForecast(): string {
  const rows = JSON.parse(forecastText)
  rows[0].night_forecast = 'changed'
  return JSON.stringify(rows)
}

describe('MET ingestion', () => {
  test('records a bounded schema error for conflicting warnings with a 50000-unit key', () => {
    const h = harness()
    const warning = JSON.parse(warningText)[0]
    warning.warning_issue.title_en = 'x'.repeat(49948)
    const parsed = parseMetWarnings([warning])[0]!
    expect(parsed.warning_key.length).toBe(50000)
    expect(parsed.title_en).toBe(warning.warning_issue.title_en)
    h.set(JSON.stringify([warning, { ...warning, text_en: 'changed' }]))
    const appendPoll = h.ports.appendPoll
    h.ports.appendPoll = (row) => {
      if (typeof row.error === 'string' && row.error.length > 50000) throw new Error('poll error exceeds Sheets limit')
      appendPoll(row)
    }

    const report = h.run()

    expect(report).toMatchObject({
      appendedRows: 0,
      touchedWarnings: 0,
      rawCreated: false,
      poll: { outcome: 'error', new_rows: 0, http_status: 200 }
    })
    expect(h.state.polls).toHaveLength(1)
    expect(report.poll.error).toMatch(/conflict/i)
    expect(String(report.poll.error).length).toBeLessThanOrEqual(50000)
    expect(h.state.warnings).toHaveLength(0)
    expect(h.state.forecast).toHaveLength(0)
    expect(h.state.raw.size).toBe(0)
    expect(h.state.events.filter((event) => ['warnings', 'forecast', 'archive', 'touch'].includes(event))).toEqual([])
  })
  test('initializes exact sources and six glossary pairs while preserving human configuration', () => {
    const h = harness()
    h.run()
    expect(h.state.sources).toEqual([
      {
        source_id: 'met_warning',
        kind: 'met_warning',
        name: 'MET warnings',
        cadence_min: 10,
        stale_after_min: 20,
        freshness: 'polled',
        licence: 'CC BY 4.0, MET Malaysia via data.gov.my',
        url: MET_WARNING_ENDPOINT
      }
    ])
    expect(h.state.glossary).toEqual(glossary)
    h.state.sources[0]!.cadence_min = 77
    h.state.sources.push({ source_id: 'other', kind: 'jps' })
    h.state.glossary = [glossary[0]!]
    h.run()
    expect(h.state.sources).toHaveLength(2)
    expect(h.state.sources[0]!.cadence_min).toBe(77)
    expect(h.state.glossary).toEqual([glossary[0]!])
    const f = harness('forecast')
    f.run()
    expect(f.state.sources[0]).toMatchObject({
      source_id: 'Ds058',
      kind: 'met_forecast',
      cadence_min: 360,
      stale_after_min: 720,
      url: MET_FORECAST_ENDPOINT
    })
    for (const kind of ['warning', 'forecast'] as const) {
      const bad = harness(kind)
      bad.state.sources = [{ source_id: kind === 'warning' ? 'met_warning' : 'Ds058', kind: 'wrong' }]
      expect(() => bad.run()).toThrow(/kind/i)
      expect(bad.state.fetches).toHaveLength(0)
    }
  })
  test('first captures four warnings; repeat only touches active last_seen and reuses raw bytes', () => {
    const h = harness()
    const first = h.run()
    const original = structuredClone(h.state.warnings)
    h.advance()
    const repeat = h.run()
    expect(first).toMatchObject({
      appendedRows: 4,
      touchedWarnings: 0,
      rawCreated: true,
      poll: { new_rows: 4, outcome: 'ok', raw_file_id: 'raw-1' }
    })
    expect(repeat).toMatchObject({
      appendedRows: 0,
      touchedWarnings: 4,
      rawCreated: false,
      poll: { outcome: 'unchanged', raw_file_id: 'raw-1' }
    })
    expect(h.state.names).toEqual(['warning-20261105-211300.json'])
    expect(h.state.polls).toHaveLength(2)
    for (const [i, row] of h.state.warnings.entries())
      expect(row).toEqual({ ...original[i], last_seen_at: '2026-11-05T21:23:00+08:00' })
    expect(h.state.events.indexOf('receipt')).toBeLessThan(h.state.events.indexOf('warnings'))
    expect(h.state.events.indexOf('warnings')).toBeLessThan(h.state.events.indexOf('poll'))
    expect(h.state.events.indexOf('poll')).toBeLessThan(h.state.events.indexOf('clear'))
  })
  test('appends immutable A B A revisions and never invents cancellations', () => {
    const h = harness()
    h.run()
    const first = structuredClone(h.state.warnings[0])
    h.advance()
    h.set(changedWarning())
    expect(h.run().appendedRows).toBe(1)
    h.advance()
    h.set(warningText)
    expect(h.run().appendedRows).toBe(1)
    expect(h.state.warnings).toHaveLength(6)
    expect(h.state.warnings[0]).toEqual(first)
    h.advance()
    h.run()
    expect(h.state.warnings[0]).toEqual(first)
    expect(h.state.warnings[4]!.last_seen_at).toBe('2026-11-05T21:23:00+08:00')
    h.set('[]')
    expect(h.run().appendedRows).toBe(0)
    expect(h.state.warnings).toHaveLength(6)
  })
  test('forecast versions compare newest date and preserve Date cells and blank temperatures', () => {
    const h = harness('forecast')
    expect(h.run().appendedRows).toBe(7)
    expect(h.state.names).toEqual(['forecast-20261105-211300.json'])
    h.state.forecast[0]!.date = new Date(`${h.state.forecast[0]!.date}T00:00:00+08:00`)
    expect(h.run().appendedRows).toBe(0)
    h.advance()
    h.set(changedForecast())
    expect(h.run().appendedRows).toBe(1)
    h.advance()
    h.set(forecastText)
    expect(h.run().appendedRows).toBe(1)
    const bad = harness('forecast')
    bad.run()
    bad.state.forecast[0]!.min_temp = ''
    expect(() => bad.run()).toThrow(/storage/i)
    const unbound = harness('forecast')
    unbound.set(JSON.stringify([{ location: { location_id: 'St009' } }]))
    expect(unbound.run().poll.outcome).toBe('error')
    expect(unbound.state.forecast).toHaveLength(0)
  })
  test('byte-only changes archive separately and success always references its actual raw', () => {
    const h = harness()
    h.run()
    h.set(warningText + '\n')
    const report = h.run()
    expect(report).toMatchObject({
      appendedRows: 0,
      rawCreated: true,
      poll: { outcome: 'ok', new_rows: 0, raw_file_id: 'raw-2' }
    })
    expect(h.state.raw.size).toBe(2)
    expect(h.run().poll).toMatchObject({ outcome: 'unchanged', raw_file_id: 'raw-2' })
  })
  test.each(['429', '500', 'transport', 'utf8', 'schema'])(
    '%s records one source error with no feed/archive/touch writes',
    (failure) => {
      const h = harness()
      if (failure === 'transport') h.state.throwFetch = true
      else if (failure === 'utf8') h.state.response.text = null
      else if (failure === 'schema') h.set('{}')
      else h.state.response.status = Number(failure)
      const report = h.run()
      expect(report.poll).toMatchObject({
        outcome: 'error',
        new_rows: 0,
        http_status: failure === 'transport' ? 0 : ['utf8', 'schema'].includes(failure) ? 200 : Number(failure)
      })
      expect(h.state.polls).toHaveLength(1)
      expect(h.state.warnings).toHaveLength(0)
      expect(h.state.raw.size).toBe(0)
      expect(h.state.events).not.toContain('touch')
      expect(h.state.fetches).toEqual([MET_WARNING_ENDPOINT])
    }
  )
  test('handler holds lock around recovery, one fresh fetch and evaluation', () => {
    const h = harness()
    let locked = false
    const fetch = h.ports.fetch
    h.ports.fetch = (url) => {
      expect(locked).toBe(true)
      return fetch(url)
    }
    runMetHandler({
      kind: 'warning',
      ports: h.ports,
      withLock: (fn) => {
        locked = true
        try {
          return fn()
        } finally {
          locked = false
        }
      }
    })
    expect(h.state.fetches).toHaveLength(1)
    expect(h.state.evaluations).toBe(1)
  })
})

describe('MET recoverable receipts', () => {
  test('decoder retains only owned metadata and rejects malformed present state', () => {
    expect(decodeMetReceipt(null, 'warning')).toBeNull()
    const h = harness()
    h.state.fail = 'warnings'
    expect(() => h.run()).toThrow()
    const receipt = h.state.pending!
    const dirty = { ...receipt, body: 'secret', person: 'person', poll: { ...receipt.poll, person: 'person' } }
    expect(decodeMetReceipt(JSON.stringify(dirty), 'warning')).toEqual(receipt)
    for (const outcome of ['ok', 'unchanged']) {
      const valid = { ...receipt, poll: { ...receipt.poll, outcome } }
      expect(decodeMetReceipt(JSON.stringify(valid), 'warning')).toEqual(valid)
    }
    const bad = [
      { ...receipt, kind: 'forecast' },
      { ...receipt, sha256: 'bad' },
      { ...receipt, rawFileId: '' },
      ...[
        ['poll_id', ''],
        ['source_id', 'other'],
        ['source_kind', 'wrong'],
        ['http_status', 429],
        ['outcome', 'error'],
        ['new_rows', -1],
        ['new_rows', 1.2],
        ['latency_ms', Infinity],
        ['started_at', '2026-02-30T00:00:00+08:00'],
        ['received_at', '2026-11-05T21:13:00'],
        ['raw_file_id', 'wrong']
      ].map(([field, value]) => ({ ...receipt, poll: { ...receipt.poll, [field as string]: value } }))
    ]
    for (const value of [undefined, {}, [], ...bad])
      expect(() => decodeMetReceipt(JSON.stringify(value) ?? '', 'warning')).toThrow(/receipt/i)
  })
  test.each([
    { outcome: ['ok'] },
    { outcome: ['unchanged'] },
    { outcome: {} },
    { outcome: { value: 'ok' } },
    { outcome: null }
  ])('rejects non-string receipt outcome %p before recovery writes', ({ outcome }) => {
    const h = harness()
    h.state.fail = 'warnings'
    expect(() => h.run()).toThrow(/storage/)
    const receipt = { ...h.state.pending!, poll: { ...h.state.pending!.poll, outcome } }
    expect(() => decodeMetReceipt(JSON.stringify(receipt), 'warning')).toThrow(/receipt/i)
    h.ports.readPending = () => receipt as unknown as MetReceipt
    const events = [...h.state.events]
    expect(() => h.run()).toThrow(/receipt/i)
    expect(h.state.events).toEqual(events)
    expect(h.state.fetches).toHaveLength(1)
    expect(h.state.warnings).toHaveLength(0)
    expect(h.state.polls).toHaveLength(0)
  })
  test.each(['archive', 'receipt', 'warnings', 'poll', 'clear'])(
    'recovers %s failures before and after persistence without duplicate row or poll',
    (stage) => {
      for (const after of [false, true]) {
        const h = harness()
        h.state.fail = stage
        h.state.after = after
        expect(() => h.run()).toThrow(/storage/)
        expect(h.state.polls.every((p) => p.outcome !== 'error')).toBe(true)
        const pendingId = h.state.pending?.poll.poll_id
        const priorRows = h.state.warnings.length
        h.advance()
        const report = h.run()
        expect(h.state.warnings).toHaveLength(4)
        expect(new Set(h.state.polls.map((p) => p.poll_id)).size).toBe(h.state.polls.length)
        expect(h.state.pending).toBeNull()
        expect(report.recoveredPollIds).toEqual(pendingId ? [pendingId as string] : [])
        expect(report.appendedRows).toBe(4 - priorRows)
        expect(h.state.fetches).toHaveLength(2)
        for (const row of h.state.warnings)
          expect(h.state.polls.some((p) => p.poll_id === row.poll_id && h.state.raw.has(p.raw_file_id as string))).toBe(
            true
          )
      }
    }
  )
  test('partial row append retains original intended count/time then captures changed fresh event', () => {
    const h = harness()
    h.state.partial = true
    expect(() => h.run()).toThrow(/partial/)
    expect(h.state.pending!.poll.new_rows).toBe(4)
    h.advance()
    h.set(changedWarning())
    const report = h.run()
    expect(report).toMatchObject({ recoveredPollIds: ['poll-1'], appendedRows: 4, poll: { new_rows: 1 } })
    expect(h.state.warnings).toHaveLength(5)
    expect(h.state.polls[0]).toMatchObject({ poll_id: 'poll-1', new_rows: 4, received_at: '2026-11-05T21:13:00+08:00' })
    expect(h.state.warnings.slice(0, 4).every((r) => r.first_seen_at === '2026-11-05T21:13:00+08:00')).toBe(true)
  })
  test('forecast row append failures recover before and after persistence', () => {
    for (const after of [false, true]) {
      const h = harness('forecast')
      h.state.fail = 'forecast'
      h.state.after = after
      expect(() => h.run()).toThrow(/storage/)
      h.advance()
      const report = h.run()
      expect(report.recoveredPollIds).toEqual(['poll-1'])
      expect(h.state.forecast).toHaveLength(7)
      expect(h.state.polls).toHaveLength(2)
    }
  })
  test('normalizes native warning and poll Date cells without changing published text', () => {
    const h = harness()
    h.run()
    for (const row of h.state.warnings)
      for (const field of ['issued', 'first_seen_at', 'last_seen_at', 'valid_from', 'valid_to'] as const)
        if (row[field]) row[field] = new Date(String(row[field]))
    h.state.polls[0]!.started_at = new Date(String(h.state.polls[0]!.started_at))
    h.state.polls[0]!.received_at = new Date(String(h.state.polls[0]!.received_at))
    h.advance()
    expect(h.run()).toMatchObject({ appendedRows: 0, touchedWarnings: 4 })
  })
  test('source error after prior capture leaves existing observations unchanged', () => {
    const h = harness()
    h.run()
    const saved = structuredClone(h.state.warnings)
    h.advance()
    h.state.response.status = 429
    h.run()
    expect(h.state.warnings).toEqual(saved)
    expect(h.state.raw.size).toBe(1)
  })
  test('rejects extra receipt-owned rows absent from its archive', () => {
    const h = harness()
    h.state.fail = 'poll'
    expect(() => h.run()).toThrow()
    h.state.warnings.push({
      ...h.state.warnings[0],
      title_en: 'extra',
      warning_key: `${h.state.warnings[0]!.issued}·extra·${h.state.warnings[0]!.valid_from}`
    })
    expect(() => h.run()).toThrow(/storage/)
  })
  test('touch failures recover both before and after persistence', () => {
    for (const after of [false, true]) {
      const h = harness()
      h.run()
      h.advance()
      h.state.fail = 'touch'
      h.state.after = after
      expect(() => h.run()).toThrow(/storage/)
      h.advance()
      h.run()
      expect(h.state.warnings).toHaveLength(4)
      expect(h.state.polls).toHaveLength(3)
      expect(h.state.pending).toBeNull()
    }
  })
  test.each(['missing', 'bytes', 'text', 'receipt', 'owned row', 'poll collision'])(
    'corrupt %s state propagates a storage error',
    (failure) => {
      const h = harness()
      h.state.fail = 'warnings'
      expect(() => h.run()).toThrow()
      if (failure === 'missing') h.state.raw.clear()
      if (failure === 'bytes') h.state.raw.get('raw-1')!.bytes.push(32)
      if (failure === 'text') h.state.raw.get('raw-1')!.text = null
      if (failure === 'receipt') h.state.pending!.sha256 = 'bad'
      if (failure === 'owned row') h.state.warnings.push({ warning_key: 'broken' })
      if (failure === 'poll collision') h.state.polls.push({ ...h.state.pending!.poll, new_rows: 99 })
      expect(() => h.run()).toThrow(/storage|receipt/i)
      expect(h.state.polls.every((p) => p.outcome !== 'error')).toBe(true)
      expect(h.state.fetches).toHaveLength(1)
    }
  )
})

describe('MET text verification', () => {
  test('no data is never positive proof; four literal warning rows match their own archived polls', () => {
    const h = harness()
    expect(verifyMetWarningText(h.ports)).toMatchObject({
      status: 'no_data',
      rowsChecked: 0,
      comparedFields: 0,
      matchedFields: 0
    })
    h.run()
    h.advance()
    h.set(changedWarning())
    h.run()
    h.state.rawReads = 0
    expect(verifyMetWarningText(h.ports)).toMatchObject({
      status: 'match',
      rowsChecked: 5,
      comparedFields: 10,
      matchedFields: 10,
      problems: []
    })
    expect(h.state.rawReads).toBe(2)
  })
  test.each(['missing poll', 'wrong source', 'raw id', 'decode', 'key', 'field'])(
    'reports explicit %s problems',
    (failure) => {
      const h = harness()
      h.run()
      if (failure === 'missing poll') h.state.polls = []
      if (failure === 'wrong source') h.state.polls[0]!.source_kind = 'jps'
      if (failure === 'raw id') h.state.polls[0]!.raw_file_id = ''
      if (failure === 'decode') h.state.raw.get('raw-1')!.text = null
      if (failure === 'key') h.state.warnings[0]!.warning_key = 'absent'
      if (failure === 'field') h.state.warnings[0]!.text_bm = 'different'
      const report = verifyMetWarningText(h.ports)
      expect(report.status).toBe('mismatch')
      expect(report.problems.length).toBeGreaterThan(0)
      expect(report.problems[0]).toHaveProperty('reason')
    }
  )
})
