import { expect, test, type Page } from '@playwright/test'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { APP, CHECK, PROJECT, SITE, VIDEO_ROOT, hasStorageState, runDir } from './contract'
import { recordTake, warm, type TakeApi } from './take'

// One test per beat of docs/demo/prelim/director-script.md, on production. Labels are the screen's (the director
// script's "Labels used"). Check mode (bun run record:check) navigates and finds every cue but never clicks a write.
// Pick beats with -g, for example: bun run record -- -g "D1".

const project = (path = '') => `${APP}${PROJECT}${path}`
const WINDOW_TITLE = '15:30 release wave, LRT Bukit Jalil'

// Signals, Overview and bundle review get a UI polish deploy at 07:15–07:30 MYT; record them only after it is live.
const afterPolish = () => process.env.AFTER_POLISH === '1'

async function signedIn(page: Page, url: string) {
  test.skip(!hasStorageState(), 'Needs record/.state/app.json, saved by a person signing in by hand.')
  await warm(page, url)
  // Never record the re-auth wall or a stale sign-in.
  await expect(page.getByText('Re-authenticate before approving')).toHaveCount(0)
}

// In check mode, keep an outline of each page so labels can be compared with the director script before recording.
async function outline(page: Page, name: string) {
  if (!CHECK) return
  await mkdir(runDir(), { recursive: true })
  await writeFile(join(runDir(), `${name}.aria.yml`), await page.locator('body').ariaSnapshot())
}

// The public site's parts ("Approval and notice", "The notice", "The ledger entry") are radios.
const control = (page: Page, name: string | RegExp) =>
  page
    .getByRole('radio', { name })
    .or(page.getByRole('tab', { name }))
    .or(page.getByRole('button', { name }))
    .or(page.getByRole('link', { name }))
    .first()

async function choose(take: TakeApi, page: Page, label: string, option: string) {
  const field = page.getByLabel(label, { exact: true }).first()
  if ((await field.evaluate((el) => el.tagName)) === 'SELECT') {
    await take.glide(field)
    await field.selectOption({ label: option })
    return
  }
  await take.click(field)
  await take.click(page.getByRole('option', { name: option, exact: true }))
}

async function setTime(take: TakeApi, page: Page, label: string, value: string) {
  const field = page.getByLabel(label, { exact: true }).first()
  if ((await field.getAttribute('type')) === 'time') {
    await take.glide(field)
    await field.fill(value)
  } else await take.type(field, value)
}

test('D1 declare', async ({ page }) => {
  await signedIn(page, project('/windows'))
  await outline(page, 'D1-windows')
  await recordTake(page, 'D1', async (take) => {
    const declare = page.getByRole('button', { name: 'Declare a window' }).first()
    await take.cue('declare', declare)
    await take.click(declare)
    const dialog = page.getByRole('dialog', { name: 'Declare a window' })
    await take.cue('dialog', dialog)
    await outline(page, 'D1-dialog')
    const title = dialog.getByLabel('Title', { exact: true })
    await take.cue('title', title)
    await take.type(title, WINDOW_TITLE)
    await take.cue('kind', dialog.getByLabel('Kind', { exact: true }))
    await choose(take, page, 'Kind', 'Commute wave')
    await take.cue('date', dialog.getByLabel('Date', { exact: true }))
    await take.cue('start', dialog.getByLabel('Start (MYT)', { exact: true }))
    await setTime(take, page, 'Start (MYT)', '15:30')
    await take.cue('end', dialog.getByLabel('End (MYT)', { exact: true }))
    await setTime(take, page, 'End (MYT)', '15:30')
    // Not built: never tick it. A build may hide it for a commute wave; if it shows, it must be unticked.
    const repeat = dialog.getByLabel('Repeat weekly')
    if (await repeat.count()) await expect(repeat).not.toBeChecked()
    const save = dialog.getByRole('button', { name: 'Save window' })
    await take.cue('save', save)
    if (await take.commit(save, 'Save window')) {
      await take.cue('saved', page.getByText('Window saved.'))
      // The timeline row itself, not the first text match (the First-run checklist also prints the title).
      await take.cue('new-row', page.getByRole('link', { name: WINDOW_TITLE }).last())
      await take.hold(2000)
    }
  })
})

test('D2 watch', async ({ page }) => {
  test.skip(
    !afterPolish(),
    'Wait for the 07:15–07:30 polish deploy and the troubleshooter screenshots; then set AFTER_POLISH=1.'
  )
  await signedIn(page, project('/signals'))
  await outline(page, 'D2-signals')
  await recordTake(page, 'D2', async (take) => {
    const finding = page.getByText(/Sky: \d+ inputs reporting/).first()
    await take.cue('finding', finding)
    await take.glide(finding)
    await take.hold(1000)
    for (const [id, name] of [
      ['row-gauge', 'Rainfall gauge, JPS'],
      ['row-met', 'Weather warnings, MET'],
      ['row-doe', 'Air Pollutant Index, DOE'] // renamed by #803 (8535ab8e)
    ] as const) {
      const row = page.getByRole('row').filter({ hasText: name }).first()
      await take.cue(id, row)
      await take.glide(row)
      await take.hold(1500)
    }
    const age = page.getByRole('columnheader', { name: 'Age' })
    await take.cue('age-header', age)
    await take.cue('table', page.getByRole('table').first())
    await take.glide(age)
    await take.hold(2000)
    await take.click(page.locator('a[href*="source=0232901RF"]').first())
    const detail = page
      .getByText(/Source detail · 0232901RF/)
      .or(page.getByRole('dialog').filter({ hasText: '0232901RF' }))
    await take.cue('detail', detail.first())
    await outline(page, 'D2-detail')
    await take.hold(2000)
  })
})

const nowMyt = () =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kuala_Lumpur',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(new Date())

/** The newest row in Recent bundles, by its printed MYT time, no older than `notBefore` (HH:MM). */
async function newestBundle(page: Page, notBefore?: string): Promise<{ href: string; time: string }> {
  const rows = await page
    .getByRole('region', { name: 'Recent bundles' })
    .getByRole('link')
    .evaluateAll((links) =>
      links.map((a) => ({
        href: a.getAttribute('href') ?? '',
        time: a.querySelector('time')?.textContent?.slice(0, 5) ?? ''
      }))
    )
  const newest = rows
    .filter((r) => r.href && r.time && (!notBefore || r.time >= notBefore))
    .sort((a, b) => (a.time < b.time ? 1 : -1))[0]
  if (!newest)
    throw new Error(`No bundle in Recent bundles at or after ${notBefore ?? 'any time'}. Stop and tell the Director.`)
  return newest
}

// D4. Off camera: Ask for a call → "Ask for a call now?" → Ask (a write: only with ASK=1, after the Director's go and
// the subscriber link), wait for "Drafted…", then open the newest row by its time. Check mode opens the dialog and
// clicks Cancel only, then reviews the newest existing bundle read-only.
test('D4 approve', async ({ page }) => {
  test.skip(!afterPolish(), 'Wait for the 07:15–07:30 polish deploy; then set AFTER_POLISH=1.')
  await signedIn(page, project())
  // Ask only on a Sky card that is not "No call" (a stale input); say which input and stop otherwise.
  const sky = page
    .getByRole('region', { name: 'Mode now' })
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Sky' }) })
  const skyText = (await sky.innerText()).replace(/\s+/g, ' ')
  console.log(`D4: Sky card reads: ${skyText.slice(0, 160)}`)
  if (/^Sky No call\b/.test(skyText) || (await sky.getByText('No call', { exact: true }).count()))
    throw new Error(
      `The Sky card reads No call (${skyText.match(/failing since [^.]*/)?.[0] ?? 'stale input'}). Don't ask; tell the Director.`
    )
  const ask = page.getByRole('region', { name: 'Recent bundles' }).getByRole('button', { name: 'Ask for a call' })
  await ask.click()
  await page.waitForTimeout(600)
  await outline(page, 'D4-ask-dialog')
  const dialog = page
    .getByRole('dialog', { name: 'Ask for a call now?' })
    .or(page.getByRole('alertdialog', { name: 'Ask for a call now?' }))
  await expect(dialog.getByText('Skyclause drafts a bundle for the approver to review.')).toBeVisible()
  let notBefore: string | undefined
  if (CHECK || process.env.ASK !== '1') {
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(dialog).toBeHidden()
  } else {
    notBefore = nowMyt()
    // Log every non-GET request from the click on: method, path, status, timing and response body (no headers or
    // cookies), so a silent Ask can be traced. Written beside the run's manifest as ask-log.json.
    const log: { at: string; method: string; path: string; status?: number; ms?: number; body?: string }[] = []
    const started = new Map<object, number>()
    page.on('request', (r) => {
      if (r.method() !== 'GET') started.set(r, Date.now())
    })
    page.on('requestfinished', async (r) => {
      if (r.method() === 'GET') return
      const res = await r.response()
      log.push({
        at: new Date().toISOString(),
        method: r.method(),
        path: new URL(r.url()).pathname,
        status: res?.status(),
        ms: Date.now() - (started.get(r) ?? Date.now()),
        body: (await res?.text().catch(() => ''))?.slice(0, 2000)
      })
    })
    page.on('requestfailed', (r) => {
      if (r.method() !== 'GET')
        log.push({
          at: new Date().toISOString(),
          method: r.method(),
          path: new URL(r.url()).pathname,
          body: `failed: ${r.failure()?.errorText}`
        })
    })
    const saveLog = async () => {
      await mkdir(runDir(), { recursive: true })
      await writeFile(join(runDir(), 'ask-log.json'), `${JSON.stringify(log, null, 2)}\n`)
    }
    await dialog.getByRole('button', { name: 'Ask', exact: true }).click()
    const drafted = page.getByText('Drafted. The new bundle is in the list below.')
    const failed = page.getByText(/No bundle was drafted\./)
    try {
      await expect(drafted.or(failed).first()).toBeVisible({ timeout: 180_000 })
    } catch (error) {
      await saveLog()
      throw new Error(
        `Neither "Drafted…" nor "No bundle was drafted…" in 180 s. Log: ${join(runDir(), 'ask-log.json')}`
      )
    }
    await saveLog()
    if (await failed.isVisible()) throw new Error('No bundle was drafted. Stop and tell the Director.')
  }
  const newest = await newestBundle(page, notBefore)
  console.log(`D4: opening the ${newest.time} MYT bundle`)
  await warm(page, `${APP}${newest.href}`)
  await outline(page, 'D4-bundle')
  await recordTake(page, 'D4', async (take) => {
    await take.cue('heading', page.getByRole('heading', { name: 'Bundle review' }))
    // A run with no open window today drafts no calls ("Closed; no approval needed"). Before D1 that is expected.
    if (await page.getByText('No calls in this bundle yet.').first().isVisible()) {
      await take.cue('no-calls', page.getByText('No calls in this bundle yet.').first())
      if (!CHECK)
        throw new Error('The bundle has no calls: is the D1 window declared for today? Stop and tell the Director.')
      take.deviation(
        'Newest bundle has no calls (no window declared yet); the Normal and approve paths were not reached.'
      )
      return
    }
    // A stale input gives "No call": honest, but not filmed. The beat starts at the Rota summary instead (#802).
    if (await page.getByText('No call', { exact: true }).first().isVisible())
      throw new Error(
        'The bundle reads No call: do not film it. Start D4 at the Rota summary, then the public worked example.'
      )
    if (await page.getByText(/Normal: nothing to send/).isVisible()) {
      await take.cue('normal', page.getByText(/Normal: nothing to send/).first())
      take.deviation('The sky gave Normal: nothing to send. Use the Normal opening, then the D4 fallback.')
      await take.hold(3000)
      return
    }
    await take.cue('trigger', page.getByText(/ at .* · Sky/).first())
    await take.cue('sla', page.getByText(/SLA due/).first())
    await take.cue('fired', page.getByText('Fired clauses').first())
    await take.cue('input-age', page.getByText(/\d+ min old/).first())
    await take.cue('summary', page.getByText(/Calls: \d+ · disagreements with the clause engine: \d+/).first())
    await take.cue('wording', page.getByText('Wording').first())
    await take.cue('sends', page.getByText(/Sends .* to .*/).first())
    const approve = page.getByRole('button', { name: /Approve 1 call/ })
    await take.cue('approve', approve)
    if (!(await approve.isEnabled())) throw new Error('Approve is disabled: never record it. Use the D4 fallback.')
    // A call that is not Normal changes D4 and D5: never approve it without the Director's explicit go (APPROVE=1).
    if (!CHECK && process.env.APPROVE !== '1') {
      take.deviation('A call that is not Normal is ready to approve. Stopped before Approve: tell the Director.')
      await take.hold(2000)
      return
    }
    if (await take.commit(approve, 'Approve 1 call')) {
      await take.cue('approved', page.getByText(/Approved at/).first())
      await take.cue('sent', page.getByText(/Sent .* at/).first())
      await take.hold(2000)
    }
  })
})

// D4, live flow (Director, 08:10 MYT). Production can't confirm a draft in the dialog (its event stream answers 501),
// so the take films Ask for a call → Ask → "Asked…", closes the dialog, and waits with the mouse still while the
// troubleshooter reads the run status. A person writes that status to record/.state/ask-result ("drafted" or
// "no_draft"); the take then reloads the overview and, only on "drafted", opens the newest bundle and holds on it.
// The "No bundle was drafted…" timeout message is never filmed as a result. One Ask only: ASK=1.
test('D4 live', async ({ page }) => {
  test.skip(CHECK || process.env.ASK !== '1', "Writes to production: only with ASK=1 and the Director's go.")
  test.setTimeout(10 * 60 * 1000)
  const state = join(VIDEO_ROOT, 'record/.state')
  const resultFile = join(state, 'ask-result')
  const askedFile = join(state, 'asked-at')
  await rm(resultFile, { force: true })
  await rm(askedFile, { force: true })
  await signedIn(page, project())
  const sky = page
    .getByRole('region', { name: 'Mode now' })
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Sky' }) })
  const skyText = (await sky.innerText()).replace(/\s+/g, ' ')
  if (await sky.getByText('No call', { exact: true }).count())
    throw new Error(
      `The Sky card reads No call (${skyText.match(/failing since [^.]*/)?.[0] ?? 'stale input'}). Don't ask.`
    )
  const log: { at: string; method: string; path: string; status?: number; ms?: number; body?: string }[] = []
  const started = new Map<object, number>()
  page.on('request', (r) => {
    if (r.method() !== 'GET') started.set(r, Date.now())
  })
  page.on('requestfinished', async (r) => {
    if (r.method() === 'GET') return
    const res = await r.response()
    log.push({
      at: new Date().toISOString(),
      method: r.method(),
      path: new URL(r.url()).pathname,
      status: res?.status(),
      ms: Date.now() - (started.get(r) ?? Date.now()),
      body: (await res?.text().catch(() => ''))?.slice(0, 2000)
    })
  })
  page.on('requestfailed', (r) => {
    if (r.method() !== 'GET')
      log.push({
        at: new Date().toISOString(),
        method: r.method(),
        path: new URL(r.url()).pathname,
        body: `failed: ${r.failure()?.errorText}`
      })
  })
  let notBefore = ''
  try {
    await recordTake(page, 'D4-live', async (take) => {
      const recent = page.getByRole('region', { name: 'Recent bundles' })
      const ask = recent.getByRole('button', { name: 'Ask for a call' })
      await take.cue('ask', ask)
      await take.click(ask)
      const dialog = page
        .getByRole('alertdialog', { name: 'Ask for a call now?' })
        .or(page.getByRole('dialog', { name: 'Ask for a call now?' }))
      await take.cue('dialog', dialog.first())
      const confirm = dialog.first().getByRole('button', { name: 'Ask', exact: true })
      await take.cue('confirm', confirm)
      await take.glide(confirm)
      await take.hold(1800)
      notBefore = nowMyt()
      await confirm.click()
      const askedAt = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kuala_Lumpur',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
      }).format(new Date())
      await writeFile(askedFile, `${askedAt}\n`)
      console.log(`ASKED ${askedAt}`)
      // The Ask has gone out: from here nothing may fail the take before the status arrives.
      await take
        .cue('asked', page.getByText(/Asked…|Asked\.\.\./).first())
        .catch(() => take.deviation('No "Asked…" text seen'))
      await take.hold(1200)
      await page.keyboard.press('Escape')
      if (
        await dialog
          .first()
          .isVisible()
          .catch(() => false)
      )
        await dialog
          .first()
          .getByRole('button', { name: 'Cancel', exact: true })
          .click()
          .catch(() => undefined)
      await expect(dialog.first())
        .toBeHidden()
        .catch(() => take.deviation('The Ask dialog stayed open'))
      // Wait, mouse still, for the run status (up to 4 min).
      let result = ''
      for (let waited = 0; waited < 240_000 && !result; waited += 1000) {
        await page.waitForTimeout(1000)
        result = (await readFile(resultFile, 'utf8').catch(() => '')).trim()
      }
      if (!result) throw new Error('No run status arrived in 4 min (record/.state/ask-result). Stopped.')
      take.observe('run-status', 'drafted or no_draft', result, true)
      await page.reload({ waitUntil: 'networkidle' })
      await take.cue('recent', recent.getByRole('heading', { name: 'Recent bundles' }))
      if (!result.startsWith('drafted')) {
        await take.hold(2000)
        return
      }
      const newest = await newestBundle(page, notBefore)
      const row = recent
        .getByRole('link')
        .filter({ has: page.locator('time', { hasText: newest.time }) })
        .first()
      await take.cue('new-row', row)
      await take.click(row)
      await take.cue('heading', page.getByRole('heading', { name: 'Bundle review' }))
      const normal = page.getByText(/Normal: nothing to send/).first()
      if (await normal.isVisible()) {
        await take.cue('normal', normal)
        await take.hold(2000)
      } else take.deviation('The new bundle does not read Normal: stopped before anything else. Tell the Director.')
    })
  } finally {
    await mkdir(runDir(), { recursive: true })
    await writeFile(join(runDir(), 'ask-log.json'), `${JSON.stringify(log, null, 2)}\n`)
  }
})

// D4 rota, narrow (Director, 08:27 MYT): the same live page at a 640×360 CSS viewport rendered at 3× device scale
// (900×506 still showed two columns), so the layout stacks and the summary fills a crisp 1920×1080 frame. A 56 px
// scroll off camera tucks the title wholly under the sticky bar and keeps the shift card below the fold.
// Read-only; the name is masked from MASK_TEXT. The take asserts the shift card's top stays below the viewport.
test.describe('narrow', () => {
  test.use({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 3 })
  test('D4 rota narrow', async ({ page }) => {
    await signedIn(page, project('/settings/rota'))
    const card = page.getByRole('region', { name: 'Project shifts' })
    await page.evaluate(() => window.scrollTo(0, 56))
    await page.waitForTimeout(500)
    const cardBelow = async () => ((await card.boundingBox())?.y ?? Infinity) >= 360
    expect(await cardBelow(), 'the shift card must start below the viewport').toBe(true)
    await expect(page.locator('p', { hasText: 'Inherited organisation rota' }).first()).toBeInViewport({ ratio: 1 })
    await outline(page, 'D4-rota-narrow')
    await recordTake(page, 'D4-rota-narrow', async (take) => {
      const line = (label: string) => page.locator('p', { hasText: label }).first()
      await take.cue('on-duty', line('On duty now'))
      await take.cue('shift-count', line('Project shifts'))
      await take.cue('inherited', line('Inherited organisation rota'))
      await take.glide(line('On duty now'))
      for (let i = 0; i < 8; i++) {
        await take.hold(500)
        if (!(await cardBelow())) throw new Error('The shift card came into view: mask it whole and tell the Director.')
      }
    })
  })
})

// Check only: the overview D4 starts from. Never clicks Ask for a call.
test('D4 overview (check)', async ({ page }) => {
  test.skip(!CHECK, 'Check mode only.')
  test.skip(!afterPolish(), 'Set AFTER_POLISH=1 once the polish deploy is live.')
  await signedIn(page, project())
  await outline(page, 'D4-overview')
  await recordTake(page, 'D4-overview', async (take) => {
    await take.cue('mode-now', page.getByRole('heading', { name: 'Mode now' }))
    await take.cue('signal-health', page.getByRole('heading', { name: 'Signal health' }))
    await take.cue('recent', page.getByRole('heading', { name: 'Recent bundles' }))
    const ask = page.getByRole('button', { name: 'Ask for a call' })
    await take.cue('ask', ask)
    await take.commit(ask, 'Ask for a call')
  })
})

// D4 fallback, live part: who is on duty. Frame only the summary column; the shift row prints an email.
test('D4 rota', async ({ page }) => {
  await signedIn(page, project('/settings/rota'))
  await outline(page, 'D4-rota')
  await recordTake(page, 'D4-rota', async (take) => {
    // Each summary line is one paragraph, label and value together ("On duty now {name} until 12:00 MYT").
    const line = (label: string) => page.locator('p', { hasText: label }).first()
    await take.cue('on-duty', line('On duty now'))
    await take.cue('shift-count', line('Project shifts'))
    await take.cue('inherited', line('Inherited organisation rota'))
    await take.glide(line('On duty now'))
    await take.hold(3000)
  })
})

test('D6 record', async ({ page }) => {
  await signedIn(page, process.env.BUNDLE_URL ?? project('/ledger'))
  if (process.env.BUNDLE_URL) await page.getByRole('link', { name: 'See it in the ledger' }).click()
  await outline(page, 'D6-ledger')
  await recordTake(page, 'D6', async (take) => {
    take.observe(
      'public-cut-in',
      'none',
      'dropped: the public ledger entry shows grade copy that a 1.2 push cannot leave out',
      true
    )
    await take.cue('heading', page.getByRole('heading', { name: 'Ledger' }))
    const empty = page.getByText(/No entries yet \(n=0\)/).first()
    if (await empty.isVisible()) await take.cue('empty', empty)
    else {
      const row = page.getByRole('row').filter({ hasText: 'Call approved' }).first()
      await take.cue('row-approved', row)
      for (const [id, name] of [
        ['col-time', 'Time (MYT)'],
        ['col-decided', 'Decided by'],
        ['col-approval', 'To approval'],
        ['col-notice', 'To notice']
      ] as const) {
        const header = page.getByRole('columnheader', { name })
        await take.cue(id, header)
        await take.glide(header)
        await take.hold(900)
      }
    }
    const check = page.getByRole('button', { name: 'Check integrity' })
    await take.cue('check', check)
    if (await take.commit(check, 'Check integrity')) {
      await take.cue('intact', page.getByText(/Chain intact: \d+ checked/).first())
      await take.hold(3000)
    }
    const exportCsv = control(page, 'Export CSV')
    await take.cue('export', exportCsv)
    await take.glide(exportCsv)
    await take.hold(1500)
  })
})

// D5, live part (Director, 08:16 MYT): Settings → Channels with Conditions calendar On, 4–5 s, read-only. The feed
// itself (0 entries today) stays off screen; the edit captions "ICS calendar feed · Outlook and Google Calendar".
test('D5 channels', async ({ page }) => {
  await signedIn(page, project('/settings/channels'))
  await outline(page, 'D5-channels')
  await recordTake(page, 'D5-channels', async (take) => {
    const calendar = page.getByRole('switch', { name: /Conditions calendar/ }).first()
    await take.cue('calendar', calendar)
    await expect(calendar).toBeChecked()
    await take.cue('calendar-row', page.getByRole('listitem').filter({ has: calendar }).first())
    await take.glide(calendar)
    await take.hold(4500)
  })
})

// Public-site fallbacks (signed out, read-only). Each panel carries its own Replay mark, and the edit adds ours. The
// take starts already scrolled to the section, off camera, so the hero's "graded call" never reaches a kept frame;
// the Grade stage is never selected.
async function publicPart(page: Page, take: TakeApi, part: string, mustRead: (string | RegExp)[]) {
  // The radio input itself is visually hidden; the viewer sees (and the cursor clicks) its label.
  const partControl = page
    .locator('label', { has: page.getByRole('radio', { name: part }) })
    .or(page.getByText(part, { exact: true }))
    .first()
  await take.cue('part', partControl)
  await take.click(partControl)
  for (const [index, text] of mustRead.entries()) await take.cue(`text-${index}`, page.getByText(text).first())
  await take.hold(3000)
}

const publicBeat = (beat: string, section: string, part: string, mustRead: (string | RegExp)[], dropped?: string) =>
  test(`${beat} public`, async ({ page }) => {
    test.skip(!!dropped && !CHECK, `Dropped from the cut: ${dropped}`)
    await page.goto(SITE, { waitUntil: 'networkidle' })
    await control(page, section).click() // off camera
    await page.waitForTimeout(1500) // let the scroll settle before the first frame
    // Grading is paused: no grade claim in a kept frame. Push the section's grade sentence below the fold.
    const gradeLine = page.getByText(/next morning grades it/).first()
    if (await gradeLine.isVisible()) {
      const top = await gradeLine.evaluate((el) => el.getBoundingClientRect().top)
      if (top < 1080) await page.mouse.wheel(0, -(1080 - top + 40))
      await page.waitForTimeout(800)
    }
    await expect(page.getByText('graded call')).not.toBeInViewport()
    await expect(gradeLine).not.toBeInViewport()
    await outline(page, `${beat}-public`)
    await recordTake(page, `${beat}-public`, (take) => publicPart(page, take, part, mustRead))
  })

publicBeat('D4', 'How it works', 'Approval and notice', [
  'Worked example: no call was made that day',
  'Bundle for the Sky pack'
])
publicBeat('D5', 'The record', 'The notice', [/n=0: this project has no sent call yet/])
// Dropped (Director, 06:27 MYT): beside the card, "…delay and grade…" sits at x 24–598 on the same rows, and the
// card's 4th row prints "Grade input · Span peak 59.5 mm". Leaving both out needs a push of at least 1.45, over the
// 1.2 cap, so D6 stays live only. The D6 manifest logs this.
publicBeat(
  'D6',
  'The record',
  'The ledger entry',
  ['Empty: no call was made that day'],
  'grade copy beside and under the card'
)
