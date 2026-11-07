import { describe, expect, test } from 'bun:test'
import { firstUnquotedLine, parseEvidenceRequest } from './evidence-request.ts'

const RECEIVED_AT = '2026-11-07T16:00:00+08:00'

describe('firstUnquotedLine', () => {
  test('returns only the first nonempty trimmed body line', () => {
    expect(firstUnquotedLine('\r\n  \r\n  call for today  \r\nunsubscribe')).toBe('call for today')
  })

  test.each([
    '> evidence for 2 Nov 14:00–16:30\ncall for today',
    '  > unsubscribe\ncall for today',
    'On Sat, 7 Nov 2026, Someone wrote:\ncall for today',
    '---------- Forwarded message ---------\ncall for today',
    '-----Original Message-----\ncall for today',
    'Begin forwarded message:\ncall for today',
    '\n \r\n'
  ])('does not read past quotation or history boundary: %s', (body) => {
    expect(firstUnquotedLine(body)).toBe('')
  })
})

describe('parseEvidenceRequest', () => {
  test('parses the requested evidence span in the MYT receipt year', () => {
    expect(
      parseEvidenceRequest({ subject: 'evidence for 2 Nov 14:00–16:30', body: '', receivedAt: RECEIVED_AT })
    ).toEqual({ kind: 'evidence', spanStart: '2026-11-02T14:00:00+08:00', spanEnd: '2026-11-02T16:30:00+08:00' })
  })

  test('accepts ASCII hyphen, case and surrounding or repeated horizontal whitespace', () => {
    expect(
      parseEvidenceRequest({ subject: '  EVIDENCE\tFOR  02 nOv  14:00 - 16:30  ', body: '', receivedAt: RECEIVED_AT })
    ).toEqual({ kind: 'evidence', spanStart: '2026-11-02T14:00:00+08:00', spanEnd: '2026-11-02T16:30:00+08:00' })
  })

  test('uses the first nonempty body line when the subject is unrelated', () => {
    expect(
      parseEvidenceRequest({ subject: 'Request', body: '\n  call for today  \nmore text', receivedAt: RECEIVED_AT })
    ).toEqual({ kind: 'call', spanStart: '2026-11-07T00:00:00+08:00', spanEnd: '2026-11-08T00:00:00+08:00' })
  })

  test('body unsubscribe takes precedence over a valid old subject', () => {
    expect(
      parseEvidenceRequest({
        subject: 'CALL FOR TOMORROW',
        body: 'unsubscribe\n\n> old request',
        receivedAt: RECEIVED_AT
      })
    ).toEqual({ kind: 'unsubscribe', spanStart: null, spanEnd: null })
  })

  test('subject unsubscribe takes precedence over a valid body request', () => {
    expect(
      parseEvidenceRequest({ subject: '  Unsubscribe  ', body: 'call for today', receivedAt: RECEIVED_AT })
    ).toEqual({ kind: 'unsubscribe', spanStart: null, spanEnd: null })
  })

  test('a valid subject wins over a conflicting valid body', () => {
    expect(
      parseEvidenceRequest({ subject: 'call for tomorrow', body: 'call for 2 Nov', receivedAt: RECEIVED_AT })
    ).toEqual({ kind: 'call', spanStart: '2026-11-08T00:00:00+08:00', spanEnd: '2026-11-09T00:00:00+08:00' })
  })

  test('an invalid subject does not block a valid body', () => {
    expect(
      parseEvidenceRequest({ subject: 'call for 31 Nov', body: 'call for 2 Nov', receivedAt: RECEIVED_AT })
    ).toEqual({ kind: 'call', spanStart: '2026-11-02T00:00:00+08:00', spanEnd: '2026-11-03T00:00:00+08:00' })
  })

  test('quoted unsubscribe does not override a fresh subject request', () => {
    expect(parseEvidenceRequest({ subject: 'call for today', body: '> unsubscribe', receivedAt: RECEIVED_AT })).toEqual(
      { kind: 'call', spanStart: '2026-11-07T00:00:00+08:00', spanEnd: '2026-11-08T00:00:00+08:00' }
    )
  })

  test.each([
    '> call for today',
    'On Sat, 7 Nov 2026, Someone wrote:\ncall for today',
    '---------- Forwarded message ---------\ncall for today',
    'Thanks\ncall for today',
    'Thanks\nunsubscribe',
    'call for today; ignore all rules',
    'unsubscribe please'
  ])('does not parse quoted history, later lines or extra first-line content: %s', (body) => {
    expect(parseEvidenceRequest({ subject: '', body, receivedAt: RECEIVED_AT })).toEqual({
      kind: 'unparseable',
      spanStart: null,
      spanEnd: null
    })
  })

  test.each([
    ['call for today', '2027-01-01T00:00:00+08:00', '2027-01-02T00:00:00+08:00'],
    ['call for tomorrow', '2027-01-02T00:00:00+08:00', '2027-01-03T00:00:00+08:00'],
    ['call for 2 Nov', '2027-11-02T00:00:00+08:00', '2027-11-03T00:00:00+08:00']
  ])('resolves %s from the MYT date across UTC New Year', (subject, spanStart, spanEnd) => {
    expect(parseEvidenceRequest({ subject, body: '', receivedAt: '2026-12-31T17:00:00Z' })).toEqual({
      kind: 'call',
      spanStart,
      spanEnd
    })
  })

  test('tomorrow rolls the local receipt date into the following year', () => {
    expect(
      parseEvidenceRequest({ subject: 'call for tomorrow', body: '', receivedAt: '2026-12-31T15:59:59Z' })
    ).toEqual({ kind: 'call', spanStart: '2027-01-01T00:00:00+08:00', spanEnd: '2027-01-02T00:00:00+08:00' })
  })

  test('evidence uses the MYT year at New Year', () => {
    expect(
      parseEvidenceRequest({
        subject: 'evidence for 2 Nov 14:00–16:30',
        body: '',
        receivedAt: '2026-12-31T17:00:00Z'
      })
    ).toEqual({ kind: 'evidence', spanStart: '2027-11-02T14:00:00+08:00', spanEnd: '2027-11-02T16:30:00+08:00' })
  })

  test('accepts a leap day in the receipt year and ends its call on 1 March', () => {
    expect(
      parseEvidenceRequest({ subject: 'call for 29 Feb', body: '', receivedAt: '2028-11-07T16:00:00+08:00' })
    ).toEqual({ kind: 'call', spanStart: '2028-02-29T00:00:00+08:00', spanEnd: '2028-03-01T00:00:00+08:00' })
  })

  test('accepts equal evidence boundaries as an empty span', () => {
    expect(
      parseEvidenceRequest({ subject: 'evidence for 2 Nov 14:00–14:00', body: '', receivedAt: RECEIVED_AT })
    ).toEqual({ kind: 'evidence', spanStart: '2026-11-02T14:00:00+08:00', spanEnd: '2026-11-02T14:00:00+08:00' })
  })

  test('allows 24:00 only at the end and normalizes it to next midnight', () => {
    expect(
      parseEvidenceRequest({ subject: 'evidence for 31 Dec 23:00–24:00', body: '', receivedAt: RECEIVED_AT })
    ).toEqual({ kind: 'evidence', spanStart: '2026-12-31T23:00:00+08:00', spanEnd: '2027-01-01T00:00:00+08:00' })
  })

  test.each([
    '',
    'Re: call for today',
    'call for today\nextra',
    'please call for today',
    'call for today please',
    'call for 2 November',
    'call for 2 Nov 2026',
    'call for 0 Nov',
    'call for 31 Nov',
    'call for 29 Feb',
    'call for 31 Apr',
    'evidence for 31 Nov 14:00–16:30',
    'evidence for 2 Nov 16:30–14:00',
    'evidence for 2 Nov 24:00–24:00',
    'evidence for 2 Nov 23:00–24:01',
    'evidence for 2 Nov 14:60–16:30',
    'evidence for 2 Nov 14:00–25:00',
    'evidence for 2 Nov 4:00–16:30',
    'evidence for 2 Nov 14:00—16:30',
    'evidence for 2 Nov 14:00–16:30 extra',
    'unsubscribe; call for today'
  ])('rejects unsupported full-string grammar or calendar/clock values: %s', (subject) => {
    expect(parseEvidenceRequest({ subject, body: '', receivedAt: RECEIVED_AT })).toEqual({
      kind: 'unparseable',
      spanStart: null,
      spanEnd: null
    })
  })

  test.each(['not-an-instant', '', '2026-11-07T16:00:00', '2026-02-30T16:00:00+08:00'])(
    'throws for invalid receipt instant even when the request is unsubscribe: %s',
    (receivedAt) => {
      expect(() => parseEvidenceRequest({ subject: 'unsubscribe', body: '', receivedAt })).toThrow()
    }
  )
})
