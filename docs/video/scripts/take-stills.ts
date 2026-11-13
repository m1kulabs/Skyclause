// Three review stills per ingested take (start, key moment, end) for the Director, with every mask the edit would
// draw already painted on, so no email or name leaves the machine in a still. Usage, from docs/video:
//   bun scripts/take-stills.ts <beat> <key-cue-id>
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { MASK, maskBoxesAt, maskPadX, type IngestedTake } from '../src/demo/take'

const VIDEO = resolve(import.meta.dirname, '..')
const SHARED = process.env.SKYCLAUSE_SHARED ?? '/mnt/c/Users/User/Downloads/skyclause-video'
const [beat, keyCue] = process.argv.slice(2)
if (!beat || !keyCue) throw new Error('Usage: bun scripts/take-stills.ts <beat> <key-cue-id>')
const take = JSON.parse(readFileSync(join(VIDEO, 'public/footage/ingested', `${beat}.json`), 'utf8')) as IngestedTake
const key = take.cues.find((c) => c.id === keyCue)
if (!key) throw new Error(`${beat}: no cue ${keyCue}; cues are ${take.cues.map((c) => c.id).join(', ')}`)
const out = join(SHARED, 'stills', beat)
mkdirSync(out, { recursive: true })
const moments = { start: take.cutInMs + 500, key: key.tMs + 400, end: take.videoMs - 3200 } // end: before the 3 s tpad
for (const [name, tMs] of Object.entries(moments)) {
  const boxes = maskBoxesAt(take, tMs)
  const colour = `0x${MASK.fill.slice(1)}`
  const paint = boxes.map(
    (b) =>
      `drawbox=x=${b.x - maskPadX(take)}:y=${b.y - MASK.padY}:w=${b.width + 2 * maskPadX(take)}:h=${b.height + 2 * MASK.padY}:color=${colour}:t=fill`
  )
  const file = join(out, `${beat}-${name}.png`)
  const r = spawnSync('nice', [
    '-n',
    '10',
    'ffmpeg',
    '-v',
    'error',
    '-y',
    '-ss',
    (tMs / 1000).toFixed(3),
    '-i',
    join(VIDEO, 'public', take.src),
    '-frames:v',
    '1',
    ...(paint.length ? ['-vf', paint.join(',')] : []),
    file
  ])
  if (r.status !== 0) throw new Error(r.stderr.toString())
  console.log(`${file} (${tMs} ms, ${boxes.length} masks)`)
}
