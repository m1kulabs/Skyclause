import { expect, type Locator, type Page } from '@playwright/test'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  CHECK,
  FPS,
  PUBLIC_DIR,
  SYNC_MS,
  RUN_ID,
  VIEWPORT,
  manifestPath,
  runDir,
  type Box,
  type Cue,
  type Manifest,
  type MaskSample,
  type Observation,
  type Take,
  type TrackSample
} from './contract'

export type TakeApi = {
  /** Wait for the element, record its box, and keep tracking it every ~100 ms until the take ends. */
  cue: (id: string, locator: Locator) => Promise<void>
  /** Move the visible cursor slowly to the element's centre. */
  glide: (locator: Locator) => Promise<void>
  /** A click that writes nothing (open a dialog, a row, a tab): 1.8 s hold before, 1.2 s after. */
  click: (locator: Locator) => Promise<void>
  /** A click that writes to production. Check mode only proves it is there and enabled, and never clicks. */
  commit: (locator: Locator, label: string) => Promise<boolean>
  type: (locator: Locator, text: string) => Promise<void>
  hold: (ms: number) => Promise<void>
  observe: (id: string, expected: string, actual: string, matches: boolean) => void
  deviation: (note: string) => void
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const round = (box: Box): Box => ({
  x: Math.round(box.x),
  y: Math.round(box.y),
  width: Math.round(box.width),
  height: Math.round(box.height)
})
const sameBox = (a: Box | null, b: Box | null) =>
  a === b ||
  (!!a &&
    !!b &&
    Math.abs(a.x - b.x) < 2 &&
    Math.abs(a.y - b.y) < 2 &&
    Math.abs(a.width - b.width) < 2 &&
    Math.abs(a.height - b.height) < 2)

// The element's box only while a viewer can see it: laid out, not hidden, near-opaque, in the viewport, and on top at
// its centre (a dialog or menu over it counts as gone). A callout drawn from this never outlives its target.
function presence(element: Element): Box | null {
  const rect = element.getBoundingClientRect()
  if (rect.width < 1 || rect.height < 1) return null
  if (rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth) return null
  let opacity = 1
  for (let node: Element | null = element; node; node = node.parentElement) {
    const style = getComputedStyle(node)
    if (style.display === 'none' || style.visibility === 'hidden') return null
    opacity *= Number(style.opacity)
  }
  if (opacity < 0.9) return null
  const x = Math.min(Math.max(rect.left + rect.width / 2, 0), innerWidth - 1)
  const y = Math.min(Math.max(rect.top + rect.height / 2, 0), innerHeight - 1)
  const top = document.elementFromPoint(x, y)
  if (!top || !(top === element || element.contains(top) || top.contains(element))) return null
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
}

// Every email address in text or a field, every account avatar, and any extra text the run names in MASK_TEXT.
function maskBoxes(extra: string[]): Box[] {
  const email = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g
  const boxes: Box[] = []
  const add = (rect: DOMRect) => {
    if (rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight)
      boxes.push({ x: rect.left, y: rect.top, width: rect.width, height: rect.height })
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue ?? ''
    const hits = [...text.matchAll(email)].map((m) => [m.index!, m[0].length] as const)
    for (const word of extra)
      for (let i = text.indexOf(word); i >= 0; i = text.indexOf(word, i + 1)) hits.push([i, word.length])
    for (const [start, length] of hits) {
      const range = document.createRange()
      range.setStart(node, start)
      range.setEnd(node, start + length)
      for (const rect of range.getClientRects()) add(rect)
    }
  }
  for (const field of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'))
    if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(field.value)) add(field.getBoundingClientRect())
  for (const avatar of document.querySelectorAll('[data-slot="avatar"], header img, img[alt*="avatar" i]'))
    add(avatar.getBoundingClientRect())
  return boxes
}

async function readRunManifest(): Promise<Manifest | null> {
  try {
    return JSON.parse(await readFile(manifestPath(), 'utf8')) as Manifest
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null
    throw error
  }
}

async function writeJsonAtomically(file: string, value: unknown): Promise<void> {
  const temporary = `${file}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  await rename(temporary, file)
}

async function saveTake(take: Take, browser: string): Promise<void> {
  await mkdir(runDir(), { recursive: true })
  const current = (await readRunManifest()) ?? { runId: RUN_ID!, mode: CHECK ? 'check' : 'record', browser, takes: [] }
  if (current.takes.some((item) => item.beat === take.beat))
    throw new Error(`Refusing to overwrite ${take.beat} in run ${RUN_ID}`)
  current.takes.push(take)
  await writeJsonAtomically(manifestPath(), current)
}

/** Warm the page off camera: a cold database can flash "Projects unavailable", and a lost session lands on sign-in. */
export async function warm(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'networkidle' })
  // A cold database can answer the projects read late; reload up to three times, 2 s apart, before giving up.
  for (let tries = 0; tries < 3 && (await page.getByText('Projects unavailable').isVisible()); tries++) {
    await page.waitForTimeout(2000)
    await page.reload({ waitUntil: 'networkidle' })
  }
  if (page.url().includes('/sign-in') || (await page.getByText('Continue with Google').isVisible()))
    throw new Error('Signed out. A person must sign in by hand and save record/.state/app.json. Stop and ask.')
  // Only a visible one counts: the phone layout keeps the switcher (and its error text) in a closed sheet.
  await expect(page.getByText('Projects unavailable').filter({ visible: true })).toHaveCount(0)
}

export async function recordTake(page: Page, beat: string, action: (take: TakeApi) => Promise<void>): Promise<Take> {
  const viewport = page.viewportSize() ?? VIEWPORT
  // A narrower 16:9 viewport rendered at a higher device scale (the D4 rota take) records crisp at 1920×1080; every
  // box is stored in video pixels, so the edit never knows the difference.
  const scale = VIEWPORT.width / viewport.width
  if (Math.abs(viewport.height * scale - VIEWPORT.height) > 2)
    throw new Error(`Expected a 16:9 viewport; received ${viewport.width}×${viewport.height}`)
  const toVideo = (box: Box): Box =>
    round({ x: box.x * scale, y: box.y * scale, width: box.width * scale, height: box.height * scale })
  const browser = `Chromium ${page.context().browser()?.version() ?? 'unknown'} (headless)`
  const relativeVideo = `footage/runs/${RUN_ID}/${beat}.webm`
  const absoluteVideo = join(PUBLIC_DIR, relativeVideo)
  if (!CHECK && existsSync(absoluteVideo)) throw new Error(`Refusing to overwrite earlier take ${absoluteVideo}`)

  const cues: Cue[] = []
  const tracked = new Map<string, Locator>()
  const tracks: Record<string, TrackSample[]> = {}
  const masks: MaskSample[] = []
  const observations: Observation[] = []
  const deviations: string[] = []
  const writes: string[] = []
  const extraMasks = (process.env.MASK_TEXT ?? '')
    .split(',')
    .map((word) => word.trim())
    .filter(Boolean)
  let origin = Date.now()
  let syncMs: number | null = null
  let durationMs = 0
  let started = false
  let sampling = true
  let sampleGapMs = 0
  const ticks: [number, number][] = []
  let failure: unknown
  let firstFrame!: () => void
  const firstFrameSeen = new Promise<void>((resolve) => (firstFrame = resolve))
  const now = () => Math.max(0, Math.round(Date.now() - origin))

  page.on('request', (request) => {
    if (request.method() !== 'GET' && request.url().includes('skyclause.m1ku.tech'))
      writes.push(`${now()} ms ${request.method()} ${new URL(request.url()).pathname}`)
  })

  const boxOf = async (locator: Locator) =>
    locator
      .first()
      .evaluate(presence, undefined, { timeout: 150 })
      .catch(() => null)

  const sampler = (async () => {
    let previous = -1
    while (sampling) {
      const tMs = now()
      if (previous >= 0) sampleGapMs = Math.max(sampleGapMs, tMs - previous)
      previous = tMs
      const targets = [...tracked]
      const [raws, found] = await Promise.all([
        Promise.all(targets.map(([, locator]) => boxOf(locator))),
        page.evaluate(maskBoxes, extraMasks).catch(() => [] as Box[])
      ])
      targets.forEach(([id], i) => {
        const box = raws[i] ? toVideo(raws[i]!) : null
        const list = (tracks[id] ??= [])
        if (!list.length || !sameBox(list.at(-1)!.box, box)) list.push({ tMs, box })
      })
      const boxes = found.map(toVideo)
      ticks.push([tMs, now()])
      const last = masks.at(-1)
      if (!last || last.boxes.length !== boxes.length || last.boxes.some((b, i) => !sameBox(b, boxes[i]!)))
        masks.push({ tMs, boxes })
      await sleep(100)
    }
  })()

  const take: TakeApi = {
    async cue(id, locator) {
      if (cues.some((cue) => cue.id === id)) throw new Error(`Cue ${id} recorded twice in ${beat}`)
      await expect(locator.first(), `cue ${id}`).toBeVisible()
      await locator.first().scrollIntoViewIfNeeded()
      // Wait out a fade or a slide-in: the cue counts only once the element is fully there and on top.
      let raw: Box | null = null
      for (let tries = 0; tries < 30 && !raw; tries++) {
        raw = await boxOf(locator)
        if (!raw) await sleep(100)
      }
      if (!raw) throw new Error(`Cue ${id} is covered, faded or off screen`)
      cues.push({ id, tMs: now(), box: toVideo(raw) })
      tracked.set(id, locator.first())
      if (CHECK) {
        // Proof of position: the page with the cue's box drawn on it, for review before any take.
        const box = round(raw) // CSS pixels, for the proof drawn on the page itself
        await page.evaluate((b) => {
          const mark = document.createElement('div')
          mark.id = 'skyclause-cue-proof'
          mark.style.cssText = `position:fixed;left:${b.x}px;top:${b.y}px;width:${b.width}px;height:${b.height}px;outline:3px solid #ff00ff;z-index:2147483647;pointer-events:none`
          document.body.append(mark)
        }, box)
        await mkdir(runDir(), { recursive: true })
        await page.screenshot({ path: join(runDir(), `${beat}-${String(cues.length).padStart(2, '0')}-${id}.png`) })
        await page.evaluate(() => document.getElementById('skyclause-cue-proof')?.remove())
      }
    },
    async glide(locator) {
      const box = await locator.first().boundingBox()
      if (!box) throw new Error('Nothing to move the cursor to')
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: CHECK ? 1 : 28 })
    },
    async click(locator) {
      await take.glide(locator)
      await take.hold(1800)
      await locator.first().click()
      await take.hold(1200)
    },
    async commit(locator, label) {
      await expect(locator.first(), label).toBeVisible()
      await expect(locator.first(), label).toBeEnabled()
      if (CHECK) {
        observations.push({
          id: `commit:${label}`,
          expected: 'present and enabled',
          actual: 'not clicked (check)',
          matches: true
        })
        return false
      }
      await take.click(locator)
      return true
    },
    async type(locator, text) {
      await take.glide(locator)
      await locator.first().click()
      await locator.first().pressSequentially(text, { delay: CHECK ? 0 : 55 })
    },
    async hold(ms) {
      await page.waitForTimeout(CHECK ? Math.min(ms, 100) : ms)
    },
    observe(id, expected, actual, matches) {
      observations.push({ id, expected, actual, matches })
      if (!matches) deviations.push(`${id}: expected "${expected}", saw "${actual}"`)
    },
    deviation(note) {
      deviations.push(note)
    }
  }

  try {
    if (!CHECK) {
      await mkdir(runDir(), { recursive: true })
      let sawFirstFrame = false
      await page.screencast.start({
        path: absoluteVideo,
        fps: FPS,
        size: VIEWPORT,
        onFrame: () => {
          if (sawFirstFrame) return
          sawFirstFrame = true
          origin = Date.now()
          firstFrame()
        }
      })
      started = true
      await page.screencast.showActions({ cursor: 'pointer', style: { title: 'display: none' } })
      await Promise.race([
        firstFrameSeen,
        sleep(15_000).then(() => {
          throw new Error('No screencast frame arrived within 15 seconds')
        })
      ])
      // Sync mark: a 24 px magenta square for 300 ms, under where the corner caption sits in the edit. Ingest finds
      // its first frame and shifts every cue and track by the difference, so callouts land on the right frame.
      await take.hold(800)
      // A manual popover sits in the top layer, above any other top-layer region (the phone layout's notifications
      // section covered a plain fixed div whatever its z-index).
      await page.evaluate((k) => {
        const mark = document.createElement('div')
        mark.id = 'skyclause-sync'
        mark.setAttribute('popover', 'manual')
        mark.style.cssText = `position:fixed;inset:auto;margin:0;padding:0;border:0;left:${1780 / k}px;top:${1046 / k}px;width:${24 / k}px;height:${24 / k}px;background:#ff00ff;pointer-events:none`
        document.body.append(mark)
        mark.showPopover()
      }, scale)
      syncMs = now()
      await page.waitForTimeout(SYNC_MS)
      await page.evaluate(() => document.getElementById('skyclause-sync')?.remove())
      await take.hold(2000 - (SYNC_MS - 300)) // still screen before the first move
    }
    await action(take)
    await take.hold(2000) // 2 s of still screen at the end
  } catch (error) {
    failure = error
  }

  sampling = false
  await sampler
  if (started) {
    await page.screencast.hideActions().catch(() => undefined)
    try {
      await page.screencast.stop()
      durationMs = Date.now() - origin
    } catch (error) {
      failure ??= error
    }
  } else durationMs = Date.now() - origin

  if (CHECK && writes.length) deviations.push(`Check mode saw ${writes.length} non-GET requests: ${writes.join('; ')}`)
  const note = [...(failure ? [failure instanceof Error ? failure.message : String(failure)] : []), ...deviations].join(
    ' | '
  )
  const result: Take = {
    beat,
    runId: RUN_ID!,
    status: failure ? 'failed' : deviations.length ? 'ok-deviation' : 'ok',
    method: CHECK ? 'check' : 'screencast',
    file: CHECK ? null : relativeVideo,
    durationMs: Math.round(durationMs),
    fps: FPS,
    viewport,
    syncMs,
    sampleGapMs,
    ticks,
    cues,
    tracks,
    masks,
    writes,
    observations,
    ...(note ? { note } : {})
  }
  await saveTake(result, browser)
  if (failure) throw failure
  return result
}
