// Tests for the WIN-1 opt-in form (#50): the field order, the idempotent
// create, the submit handler's rows and its rejects. Forms and sheets are fakes.
import { describe, expect, test } from 'bun:test'
import {
  ensureResponsesSheetId,
  nextId,
  OPTIN_CONSENT_CHOICE,
  OPTIN_LANGUAGE_HELP,
  OPTIN_TITLES,
  optinDescription,
  optinFieldSpecs,
  pdpaNotice,
  REJECT_COLUMN,
  runCreateWindowForm,
  runOptinSubmit,
  type OptinStores,
  type OptinSubmission,
  type WindowFormPort
} from './optin-form.ts'
import { triggerRegistry } from './registry.ts'
import { columnsOf, type Row } from './schema.ts'
import type { DrivePort, PropertyPort } from './setup.ts'

const SUBMITTED = new Date('2026-11-07T09:15:00+08:00')

function answers(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    [OPTIN_TITLES.title]: 'Haze Lab Session',
    [OPTIN_TITLES.kind]: 'Class',
    [OPTIN_TITLES.date]: '2026-11-10',
    [OPTIN_TITLES.start]: '14:00',
    [OPTIN_TITLES.end]: '16:00',
    [OPTIN_TITLES.email]: 'Student@Example.com',
    [OPTIN_TITLES.role]: 'Commuting student',
    [OPTIN_TITLES.language]: 'English',
    [OPTIN_TITLES.consent]: OPTIN_CONSENT_CHOICE,
    ...overrides
  }
}

function fakeStores(seed?: { windows?: Row<'windows'>[]; subscribers?: Row<'subscribers'>[] }): OptinStores & {
  windows: Row<'windows'>[]
  subscribers: Row<'subscribers'>[]
  rejects: { rowNumber: number; reason: string }[]
} {
  const windows = [...(seed?.windows ?? [])]
  const subscribers = [...(seed?.subscribers ?? [])]
  const rejects: { rowNumber: number; reason: string }[] = []
  return {
    windows,
    subscribers,
    rejects,
    windowIds: () => windows.map((row) => String(row.window_id)),
    subscriberIds: () => subscribers.map((row) => String(row.subscriber_id)),
    subscriberByEmail: (email) => subscribers.find((row) => row.email === email) ?? null,
    appendWindow: (row) => void windows.push(row),
    appendSubscriber: (row) => void subscribers.push(row),
    updateSubscriber: (email, patch) => {
      const found = subscribers.find((row) => row.email === email)
      if (found) Object.assign(found, patch)
    },
    writeReject: (rowNumber, reason) => void rejects.push({ rowNumber, reason })
  }
}

function submit(values: Record<string, string>, stores: OptinStores, rowNumber = 2): ReturnType<typeof runOptinSubmit> {
  const submission: OptinSubmission = { rowNumber, values, submittedAt: SUBMITTED }
  return runOptinSubmit(submission, stores)
}

function fakeForm(linked: { id: string; publishedUrl: string } | null = null): WindowFormPort & {
  created: { title: string; description: string; fields: unknown[] }[]
  rejectColumns: number
} {
  const created: { title: string; description: string; fields: unknown[] }[] = []
  return {
    created,
    rejectColumns: 0,
    linkedForm: () => linked,
    createForm: (title, description, fields) => {
      created.push({ title, description, fields })
      return { id: 'form-1', publishedUrl: 'https://docs.google.com/forms/d/form-1/viewform' }
    },
    ensureRejectColumn: function () {
      this.rejectColumns += 1
    }
  }
}

describe('optinFieldSpecs', () => {
  test('lists the ten WIN-1 fields in order, with the notice before consent', () => {
    const specs = optinFieldSpecs('inbox@example.com')
    expect(specs.map((spec) => ('title' in spec ? spec.title : ''))).toEqual([
      OPTIN_TITLES.title,
      OPTIN_TITLES.kind,
      OPTIN_TITLES.date,
      OPTIN_TITLES.start,
      OPTIN_TITLES.end,
      OPTIN_TITLES.email,
      OPTIN_TITLES.role,
      OPTIN_TITLES.language,
      OPTIN_TITLES.notice,
      OPTIN_TITLES.consent
    ])
    expect(specs.map((spec) => spec.item)).toEqual([
      'text',
      'choice',
      'date',
      'time',
      'time',
      'text',
      'choice',
      'choice',
      'section',
      'checkbox'
    ])
    expect(specs.every((spec) => spec.item === 'section' || spec.required)).toBe(true)
  })

  test('offers the ticket kinds, roles and the single English language', () => {
    const specs = optinFieldSpecs('inbox@example.com')
    const byTitle = Object.fromEntries(specs.filter((spec) => 'title' in spec).map((spec) => [spec.title, spec]))
    expect(byTitle[OPTIN_TITLES.kind]).toMatchObject({ choices: ['Class', 'Event', 'Commute wave'] })
    expect(byTitle[OPTIN_TITLES.role]).toMatchObject({
      choices: ['Commuting student', 'Student club events lead', 'Lecturer', 'Hackathon reviewer', 'Other']
    })
    expect(byTitle[OPTIN_TITLES.language]).toMatchObject({ choices: ['English'], help: OPTIN_LANGUAGE_HELP })
    expect(byTitle[OPTIN_TITLES.email]).toMatchObject({ email: true, help: 'No sign-in needed.' })
    expect(byTitle[OPTIN_TITLES.consent]).toMatchObject({ choices: [OPTIN_CONSENT_CHOICE] })
  })

  test('the PDPA notice carries the inbox and the not-a-safety-service line', () => {
    const notice = pdpaNotice('sky-team@example.com')
    expect(notice).toContain('sky-team@example.com')
    expect(notice).toContain('In an emergency, call 999.')
    expect(notice).toContain('never your email or window title')
    expect(optinDescription()).toContain('the end is after the start')
    expect(optinDescription()).toContain('cannot submit without it')
  })
})

describe('runCreateWindowForm', () => {
  test('creates the form with the ticket fields, then reuses the linked form', () => {
    const form = fakeForm()
    const first = runCreateWindowForm(form, 'sky-team@example.com')
    expect(first).toEqual({
      formId: 'form-1',
      publishedUrl: 'https://docs.google.com/forms/d/form-1/viewform',
      created: true
    })
    expect(form.created).toHaveLength(1)
    expect(form.created[0]?.description).toContain('the end is after the start')
    expect(form.created[0]?.description).toContain('cannot submit without it')
    expect(form.rejectColumns).toBe(1)

    const reused = fakeForm({ id: 'form-9', publishedUrl: 'https://forms/published' })
    expect(runCreateWindowForm(reused, 'sky-team@example.com')).toEqual({
      formId: 'form-9',
      publishedUrl: 'https://forms/published',
      created: false
    })
    expect(reused.created).toHaveLength(0)
    expect(reused.rejectColumns).toBe(1)
  })
})

describe('ensureResponsesSheetId', () => {
  function workspace() {
    const props = new Map<string, string>()
    const properties: PropertyPort = {
      get: (name) => props.get(name) ?? null,
      set: (name, value) => void props.set(name, value)
    }
    const drive: DrivePort = {
      findRootFolder: () => null,
      createRootFolder: () => 'root-1',
      findFolder: () => null,
      createFolder: (_parent, _name) => 'folder-1',
      findSpreadsheet: () => null,
      createSpreadsheet: () => 'responses-1'
    }
    return { props, properties, drive }
  }

  test('stores the new responses workbook once and keeps it on reruns', () => {
    const { props, properties, drive } = workspace()
    expect(ensureResponsesSheetId({ properties, drive })).toBe('responses-1')
    expect(props.get('RESPONSES_SHEET_ID')).toBe('responses-1')
    expect(ensureResponsesSheetId({ properties, drive })).toBe('responses-1')
  })
})

describe('runOptinSubmit', () => {
  test('writes one windows row and one subscribers row in schema column order', () => {
    const stores = fakeStores()
    expect(submit(answers(), stores)).toEqual({ ok: true, windowId: 'W-0001', subscriberId: 'S-0001' })
    expect(stores.rejects).toEqual([])
    expect(stores.subscribers).toEqual([
      {
        subscriber_id: 'S-0001',
        email: 'student@example.com',
        role: 'commuting_student',
        language: 'en',
        consent_at: '2026-11-07T09:15:00+08:00',
        unsubscribed_at: ''
      }
    ])
    expect(stores.windows).toEqual([
      {
        window_id: 'W-0001',
        subscriber_id: 'S-0001',
        kind: 'class',
        date: '2026-11-10',
        start_myt: '2026-11-10T14:00:00+08:00',
        end_myt: '2026-11-10T16:00:00+08:00',
        language: 'en',
        status: 'active',
        declared_at: '2026-11-07T09:15:00+08:00',
        title: 'Haze Lab Session'
      }
    ])
    expect(Object.keys(stores.windows[0] ?? {})).toEqual([...columnsOf('windows')])
    expect(Object.keys(stores.subscribers[0] ?? {})).toEqual([...columnsOf('subscribers')])
  })

  test('a second window from the same address, however cased, reuses its S- ID', () => {
    const stores = fakeStores()
    submit(answers(), stores)
    const result = submit(
      answers({ [OPTIN_TITLES.email]: 'STUDENT@example.com', [OPTIN_TITLES.title]: 'Evening Gig' }),
      stores,
      3
    )
    expect(result).toEqual({ ok: true, windowId: 'W-0002', subscriberId: 'S-0001' })
    expect(stores.subscribers).toHaveLength(1)
    expect(stores.windows.map((row) => [row.window_id, row.subscriber_id])).toEqual([
      ['W-0001', 'S-0001'],
      ['W-0002', 'S-0001']
    ])
  })

  test('the ID sequence continues past existing rows', () => {
    const stores = fakeStores({
      windows: [{ window_id: 'W-0009' } as Row<'windows'>],
      subscribers: [{ subscriber_id: 'S-0003', email: 'other@example.com' } as Row<'subscribers'>]
    })
    expect(nextId('W-', stores.windowIds())).toBe('W-0010')
    const result = submit(answers(), stores)
    expect(result).toEqual({ ok: true, windowId: 'W-0010', subscriberId: 'S-0004' })
  })

  test('an end before the start writes no rows and records the reason', () => {
    const stores = fakeStores()
    const result = submit(answers({ [OPTIN_TITLES.start]: '16:00', [OPTIN_TITLES.end]: '14:00' }), stores)
    expect(result).toEqual({ ok: false, reason: 'rejected: end 14:00 is before start 16:00' })
    expect(stores.windows).toEqual([])
    expect(stores.subscribers).toEqual([])
    expect(stores.rejects).toEqual([{ rowNumber: 2, reason: 'rejected: end 14:00 is before start 16:00' }])
  })

  test('an end equal to the start is accepted only for a commute wave', () => {
    for (const [kind, accepted] of [
      ['Class', false],
      ['Event', false],
      ['Commute wave', true]
    ] as const) {
      const stores = fakeStores()
      const result = submit(
        answers({ [OPTIN_TITLES.kind]: kind, [OPTIN_TITLES.start]: '08:30', [OPTIN_TITLES.end]: '08:30' }),
        stores
      )
      if (accepted) {
        expect(result).toEqual({ ok: true, windowId: 'W-0001', subscriberId: 'S-0001' })
        expect(stores.rejects).toEqual([])
      } else {
        expect(result).toEqual({ ok: false, reason: 'rejected: end equals start and kind is not commute_wave' })
        expect(stores.windows).toEqual([])
        expect(stores.subscribers).toEqual([])
      }
    }
  })

  test('missing consent writes no rows and records the reason', () => {
    const stores = fakeStores()
    const result = submit(answers({ [OPTIN_TITLES.consent]: '' }), stores)
    expect(result.ok).toBe(false)
    expect(stores.windows).toEqual([])
    expect(stores.subscribers).toEqual([])
    expect(stores.rejects).toHaveLength(1)
  })

  test('the reject column name is stable for the response sheet', () => {
    expect(REJECT_COLUMN).toBe('reject_reason')
  })
})

describe('the trigger registry', () => {
  test('registers the submit handler on the responses spreadsheet', () => {
    expect(triggerRegistry).toContainEqual({
      kind: 'on_form_submit',
      handler: 'onWindowFormSubmit',
      spreadsheet: 'RESPONSES_SHEET_ID'
    })
  })
})
