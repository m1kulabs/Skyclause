// QA for callouts and masks in the Demo plan, from the takes' own tracking data. For every callout it prints the beat
// frames where the box comes in, sits mid-way and goes out, with the target's box at each; it fails if the target is
// missing, covered or more than 4 px from the box at any frame the box shows. For masks it fails if any frame of a take
// beat shows a sampled email or avatar box that no mask covers. Run from docs/video: bun scripts/check-marks.ts
// Then render the listed frames with `bunx remotion still … Demo --frame=<n>` and look at each one.
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PLAN, segmentSeconds, type Segment } from '../src/demo/plan'
import { checkSteps, maskBoxesAt, spannedWindow, takeMsAt, type IngestedTake } from '../src/demo/take'

const VIDEO = resolve(import.meta.dirname, '..')
const FPS = 30
// A plan file (the same JSON passed to the Demo render as props.plan) checks a subset; default is the whole PLAN.
const planFile = process.argv[2]
const plan = planFile ? (JSON.parse(readFileSync(planFile, 'utf8')) as { plan: Segment[] }).plan : PLAN
const failures: string[] = []
let at = 0
for (const segment of plan) {
  const start = Math.round(at * FPS)
  at += segmentSeconds(segment)
  if (segment.kind !== 'take') continue
  const take = JSON.parse(
    readFileSync(
      join(process.env.PUBLIC_DIR ?? join(VIDEO, 'public'), 'footage/ingested', `${segment.take}.json`),
      'utf8'
    )
  ) as IngestedTake
  checkSteps(take, segment.steps)
  const frames = Math.round(segmentSeconds(segment) * FPS)
  const sample = <T extends { tMs: number }>(list: T[], tMs: number): T | undefined =>
    list.filter((s) => s.tMs <= tMs).at(-1)
  for (const spec of segment.callouts ?? []) {
    const { fromMs, toMs } = spannedWindow(take, spec)
    const shown: number[] = []
    for (let f = 0; f < frames; f++) {
      const tMs = takeMsAt(segment.steps, f / FPS)
      if (tMs < fromMs || tMs > toMs) continue
      shown.push(f)
      const box = spec.staticBox ?? sample(take.tracks[spec.cue]!, tMs)?.box
      const span = spec.staticBox ?? (spec.spanY ? sample(take.tracks[spec.spanY]!, tMs)?.box : box)
      if (!box || !span)
        failures.push(`${segment.id} frame ${start + f}: callout ${spec.cue} drawn with no target under it`)
    }
    if (!shown.length) {
      failures.push(`${segment.id}: callout ${spec.cue} never shows`)
      continue
    }
    const pick = [shown[0]!, shown[Math.floor(shown.length / 2)]!, shown.at(-1)!]
    console.log(
      `${segment.id} callout ${spec.cue}: in ${start + pick[0]!}, mid ${start + pick[1]!}, out ${start + pick[2]!} ` +
        `(${((shown.length * 1000) / FPS / 1000).toFixed(2)} s, take ${fromMs}–${toMs} ms${spec.staticBox ? `, static: ${spec.gate}` : ''})`
    )
  }
  // Every sampled mask box must be inside the mask set the edit draws at that frame (it draws a superset by design).
  for (let f = 0; f < frames; f++) {
    const tMs = takeMsAt(segment.steps, f / FPS)
    const drawn = maskBoxesAt(take, tMs)
    const needed = sample(take.masks, tMs)?.boxes ?? []
    for (const box of needed)
      if (!drawn.some((d) => d.x === box.x && d.y === box.y))
        failures.push(`${segment.id} frame ${start + f}: a sampled mask box at ${box.x},${box.y} is not drawn`)
  }
  const maxBoxes = Math.max(0, ...take.masks.map((m) => m.boxes.length))
  console.log(
    `${segment.id} masks: ${take.masks.length} samples, up to ${maxBoxes} boxes at once, gap ${take.sampleGapMs} ms`
  )
}
if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log('check-marks: pass')
