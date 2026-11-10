import { describe, expect, test } from 'vitest'
import { callCard, cardAlt, projectCard, windowCard } from '../../features/share-previews/card'
import { call, pack, publicWindow, rain60, status } from './doubles'

const NOW = new Date('2026-11-02T07:05:00Z')
const inForce = pack({ pack: 'sky', basis: 'approved_call', call_id: call().id, mode: 'commute_disruption' })

// WEB-4: "each image shows the mode, window time and capture time of the data". Expected strings are worked by hand
// from the doubles: 07:30Z is 15:30 MYT on Monday 2 November 2026.
describe('card models', () => {
  test('a project card shows the approved call in force, its window, the derived strip and the capture time', () => {
    const strip = [
      rain60('2026-11-02T06:00:00Z', 3),
      rain60('2026-11-02T06:30:00Z', 20),
      rain60('2026-11-02T07:00:00Z', 39)
    ]
    const card = projectCard(status({ packs: [inForce, pack({ pack: 'crowd' })], strip }), call(), NOW)

    expect(card).toEqual({
      project: 'bukit-jalil',
      state: 'commute_disruption',
      range: '15:30 MYT – 17:00 MYT',
      window: '15:30 MYT – 17:00 MYT · Monday 2 November 2026',
      approved: null,
      noCall: null,
      strip: {
        from: '2026-11-02T06:00:00Z',
        to: '2026-11-02T07:05:00.000Z',
        now: '2026-11-02T07:05:00.000Z',
        window: null,
        rain5: [],
        rain60: [
          { at: '2026-11-02T06:00:00Z', value: 3 },
          { at: '2026-11-02T06:30:00Z', value: 20 },
          { at: '2026-11-02T07:00:00Z', value: 39 }
        ]
      },
      captured: '2 November 2026, 15:00 MYT',
      reading: '39 mm Rain in the last 60 minutes at 15:00 MYT'
    })
    expect(cardAlt(card)).toBe(
      'Commute disruption. 15:30 MYT – 17:00 MYT · Monday 2 November 2026. Deciding reading: 39 mm Rain in the last 60 minutes at 15:00 MYT.'
    )
  })

  test("the window's box is cut to the strip's range, and left out when they don't meet", () => {
    const strip = [rain60('2026-11-02T06:00:00Z', 3), rain60('2026-11-02T07:00:00Z', 39)]
    const early = call({ window: { starts_at: '2026-11-02T06:45:00Z', ends_at: '2026-11-02T09:00:00Z' } })
    const card = projectCard(status({ packs: [inForce], strip }), early, NOW)
    expect(card.strip?.window).toEqual({ from: '2026-11-02T06:45:00Z', to: '2026-11-02T07:05:00.000Z' })
    expect(projectCard(status({ packs: [inForce], strip }), call(), NOW).strip?.window).toBeNull()
  })

  test('with no call in force it reads "No approved call yet" and invents no window, strip or capture time', () => {
    const engine = pack({ pack: 'sky', basis: 'engine_verdict', mode: 'hybrid_recommended' })
    const card = projectCard(status({ packs: [engine] }), null, NOW)

    expect(card).toMatchObject({ state: null, range: null, window: null, strip: null, captured: null, reading: null })
    expect(cardAlt(card)).toBe('No approved call yet.')
  })

  test('a failing required input uses display names in No call and alt text', () => {
    const noCall = {
      inputs: [
        { name: 'site.rain_60m_mm', source_id: 'src-jps', state: 'error' as const, since: '2026-11-02T06:50:00Z' },
        { name: 'site.api_max', source_id: 'src-apims', state: 'error' as const, since: '2026-11-02T06:55:00Z' }
      ]
    }
    const card = projectCard(
      status({ packs: [{ ...inForce, no_call: noCall }], strip: [rain60('2026-11-02T06:45:00Z', 12)] }),
      call(),
      NOW
    )

    expect(card.noCall).toBe(
      'No call: Rain in the last 60 minutes, Highest Air Pollution Index failing since 14:50 MYT'
    )
    expect(cardAlt(card)).toBe(
      'Commute disruption. 15:30 MYT – 17:00 MYT · Monday 2 November 2026. Deciding reading: 39 mm Rain in the last 60 minutes at 15:00 MYT. No call: Rain in the last 60 minutes, Highest Air Pollution Index failing since 14:50 MYT.'
    )
    expect(card.strip).toBeNull()
    expect(card.captured).toBe('2 November 2026, 15:00 MYT')
  })

  test('a call card adds the approval time and carries no project, which the public call read lacks', () => {
    const card = callCard(call({ state: 'sent', sent_at: '2026-11-02T07:14:00Z' }))

    expect(card).toEqual({
      project: null,
      state: 'commute_disruption',
      range: '15:30 MYT – 17:00 MYT',
      window: '15:30 MYT – 17:00 MYT · Monday 2 November 2026',
      approved: 'Approved 15:12 MYT',
      noCall: null,
      strip: null,
      captured: '2 November 2026, 15:00 MYT',
      reading: '39 mm Rain in the last 60 minutes at 15:00 MYT'
    })
  })

  test('alt text leaves out what a card lacks, as whole sentences', () => {
    expect(cardAlt(callCard(call({ fired: [] })))).toBe(
      'Commute disruption. 15:30 MYT – 17:00 MYT · Monday 2 November 2026.'
    )
    expect(cardAlt(callCard(call({ window: null })))).toBe(
      'Commute disruption. Deciding reading: 39 mm Rain in the last 60 minutes at 15:00 MYT.'
    )
  })

  test('a window card is untitled and takes its capture time from its call', () => {
    const card = windowCard(status(), publicWindow({ mode: 'outdoor_limited' }), call())

    expect(card).toMatchObject({
      project: 'bukit-jalil',
      state: 'outdoor_limited',
      window: '15:30 MYT – 17:00 MYT · Monday 2 November 2026',
      captured: '2 November 2026, 15:00 MYT'
    })
  })
})
