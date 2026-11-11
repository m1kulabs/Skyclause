import { expect, test } from '../fixtures'
import { callDouble, gauge, gauge5, ids } from '../bundles/doubles'
import { callPath, callsPath, callReplay, gradeDouble, prepareCalls } from './doubles'

test('CAL-16 calls list keeps filters in the URL and shows the empty next action', async ({ page }) => {
  await prepareCalls(page, { rows: [] })
  await page.goto(`${callsPath}?pack=crowd&mode=normal&state=expired&from=2026-11-02&to=2026-11-09`)

  const list = page.getByRole('region', { name: 'Calls' })
  await expect(list.getByRole('heading', { level: 1 })).toHaveText('Calls')
  await expect(list.getByLabel('Pack')).toHaveValue('crowd')
  await expect(list.getByLabel('Mode')).toHaveValue('normal')
  await expect(list.getByLabel('State')).toHaveValue('expired')
  await expect(list).toContainText('n=0')
  await expect(list.getByRole('link', { name: 'Declare a window' })).toHaveAttribute(
    'href',
    '/test-org/test-project/windows?declare=window'
  )
  await page.reload()
  await expect(page.getByRole('region', { name: 'Calls' }).getByLabel('Pack')).toHaveValue('crowd')
})

test('CAL-16 list cursor pages render at most 50 call rows at once', async ({ page }) => {
  const rows = Array.from({ length: 50 }, (_, index) =>
    callDouble(`019a45b0-0000-7000-8000-${String(index + 10).padStart(12, '0')}`)
  )
  await prepareCalls(page, { rows, nextCursor: 'calls-after-50' })
  await page.goto(callsPath)

  const list = page.getByRole('region', { name: 'Calls' })
  await expect(list.locator('[data-call]')).toHaveCount(50)
  await expect(list.getByRole('link', { name: 'Next' })).toBeVisible()
  await expect(list.getByRole('link', { name: 'Next' })).toHaveAttribute('href', /cursor=calls-after-50/)
})

test('CAL-12 detail renders the strip, trace ages, role, delay, grade, version and copy actions', async ({ page }) => {
  const call = callReplay({
    approved_by: 'private-account-must-not-render',
    grade: gradeDouble(callReplay()),
    inputs: [gauge, gauge5],
    trace: [
      {
        step: 'Drafted',
        duration_ms: 250,
        inputs: [gauge, gauge5],
        detail: 'Replay · 2 November 2026'
      }
    ]
  })
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => undefined }
    })
  })
  await prepareCalls(page, { call })
  await page.goto(callPath)

  const detail = page.getByRole('region', { name: 'Call details' })
  await expect(detail.getByRole('figure')).toBeVisible()
  const inputRows = detail.locator('div[aria-label="Inputs read at drafting"] [data-slot="trace-line"]')
  await expect(inputRows).toHaveCount(2)
  await expect(inputRows.nth(0)).toContainText(/gauge.*5 min old/)
  await expect(inputRows.nth(1)).toContainText(/gauge_5m.*5 min old/)
  await expect(detail).toContainText('Approver on duty')
  await expect(detail).toContainText(
    /Crossing 15:05 MYT · drafted 15:06 MYT \(1 min\) · approved 15:12 MYT \(6 min\) · sent 15:14 MYT \(2 min\)/
  )
  await expect(detail).toContainText('Hit')
  await expect(detail).toContainText(/commute disruption/i)
  await expect(detail.getByRole('link', { name: 'Sheet version test-sheet' })).toHaveAttribute(
    'href',
    /clauses\?version=test-sheet/
  )
  await expect(detail.getByRole('link', { name: /permalink/i })).toHaveAttribute('href', call.permalink)
  await expect(detail).not.toContainText('private-account-must-not-render')
  const copy = detail.getByRole('button', { name: 'Copy permalink' })
  await copy.focus()
  await page.keyboard.press('Enter')
  await expect(detail.getByText('Copied', { exact: true })).toBeVisible()
  const copyTrace = detail.getByRole('button', { name: 'Copy trace ID' })
  await copyTrace.focus()
  await page.keyboard.press('Enter')
  await expect(detail.getByText('Copied', { exact: true })).toHaveCount(2)
})

test('CAL-16 No call and expired calls explain the missing input and are not sent', async ({ page }) => {
  const base = callReplay()
  const noCall = callDouble(ids.first, {
    ...base,
    mode: null,
    state: 'expired',
    approved_at: null,
    sent_at: null,
    no_call: ['gauge'],
    inputs: [{ ...base.inputs[0]!, state: 'error', since: '2026-11-02T06:50:00Z', age_s: null }],
    trace_id: ids.run,
    grade: null
  })
  await prepareCalls(page, { call: noCall, grades: [] })
  await page.goto(callPath)

  const detail = page.getByRole('region', { name: 'Call details' })
  await expect(detail).toContainText('No call')
  await expect(detail).toContainText(/gauge.*since.*14:50 MYT/)
  await expect(detail).toContainText('Expired, not sent')
})

test('CAL-16 an ungraded Crowd night shows its pending deadline', async ({ page }) => {
  const call = callReplay({
    window_id: null,
    window: null,
    night_id: 'night-replay-20261102',
    night: {
      id: 'night-replay-20261102',
      project_id: '019a45b0-0000-7000-8000-000000000003',
      date: '2026-11-02',
      state: 'upcoming',
      doors: '2026-11-02T11:00:00Z',
      show: '2026-11-02T11:30:00Z',
      arrival_start: '2026-11-02T10:30:00Z',
      arrival_end: '2026-11-02T11:30:00Z',
      exit_start: null,
      exit_end: null
    },
    grade: null
  })
  const pendingGrade = {
    id: 'pending-crowd-night',
    call_id: null,
    night_id: call.night_id,
    outcome: 'pending',
    sheet_version_id: call.sheet_version_id,
    pack: 'crowd' as const,
    window_id: null,
    proposed_mode: null,
    observed_mode: null,
    mode_diff: 0,
    no_call: false,
    agrees: true,
    stale_inputs: false,
    forecast: null,
    actual: null,
    reading_ids: [],
    graded_at: '2026-11-02T22:45:00Z',
    local_date: '2026-11-02',
    pending_until: '2026-11-02T22:45:00Z'
  }
  await prepareCalls(page, { call, grades: [pendingGrade] })
  await page.goto(callPath)
  await expect(page.getByRole('region', { name: 'Call details' })).toContainText('Pending until 06:45 MYT')
})
