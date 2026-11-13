// Ingest a take run: re-encode each kept take to 30 fps H.264 (a keyframe every 10 frames, a 3 s hold on the last
// frame), find the sync mark's first frame, and shift every cue, track and mask sample from the recorder's clock onto
// the video's own frames. Writes public/footage/ingested/<beat>.mp4 and <beat>.json, and copies the run to the shared
// recordings folder. Usage, from docs/video: bun scripts/ingest.ts <run-id> [beat ...]
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Manifest, Take } from '../record/contract'

// record/contract.ts SYNC_MS (that module needs a run id, so the value is repeated here).
const SYNC_MS = 600

const VIDEO = resolve(import.meta.dirname, '..')
const SHARED = process.env.SKYCLAUSE_SHARED ?? '/mnt/c/Users/User/Downloads/skyclause-video'
const [runId, ...only] = process.argv.slice(2)
if (!runId) throw new Error('Usage: bun scripts/ingest.ts <run-id> [beat ...]')
const PUBLIC = process.env.PUBLIC_DIR ?? join(VIDEO, 'public')
// NO_SHARE=1 keeps a scratch run out of the shared recordings folder.
const share = process.env.NO_SHARE !== '1'
const runDir = join(PUBLIC, 'footage/runs', runId)
const outDir = join(PUBLIC, 'footage/ingested')
mkdirSync(outDir, { recursive: true })
const manifest = JSON.parse(readFileSync(join(runDir, 'manifest.json'), 'utf8')) as Manifest

const FPS = 30
const SYNC = { x: 1780, y: 1046, size: 24 } // where take.ts draws the mark
const run = (cmd: string, args: string[]) => {
  const result = spawnSync('nice', ['-n', '10', cmd, ...args], { maxBuffer: 1 << 28 })
  if (result.status !== 0) throw new Error(`${cmd} failed: ${result.stderr.toString().slice(-800)}`)
  return result.stdout
}

export type IngestedTake = Take & {
  src: string
  /** Video time of the sync mark's first frame, and the shift added to every recorder time. */
  syncVideoMs: number
  shiftMs: number
  /** The first frame the cut may use: after the sync mark is gone. */
  cutInMs: number
  videoMs: number
}

for (const take of manifest.takes) {
  if (only.length && !only.includes(take.beat)) continue
  if (take.status === 'failed' || !take.file || take.syncMs === null) {
    console.log(`${take.beat}: skipped (${take.status}${take.note ? `: ${take.note.slice(0, 120)}` : ''})`)
    continue
  }
  const src = join(PUBLIC, take.file)
  const mp4 = join(outDir, `${take.beat}.mp4`)
  run('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-i',
    src,
    '-vf',
    'fps=30,tpad=stop_mode=clone:stop_duration=3',
    '-c:v',
    'libx264',
    '-crf',
    '16',
    '-preset',
    'medium',
    '-g',
    '10',
    '-pix_fmt',
    'yuv420p',
    '-an',
    '-movflags',
    '+faststart',
    mp4
  ])

  // One averaged RGB pixel per frame over the mark's square, for the first 6 s.
  const pixels = run('ffmpeg', [
    '-v',
    'error',
    '-t',
    '6',
    '-i',
    mp4,
    '-vf',
    `crop=${SYNC.size}:${SYNC.size}:${SYNC.x}:${SYNC.y},scale=1:1:flags=area`,
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    '-'
  ])
  let syncFrame = -1
  for (let i = 0; i + 2 < pixels.length; i += 3) {
    const [r, g, b] = [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!]
    if (r > 180 && b > 180 && g < 110) {
      syncFrame = i / 3
      break
    }
  }
  if (syncFrame < 0) throw new Error(`${take.beat}: no sync mark in the first 6 s of ${mp4}. Don't guess a shift.`)
  const syncVideoMs = Math.round((syncFrame * 1000) / FPS)
  const shiftMs = syncVideoMs - take.syncMs
  const shift = (t: number) => t + shiftMs
  const videoMs = Math.round(
    Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4]).toString()) * 1000
  )
  // The corner caption (bottom right, under the deck footer) covers x 1634–1824, y 1043–1073 in the edit. Flag any
  // take whose own UI puts something there, so the caption is lifted for that beat instead of covering it.
  const corner = run('ffmpeg', [
    '-v',
    'error',
    '-i',
    mp4,
    '-vf',
    'crop=200:36:1630:1040,scale=50:9:flags=area,format=gray',
    '-f',
    'rawvideo',
    '-'
  ])
  let cornerBusyMs: number | null = null
  for (let f = 0; f * 450 < corner.length; f++) {
    const frame = corner.subarray(f * 450, f * 450 + 450)
    if (Math.max(...frame) - Math.min(...frame) > 24 && (f * 1000) / FPS >= syncVideoMs + 500) {
      cornerBusyMs = Math.round((f * 1000) / FPS)
      break
    }
  }
  // Risky spans: a tick interval over 500 ms with a masked element on screen and the page moving (a mask box or a
  // tracked box changed). The OCR pass must clear these frame by frame, or the span is retaken.
  const ticks = take.ticks.map(([s, e]) => [shift(s), shift(e)] as [number, number])
  const masksAt = (t: number) => take.masks.filter((m) => shift(m.tMs) <= t).at(-1)?.boxes ?? []
  const tracksChanged = (a: number, b: number) =>
    Object.values(take.tracks).some((list) => list.some((s) => shift(s.tMs) > a && shift(s.tMs) <= b))
  const maskRisk: { fromMs: number; toMs: number }[] = []
  for (let k = 1; k < ticks.length; k++) {
    const [a, b] = [ticks[k - 1]![0], ticks[k]![1]]
    if (ticks[k]![0] - ticks[k - 1]![0] <= 500) continue
    const before = masksAt(ticks[k - 1]![0])
    const after = masksAt(ticks[k]![0])
    const moved = JSON.stringify(before) !== JSON.stringify(after) || tracksChanged(a, b)
    if ((before.length || after.length) && moved) maskRisk.push({ fromMs: a, toMs: b })
  }
  const ingested: IngestedTake & { cornerBusyMs: number | null; maskRisk: { fromMs: number; toMs: number }[] } = {
    cornerBusyMs,
    maskRisk,
    ...take,
    src: `footage/ingested/${take.beat}.mp4`,
    syncVideoMs,
    shiftMs,
    // Takes before 08:29 MYT showed the mark for 300 ms; later ones for SYNC_MS. Cut in after the longer of the two.
    cutInMs: syncVideoMs + Math.max(300, take.syncMs !== null && take.runId >= '20261113-0829' ? SYNC_MS : 300) + 200,
    videoMs,
    cues: take.cues.map((cue) => ({ ...cue, tMs: shift(cue.tMs) })),
    tracks: Object.fromEntries(
      Object.entries(take.tracks).map(([id, list]) => [id, list.map((s) => ({ ...s, tMs: shift(s.tMs) }))])
    ),
    masks: take.masks.map((m) => ({ ...m, tMs: shift(m.tMs) })),
    ticks
  }
  writeFileSync(join(outDir, `${take.beat}.json`), `${JSON.stringify(ingested, null, 2)}\n`)
  if (share) {
    const shared = join(SHARED, 'recordings', runId)
    mkdirSync(shared, { recursive: true })
    copyFileSync(mp4, join(shared, `${take.beat}.mp4`))
    copyFileSync(join(outDir, `${take.beat}.json`), join(shared, `${take.beat}.json`))
  }
  console.log(
    `${take.beat}: sync at frame ${syncFrame} (${syncVideoMs} ms), shift ${shiftMs} ms, cut in ${ingested.cutInMs} ms, ` +
      `${videoMs} ms, sample gap ${take.sampleGapMs} ms, corner ${cornerBusyMs === null ? 'clear' : `busy from ${cornerBusyMs} ms: lift the caption`}, ` +
      `mask risk ${maskRisk.length ? maskRisk.map((r) => `${r.fromMs}–${r.toMs} ms`).join(', ') + ' (OCR must clear)' : 'none'}`
  )
}
if (share) copyFileSync(join(runDir, 'manifest.json'), join(SHARED, 'recordings', runId, 'manifest.json'))
