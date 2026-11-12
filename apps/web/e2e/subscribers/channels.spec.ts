import { test, expect } from '../fixtures'
import { stubApi } from '../harness'
import { expectUnclippedText } from '../harness/expect-unclipped-text'
import { setupProject, channelsPath, registry, failOperation } from './data'
import { t } from './messages'

test('SET-4 Channels replaces its settings placeholder and saves toggles by keyboard', async ({ page }) => {
  await setupProject(page)
  await stubApi(page, 'updateChannel', { channel: 'email', enabled: false }, { registry })
  await page.goto(channelsPath)
  await expect(page.locator('[data-settings-panel] [data-unbuilt]')).toHaveCount(0)
  const toggle = page.getByRole('switch', { name: t('channels.toggle', { channel: t('subscribe.email_channel') }) })
  await expect(toggle).toBeChecked()
  const request = page.waitForRequest((request) => request.method() === 'PATCH')
  await toggle.focus()
  await page.keyboard.press('Space')
  expect((await request).postDataJSON()).toEqual({ enabled: false })
  await expect(toggle).not.toBeChecked()
  await expect(page.locator('[data-channels-panel]').getByRole('status')).toHaveText(
    t('channels.saved', { channel: t('subscribe.email_channel') })
  )
})

test('NTC-7 preview renders latest real-call operation data as text, or says there is none', async ({ page }) => {
  await setupProject(page)
  await stubApi(page, 'previewChannels', { n: 0, call_id: null, previews: [] }, { registry })
  await page.goto(channelsPath)
  await page.getByRole('button', { name: t('channels.preview') }).click()
  await expect(page.getByText(t('channels.no_preview'))).toBeVisible()
  await stubApi(
    page,
    'previewChannels',
    {
      n: 1,
      call_id: 'test-call-from-api',
      previews: [
        {
          channel: 'email',
          pack: 'sky',
          mode: 'outdoor_limited',
          language: 'en',
          subject: 'Operation-supplied subject',
          text: '<script>untrusted text</script>\n09:00 MYT',
          html: '<script>window.previewExecuted=true</script>'
        }
      ]
    },
    { registry }
  )
  await page.getByRole('button', { name: t('channels.preview') }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText(t('channels.source'))).toBeVisible()
  await expect(page.getByText('Operation-supplied subject')).toBeVisible()
  await expect(page.getByText(/<script>untrusted text/)).toBeVisible()
  expect(await page.evaluate(() => 'previewExecuted' in window)).toBe(false)
})

test('channel errors keep the confirmed state and never invent a preview', async ({ page }) => {
  await setupProject(page)
  await failOperation(page, '**/v1/projects/project-id/channels/email', 'PATCH', 403, 'permission-denied')
  await failOperation(page, '**/v1/projects/project-id/channels/preview*')
  await page.goto(channelsPath)
  const toggle = page.getByRole('switch').first()
  // uncheck() would wait for an unchecked state the error path never reaches; Space performs the same write.
  await toggle.focus()
  await page.keyboard.press('Space')
  // Said in words; the problem's slug stays on the alert for tests, never in what a person reads.
  const alert = page.locator('[data-channels-panel]').getByRole('alert')
  await expect(alert).toHaveText(t('subscribe.error_forbidden'))
  await expect(alert).toHaveAttribute('data-problem', 'permission-denied')
  await expect(toggle).toBeChecked()
  await page.getByRole('button', { name: t('channels.preview') }).click()
  await expect(alert).toHaveText(t('subscribe.failed'))
  await expect(alert).toHaveAttribute('data-problem', 'operation-unavailable')
  await expect(page.getByText(t('channels.no_preview'))).toHaveCount(0)
})

for (const theme of ['dark', 'light', 'high-contrast'] as const) {
  test(`channels panel is axe-clean and unclipped in ${theme}`, async ({ page, baseURL, expectAxeClean }) => {
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
    await page.setViewportSize({ width: 375, height: 812 })
    await setupProject(page)
    await page.goto(channelsPath)
    await expect(page.getByRole('switch').first()).toBeVisible()
    await expectAxeClean(page)
    await expectUnclippedText(page)
  })
}
