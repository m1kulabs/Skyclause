import { describe, expect, test } from 'bun:test'
import type { ScriptProperty } from './properties.ts'
import { triggerRegistry } from './registry.ts'
import {
  MAX_TRIGGERS,
  syncTriggers,
  type Cadence,
  type InstalledTrigger,
  type TriggerEntry,
  type TriggerPort
} from './triggers.ts'

const PILOT = '1pilotScriptIdStampedByCi'
const properties: Partial<Record<ScriptProperty, string>> = { SHEET_ID: 'sheet-1', RESPONSES_SHEET_ID: 'responses-1' }
const getProperty = (name: ScriptProperty) => properties[name] ?? null

// An in-memory project trigger list that records every change. Unlike Apps Script, it remembers cadences.
function fakeTriggers(initial: InstalledTrigger[]) {
  const installed: (InstalledTrigger & { every?: Cadence })[] = [...initial]
  const changes: string[] = []
  let next = 1
  const port: TriggerPort = {
    list: () => installed.map((trigger) => ({ ...trigger })),
    createTime: (handler, every) => {
      installed.push({ id: `new-${next++}`, handler, kind: 'time', sourceId: null, every })
      changes.push(`create time ${handler} ${JSON.stringify(every)}`)
    },
    createSpreadsheet: (handler, kind, spreadsheetId) => {
      installed.push({ id: `new-${next++}`, handler, kind, sourceId: spreadsheetId })
      changes.push(`create ${kind} ${handler} ${spreadsheetId}`)
    },
    remove: (id) => {
      installed.splice(
        installed.findIndex((trigger) => trigger.id === id),
        1
      )
      changes.push(`remove ${id}`)
    }
  }
  return { port, installed, changes }
}

const registry: TriggerEntry[] = [
  { kind: 'time', handler: 'pollJpsGauge', every: { minutes: 5 } },
  { kind: 'time', handler: 'gradeSkyWindows', every: { atHour: 23, nearMinute: 55 } },
  { kind: 'time', handler: 'gradeSkyWindows', every: { atHour: 6, nearMinute: 0 } },
  { kind: 'on_form_submit', handler: 'onWindowFormSubmit', spreadsheet: 'RESPONSES_SHEET_ID' },
  { kind: 'on_edit', handler: 'onEditClauses', spreadsheet: 'SHEET_ID' }
]

const existing: InstalledTrigger[] = [
  { id: 't1', handler: 'pollJpsGauge', kind: 'time', sourceId: null },
  { id: 't2', handler: 'pollRetiredFeed', kind: 'time', sourceId: null },
  { id: 't3', handler: 'gradeSkyWindows', kind: 'time', sourceId: null },
  { id: 't4', handler: 'onEditClauses', kind: 'on_edit', sourceId: 'sheet-1' },
  { id: 't5', handler: 'onOldFormSubmit', kind: 'on_form_submit', sourceId: 'responses-0' }
]

describe('syncTriggers on the stamped pilot script', () => {
  test('leaves exactly the registry’s time triggers and adds its missing event triggers', () => {
    const { port, installed } = fakeTriggers(existing)
    syncTriggers(registry, port, { scriptId: PILOT, pilotScriptId: PILOT, getProperty })

    const time = installed.filter((trigger) => trigger.kind === 'time')
    expect(time.map((trigger) => trigger.handler).sort()).toEqual([
      'gradeSkyWindows',
      'gradeSkyWindows',
      'pollJpsGauge'
    ])
    expect(time.find((trigger) => trigger.handler === 'pollJpsGauge')?.id).toBe('t1')
    expect(time.filter((trigger) => trigger.handler === 'gradeSkyWindows').map((trigger) => trigger.every)).toEqual([
      { atHour: 23, nearMinute: 55 },
      { atHour: 6, nearMinute: 0 }
    ])
    expect(installed.filter((trigger) => trigger.kind !== 'time')).toEqual([
      { id: 't4', handler: 'onEditClauses', kind: 'on_edit', sourceId: 'sheet-1' },
      { id: 't5', handler: 'onOldFormSubmit', kind: 'on_form_submit', sourceId: 'responses-0' },
      { id: 'new-3', handler: 'onWindowFormSubmit', kind: 'on_form_submit', sourceId: 'responses-1' }
    ])
  })

  test('changes nothing on a second run', () => {
    const { port, changes } = fakeTriggers(existing)
    syncTriggers(registry, port, { scriptId: PILOT, pilotScriptId: PILOT, getProperty })
    changes.length = 0
    syncTriggers(registry, port, { scriptId: PILOT, pilotScriptId: PILOT, getProperty })
    expect(changes).toEqual([])
  })

  test('skips an event trigger whose spreadsheet ID is still unset, and installs it on a later run', () => {
    const { port, installed } = fakeTriggers([])
    const unset = (name: ScriptProperty) => (name === 'RESPONSES_SHEET_ID' ? null : getProperty(name))
    const result = syncTriggers(registry, port, { scriptId: PILOT, pilotScriptId: PILOT, getProperty: unset })
    expect(result.skipped).toEqual(['onWindowFormSubmit: RESPONSES_SHEET_ID is not set'])
    expect(installed.some((trigger) => trigger.handler === 'onWindowFormSubmit')).toBe(false)

    syncTriggers(registry, port, { scriptId: PILOT, pilotScriptId: PILOT, getProperty })
    expect(installed.filter((trigger) => trigger.handler === 'onWindowFormSubmit')).toHaveLength(1)
  })

  test(`refuses a registry above ${MAX_TRIGGERS} triggers before touching any`, () => {
    const { port, changes } = fakeTriggers(existing)
    const tooMany: TriggerEntry[] = Array.from({ length: MAX_TRIGGERS + 1 }, (_, n) => ({
      kind: 'time',
      handler: `handler${n}`,
      every: { minutes: 30 }
    }))
    expect(() => syncTriggers(tooMany, port, { scriptId: PILOT, pilotScriptId: PILOT, getProperty })).toThrow(
      'the trigger registry has 21 entries; Apps Script allows 20'
    )
    expect(changes).toEqual([])
  })
})

describe('syncTriggers anywhere else', () => {
  for (const [name, pilotScriptId] of [
    ['a dev script', PILOT],
    ['a build with no stamped ID', '']
  ] as const) {
    test(`installs and removes nothing in ${name}`, () => {
      const touched: string[] = []
      const port: TriggerPort = {
        list: () => (touched.push('list'), existing),
        createTime: () => void touched.push('createTime'),
        createSpreadsheet: () => void touched.push('createSpreadsheet'),
        remove: () => void touched.push('remove')
      }
      const result = syncTriggers(registry, port, { scriptId: '1devScriptId', pilotScriptId, getProperty })
      expect(result).toEqual({ pilot: false, created: [], removed: [], skipped: [] })
      expect(touched).toEqual([])
    })
  }
})

test(`the trigger registry fits Apps Script’s ${MAX_TRIGGERS} triggers`, () => {
  expect(triggerRegistry.length).toBeLessThanOrEqual(MAX_TRIGGERS)
})
