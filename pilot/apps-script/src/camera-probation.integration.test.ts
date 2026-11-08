import { afterEach, describe, expect, test } from 'bun:test'
import * as gas from './gas.ts'
import { handleLabelPage } from './label.ts'
import { columnsOf, type Cell, type Tab } from './schema.ts'
import {
  CAMERA_PROBATION_HISTORY_KEY as key,
  cameraEligibilityAt,
  decodeCameraProbationHistory,
  type CameraProbationHistory
} from './camera-probation-history.ts'

const originals = new Map<string, PropertyDescriptor | undefined>()
function install(name: string, value: unknown) {
  if (!originals.has(name)) originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
}
afterEach(() => {
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else delete (globalThis as Record<string, unknown>)[name]
  }
  originals.clear()
})

// Only external services are doubled; label routing, summaries, lock and adapters stay real.
function native() {
  const rows = new Map<Tab, Cell[][]>()
  const notes = new Map<string, string>()
  const events: string[] = []
  const reads: string[] = []
  const writes: string[] = []
  const props: Record<string, string> = { CAMERA_TOKEN: 'private-never-read' }
  let failure = ''
  function seed(tab: Tab, records: Record<string, Cell>[]) {
    rows.set(
      tab,
      records.map((record) => columnsOf(tab).map((column) => record[column] ?? ''))
    )
  }
  seed('sources', [
    { source_id: 'apims-1', kind: 'apims' },
    { source_id: ' actual-camera-id ', kind: 'camera' }
  ])
  install('SpreadsheetApp', {
    openById: (spreadsheetId: string) => {
      if (spreadsheetId !== 'sheet-actual') throw new Error('wrong workbook')
      return {
        getSheetByName: (tab: Tab) => ({
          getLastRow: () => (rows.get(tab)?.length ?? 0) + 1,
          getRange: (row: number, column: number, height = 1, width = 1) => ({
            getValue: () => rows.get(tab)?.[row - 2]?.[column - 1] ?? '',
            getValues: () =>
              Array.from({ length: height }, (_, r) =>
                Array.from({ length: width }, (_, c) => rows.get(tab)?.[row - 2 + r]?.[column - 1 + c] ?? '')
              ),
            setValue: (value: Cell) => {
              events.push('cell:' + columnsOf(tab)[column - 1])
              if (failure === 'mirror') throw new Error('mirror unavailable')
              rows.get(tab)![row - 2]![column - 1] = value
            },
            setNote: (note: string) => {
              events.push('note')
              if (failure === 'note') throw new Error('note unavailable')
              notes.set(`${tab}:${row}:${column}`, note)
            }
          })
        })
      }
    }
  })
  install('PropertiesService', {
    getScriptProperties: () => ({
      getProperties: () => {
        throw new Error('forbidden bulk secret read')
      },
      getProperty: (name: string) => {
        reads.push(name)
        if (name !== key) throw new Error('forbidden property read')
        if (failure === 'read') throw new Error('private storage error details')
        return props[name] ?? null
      },
      setProperty: (name: string, value: string) => {
        writes.push(name)
        events.push('save')
        if (name !== key) throw new Error('forbidden property write')
        if (failure === 'save-before') throw new Error('private storage error details')
        props[name] = value
        if (failure === 'save-after') throw new Error('private storage error details')
      }
    })
  })
  install('LockService', {
    getScriptLock: () => ({
      waitLock: () => events.push('lock'),
      releaseLock: () => events.push('unlock')
    })
  })
  return {
    rows,
    props,
    notes,
    events,
    reads,
    writes,
    seed,
    fail: (at: string) => {
      failure = at
    },
    store: () => gas.labelStore('sheet-actual'),
    history: () => decodeCameraProbationHistory(props[key]!, 'sheet-actual'),
    cell: (column: string) => rows.get('sources')?.[1]?.[columnsOf('sources').indexOf(column as never)]
  }
}

describe('native camera decision recording', () => {
  test('constructs lazily and saves real workbook/source/time before the existing mirror', () => {
    const f = native()
    const store = f.store()
    expect(f.events).toEqual([])
    expect(f.reads).toEqual([])
    const before = Date.now()
    store.recordVerdict('pass: existing summary', true, 100, 0.9)
    const after = Date.now()
    const saved = f.history()
    expect(saved.spreadsheetId).toBe('sheet-actual')
    expect(saved.decisions).toHaveLength(1)
    expect(saved.decisions[0]!.sourceId).toBe(' actual-camera-id ')
    expect(saved.decisions[0]!.passed).toBe(true)
    expect(Date.parse(saved.decisions[0]!.at)).toBeGreaterThanOrEqual(before)
    expect(Date.parse(saved.decisions[0]!.at)).toBeLessThanOrEqual(after)
    expect(f.reads).toEqual([key])
    expect(f.writes).toEqual([key])
    expect(f.props.CAMERA_TOKEN).toBe('private-never-read')
    expect(f.events).toEqual(['save', 'cell:probation', 'cell:probation_n', 'cell:probation_agreement', 'note'])
    expect(f.cell('probation')).toBe(false)
    expect(f.cell('probation_n')).toBe(100)
    expect(f.cell('probation_agreement')).toBe(0.9)
    expect([...f.notes.values()]).toEqual(['pass: existing summary'])
    expect(cameraEligibilityAt(saved, ' actual-camera-id ', new Date(before - 1))).toBe('unknown')
  })

  test('no source row means no invented source or history', () => {
    const f = native()
    f.seed('sources', [{ source_id: 'apims-1', kind: 'apims' }])
    f.store().recordVerdict('pending', false, 3, null)
    expect(f.events).toEqual([])
    expect(f.reads).toEqual([])
    expect(f.writes).toEqual([])
    expect(f.props[key]).toBeUndefined()
  })

  test('a camera row without a real source ID cannot invent one', () => {
    const f = native()
    f.seed('sources', [{ kind: 'camera' }])
    expect(() => f.store().recordVerdict('pass', true, 100, 1)).toThrow('camera_probation_history_invalid')
    expect(f.events).toEqual([])
    expect(f.props[key]).toBeUndefined()
  })

  test('ordinary labels, settlements and figures never read or record history', () => {
    const f = native()
    f.seed('probation', [{ capture_id: 'c-1' }])
    const store = f.store()
    store.writeLabel('c-1', 'a', 'visible')
    store.writeSettlement('c-1', 'visible', true)
    store.writeFigures(1, null)
    expect(f.reads).toEqual([])
    expect(f.writes).toEqual([])
    expect(f.cell('probation_n')).toBe(1)
    expect(f.cell('probation_agreement')).toBe('')
  })

  test.each(['read', 'save-before', 'save-after'])('bounds %s failures before mirror updates', (failure) => {
    const f = native()
    f.fail(failure)
    expect(() => f.store().recordVerdict('pass', true, 100, 0.9)).toThrow(
      failure === 'read' ? 'camera_probation_history_read_failed' : 'camera_probation_history_write_failed'
    )
    expect(f.events.filter((event) => event.startsWith('cell:') || event === 'note')).toEqual([])
    expect(f.props[key] !== undefined).toBe(failure === 'save-after')
    if (failure === 'save-after') {
      const original = f.history().decisions[0]!.at
      f.fail('')
      f.store().recordVerdict('retry', true, 100, 0.9)
      expect(f.history().decisions).toEqual([{ at: original, sourceId: ' actual-camera-id ', passed: true }])
      expect(f.cell('probation')).toBe(false)
    }
  })

  test.each(['mirror', 'note'])('preserves saved boundary after %s failure and repairs mirror on retry', (failure) => {
    const f = native()
    f.fail(failure)
    expect(() => f.store().recordVerdict('pass', true, 100, 0.9)).toThrow(`${failure} unavailable`)
    const original = f.history().decisions[0]!.at
    expect(f.events[0]).toBe('save')
    f.fail('')
    f.store().recordVerdict('repaired summary', true, 101, 0.95)
    expect(f.history().decisions).toEqual([{ at: original, sourceId: ' actual-camera-id ', passed: true }])
    expect(f.cell('probation_n')).toBe(101)
    expect(f.cell('probation_agreement')).toBe(0.95)
    expect([...f.notes.values()]).toEqual(['repaired summary'])
  })

  test.each(['malformed', 'workbook', 'backward', 'overflow'])(
    'preserves %s owned data and blocks the mirror',
    (kind) => {
      const f = native()
      const value: CameraProbationHistory = {
        version: 1,
        spreadsheetId: kind === 'workbook' ? 'other-workbook' : 'sheet-actual',
        decisions: [
          {
            at: kind === 'backward' ? '2099-01-01T00:00:00.000Z' : '2026-01-01T00:00:00.000Z',
            sourceId: ' actual-camera-id ',
            passed: true
          }
        ]
      }
      f.props[key] =
        kind === 'malformed' ? '{private broken state' : kind === 'overflow' ? '界'.repeat(3000) : JSON.stringify(value)
      const original = f.props[key]
      expect(() => f.store().recordVerdict('pass', true, 100, 1)).toThrow(
        kind === 'overflow' ? 'camera_probation_history_overflow' : 'camera_probation_history_invalid'
      )
      expect(f.props[key]).toBe(original)
      expect(f.events).toEqual([])
      expect(f.writes).toEqual([])
    }
  )

  test('an appended decision cannot overflow or truncate a valid saved history', () => {
    const f = native()
    const previous: CameraProbationHistory = {
      version: 1,
      spreadsheetId: 'sheet-actual',
      decisions: [{ at: '2026-01-01T00:00:00.000Z', sourceId: '界'.repeat(2670), passed: true }]
    }
    f.props[key] = JSON.stringify(previous)
    expect(new TextEncoder().encode(f.props[key]).length).toBeLessThanOrEqual(8192)
    const original = f.props[key]
    expect(() => f.store().recordVerdict('pass', true, 100, 1)).toThrow('camera_probation_history_overflow')
    expect(f.props[key]).toBe(original)
    expect(f.events).toEqual([])
    expect(f.writes).toEqual([])
  })

  test('Record verdict uses computed pending/pass decisions inside the single existing lock', () => {
    const f = native()
    f.seed('probation', [])
    const deps = {
      store: f.store(),
      withLock: gas.withLock,
      scriptUrl: 'https://script.test/exec',
      getProperty: (name: string) => (name === 'LABEL_TOKEN_A' ? 'aaa' : null)
    }
    const params = {
      page: 'label',
      slot: 'a',
      key: 'aaa',
      action: 'record',
      view: 'verdict',
      at: '2000-01-01',
      sourceId: 'invented'
    }
    expect(handleLabelPage(params, deps).html).toContain('Verdict recorded')
    expect(f.history().decisions[0]!.passed).toBe(false)
    expect(f.cell('probation')).toBe(true)
    expect(f.cell('probation_n')).toBe(0)
    expect(f.cell('probation_agreement')).toBe('')
    expect([...f.notes.values()][0]).toStartWith('pending: ')
    f.seed(
      'probation',
      Array.from({ length: 100 }, (_, i) => ({
        capture_id: `c-${i}`,
        device_time: '2026-01-01T10:00:00+08:00',
        phone_flag: i < 10 ? 'obscured' : 'visible',
        label_a: i < 10 ? 'obscured' : 'visible',
        label_b: i < 10 ? 'obscured' : 'visible',
        settled: i < 10 ? 'obscured' : 'visible',
        agrees: i < 90
      }))
    )
    handleLabelPage(params, deps)
    expect(f.history().decisions.map((decision) => decision.passed)).toEqual([false, true])
    expect(f.cell('probation')).toBe(false)
    expect(f.cell('probation_n')).toBe(100)
    expect(f.cell('probation_agreement')).toBe(0.9)
    expect([...f.notes.values()][0]).toStartWith('pass: 100 frames')
    expect(f.events.filter((event) => event === 'lock')).toHaveLength(2)
    expect(f.events.filter((event) => event === 'unlock')).toHaveLength(2)
    expect(f.events[0]).toBe('lock')
    expect(f.events.at(-1)).toBe('unlock')
  })

  test('history failure releases the existing outer lock', () => {
    const f = native()
    f.seed('probation', [])
    f.fail('save-before')
    expect(() =>
      handleLabelPage(
        { slot: 'a', key: 'aaa', action: 'record' },
        {
          store: f.store(),
          withLock: gas.withLock,
          scriptUrl: '',
          getProperty: () => 'aaa'
        }
      )
    ).toThrow('camera_probation_history_write_failed')
    expect(f.events).toEqual(['lock', 'save', 'unlock'])
  })
})
