import { expect, type Locator, type Page } from '@playwright/test'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  CHECK,
  RUN_ID,
  SHOTS,
  manifestPath,
  runDir,
  shot,
  type Box,
  type Cue,
  type Manifest,
  type Observation,
  type Take
} from './contract'

export type TakeApi = {
  cue: (id: string, locator: Locator) => Promise<void>
  mask: (locator: Locator) => Promise<void>
  hold: (ms: number) => Promise<void>
  observe: (id: string, expected: string, actual: string, matches: boolean) => void
  deviation: (note: string) => void
}

const missingFile = (error: unknown) => error instanceof Error && 'code' in error && error.code === 'ENOENT'
const rounded = (box: Box): Box => ({
  x: Math.round(box.x),
  y: Math.round(box.y),
  width: Math.round(box.width),
  height: Math.round(box.height)
})

async function settledBox(page: Page, locator: Locator): Promise<Box | null> {
  let last = await locator.boundingBox()
  for (let attempt = 0; attempt < 25; attempt++) {
    await page.waitForTimeout(120)
    const next = await locator.boundingBox()
    if (
      last &&
      next &&
      Math.abs(last.x - next.x) < 0.5 &&
      Math.abs(last.y - next.y) < 0.5 &&
      Math.abs(last.width - next.width) < 0.5 &&
      Math.abs(last.height - next.height) < 0.5
    )
      return next
    last = next
  }
  throw new Error('The cue element kept moving for 3 seconds')
}

async function readRunManifest(): Promise<Manifest | null> {
  try {
    return JSON.parse(await readFile(manifestPath(), 'utf8')) as Manifest
  } catch (error) {
    if (missingFile(error)) return null
    throw error
  }
}

async function writeJsonAtomically(file: string, value: unknown): Promise<void> {
  const temporary = `${file}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  await rename(temporary, file)
}

async function saveTake(take: Take, browser: string): Promise<void> {
  const directory = runDir()
  await mkdir(directory, { recursive: true })
  const current = (await readRunManifest()) ?? {
    runId: RUN_ID!,
    mode: CHECK ? 'check' : 'record',
    browser,
    takes: []
  }
  if (current.takes.some((item) => item.shotId === take.shotId))
    throw new Error(`Refusing to overwrite ${take.shotId} in run ${RUN_ID}`)
  current.takes.push(take)
  await writeJsonAtomically(manifestPath(), current)

  if (!CHECK && take.status !== 'failed') {
    const indexPath = join(import.meta.dirname, 'manifests.json')
    const index = JSON.parse(await readFile(indexPath, 'utf8')) as Take[]
    index.push(take)
    await writeJsonAtomically(indexPath, index)
  }
}

function cueTime(date: number, origin: number): number {
  return Math.max(0, Math.round(date - origin))
}

export async function recordTake(page: Page, shotId: string, action: (take: TakeApi) => Promise<void>): Promise<Take> {
  const spec = shot(shotId)
  const requiredCues = spec.cues ?? []
  const viewport = page.viewportSize() ?? { width: 1920, height: 1080 }
  if (viewport.width !== SHOTS.viewport.width || viewport.height !== SHOTS.viewport.height)
    throw new Error(`Expected a 1920×1080 viewport; received ${viewport.width}×${viewport.height}`)
  const browser = `Chromium ${page.context().browser()?.version() ?? 'unknown'} (headless)`
  const relativeVideo = `footage/runs/${RUN_ID}/${shotId}.webm`
  const absoluteVideo = join(import.meta.dirname, '..', 'public', relativeVideo)
  if (!CHECK && existsSync(absoluteVideo)) throw new Error(`Refusing to overwrite earlier take ${absoluteVideo}`)

  const cues: Cue[] = []
  const observations: Observation[] = []
  const deviations: string[] = []
  let origin = Date.now()
  let durationMs = 0
  let started = false
  let failure: unknown
  let firstFrame!: () => void
  const firstFrameSeen = new Promise<void>((resolve) => {
    firstFrame = resolve
  })

  const take: TakeApi = {
    async cue(id, locator) {
      if (!requiredCues.includes(id)) throw new Error(`Cue ${id} is not listed for ${shotId} in shots.json`)
      await expect(locator, `cue ${id}`).toBeVisible()
      await expect(locator, `cue ${id}`).toBeInViewport()
      const box = await settledBox(page, locator)
      cues.push({ id, tMs: cueTime(Date.now(), origin), box: box ? rounded(box) : null })
    },
    async mask(locator) {
      const count = await locator.count()
      for (let index = 0; index < count; index++) {
        const item = locator.nth(index)
        if (await item.isVisible())
          await item.evaluate((element) => ((element as HTMLElement).style.filter = 'blur(8px)'))
      }
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
        fps: SHOTS.fps,
        size: { width: SHOTS.viewport.width, height: SHOTS.viewport.height },
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
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('No screencast frame arrived within 15 seconds')), 15_000)
        )
      ])
    }
    await action(take)
    const missing = requiredCues.filter((id) => !cues.some((cue) => cue.id === id))
    if (missing.length) throw new Error(`Missing cues for ${shotId}: ${missing.join(', ')}`)
  } catch (error) {
    failure = error
  }

  if (started) {
    try {
      await page.screencast.hideActions()
    } catch {
      // The page may have closed after a recording failure.
    }
    try {
      await page.screencast.stop()
      durationMs = Date.now() - origin
    } catch (error) {
      failure ??= error
    }
  } else {
    durationMs = Date.now() - origin
  }

  const note = [...(failure ? [failure instanceof Error ? failure.message : String(failure)] : []), ...deviations].join(
    ' | '
  )
  const result: Take = {
    shotId,
    runId: RUN_ID!,
    status: failure ? 'failed' : deviations.length ? 'ok-deviation' : 'ok',
    method: CHECK ? 'check' : 'screencast',
    file: CHECK ? null : relativeVideo,
    durationMs: Math.round(durationMs),
    fps: SHOTS.fps,
    viewport,
    cues: cues.map((cue) => ({ ...cue, tMs: Math.max(0, cue.tMs) })),
    observations,
    ...(note ? { note } : {})
  }
  await saveTake(result, browser)
  if (failure) throw failure
  return result
}
