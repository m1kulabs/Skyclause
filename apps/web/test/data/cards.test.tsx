// @vitest-environment jsdom
import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import '../../features/data-components/catalogue'
import { t } from '../../features/data-components/catalogue'
import { SourceHealthRow } from '../../features/data-components/source-health-row'
import { CallRow } from '../../features/data-components/call-row'
import { BundleCard } from '../../features/data-components/bundle-card'
import { GradeCard } from '../../features/data-components/grade-card'
import { PackStateNote } from '../../features/data-components/pack-state-note'

import type { Bundle, CallView, Grade, PackState, Source } from '@skyclause/contracts'

async function expectAxeClean(): Promise<void> {
  const results = await axe.run(document.body, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    rules: { 'color-contrast': { enabled: false } }
  } as Parameters<typeof axe.run>[1])
  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toBe('')
}

const source: Source = {
  id: 's1',
  kind: 'jps_rain',
  external_id: '0232901RF',
  owner_org_id: null,
  name: 'Sg. Kuyoh',
  lat: null,
  lon: null,
  url: 'https://infobanjirjpskl.water.gov.my/',
  cadence_s: 300,
  stale_after_s: 600,
  licence_id: 'none',
  licence_label: 'no published terms'
}

function table(body: React.ReactNode) {
  return render(
    <table>
      <tbody>{body}</tbody>
    </table>
  )
}

describe('data components', () => {
  afterEach(cleanup)

  test('SourceHealthRow shows station, value, age, cadence, state word, ticks and licence', async () => {
    table(
      <SourceHealthRow
        source={{ ...source }}
        latest={{ value: 0.5, observed_at: '2026-11-02T07:00:00Z', unit: 'mm' }}
        state={{ state: 'fresh', since: '2026-11-02T07:00:00Z', http_status: 200, pending_until: null }}
        ageS={720}
        ticks={Array.from({ length: 48 }, (_, i): 'received' | 'error' => (i === 47 ? 'error' : 'received'))}
      />
    )
    expect(screen.getByText('Sg. Kuyoh')).toBeTruthy()
    expect(document.querySelector('[translate="no"]')?.textContent).toBe('0232901RF')
    expect(document.body.textContent).toContain('Fresh input')
    await expectAxeClean()
  })

  test('CallRow renders mode with word and glyph, never colour alone', async () => {
    const call: CallView = {
      id: 'c1',
      bundle_id: 'b1',
      window_id: 'w1',
      night_id: null,
      mode: 'commute_disruption',
      watch: false,
      no_call: null,
      fired: [{ clause: 'storm_confirmed', inputs: ['gauge 39.0 mm'] }],
      recommendations: [],
      recipients: [],
      notices: [],
      reason: 'storm',
      state: 'drafted',
      shadow: {
        scope: { kind: 'site', id: null },
        pack: 'sky',
        mode: 'commute_disruption',
        watch: false,
        no_call: null,
        recommendations: [],
        clauses: [],
        open_from: null
      },
      chosen: 'engine',
      agrees: true,
      decision: null,
      expires_at: '2026-11-02T09:30:00Z',
      triggered_at: '2026-11-02T07:05:00Z',
      drafted_at: '2026-11-02T07:06:00Z',
      approved_at: null,
      sent_at: null,
      superseded_by_call_id: null,
      ics_uid: 'call-c1@skyclause.m1ku.tech',
      ics_sequence: 0
    }
    table(
      <CallRow call={{ ...call }} actions={<button type="button">{t('data.bundle.approve', { count: 1 })}</button>} />
    )
    expect(screen.getByText(/Commute disruption/)).toBeTruthy()
    expect(document.body.innerHTML).toContain('aria-hidden="true"')
    expect(document.body.textContent).toContain('MYT')
    await expectAxeClean()
  })

  test('draft_only bundles show Draft where Approve would be', async () => {
    const bundle: Bundle = {
      id: 'b1',
      project_id: 'p1',
      run_id: 'r1',
      pack: 'sky',
      state: 'drafted',
      superseded_by: null,
      review_hash: 'h',
      sla_due_at: '2026-11-02T08:00:00Z',
      needs_review_at: null,
      approved_by: null,
      escalation_level: 0,
      draft_only: true,
      calls: []
    }
    render(
      <BundleCard
        bundle={{ ...bundle }}
        actions={<button type="button">{t('data.bundle.approve', { count: 0 })}</button>}
      />
    )
    expect(screen.getByText(/Draft: not reviewed, not sent/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Approve/ })).toBeNull()
    await expectAxeClean()
  })

  test('a closed bundle has no SLA, so its card shows none', async () => {
    const bundle: Bundle = {
      id: 'b2',
      project_id: 'p1',
      run_id: 'r2',
      pack: 'sky',
      state: 'closed',
      superseded_by: null,
      review_hash: 'h',
      sla_due_at: null,
      needs_review_at: null,
      approved_by: null,
      escalation_level: 0,
      draft_only: false,
      calls: []
    }
    render(<BundleCard bundle={{ ...bundle }} triggeredAt="2026-11-02T06:45:00Z" />)
    expect(document.body.textContent).toContain('14:45')
    expect(document.body.textContent).not.toMatch(/SLA/)
  })

  test('GradeCard prints n=0 with no bar and takes its interval from the API', async () => {
    const grade: Grade = {
      id: 'g0',
      call_id: null,
      night_id: null,
      outcome: 'agree',
      sheet_version_id: 'v1',
      pack: 'sky',
      window_id: null,
      proposed_mode: null,
      observed_mode: null,
      mode_diff: 0,
      no_call: false,
      agrees: true,
      stale_inputs: false
    }
    const { unmount } = render(
      <GradeCard grade={{ ...grade }} metric={{ metric: 'precision', x: null, n: 0, low: null, high: null }} />
    )
    expect(screen.getAllByText('n=0').length).toBeGreaterThan(0)
    expect(document.querySelector('[role="img"]')).toBeNull()
    unmount()
    cleanup()
    render(
      <GradeCard
        grade={{ ...grade, id: 'g1' }}
        metric={{ metric: 'precision', x: 0.88, n: 8, low: 0.53, high: 0.98 }}
        period={{ from: '2026-01-01', to: '2026-11-04' }}
        replay
      />
    )
    expect(screen.getByRole('img', { name: /Wilson 95%/ })).toBeTruthy()
    expect(screen.getByText(/n=8/)).toBeTruthy()
    await expectAxeClean()
  })

  test('PackStateNote prints the clause engine line beside the mode', async () => {
    const pack: PackState = {
      pack: 'sky',
      basis: 'engine_verdict',
      call_id: null,
      mode: 'commute_disruption',
      watch: false,
      no_call: null
    }
    render(<PackStateNote pack={pack} />)
    expect(screen.getByText(/Commute disruption/)).toBeTruthy()
    expect(screen.getByText(/Clause engine verdict: not reviewed, not sent/)).toBeTruthy()
    await expectAxeClean()
  })
})
