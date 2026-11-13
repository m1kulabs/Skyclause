// OCR QA for personal data in a rendered Demo (or one beat rendered with props.plan). Every frame where a take beat
// has a mask, every frame of a flagged mask-risk span, and every 15th frame of the rest are read with tesseract; the
// pass fails on any email-shaped text, and on any word passed in MASK_TEXT (names, read from the environment only).
// Usage, from docs/video: bun scripts/ocr-masks.ts <render.mp4> [plan.json]
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { PLAN, segmentSeconds, type Segment } from '../src/demo/plan'
import { maskBoxesAt, takeMsAt, type IngestedTake } from '../src/demo/take'

const VIDEO = resolve(import.meta.dirname, '..')
const PUBLIC = process.env.PUBLIC_DIR ?? join(VIDEO, 'public')
const [render, planFile, onlySegment] = process.argv.slice(2)
if (!render) throw new Error('Usage: bun scripts/ocr-masks.ts <render.mp4> [plan.json]')
const plan = planFile ? (JSON.parse(readFileSync(planFile, 'utf8')) as { plan: Segment[] }).plan : PLAN
const FPS = 30
// Each MASK_TEXT entry is matched whole and with its spaces removed (an email local part often joins a name).
const words = (process.env.MASK_TEXT ?? '')
  .split(',')
  .map((w) => w.trim().toLowerCase())
  .filter((w) => w.length >= 4)
  .flatMap((w) => [w, w.replace(/\s+/g, '')])
const email = /[\w.+-]+\s?@\s?[\w-]+(?:\s?\.\s?[\w-]+)+/

const frames = new Set<number>()
let at = 0
for (const segment of plan) {
  const start = Math.round(at * FPS)
  const length = Math.round(segmentSeconds(segment) * FPS)
  at += segmentSeconds(segment)
  if (onlySegment && segment.id !== onlySegment) continue
  // A named segment is read on every frame; otherwise every 15th frame plus every masked or risky one.
  for (let f = 0; f < length; f += onlySegment ? 1 : 15) frames.add(start + f)
  if (segment.kind !== 'take') continue
  const take = JSON.parse(
    readFileSync(join(PUBLIC, 'footage/ingested', `${segment.take}.json`), 'utf8')
  ) as IngestedTake & {
    maskRisk?: { fromMs: number; toMs: number }[]
  }
  for (let f = 0; f < length; f++) {
    const tMs = takeMsAt(segment.steps, f / FPS)
    const risky = (take.maskRisk ?? []).some((r) => tMs >= r.fromMs - 100 && tMs <= r.toMs + 100)
    if (risky || maskBoxesAt(take, tMs).length) frames.add(start + f)
  }
}
const list = [...frames].sort((a, b) => a - b)
const dir = mkdtempSync(join(tmpdir(), 'ocr-'))
const select = list.map((n) => `eq(n\\,${n})`).join('+')
const ff = spawnSync('nice', [
  '-n',
  '10',
  'ffmpeg',
  '-v',
  'error',
  '-i',
  render,
  '-vf',
  `select='${select}'`,
  '-vsync',
  '0',
  '-frame_pts',
  '1',
  join(dir, 'f-%d.png')
])
if (ff.status !== 0) throw new Error(ff.stderr.toString())
const failures: string[] = []
for (const file of readdirSync(dir).sort()) {
  // One thread per read, at nice 10, so the pass never spikes the shared machine.
  const text = spawnSync('nice', ['-n', '10', 'tesseract', join(dir, file), '-', '--psm', '11'], {
    encoding: 'utf8',
    env: { ...process.env, OMP_THREAD_LIMIT: '1' }
  }).stdout
  const frame = Number(file.slice(2, -4))
  const flat = text.toLowerCase()
  const hit = email.exec(text)?.[0] ?? words.find((w) => flat.includes(w) || flat.replace(/\s+/g, '').includes(w))
  if (hit) failures.push(`frame ${frame} (${(frame / FPS).toFixed(2)} s): personal data readable`)
}
rmSync(dir, { recursive: true })
console.log(`ocr-masks: read ${list.length} frames`)
if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log('ocr-masks: pass')
