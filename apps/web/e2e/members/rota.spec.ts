import { expect, test } from '../fixtures'
import { membersOperations } from '../../features/members/operations'
import { assertValidResponse } from '../harness'
import { defaultTemplates, ownerId, prepareSettings } from './stubs'

type Replacement = {
  project_id: string | null
  templates: (typeof defaultTemplates)[number][]
  shifts: Array<{
    account_id: string
    days: number[]
    local_start: string
    local_end: string
    condition: string | null
    order: number
    template: 'storm_afternoon' | 'surge_night' | 'custom'
  }>
}

test('rota shifts can be added, changed and removed with keyboard input alone', async ({ page }) => {
  await prepareSettings(page, 'rota')
  let currentShifts: Replacement['shifts'] = []
  await page.route('**/api/orgs/test-org/rota/shifts', async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.fallback()
      return
    }
    const replacement = route.request().postDataJSON() as Replacement
    currentShifts = replacement.shifts
    const body = {
      time_zone: 'Asia/Kuala_Lumpur',
      templates: replacement.templates,
      shifts: currentShifts.map((shift, index) => ({
        ...shift,
        id: `00000000-0000-7000-8000-${String(index + 21).padStart(12, '0')}`,
        project_id: null
      })),
      on_duty: [],
      next_shift: null,
      unstaffed_slots: []
    }
    const valid = assertValidResponse(membersOperations.replaceRotaShifts, body)
    await route.fulfill({ status: 200, contentType: 'application/json', json: valid })
  })

  await page.goto('/test-org/settings/rota')
  const add = page.getByRole('button', { name: 'Add an approver' })
  await add.focus()
  await page.keyboard.press('Enter')
  const monday = page.getByRole('checkbox', { name: 'Monday' })
  await monday.focus()
  await page.keyboard.press('Space')
  const apply = page.getByRole('button', { name: 'Add shift' })
  await apply.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('Rota shifts (n=1)')).toBeVisible()

  const save = page.getByRole('button', { name: 'Save rota' })
  await save.focus()
  await page.keyboard.press('Enter')
  await expect.poll(() => currentShifts.length).toBe(1)
  expect(currentShifts[0]?.account_id).toBe(ownerId)
  await expect(page.getByText('Rota saved.')).toBeVisible()
  const edit = page.getByRole('button', { name: /^Shift for You,/ })
  await edit.focus()
  await page.keyboard.press('Enter')

  const template = page.getByRole('combobox', { name: 'Template' })
  await template.focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  const start = page.getByLabel('Start time (MYT)')
  await start.focus()
  await page.keyboard.press('ArrowUp')
  const end = page.getByLabel('End time (MYT)')
  await end.focus()
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowRight')
  for (let minute = 0; minute < 15; minute += 1) await page.keyboard.press('ArrowDown')
  await expect(start).toHaveValue('15:00')
  await expect(end).toHaveValue('20:00')
  await page.getByRole('button', { name: 'Add shift' }).focus()
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Save rota' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('Rota saved.')).toBeVisible()
  await expect.poll(() => currentShifts[0]?.local_start).toBe('15:00')
  await expect(page.getByText('15:00–20:00')).toBeVisible()

  const remove = page.getByRole('button', { name: 'Remove shift for You' })
  await remove.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('Rota shifts (n=0)')).toBeVisible()
  await page.getByRole('button', { name: 'Save rota' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('Rota saved.')).toBeVisible()
  await expect.poll(() => currentShifts.length).toBe(0)
  await expect(page.getByText('Rota shifts (n=0)')).toBeVisible()
})
