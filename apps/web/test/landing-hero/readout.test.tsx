// @vitest-environment jsdom
import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import '../../features/landing-hero/catalogue'
import { HeroReadout } from '../../features/landing-hero/readout'
import { ReplayAnswer } from '../../features/landing-hero/replay-answer'
import type { EvaluateResult } from '../../features/landing-hero/evaluate'
import type { Verdict } from '@skyclause/contracts/api/shared'
import { input } from './fixtures'

type EvaluateOk = Extract<EvaluateResult, { kind: 'ok' }>

async function expectAxeClean(): Promise<void> {
  const results = await axe.run(document.body, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    rules: { 'color-contrast': { enabled: false } }
  } as Parameters<typeof axe.run>[1])
  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toBe('')
}

const since = '2026-11-05T07:00:00.000Z'

function verdict(pack: 'sky' | 'crowd', over: Partial<Verdict> = {}): Verdict {
  return {
    scope: { kind: 'window', id: 'w1' },
    pack,
    mode: 'normal',
    watch: false,
    no_call: null,
    recommendations: [],
    clauses: [],
    open_from: null,
    ...over
  }
}

function response(over: Partial<EvaluateOk> = {}): EvaluateOk {
  return {
    kind: 'ok',
    data: {
      label: 'Clause engine verdict: not reviewed, not sent',
      evaluated_at: '2026-11-05T13:05:00.000Z',
      verdicts: [
        {
          t_eval: '2026-11-05T13:05:00.000Z',
          pack: 'sky',
          content_hash: 'c',
          snapshot_hash: 's',
          hash: 'h',
          site: [],
          windows: [
            verdict('sky', {
              clauses: [
                { key: 'Storm confirmed', result: 'fired', blocked_by: [], inputs: [input()] },
                { key: 'Flash-flood risk', result: 'not_fired', blocked_by: [], inputs: [input()] }
              ]
            })
          ],
          nights: []
        }
      ],
      strip: []
    },
    ...over
  }
}

describe('HeroReadout', () => {
  afterEach(cleanup)

  test('normal renders the mode word per pack, input ages, the label and n=0 with sources', async () => {
    render(
      <HeroReadout
        result={response()}
        win={{ date: '2026-11-05', startMin: 1290, endMin: 1380 }}
        latestCall={null}
        calendarQuery="/v1/public/commons/bukit-jalil/calendar-entries?limit=1"
        rainAnimated
        replay={null}
      />
    )
    expect(screen.getByText('Sky')).toBeTruthy()
    expect(screen.getByText('Normal')).toBeTruthy()
    expect(screen.getByText('Clause engine verdict: not reviewed, not sent')).toBeTruthy()
    // LND-3's figure stays inside a sentence that says what will show there.
    expect(
      screen.getByText('No approved call yet (n=0): the latest one shows here once a person approves it.')
    ).toBeTruthy()
    expect(document.body.textContent).toContain('5 min old')
    const row = document.querySelector('[data-source="https://example.com/gauge"]')
    expect(row).toBeTruthy()
    expect(document.querySelector('[data-source="clock:Asia/Kuala_Lumpur"]')).toBeTruthy()
    await expectAxeClean()
  })

  test('no call renders exactly with no rain value, error with Retry, and not-open exactly', async () => {
    const noCall = response({
      data: {
        label: 'Clause engine verdict: not reviewed, not sent',
        evaluated_at: '2026-11-05T13:05:00.000Z',
        verdicts: [
          {
            t_eval: '2026-11-05T13:05:00.000Z',
            pack: 'sky',
            content_hash: 'c',
            snapshot_hash: 's',
            hash: 'h',
            site: [],
            windows: [
              verdict('sky', {
                mode: null,
                clauses: [
                  {
                    key: 'Storm confirmed',
                    result: 'blocked',
                    blocked_by: [{ name: 'gauge', source_id: '0232901RF', state: 'stale', since }],
                    inputs: []
                  },
                  { key: 'Surge', result: 'not_open', blocked_by: [], inputs: [] }
                ],
                open_from: '2026-11-05T14:00:00.000Z'
              })
            ],
            nights: []
          }
        ],
        strip: []
      }
    })
    render(
      <HeroReadout
        result={noCall}
        win={{ date: '2026-11-05', startMin: 1290, endMin: 1380 }}
        latestCall={null}
        calendarQuery="/v1/public/commons/bukit-jalil/calendar-entries?limit=1"
        rainAnimated={false}
        replay={null}
      />
    )
    expect(screen.getByText('No call for Storm confirmed: gauge 0232901RF silent since 15:00 MYT')).toBeTruthy()
    expect(screen.getByText('Surge evaluates from 22:00 MYT')).toBeTruthy()
    expect(document.body.textContent).not.toContain('39 mm')
    await expectAxeClean()
  })

  test('erroring input renders Couldn’t reach exactly with a Retry button, and a 429 names its MYT time', async () => {
    const error = response({
      data: {
        label: 'Clause engine verdict: not reviewed, not sent',
        evaluated_at: '2026-11-05T13:05:00.000Z',
        verdicts: [
          {
            t_eval: '2026-11-05T13:05:00.000Z',
            pack: 'sky',
            content_hash: 'c',
            snapshot_hash: 's',
            hash: 'h',
            site: [],
            windows: [
              verdict('sky', {
                clauses: [
                  {
                    key: 'Storm confirmed',
                    result: 'fired',
                    blocked_by: [],
                    inputs: [input({ name: 'JPS gauge', state: 'error', value: null, since, observed_at: since })]
                  }
                ]
              })
            ],
            nights: []
          }
        ],
        strip: []
      }
    })
    const { unmount } = render(
      <HeroReadout
        result={error}
        win={{ date: '2026-11-05', startMin: 1290, endMin: 1380 }}
        latestCall={null}
        calendarQuery="/v1/public/commons/bukit-jalil/calendar-entries?limit=1"
        rainAnimated={false}
        replay={null}
      />
    )
    expect(screen.getByText('Couldn’t reach the JPS gauge at 15:00 MYT.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
    unmount()
    render(
      <HeroReadout
        result={{ kind: 'rate_limited', retryAfter: '2026-11-05T13:06:00.000Z' }}
        win={{ date: '2026-11-05', startMin: 1290, endMin: 1380 }}
        latestCall={null}
        calendarQuery="/v1/public/commons/bukit-jalil/calendar-entries?limit=1"
        rainAnimated={false}
        replay={null}
      />
    )
    // A rate limit says when to try again, plainly, and still offers Retry.
    expect(screen.getByText('Live verdicts are busy just now.')).toBeTruthy()
    expect(screen.getByText('Try again after 21:06 MYT.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/\b429\b/)
    await expectAxeClean()
  })

  test('the latest approved call reads its date from the calendar and links nowhere until /c/{callId} is built', async () => {
    render(
      <HeroReadout
        result={response()}
        win={{ date: '2026-11-05', startMin: 1290, endMin: 1380 }}
        latestCall={{
          callId: '01J000000000000000000000001',
          permalink: '/c/01J000000000000000000000001',
          at: '2026-11-04T08:00:00.000Z'
        }}
        calendarQuery="/v1/public/x/y/calendar-entries?limit=1"
        rainAnimated
        replay={null}
      />
    )
    const latest = screen.getByText('Latest approved call').closest('[data-source]')
    expect(latest?.querySelector('time')?.getAttribute('dateTime')).toBe('2026-11-04T08:00:00.000Z')
    expect(latest?.getAttribute('data-source')).toBe('/v1/public/x/y/calendar-entries?limit=1')
    expect(screen.queryByRole('link', { name: /Latest approved call/ })).toBeNull()
    await expectAxeClean()
  })

  test('a failed calendar read says so and never reads n=0', () => {
    render(
      <HeroReadout
        result={response()}
        win={{ date: '2026-11-05', startMin: 1290, endMin: 1380 }}
        latestCall="error"
        calendarQuery="/v1/public/x/y/calendar-entries?limit=1"
        rainAnimated
        replay={null}
      />
    )
    expect(screen.getByText('Couldn’t reach the approved-call calendar.')).toBeTruthy()
    expect(screen.queryByText(/No approved call yet/)).toBeNull()
  })

  test('while live verdicts are not open, the answer is the labelled 2 November replay, with no error or Retry', async () => {
    render(
      <HeroReadout
        result={{ kind: 'unavailable' }}
        win={{ date: '2026-11-05', startMin: 1290, endMin: 1380 }}
        latestCall="not_built"
        calendarQuery="/v1/public/x/y/calendar-entries?limit=1"
        rainAnimated={false}
        replay={<ReplayAnswer />}
      />
    )
    // One plain sentence: what this is and what is not open yet.
    expect(
      screen.getByText(
        'Live verdicts for the window you pick are not open yet, so this is 2 November, replayed from the JPS gauge’s readings.'
      )
    ).toBeTruthy()
    const mark = document.querySelector('[data-replay-mark]')!
    expect(mark.textContent).toBe('Replay')
    expect(mark.closest('[data-source]')?.getAttribute('data-source')).toBe(
      'https://infobanjirjpskl.water.gov.my/Rainfall/GetRainfallGraph/75'
    )
    // The replay's window, its verdict as a mode with glyph and word, the fired clause, and the input with its age.
    expect(screen.getByText('Monday 2 November 2026, 15:30 MYT to 15:45 MYT')).toBeTruthy()
    const mode = document.querySelector('[data-pack="sky"] .status-mark')!
    expect(mode.getAttribute('data-state')).toBe('commute_disruption')
    expect(mode.textContent).toBe('Commute disruption')
    expect(mode.querySelector('svg')).toBeTruthy()
    expect(screen.getByText('Storm confirmed fired')).toBeTruthy()
    const gauge = document.querySelector(
      'li[data-source="https://infobanjirjpskl.water.gov.my/Rainfall/GetRainfallGraph/75"]'
    )!
    expect(gauge.textContent).toContain('39 mm')
    expect(gauge.textContent).toContain('0232901RF')
    expect(gauge.textContent).toContain('5 min old')
    expect(screen.getByText('Clause engine verdict: not reviewed, not sent')).toBeTruthy()
    expect(screen.getByText('Evaluated 15:05 MYT')).toBeTruthy()
    // Nothing to retry and nothing a visitor should read as a fault.
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    expect(document.body.textContent).not.toMatch(/\b50\d\b|not built|\bAPI\b|Couldn’t/)
    // LND-3 holds here too; a calendar the API does not serve yet says what will show, never n=0.
    expect(screen.getByText('Approved calls show here once the conditions calendar opens.')).toBeTruthy()
    expect(screen.queryByText(/n=0/)).toBeNull()
    await expectAxeClean()
  })

  test('a failed read keeps Retry, names the time it failed, and still shows the latest approved call', () => {
    render(
      <HeroReadout
        result={{ kind: 'error', status: 503, at: '2026-11-05T08:25:00.000Z' }}
        win={{ date: '2026-11-05', startMin: 1290, endMin: 1380 }}
        latestCall={{ callId: 'c1', permalink: '/c/c1', at: '2026-11-04T08:00:00.000Z' }}
        calendarQuery="/v1/public/x/y/calendar-entries?limit=1"
        rainAnimated={false}
        replay={null}
      />
    )
    expect(screen.getByText('Couldn’t reach the live verdict just now.')).toBeTruthy()
    expect(screen.getByText('Last tried at 16:25 MYT.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
    // A real failure is said in words; the status code stays out of sight, and no replay stands in for the answer.
    expect(document.body.textContent).not.toMatch(/\b503\b/)
    expect(document.querySelector('[data-replay-mark]')).toBeNull()
    expect(screen.getByText('Latest approved call')).toBeTruthy()
  })

  test('indicators and clauses read by their names, never their keys', () => {
    render(
      <HeroReadout
        result={response({
          data: {
            ...response().data,
            verdicts: [
              {
                ...response().data.verdicts[0]!,
                windows: [
                  verdict('sky', {
                    clauses: [{ key: 'storm_confirmed', result: 'fired', blocked_by: [], inputs: [input()] }]
                  })
                ]
              }
            ]
          }
        })}
        win={{ date: '2026-11-05', startMin: 1290, endMin: 1380 }}
        latestCall={null}
        calendarQuery="/v1/public/x/y/calendar-entries?limit=1"
        rainAnimated
        replay={null}
      />
    )
    expect(screen.getByText('Storm confirmed fired')).toBeTruthy()
    expect(screen.getByText('Rain in the last 60 minutes (site)')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/storm_confirmed|site\.rain_60m_mm/)
    expect(
      screen.getByRole('link', { name: 'Open source: Rain in the last 60 minutes (site), in a new tab' })
    ).toBeTruthy()
  })
})
