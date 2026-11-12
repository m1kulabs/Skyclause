import { readFile } from 'node:fs/promises'
import { test, expect } from '../fixtures'
import { stubApi } from '../harness/stub-api'
import { expectUnclippedText } from '../harness/expect-unclipped-text'
import { expectZonedTimes } from '../harness/expect-zoned-times'
import { makeOrg, signInAs } from '../harness/sign-in-as'
import { ledgerOperations } from '../../features/ledger/operations'
import { setup, copy, route, row, evidence, project, detailedRow, call } from './fixtures'

test('clipping guard permits modal body scroll lock and still rejects clipped sheet copy', async ({ page }) => {
  await page.setContent(
    '<style>body{height:100px;overflow:hidden} [role=dialog]{position:fixed;inset:0;overflow:auto}</style><div style="height:2000px" aria-hidden="true">Background</div><div role="dialog" aria-modal="true"><p>Readable sheet</p></div>'
  )
  await expect(expectUnclippedText(page)).resolves.toBeUndefined()
  await page.locator('[role=dialog] p').evaluate((element) => {
    element.style.cssText = 'width:10px;white-space:nowrap;overflow:hidden'
  })
  await expect(expectUnclippedText(page)).rejects.toThrow('Clipped text')
})

test('LED-7 selected filter chips clear one URL filter by keyboard and preserve the others', async ({ page }) => {
  await setup(page)
  await page.goto(`${route}?pack=sky&state=approved&from=2026-11-02`)
  const chips = page.locator('[data-ledger-filter-chips]')
  await expect(chips.getByRole('button')).toHaveCount(3)
  await chips.getByRole('button', { name: /Sky/ }).press('Enter')
  await expect(page).not.toHaveURL(/pack=/)
  await expect(page).toHaveURL(/state=approved/)
  await expect(page.getByLabel(copy('ledger.pack'), { exact: true })).toHaveValue('')
  await page.reload()
  await expect(chips.getByRole('button')).toHaveCount(2)
})

test('LED-4 evidence list opens its URL sheet and returns keyboard focus on close', async ({ page }) => {
  await setup(page, { role: 'viewer' })
  await page.goto(`${route}?tab=evidence`)
  const link = page.locator(`[data-evidence-row="${evidence.id}"] a`)
  await link.press('Enter')
  await expect(page).toHaveURL(/evidence=evidence-1/)
  await expect(page.getByRole('dialog')).toContainText('reading-1')
  await page.keyboard.press('Escape')
  await expect(link).toBeFocused()
  await expect(page).not.toHaveURL(/evidence=/)
})

test('LED-7 paginated ledger reads 1–50 then 51–100 and correction links find the original entry', async ({ page }) => {
  await setup(page)
  const first = Array.from({ length: 50 }, (_, index) => ({ ...row, id: `entry-${index + 1}`, seq: index + 1 }))
  const second = Array.from({ length: 50 }, (_, index) => ({ ...row, id: `entry-${index + 51}`, seq: index + 51 }))
  await page.route('**/v1/projects/*/ledger?*', (r) =>
    r.fulfill({
      json: new URL(r.request().url()).searchParams.has('cursor')
        ? { data: second, total: 100, next_cursor: null }
        : { data: [{ ...first[0], corrects: 'entry-100' }, ...first.slice(1)], total: 100, next_cursor: 'page-2' }
    })
  )
  await page.goto(route)
  await expect(page.locator('[data-ledger-total]')).toHaveText(copy('ledger.total', { from: 1, to: 50, n: 100 }))
  // The page scrolls and the header sticks under the shell bar.
  await page.mouse.wheel(0, 1600)
  await expect
    .poll(() =>
      page.evaluate(() => {
        const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--shell-bar-height')) || 0
        return Math.round(document.querySelector('[data-ledger-table] th')!.getBoundingClientRect().top - bar)
      })
    )
    .toBe(0)
  await page.getByRole('button', { name: copy('ledger.nextPage'), exact: true }).press('Enter')
  await expect(page.locator('[data-ledger-total]')).toHaveText(copy('ledger.total', { from: 51, to: 100, n: 100 }))
  await expect(page.locator('tr[data-index]').first()).toHaveAttribute('aria-rowindex', '52')
  await page.getByRole('button', { name: copy('ledger.firstPage'), exact: true }).press('Enter')
  await page.getByRole('link', { name: copy('ledger.corrects', { id: 'entry-100' }), exact: true }).press('Enter')
  await expect(page.locator('#ledger-entry-100')).toBeVisible()
})

test('a link with ?request=evidence opens the request form; ?call= selects and focuses that call’s entry', async ({
  page
}) => {
  await setup(page)
  await page.goto(`${route}?request=evidence`)
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: copy('evidence.request') })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page).not.toHaveURL(/request=/)
  await page.goto(`${route}?call=${row.refs.call_id}`)
  const entry = page.locator(`#ledger-${row.id}`)
  await expect(entry).toHaveAttribute('aria-current', 'true')
  await expect(entry).toBeFocused()
})

test('filters that match nothing say so, not that the ledger is empty', async ({ page }) => {
  await setup(page, { rows: [] })
  await page.goto(`${route}?pack=crowd`)
  await expect(page.getByText(copy('ledger.emptyFiltered'), { exact: true })).toBeVisible()
  await expect(page.getByText(copy('ledger.empty'), { exact: true })).toBeHidden()
})

test('LED-7 filters survive reload, totals and CSV use current filters, integrity identifies the first bad entry', async ({
  page
}) => {
  await setup(page, { total: 100 })
  await page.route('**/ledger/export?*', (r) => r.fulfill({ contentType: 'text/csv', body: 'id\nentry-1\n' }))
  await page.goto(`${route}?from=2026-11-02&pack=sky&mode=normal&state=approved`)
  await expect(page.getByText(copy('ledger.total', { from: 1, to: 1, n: 100 }), { exact: true })).toBeVisible()
  await page.getByLabel(copy('ledger.to'), { exact: true }).fill('2026-11-04')
  await page.reload()
  await expect(page.getByLabel(copy('ledger.to'), { exact: true })).toHaveValue('2026-11-04')
  const exportRequest = page.waitForRequest((r) => r.url().includes('/ledger/export?'))
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: copy('ledger.export'), exact: true }).press('Enter')
  expect(new URL((await exportRequest).url()).searchParams.get('to')).toBe('2026-11-04')
  expect(await readFile((await (await download).path())!, 'utf8')).toBe('id\nentry-1\n')
  await expect(page.locator('.ledger-page').getByRole('status')).toContainText(copy('ledger.ok', { count: 1 }))
  await stubApi(
    page,
    'verifyLedger',
    { valid: false, checked_entries: 1, first_bad_entry_id: 'entry-bad', head_hash: 'hash', verified_at: row.at },
    { registry: ledgerOperations }
  )
  await page.getByRole('button', { name: copy('ledger.verify'), exact: true }).press('Enter')
  await expect(page.locator('.ledger-page').getByRole('status')).toContainText('entry-bad')
})

test('LED-7 empty ledger prints n=0 and its next action; unavailable operations show an error', async ({ page }) => {
  await setup(page, { rows: [] })
  await page.goto(route)
  await expect(page.getByText(copy('ledger.empty'), { exact: true })).toBeVisible()
  await expect(page.getByText(copy('ledger.next'), { exact: true })).toBeVisible()
  await page.route('**/v1/projects/*/ledger?*', (r) => r.fulfill({ status: 501, json: { title: 'Not built' } }))
  await page.reload()
  const failed = page.locator('.ledger-page [data-source-error="501"]')
  await expect(failed).toContainText(copy('ledger.sources.entries'))
  // Reading again cannot change a "not built" answer, so it offers no retry; a failed read does.
  await expect(failed.getByRole('button', { name: copy('ledger.retry'), exact: true })).toHaveCount(0)
  await expect(page.getByText(copy('ledger.empty'), { exact: true })).toBeHidden()
  await page.unroute('**/v1/projects/*/ledger?*')
  await page.route('**/v1/projects/*/ledger?*', (r) => r.fulfill({ status: 503, json: { title: 'Unavailable' } }))
  await page.reload()
  await expect(
    page
      .locator('.ledger-page [data-source-error="503"]')
      .getByRole('button', { name: copy('ledger.retry'), exact: true })
  ).toBeVisible()
})

test('LED-8 pilot archive appears only with files and downloads stay outside the ledger', async ({ page }) => {
  await setup(page)
  await page.goto(route)
  await expect(page.getByRole('link', { name: copy('ledger.archive'), exact: true })).toBeHidden()
  await stubApi(
    page,
    'getPilotArchive',
    {
      data: [
        {
          project_id: project.id,
          kind: 'sheets_ledger',
          url: 'https://example.test/pilot.csv',
          sha256: 'abc',
          captured_at: row.at
        }
      ],
      next_cursor: null
    },
    { registry: ledgerOperations }
  )
  await page.reload()
  const archive = page.getByRole('link', { name: copy('ledger.archive'), exact: true })
  await archive.press('Enter')
  await expect(page.getByRole('dialog')).toContainText(copy('ledger.kinds.sheets_ledger'))
  await expect(page.getByRole('dialog').getByRole('link')).toHaveAttribute('href', 'https://example.test/pilot.csv')
  await expectZonedTimes(page)
  await page.keyboard.press('Escape')
  await expect(archive).toBeFocused()
})

test('LED-4 request by call sends Idempotency-Key, survives reload and advances from waiting to replied', async ({
  page
}) => {
  await setup(page, {
    as: {
      kind: 'share_link',
      linkId: 'reviewer-1',
      orgId: project.org_id,
      projectId: project.id,
      access: 'reviewer',
      client: 'app',
      clientName: null
    }
  })
  await page.goto(route)
  await page
    .getByRole('row')
    .nth(1)
    .getByRole('button', { name: copy('evidence.request'), exact: true })
    .press('Enter')
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel(copy('evidence.callId'), { exact: true })).toHaveValue('call-1')
  const created = page.waitForRequest((r) => r.method() === 'POST' && r.url().includes('/evidence-requests'))
  await dialog.getByRole('button', { name: copy('evidence.submit'), exact: true }).press('Enter')
  const creation = await created
  expect(creation.headers()['idempotency-key']).toBeTruthy()
  expect(creation.postDataJSON()).toEqual({ call_id: 'call-1' })
  await expect(page).toHaveURL(/tab=evidence.*evidence=evidence-1/)
  await expect(page.getByRole('dialog')).toContainText(copy('evidence.status.waiting'))
  await expect(page.getByRole('button', { name: copy('evidence.approve'), exact: true })).toBeHidden()
  await page.reload()
  await expect(page.getByRole('dialog')).toContainText(copy('evidence.status.waiting'))
  const replied = {
    ...evidence,
    status: 'replied',
    approved_at: '2026-11-02T06:02:00Z',
    replied_at: '2026-11-02T06:03:00Z'
  }
  await stubApi(page, 'getEvidenceRequest', replied, { registry: ledgerOperations })
  await page.getByRole('button', { name: copy('evidence.refreshPack'), exact: true }).press('Enter')
  await expect(page.getByRole('dialog')).toContainText('14:03 MYT')
})

test('LED-5 and LED-6 pack values expose readings, verbatim Malay, gloss, frames and four MYT times', async ({
  page
}) => {
  const replied = { ...evidence, approved_at: '2026-11-02T06:02:00Z', replied_at: '2026-11-02T06:03:00Z' }
  await setup(page, { request: replied })
  await page.goto(`${route}?tab=evidence&evidence=evidence-1`)
  const dialog = page.getByRole('dialog')
  await expect(dialog.locator('[lang="ms"]')).toHaveText('Amaran Ribut Petir')
  await expect(dialog).toContainText('Thunderstorms Warning')
  await expect(dialog).toContainText('reading-1')
  await expect(dialog).toContainText('station-1')
  for (const time of ['14:00 MYT', '14:01 MYT', '14:02 MYT', '14:03 MYT']) await expect(dialog).toContainText(time)
  await dialog.locator('[data-reading-trigger]').first().focus()
  await expect(page.locator('[data-slot="hover-card-content"]')).toContainText('station-1')
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-slot="hover-card-content"]')).toBeHidden()
  await expectZonedTimes(page)
})

test('LED-5 calls, approvals, grades and ledger values link to readings; long table content wraps', async ({
  page,
  expectAxeClean
}, testInfo) => {
  const request = {
    ...evidence,
    leaves_org: false,
    pack: {
      ...evidence.pack!,
      calls: [call],
      grades: [detailedRow.grade!],
      ledger: [row],
      approvals: [{ id: 'approval-1', call_id: call.id, approved_by: 'account-167', approved_at: call.approved_at! }]
    }
  }
  await setup(page, { rows: [detailedRow], request })
  await page.setViewportSize({ width: 320, height: 900 })
  await page.goto(route)
  await expect(page.locator('[data-ledger-table]')).toContainText(detailedRow.window!.title)
  await expect(page.locator('[data-ledger-table] td.ledger-col-toApproval')).toContainText(
    copy('ledger.minutes', { value: 2 })
  )
  await expect(page.locator('[data-ledger-table] td.ledger-col-toNotice')).toContainText(
    copy('ledger.minutes', { value: 1 })
  )
  await expectUnclippedText(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('ledger-phone.png'), fullPage: true })
  const frame = page.locator('[data-ledger-frame]')
  const requestButton = frame.getByRole('button')
  await requestButton.focus()
  const dateBounds = (await frame.locator('td').first().boundingBox())!
  const actionBounds = (await requestButton.boundingBox())!
  const frameBounds = (await frame.boundingBox())!
  expect(actionBounds.x).toBeGreaterThanOrEqual(dateBounds.x + dateBounds.width + 4)
  expect(actionBounds.x + actionBounds.width).toBeLessThanOrEqual(frameBounds.x + frameBounds.width)
  // On a phone the record is a list: nothing in it scrolls sideways.
  expect(await frame.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.goto(`${route}?tab=evidence&evidence=evidence-1`)
  const sheet = page.getByRole('dialog')
  await expect(sheet).toContainText('approval-1')
  await expect(sheet.getByRole('button', { name: copy('evidence.download'), exact: true })).toBeVisible()
  await expect(sheet.getByRole('button', { name: copy('evidence.approve'), exact: true })).toBeHidden()
  for (const id of [call.id, 'approval-1', 'grade-1', row.id]) {
    const article = sheet.locator('article').filter({ hasText: id }).first()
    await expect(article.locator('[data-reading-trigger]').first()).toContainText('reading-1')
  }
  await expectAxeClean(page)
  await expectUnclippedText(page)
  await page.screenshot({ path: testInfo.outputPath('evidence-phone.png'), fullPage: true })
})

test('LED-4 guest is not reviewed and JSON download saves the GET response', async ({ page }) => {
  await setup(page, {
    role: 'guest',
    request: { ...evidence, leaves_org: false, pack: { ...evidence.pack!, warnings: [] } }
  })
  await page.goto(`${route}?tab=evidence&evidence=evidence-1`)
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText(copy('evidence.status.notReviewed'))
  await expect(dialog).toContainText(copy('evidence.noWarnings'))
  await expect(dialog.getByRole('button', { name: copy('evidence.approve'), exact: true })).toBeHidden()
  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: copy('evidence.download'), exact: true }).press('Enter')
  expect(JSON.parse(await readFile((await (await download).path())!, 'utf8'))).toMatchObject({
    id: evidence.id,
    pack: { warnings: [] }
  })
})

for (const role of ['owner', 'admin', 'approver', 'editor', 'viewer']) {
  test(`external reply approval is gated for ${role}`, async ({ page }) => {
    await setup(page, { role })
    await page.goto(`${route}?tab=evidence&evidence=evidence-1`)
    const approve = page.getByRole('button', { name: copy('evidence.approve'), exact: true })
    if (['owner', 'admin', 'approver'].includes(role)) {
      await expect(approve).toBeVisible()
      await stubApi(
        page,
        'approveEvidenceRequest',
        { ...evidence, approved_at: '2026-11-02T06:02:00Z' },
        { registry: ledgerOperations }
      )
      await stubApi(
        page,
        'getEvidenceRequest',
        { ...evidence, approved_at: '2026-11-02T06:02:00Z' },
        { registry: ledgerOperations }
      )
      const request = page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/approve'))
      await approve.press('Enter')
      // Releasing a reply cannot be undone, so it asks first.
      const confirm = page.getByRole('alertdialog')
      await expect(confirm).toContainText(copy('evidence.confirmTitle'))
      await confirm.getByRole('button', { name: copy('evidence.approve'), exact: true }).press('Enter')
      await request
      await expect(approve).toBeHidden()
    } else {
      await expect(approve).toBeHidden()
      await expect(page.getByRole('button', { name: copy('evidence.download'), exact: true })).toBeVisible()
    }
  })
}

// #647: the page passes the URL organisation's member principal, so a real Approver's session (signInAs, no test
// principal) can release an external reply; a session without the organisation's role never could.
test('a real Approver session can approve an external reply', async ({ page }) => {
  await setup(page)
  await page.context().clearCookies({ name: 'skyclause_test_principal' })
  const org = await makeOrg()
  await signInAs(page, 'approver', org)
  await page.goto(`/${org.slug}/${project.slug}/ledger?tab=evidence&evidence=evidence-1`)
  await expect(page.getByRole('button', { name: copy('evidence.approve'), exact: true })).toBeVisible()
})

test('budget-exhausted shows the API reset in MYT; window form validates and preserves input after failure', async ({
  page
}) => {
  await setup(page)
  await page.route('**/evidence-requests', (r) =>
    r.request().method() === 'POST'
      ? r.fulfill({ status: 429, json: { type: 'budget-exhausted', reset_at: '2026-11-02T16:00:00Z' } })
      : r.fallback()
  )
  await page.goto(route)
  await page
    .getByRole('button', { name: copy('evidence.request'), exact: true })
    .first()
    .press('Enter')
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: copy('evidence.submit'), exact: true }).press('Enter')
  await expect(dialog.getByRole('alert')).toContainText(copy('evidence.invalid'))
  await expect(dialog.getByLabel(copy('evidence.from'), { exact: true })).toBeFocused()
  await dialog.getByLabel(copy('evidence.from'), { exact: true }).fill('2026-11-02T14:00')
  await dialog.getByLabel(copy('evidence.to'), { exact: true }).fill('2026-11-02T16:30')
  const submitted = page.waitForRequest((r) => r.method() === 'POST' && r.url().includes('/evidence-requests'))
  await dialog.getByRole('button', { name: copy('evidence.submit'), exact: true }).press('Enter')
  expect((await submitted).postDataJSON()).toEqual({
    span: { from: '2026-11-02T06:00:00.000Z', to: '2026-11-02T08:30:00.000Z' }
  })
  await expect(dialog.getByRole('alert')).toContainText('00:00 MYT')
  await expect(dialog.getByLabel(copy('evidence.from'), { exact: true })).toHaveValue('2026-11-02T14:00')
})

for (const theme of ['dark', 'light', 'high-contrast']) {
  test(`ledger, request, archive and pack are keyboard usable and axe-clean in ${theme}`, async ({
    page,
    baseURL,
    expectAxeClean
  }, testInfo) => {
    await page.context().addCookies([
      {
        name: 'skyclause-test-appearance',
        value: JSON.stringify({
          theme: theme === 'light' ? 'light' : 'dark',
          contrast: theme === 'high-contrast' ? 'more' : 'standard'
        }),
        url: baseURL!
      }
    ])
    await setup(page, {
      rows: [detailedRow],
      files: [
        {
          project_id: project.id,
          kind: 'sheets_ledger',
          url: 'https://example.test/pilot.csv',
          sha256: 'abc',
          captured_at: row.at
        }
      ]
    })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(route)
    await expect(page.locator('[data-ledger-table]')).toBeVisible()
    await expectAxeClean(page)
    await expectUnclippedText(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`ledger-${theme}.png`), fullPage: true })
    const frame = page.locator('[data-ledger-frame]')
    expect(await frame.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    await page
      .getByRole('button', { name: copy('evidence.request'), exact: true })
      .first()
      .press('Enter')
    await expectAxeClean(page)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: copy('evidence.request'), exact: true }).first()).toBeFocused()
    await page.getByRole('link', { name: copy('ledger.archive'), exact: true }).press('Enter')
    await expect(page.getByRole('dialog')).toContainText(copy('ledger.kinds.sheets_ledger'))
    await expect(page.locator('.ledger-sheet')).toHaveCSS('opacity', '1')
    await expectAxeClean(page)
    await expectUnclippedText(page)
    await page.keyboard.press('Escape')
    await page.goto(`${route}?tab=evidence&evidence=evidence-1`)
    await expect(page.getByRole('dialog')).toContainText('reading-1')
    await expectAxeClean(page)
    await page.screenshot({ path: testInfo.outputPath(`evidence-${theme}.png`), fullPage: true })
    for (const width of [320, 375, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      await expectUnclippedText(page)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
  })
}

test('Malay ledger and evidence copy renders with MYT times and no clipped text', async ({ page, expectAxeClean }) => {
  await setup(page)
  // Desktop Chrome's locale emulation overrides extra headers on document requests.
  await page.route('**/*', (r) =>
    r.request().isNavigationRequest()
      ? r.continue({ headers: { ...r.request().headers(), 'accept-language': 'ms-MY,ms;q=0.9,en;q=0.5' } })
      : r.fallback()
  )
  await page.setViewportSize({ width: 320, height: 900 })
  await page.goto(route)
  await expect(page.getByRole('heading', { name: /^Lejar/ })).toBeVisible()
  await expect(page.locator('.ledger-page')).toHaveAttribute('lang', 'ms')
  await expect(page.getByRole('button', { name: /^Eksport CSV/ })).toBeVisible()
  await expectUnclippedText(page)
  await page.goto(`${route}?tab=evidence&evidence=evidence-1`)
  await expect(page.getByRole('dialog')).toContainText('Menunggu kelulusan')
  await expect(page.getByRole('dialog')).toHaveAttribute('lang', 'ms')
  await expect(page.getByRole('dialog')).toContainText('14:00 MYT')
  await expectAxeClean(page)
  await expectUnclippedText(page)
})
