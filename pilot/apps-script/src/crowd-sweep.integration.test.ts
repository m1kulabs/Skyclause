import { afterEach, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { runCrowdForecast, type CrowdTickStore } from './crowd-tick.ts'
import { sweep as runAppsScriptSweep } from './main.ts'
import { columnsOf, type Cell, type Row, type Tab } from './schema.ts'
import { runSweep, type RawFile, type SweepPorts } from './sweep.ts'

const CROWD_TICK_AT = new Date('2026-11-03T10:00:00+08:00')
const SWEEP_AT = new Date('2026-11-03T10:05:00+08:00')
const GMAIL_MESSAGE_ID = 'gmail-message-from-search'
const originals = new Map<string, PropertyDescriptor | undefined>()

function produceCrowdCrossing(): { file: RawFile; report: ReturnType<typeof runCrowdForecast> } {
  const files: RawFile[] = []
  const store: CrowdTickStore = {
    readReadings: () => [],
    readPolls: () => [],
    readHistory: () => [],
    readListings: () => [
      {
        listing_id: 'L-20261104-stadium-show',
        night_date: '2026-11-04',
        venue: 'stadium',
        show: 'Show',
        class: 'stadium_concert',
        doors_myt: '18:00',
        show_myt: '20:30',
        show_end_myt: '22:30',
        sources: '["wikipedia"]',
        source_url: 'https://en.wikipedia.org/wiki/X',
        source_revision: '1',
        state: 'listed',
        single_source: false
      }
    ],
    readForecasts: () => [],
    readClauses: () => [],
    appendForecast: () => {},
    replaceCrowdShadow: () => {},
    reservedCrossingNames: () => [],
    crowdFiles: () => [...files],
    writeCrowdFile: (name, text) => files.push({ id: name, name, text })
  }
  const report = runCrowdForecast(store, CROWD_TICK_AT)
  const file = files.find((candidate) => candidate.name === report.crossingFile)
  if (!file) throw new Error('Crowd forecast did not write its crossing file')
  return { file, report }
}

function pureSweepPorts(
  crossing: RawFile,
  notifications: Row<'notifications'>[],
  mails: { to: string[]; subject: string; body: string }[]
): SweepPorts {
  return {
    now: () => new Date(SWEEP_AT),
    sha256Hex: (text) => createHash('sha256').update(text, 'utf8').digest('hex'),
    skyFiles: () => [],
    crowdFiles: () => [crossing],
    replayFiles: () => [],
    rota: () => [],
    notifications: () => [...notifications],
    ledger: () => [],
    indicators: () => [],
    clauseVersions: () => [],
    windows: () => [],
    shadow: () => [],
    sent: () => [],
    calendarDescription: () => null,
    appendCalendarDescription: () => {},
    teamAlertEmails: () => ['ops@example.com'],
    sendMail: (to, subject, body) => {
      mails.push({ to, subject, body })
      return `sweep-message-${mails.length}`
    },
    appendNotification: (row) => notifications.push(row),
    fillLedger: () => {}
  }
}

function install(name: string, value: unknown): void {
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

describe('Crowd crossing sweep integration', () => {
  test('the Crowd producer envelope sends one notice and dedupes on a second sweep', () => {
    const { file, report } = produceCrowdCrossing()
    expect(report.verdicts['N-20261104']).toBe('no_call')
    expect(JSON.parse(file.text)).toMatchObject({ pack: 'crowd', replay: false })

    const notifications: Row<'notifications'>[] = []
    const mails: { to: string[]; subject: string; body: string }[] = []
    const ports = pureSweepPorts(file, notifications, mails)
    const crossingId = (JSON.parse(file.text) as { crossing_id: string }).crossing_id

    const first = runSweep(ports)
    expect(first.crossingsNotified).toEqual([crossingId])
    expect(notifications).toEqual([
      {
        at: '2026-11-03T10:05:00+08:00',
        kind: 'crossing',
        to: 'ops@example.com',
        ref: crossingId,
        gmail_message_id: 'sweep-message-1'
      }
    ])
    expect(mails).toHaveLength(1)
    expect(mails[0]?.body).not.toContain('stadium')
    expect(mails[0]?.body).not.toContain('Show')
    expect(mails[0]?.body).not.toContain('L-20261104-stadium-show')
    expect(mails[0]?.body).not.toContain('@')

    const second = runSweep(ports)
    expect(second.crossingsNotified).toEqual([])
    expect(notifications).toHaveLength(1)
    expect(mails).toHaveLength(1)
  })

  test('the Apps Script entry point stores the Gmail ID returned by the native service double', () => {
    const { file, report } = produceCrowdCrossing()
    expect(report.verdicts['N-20261104']).toBe('no_call')

    const properties: Record<string, string> = {
      SHEET_ID: 'sheet-test',
      CROSSINGS_CROWD_FOLDER_ID: 'crowd-folder',
      TEAM_ALERT_EMAILS: 'ops@example.com'
    }
    const tables = new Map<Tab, Cell[][]>()
    const sent: { subject: string; body: string; date: Date }[] = []
    const sends: { to: string; subject: string; body: string }[] = []

    install('PropertiesService', {
      getScriptProperties: () => ({ getProperty: (key: string) => properties[key] ?? null })
    })
    install('DriveApp', {
      getFolderById: (id: string) => {
        expect(id).toBe('crowd-folder')
        return {
          getFiles: () => {
            let index = 0
            return {
              hasNext: () => index < 1,
              next: () => {
                index += 1
                return {
                  isTrashed: () => false,
                  getId: () => file.id,
                  getName: () => file.name,
                  getBlob: () => ({ getDataAsString: () => file.text })
                }
              }
            }
          }
        }
      }
    })
    install('SpreadsheetApp', {
      openById: (id: string) => {
        expect(id).toBe('sheet-test')
        return {
          getSheetByName: (tab: Tab) => ({
            getLastRow: () => (tables.get(tab)?.length ?? 0) + 1,
            getRange: (row: number, column: number, height: number, width: number) => ({
              getValues: () =>
                Array.from({ length: height }, (_, r) =>
                  Array.from({ length: width }, (_, c) => tables.get(tab)?.[row - 2 + r]?.[column - 1 + c] ?? '')
                ),
              setValues: (values: Cell[][]) => {
                const rows = tables.get(tab) ?? []
                tables.set(tab, rows)
                for (let r = 0; r < height; r++) {
                  const rowIndex = row - 2 + r
                  const target = rows[rowIndex] ?? Array.from({ length: columnsOf(tab).length }, () => '')
                  rows[rowIndex] = target
                  for (let c = 0; c < width; c++) target[column - 1 + c] = values[r]?.[c] ?? ''
                }
              }
            })
          })
        }
      }
    })
    install('GmailApp', {
      sendEmail: (to: string, subject: string, body: string) => {
        sends.push({ to, subject, body })
        sent.push({ subject, body, date: new Date(CROWD_TICK_AT) })
      },
      search: () =>
        sent.length === 0
          ? []
          : [
              {
                getId: () => 'gmail-thread-1',
                getMessages: () =>
                  sent.map((message) => ({
                    getId: () => GMAIL_MESSAGE_ID,
                    getSubject: () => message.subject,
                    getDate: () => message.date
                  }))
              }
            ]
    })
    // main.sweep() is the public trigger entry point and always acquires the script lock.
    install('LockService', {
      getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} })
    })

    runAppsScriptSweep()

    expect(sends).toHaveLength(1)
    const notifications = tables.get('notifications') ?? []
    expect(notifications).toHaveLength(1)
    const messageIdColumn = columnsOf('notifications').indexOf('gmail_message_id')
    expect(notifications[0]?.[messageIdColumn]).toBe(GMAIL_MESSAGE_ID)

    runAppsScriptSweep()
    expect(sends).toHaveLength(1)
    expect(tables.get('notifications')).toHaveLength(1)
  })
})
