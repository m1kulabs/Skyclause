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

  test("erroring input renders Couldn't reach exactly with a Retry button, and a 429 names its MYT time", async () => {
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
    expect(screen.getByText("Couldn't reach the JPS gauge at 15:00 MYT.")).toBeTruthy()
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

  test('the latest approved call links to /c/{callId} with its calendar source', async () => {
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
    const link = screen.getByRole('link', { name: /Latest approved call/ })
    expect(link.getAttribute('href')).toBe('/c/01J000000000000000000000001')
    expect(link.closest('[data-source]')?.getAttribute('data-source')).toBe('/v1/public/x/y/calendar-entries?limit=1')
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
    expect(screen.getByText("Couldn't reach the approved-call calendar.")).toBeTruthy()
    expect(screen.queryByText('No approved call yet (n=0)')).toBeNull()
  })
})
