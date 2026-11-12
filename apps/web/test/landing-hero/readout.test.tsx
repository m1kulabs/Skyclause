// @vitest-environment jsdom
import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import '../../features/landing-hero/catalogue'
import { HeroReadout } from '../../features/landing-hero/readout'
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
      />
    )
    expect(screen.getByText('Sky')).toBeTruthy()
    expect(screen.getByText('Normal')).toBeTruthy()
    expect(screen.getByText('Clause engine verdict: not reviewed, not sent')).toBeTruthy()
    expect(screen.getByText('No approved call yet (n=0)')).toBeTruthy()
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
      />
    )
    expect(screen.getByText('Retry after 21:06 MYT')).toBeTruthy()
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
      />
    )
    expect(screen.getByText('Couldn’t reach the approved-call calendar.')).toBeTruthy()
    expect(screen.queryByText('No approved call yet (n=0)')).toBeNull()
  })

  test('a 501 says the verdict is not built, offers the replay instead of Retry, and keeps the approved-call line', async () => {
    render(
      <HeroReadout
        result={{ kind: 'error', status: 501, at: '2026-11-05T08:25:00.000Z' }}
        win={{ date: '2026-11-05', startMin: 1290, endMin: 1380 }}
        latestCall="not_built"
        calendarQuery="/v1/public/x/y/calendar-entries?limit=1"
        rainAnimated={false}
      />
    )
    expect(screen.getByText('The live verdict is not built yet.')).toBeTruthy()
    expect(screen.getByText('The public API answered 501 at 16:25 MYT.')).toBeTruthy()
    // Trying again cannot build it: the way forward is the labelled replay of a real day.
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    const replay = screen.getByRole('link', { name: 'See 2 November, replayed' })
    expect(replay.getAttribute('href')).toBe('#how')
    expect(replay.getAttribute('data-source')).toBeTruthy()
    // LND-3 holds in the error state too, and a calendar that answered 501 says so instead of n=0.
    expect(screen.getByText('The approved-call calendar is not built yet.')).toBeTruthy()
    expect(screen.queryByText('No approved call yet (n=0)')).toBeNull()
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
      />
    )
    expect(screen.getByText('Couldn’t reach the live verdict at 16:25 MYT.')).toBeTruthy()
    expect(screen.getByText('It answered 503.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: /replayed/ })).toBeNull()
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
      />
    )
    expect(screen.getByText('Storm confirmed')).toBeTruthy()
    expect(screen.getByText('Rain in the last 60 minutes (site)')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/storm_confirmed|site\.rain_60m_mm/)
    expect(
      screen.getByRole('link', { name: 'Open source: Rain in the last 60 minutes (site), in a new tab' })
    ).toBeTruthy()
  })
})
