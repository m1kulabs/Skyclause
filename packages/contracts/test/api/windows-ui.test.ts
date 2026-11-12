import { expect, test } from 'vitest'
import { createWindow, updateWindow, cancelWindow, listWindows } from '../../src/api/v1/windows'
import { createIcsFeed } from '../../src/api/v1/ics-feeds'

test('#139 series scope survives request parsing and rejects unknown scopes', () => {
  for (const operation of [updateWindow, cancelWindow]) {
    expect(operation.request.query.parse({ scope: 'series' })).toEqual({ scope: 'series' })
    expect(operation.request.query.parse({ scope: 'occurrence' })).toEqual({ scope: 'occurrence' })
    expect(operation.request.query.safeParse({ scope: 'all_projects' }).success).toBe(false)
  }
})

test('window writes reject undeclared root and recurrence fields instead of stripping provenance', () => {
  const fields = {
    title: 'Lecture',
    kind: 'class',
    starts_at: '2026-11-16T01:00:00Z',
    ends_at: '2026-11-16T02:00:00Z',
    tz: 'UTC'
  }
  for (const operation of [createWindow, updateWindow]) {
    const schema = operation.request.body.content['application/json'].schema
    expect(schema.safeParse({ ...fields, declared_by: 'spoof' }).success).toBe(false)
    expect(
      schema.safeParse({
        ...fields,
        recurrence: { frequency: 'weekly', days_of_week: ['monday'], count: 1, skip_dates: [], org_id: 'spoof' }
      }).success
    ).toBe(false)
  }
  expect(updateWindow.request.body.content['application/json'].schema.safeParse({}).success).toBe(false)
  for (const operation of [updateWindow, cancelWindow])
    expect(operation.request.query.safeParse({ scope: 'series', org_id: 'spoof' }).success).toBe(false)
})

test('#143 list filters include calls and dates without changing pagination', () => {
  expect(listWindows.request.query.parse({ include: 'calls', from: '2026-11-02', to: '2026-11-16' })).toMatchObject({
    include: 'calls',
    from: '2026-11-02',
    to: '2026-11-16',
    limit: 50
  })
})

test('#139 ICS import accepts exactly one URL or file and does not parse calendar data in the UI', () => {
  const schema = createIcsFeed.request.body.content['application/json'].schema
  expect(
    schema.safeParse({
      file: { name: '2-november-replay.ics', content: 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR' }
    }).success
  ).toBe(true)
  expect(schema.safeParse({ url: 'https://calendar.example.org/replay.ics' }).success).toBe(true)
  expect(schema.safeParse({}).success).toBe(false)
  expect(schema.safeParse({ file: { name: 'replay.ics', content: '' } }).success).toBe(false)
  expect(
    schema.safeParse({
      url: 'https://calendar.example.org/replay.ics',
      file: { name: 'replay.ics', content: 'BEGIN:VCALENDAR' }
    }).success
  ).toBe(false)
})

test('ICS import accepts a window kind and defaults it to class', () => {
  const schema = createIcsFeed.request.body.content['application/json'].schema
  expect(schema.parse({ url: 'https://calendar.example.org/calendar.ics' })).toMatchObject({ kind: 'class' })
  expect(schema.safeParse({ url: 'https://calendar.example.org/calendar.ics', kind: 'class' }).success).toBe(true)
  expect(schema.safeParse({ url: 'https://calendar.example.org/calendar.ics', kind: 'bogus' }).success).toBe(false)
})
