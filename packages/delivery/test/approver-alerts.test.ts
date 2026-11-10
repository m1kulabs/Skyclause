import { describe, expect, test } from 'vitest'
import { renderApproverAlert } from '../src/approver-alerts'

// DESIGN "Approver alert": one alert per bundle, naming the project, pack, mode and SLA left; `{window}` is the
// window's MYT span, never its title. The values are the 2 November 2026 replay's (DESIGN "Bundle and call detail").
const url = 'https://app.skyclause.m1ku.tech/apu/bukit-jalil/bundles/0196f0a0-0000-7000-8000-000000000001'
const storm = {
  project: 'Bukit Jalil',
  pack: 'sky' as const,
  calls: 2,
  mode: 'commute_disruption',
  window: { startsAt: new Date('2026-11-02T07:15:00Z'), endsAt: new Date('2026-11-02T07:30:00Z') },
  slaDueAt: new Date('2026-11-02T07:20:00Z'),
  input: { name: 'site.rain_60m_mm', value: 39, unit: 'mm', ageS: 300 },
  url
}

describe('renderApproverAlert', () => {
  test('a needs-review alert names calls, project, mode, window span, SLA left and the deciding input', () => {
    expect(renderApproverAlert({ kind: 'needs_review', ...storm, now: new Date('2026-11-02T07:10:30Z') })).toEqual({
      title: '2 calls need review · Bukit Jalil',
      body: 'Commute disruption for 15:15 MYT–15:30 MYT · 10 min of SLA left · site.rain_60m_mm 39 mm, 5 min old',
      text:
        'Commute disruption for 15:15 MYT–15:30 MYT · 10 min of SLA left · site.rain_60m_mm 39 mm, 5 min old\n\n' +
        `Sky pack. Open the bundle: ${url}\n\nAn alert never approves: open the bundle to review it.`
    })
  })

  test('one call, no input and no window time read without those parts', () => {
    const rendered = renderApproverAlert({
      kind: 'needs_review',
      ...storm,
      calls: 1,
      window: null,
      input: null,
      now: new Date('2026-11-02T07:19:59Z')
    })
    expect(rendered.title).toBe('1 call needs review · Bukit Jalil')
    expect(rendered.body).toBe('Commute disruption · 1 min of SLA left')
  })

  test('an escalation says it was escalated and how far past the SLA it is', () => {
    const rendered = renderApproverAlert({ kind: 'escalated', ...storm, now: new Date('2026-11-02T07:30:00Z') })
    expect(rendered.body).toBe('Escalated to you: Commute disruption for 15:15 MYT–15:30 MYT, 10 min past SLA')
  })

  test('a no-draft alert gives the reason and what the clause engine says (D24)', () => {
    const rendered = renderApproverAlert({
      kind: 'no_draft',
      project: 'Bukit Jalil',
      pack: 'sky',
      reason: 'provider_error',
      modes: ['commute_disruption', 'outdoor_limited'],
      url
    })
    expect(rendered.title).toBe('No draft · Bukit Jalil')
    expect(rendered.body).toBe('No draft: provider_error; clause engine says Commute disruption, Outdoor-limited')
  })

  test('shift reminders print MYT times and the date', () => {
    const shift = {
      template: 'storm_afternoon' as const,
      startsAt: new Date('2026-11-09T06:00:00Z'),
      endsAt: new Date('2026-11-09T11:15:00Z'),
      url: 'https://app.skyclause.m1ku.tech/apu/settings/rota'
    }
    expect(renderApproverAlert({ kind: 'before_shift', ...shift })).toMatchObject({
      title: 'Your shift starts at 14:00 MYT',
      body: 'Storm afternoon shift, 14:00 MYT–19:15 MYT on 9 November 2026.'
    })
    expect(renderApproverAlert({ kind: 'switched_on', ...shift })).toMatchObject({
      title: 'Storm afternoon shift switched on',
      body: 'Your Storm afternoon shift is on for 9 November 2026, 14:00 MYT–19:15 MYT.'
    })
  })
})
