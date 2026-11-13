import { Video } from '@remotion/media'
import { Easing, Freeze, interpolate, Sequence, staticFile, useCurrentFrame } from 'remotion'
import type { Take } from '../../record/contract'
import { FPS } from '../lib'
import { Camera, type Box, type Push } from '../overlays'
import { dusk, EASE } from '../theme'

// A recorded take in the Demo composition, with its callouts and masks drawn from the take's own tracking data. Times
// are in take milliseconds (from the ingested video's first frame), after ingest's sync shift.
export type IngestedTake = Take & {
  src: string
  syncVideoMs: number
  shiftMs: number
  cutInMs: number
  videoMs: number
}
/** `spanY` takes the box's top and height from a second cue (a column: its header's x and width, the table's y and height). */
/**
 * `staticBox` boxes an untracked element by a measured box. Allowed only where a frame diff of that box (+8 px) shows
 * nothing under it moves across the callout and 0.2 s either side; `gate` records that result.
 */
export type CalloutSpec = {
  cue: string
  fromMs: number
  toMs: number
  ring?: boolean
  spanY?: string
  staticBox?: Box
  gate?: string
}
/** A push centred on a cue's box, or on an explicit `focus` (a framing window chosen frame by frame, as for D4/D5 public). */
export type PushSpec = {
  fromMs: number
  toMs: number
  scale: number
  cue: string
  focus?: { x: number; y: number }
  easeIn?: boolean
  easeOut?: boolean
}
/**
 * How the beat walks through its take, like D3's remap: each step plays the take 1:1 from `play` (take ms) or holds
 * the take frame at `hold` (take ms). Beat seconds run back to back. Nothing is reordered; a hold is a still frame.
 */
export type TakeStep = { beat: [number, number] } & ({ play: number } | { hold: number })

export function takeMsAt(steps: TakeStep[], beatSeconds: number): number {
  const step = steps.find((s) => beatSeconds >= s.beat[0] && beatSeconds < s.beat[1]) ?? steps.at(-1)!
  return 'hold' in step ? step.hold : step.play + (beatSeconds - step.beat[0]) * 1000
}

export function checkSteps(take: IngestedTake, steps: TakeStep[]): void {
  for (const [i, step] of steps.entries()) {
    const prev = steps[i - 1]
    if (prev && prev.beat[1] !== step.beat[0]) throw new Error(`${take.beat}: step ${i} leaves a gap or overlap`)
    const first = 'hold' in step ? step.hold : step.play
    const last = 'hold' in step ? step.hold : step.play + (step.beat[1] - step.beat[0]) * 1000
    if (first < take.cutInMs) throw new Error(`${take.beat}: step ${i} uses take time before the sync mark is gone`)
    if (last > take.videoMs) throw new Error(`${take.beat}: step ${i} runs past the end of the take`)
  }
}

type Sample = { tMs: number; box: Box | null }
const at = <T extends { tMs: number }>(list: T[], tMs: number): T | undefined => {
  let found: T | undefined
  for (const item of list) {
    if (item.tMs > tMs) break
    found = item
  }
  return found
}
const ease = Easing.bezier(...EASE)
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

/** The tick that recorded a sample (samples are stamped with their tick's start). */
const tickIndex = (take: IngestedTake, tMs: number) => {
  const i = take.ticks.findIndex(([s]) => s === tMs)
  if (i < 0) throw new Error(`${take.beat}: no sampling tick at ${tMs} ms`)
  return i
}

/**
 * Where a callout may show. Its target was first seen on screen within tick j, so it was there by that tick's end;
 * it was last seen within the tick before the one that found it gone or moved, so it was there until that tick's
 * start. The callout fits inside, 100 ms clear of each bound, and never longer than asked.
 */
export function calloutWindow(take: IngestedTake, spec: CalloutSpec): { fromMs: number; toMs: number } {
  const track: Sample[] | undefined = take.tracks[spec.cue]
  if (!track) throw new Error(`${take.beat}: no track for cue ${spec.cue}`)
  const seen = at(track, spec.fromMs)
  if (!seen?.box) throw new Error(`${take.beat}: ${spec.cue} is not on screen at ${spec.fromMs} ms`)
  const surelyThere = take.ticks[tickIndex(take, seen.tMs)]![1] + 100
  if (spec.fromMs < surelyThere)
    throw new Error(`${take.beat}: callout on ${spec.cue} starts at ${spec.fromMs} ms, before ${surelyThere} ms`)
  // Gone means hidden, covered, or moved more than 4 px (a scroll): no callout rides a moving page.
  const start = at(track, spec.fromMs)!.box!
  const moved = (b: Box) =>
    Math.abs(b.x - start.x) > 4 ||
    Math.abs(b.y - start.y) > 4 ||
    Math.abs(b.width - start.width) > 4 ||
    Math.abs(b.height - start.height) > 4
  const goneSample = track.find((s) => s.tMs > spec.fromMs && (!s.box || moved(s.box)))
  const lastThere = goneSample ? take.ticks[tickIndex(take, goneSample.tMs) - 1]![0] : take.videoMs
  const toMs = Math.min(spec.toMs, lastThere - 100)
  if (toMs - spec.fromMs < 600)
    throw new Error(`${take.beat}: callout on ${spec.cue} would last ${toMs - spec.fromMs} ms; pick another moment`)
  return { fromMs: spec.fromMs, toMs }
}

/** A callout's window, intersected with its `spanY` cue's own window, so both targets are there throughout. */
export function spannedWindow(take: IngestedTake, spec: CalloutSpec): { fromMs: number; toMs: number } {
  if (spec.staticBox) {
    if (!spec.gate) throw new Error(`${take.beat}: a static callout needs its frame-diff gate recorded`)
    return { fromMs: spec.fromMs, toMs: spec.toMs }
  }
  const own = calloutWindow(take, spec)
  if (!spec.spanY) return own
  const span = calloutWindow(take, { ...spec, cue: spec.spanY })
  return { fromMs: Math.max(own.fromMs, span.fromMs), toMs: Math.min(own.toMs, span.toMs) }
}

const TrackedCallout: React.FC<{ take: IngestedTake; spec: CalloutSpec; tMs: number }> = ({ take, spec, tMs }) => {
  const { fromMs, toMs } = spannedWindow(take, spec)
  if (tMs < fromMs || tMs > toMs) return null
  const own = spec.staticBox ?? at(take.tracks[spec.cue]!, tMs)?.box
  const span = spec.staticBox ?? (spec.spanY ? at(take.tracks[spec.spanY]!, tMs)?.box : own)
  if (!own || !span) return null // never draw a box with no target under it
  const box = { x: own.x, width: own.width, y: span.y, height: span.height }
  const pad = 8
  const fade = 200
  const side = Math.max(box.width, box.height) + 2 * pad
  return (
    <div
      style={{
        position: 'absolute',
        left: spec.ring ? box.x + box.width / 2 - side / 2 : box.x - pad,
        top: spec.ring ? box.y + box.height / 2 - side / 2 : box.y - pad,
        width: spec.ring ? side : box.width + 2 * pad,
        height: spec.ring ? side : box.height + 2 * pad,
        borderRadius: spec.ring ? 9999 : 12,
        border: `2px solid ${dusk.ink}`,
        opacity: interpolate(tMs, [fromMs, fromMs + fade, toMs - fade, toMs], [0, 1, 1, 0], { ...clamp, easing: ease }),
        scale: interpolate(tMs, [fromMs, fromMs + fade], [0.96, 1], { ...clamp, easing: ease })
      }}
    />
  )
}

/**
 * Masks over every email and avatar the take saw. They fail toward covering: each frame draws the union of the sets
 * sampled one gap before, at and one gap after it, 8 px wider all round, held still (never tweened between samples),
 * so an address that appeared, moved or left between two samples is never bare for a frame.
 */
/**
 * How a mask looks: a raised-tone capsule, so a viewer sees a redaction rather than a gap (a ground fill vanishes on
 * the app's ground). 8 px on every side; 3 px at the sides only when the take's masks never change (one sample, so
 * nothing moved), so a neighbouring word ("until 12:00 MYT") stays whole. Approved by the Director at 08:09 MYT.
 */
export const MASK = { fill: dusk.raised, padY: 8 } as const
export const maskPadX = (take: IngestedTake) => (take.masks.length <= 1 ? 3 : 8)

export function maskBoxesAt(take: IngestedTake, tMs: number): Box[] {
  // A set first seen at tick k may have appeared just after tick k−1 started; the next set's tick k′ may have seen
  // it gone only at its end. So set i covers [start of tick k−1, end of tick k′] plus one frame each side.
  // Where two sets overlap in time (around a change), a box and its match in the other set merge into one hull, so
  // an address that scrolled between two ticks stays covered all the way. Unmatched boxes stay as they are.
  const frame = 1000 / 30
  const active: Box[][] = []
  take.masks.forEach((sample, i) => {
    const k = tickIndex(take, sample.tMs)
    const from = (k > 0 ? take.ticks[k - 1]![0] : 0) - frame
    const next = take.masks[i + 1]
    const to = next ? take.ticks[tickIndex(take, next.tMs)]![1] + frame : Infinity
    if (tMs >= from && tMs <= to) active.push(sample.boxes)
  })
  if (active.length < 2) return active.flat()
  const [first, ...rest] = active
  let boxes = [...first!]
  for (const set of rest) {
    const left = [...set]
    boxes = boxes.map((box) => {
      const i = left.findIndex((b) => Math.abs(b.width - box.width) <= 6 && Math.abs(b.height - box.height) <= 6)
      if (i < 0) return box
      const [match] = left.splice(i, 1)
      const x = Math.min(box.x, match!.x)
      const y = Math.min(box.y, match!.y)
      return {
        x,
        y,
        width: Math.max(box.x + box.width, match!.x + match!.width) - x,
        height: Math.max(box.y + box.height, match!.y + match!.height) - y
      }
    })
    boxes.push(...left)
  }
  return boxes
}

const TakeMasks: React.FC<{ take: IngestedTake; tMs: number }> = ({ take, tMs }) => {
  const boxes = maskBoxesAt(take, tMs)
  return (
    <>
      {boxes.map((box, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: box.x - maskPadX(take),
            top: box.y - MASK.padY,
            width: box.width + 2 * maskPadX(take),
            height: box.height + 2 * MASK.padY,
            borderRadius: 9999,
            background: MASK.fill
          }}
        />
      ))}
    </>
  )
}

/**
 * Plays the take through its steps, with pushes, callouts and masks. Push and callout times are in take ms; a push is
 * placed at the first beat frame that reaches its take time. Use inside a <Sequence>.
 */
export const TakeClip: React.FC<{
  take: IngestedTake
  steps: TakeStep[]
  pushes?: PushSpec[]
  callouts?: CalloutSpec[]
  allowClose?: boolean
}> = ({ take, steps, pushes = [], callouts = [], allowClose }) => {
  const frame = useCurrentFrame()
  checkSteps(take, steps)
  const tMs = takeMsAt(steps, frame / FPS)
  const beatFrames = Math.round(steps.at(-1)!.beat[1] * FPS)
  const toFrame = (ms: number) => {
    for (let f = 0; f < beatFrames; f++) if (takeMsAt(steps, f / FPS) >= ms) return f
    return beatFrames
  }
  const cameraPushes: Push[] = pushes.map((p) => {
    const box = take.cues.find((cue) => cue.id === p.cue)?.box
    if (!box) throw new Error(`${take.beat}: push on unknown cue ${p.cue}`)
    return {
      from: toFrame(p.fromMs),
      to: toFrame(p.toMs),
      scale: p.scale,
      easeIn: p.easeIn,
      easeOut: p.easeOut,
      focus: p.focus ?? { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    }
  })
  return (
    <Camera pushes={cameraPushes} allowClose={allowClose}>
      {steps.map((step) => {
        const from = Math.round(step.beat[0] * FPS)
        const length = Math.round(step.beat[1] * FPS) - from
        const source = Math.round((('hold' in step ? step.hold : step.play) * FPS) / 1000)
        const video = <Video src={staticFile(take.src)} trimBefore={source} muted />
        return (
          <Sequence key={from} from={from} durationInFrames={length} layout="none">
            {'hold' in step ? <Freeze frame={0}>{video}</Freeze> : video}
          </Sequence>
        )
      })}
      <TakeMasks take={take} tMs={tMs} />
      {callouts.map((spec) => (
        <TrackedCallout key={`${spec.cue}-${spec.fromMs}`} take={take} spec={spec} tMs={tMs} />
      ))}
    </Camera>
  )
}
