import { Easing, interpolate, useCurrentFrame } from 'remotion'
import { Glyph } from './Glyph'
import { FPS } from './lib'
import { dusk, EASE, font } from './theme'

// Edit overlays for the Demo composition. Every one is a pure function of the frame: no state, effects or CSS
// transitions. Boxes are in the take's own 1920×1080 pixels, read from its manifest.
export type Box = { x: number; y: number; width: number; height: number }

const ease = Easing.bezier(...EASE)
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

/** `Replay (2 Nov 2026)`, top left, on every replayed frame. Dashed ink edge: DESIGN.md styles replay apart. */
export const ReplayBadge: React.FC<{ label?: string; x?: number; y?: number }> = ({
  label = 'Replay (2 Nov 2026)',
  x = 48,
  y = 40
}) => (
  <div
    style={{
      position: 'absolute',
      left: x,
      top: y,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 12,
      height: 52,
      padding: '0 22px 0 18px',
      borderRadius: 9999,
      border: `2px dashed ${dusk.ink}`,
      background: dusk.ground,
      color: dusk.ink,
      fontFamily: font.sans,
      fontSize: 24,
      fontWeight: 500,
      lineHeight: 1,
      whiteSpace: 'nowrap'
    }}
  >
    <Glyph name="replay" size={22} />
    {label}
  </div>
)

/**
 * A caption the edit puts on screen (for example D5's "ICS calendar feed · Outlook and Google Calendar"): a raised
 * capsule, bottom centre, above the corner caption's band, fading in and out over 0.2 s. Its words come from the
 * director script, never from a value the take did not show.
 */
export const Caption: React.FC<{ text: string; from: number; to: number; bottom?: number }> = ({
  text,
  from,
  to,
  bottom = 88
}) => {
  const frame = useCurrentFrame()
  const fade = Math.round(0.2 * FPS)
  if (frame < from || frame > to) return null
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom,
        display: 'flex',
        justifyContent: 'center',
        opacity: interpolate(frame, [from, from + fade, to - fade, to], [0, 1, 1, 0], { ...clamp, easing: ease })
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          height: 56,
          padding: '0 28px',
          borderRadius: 9999,
          background: dusk.raised,
          color: dusk.ink,
          fontFamily: font.sans,
          fontSize: 28,
          fontWeight: 500,
          whiteSpace: 'nowrap'
        }}
      >
        {text}
      </span>
    </div>
  )
}

/** A 2px ink box (or ring) on a cue box: in over 0.2 s, held, and out over 0.2 s, ending at `to`. */
export const Callout: React.FC<{ box: Box; from: number; to: number; pad?: number; ring?: boolean }> = ({
  box,
  from,
  to,
  pad = 8,
  ring = false
}) => {
  const frame = useCurrentFrame()
  const fade = Math.round(0.2 * FPS)
  if (to - from < 2 * fade) throw new Error(`Callout at frame ${from} is shorter than its fades`)
  if (frame < from || frame > to) return null
  const w = box.width + 2 * pad
  const h = box.height + 2 * pad
  const side = Math.max(w, h)
  return (
    <div
      style={{
        position: 'absolute',
        left: ring ? box.x + box.width / 2 - side / 2 : box.x - pad,
        top: ring ? box.y + box.height / 2 - side / 2 : box.y - pad,
        width: ring ? side : w,
        height: ring ? side : h,
        borderRadius: ring ? 9999 : 12,
        border: `2px solid ${dusk.ink}`,
        opacity: interpolate(frame, [from, from + fade, to - fade, to], [0, 1, 1, 0], { ...clamp, easing: ease }),
        scale: interpolate(frame, [from, from + fade], [0.96, 1], { ...clamp, easing: ease })
      }}
    />
  )
}

/**
 * A solid ground capsule over an email, an avatar or a name, held at full opacity for every frame in [from, to]. It
 * never fades, so no frame shows the text under it, and it never prints anything in its place.
 */
export const Mask: React.FC<{ box: Box; from: number; to: number; pad?: number; fill?: string }> = ({
  box,
  from,
  to,
  pad = 6,
  fill = dusk.ground
}) => {
  const frame = useCurrentFrame()
  if (frame < from || frame > to) return null
  return (
    <div
      style={{
        position: 'absolute',
        left: box.x - pad,
        top: box.y - pad,
        width: box.width + 2 * pad,
        height: box.height + 2 * pad,
        borderRadius: 9999,
        background: fill
      }}
    />
  )
}

/**
 * One push-in: ease in over `ramp` seconds to `scale` around the focus point, hold, and ease back to 100% by `to`.
 * `easeIn: false` or `easeOut: false` starts or ends the push already at `scale`, for a clip that cuts in or out
 * pushed (a frame that must never show the full page).
 */
export type Push = {
  from: number
  to: number
  scale: number
  focus: { x: number; y: number }
  ramp?: number
  easeIn?: boolean
  easeOut?: boolean
}

/**
 * Rests at 100% and returns to it after every push. Scale is capped at 1.2, or 1.4 where `allowClose` is set (the D1
 * dialog). Children (the take, its masks and callouts) move together, so a mask stays on its element.
 */
export const Camera: React.FC<{ pushes: Push[]; allowClose?: boolean; children: React.ReactNode }> = ({
  pushes,
  allowClose = false,
  children
}) => {
  const frame = useCurrentFrame()
  const cap = allowClose ? 1.4 : 1.2
  for (const push of pushes)
    if (push.scale > cap) throw new Error(`Push at frame ${push.from} goes to ${push.scale}, over the ${cap} cap`)
  const push = pushes.find((p) => frame >= p.from && frame <= p.to)
  const ramp = Math.round((push?.ramp ?? 0.9) * FPS)
  const scale = push
    ? interpolate(
        frame,
        [push.from, push.from + ramp, push.to - ramp, push.to],
        [push.easeIn === false ? push.scale : 1, push.scale, push.scale, push.easeOut === false ? push.scale : 1],
        { ...clamp, easing: ease }
      )
    : 1
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        transformOrigin: push ? `${push.focus.x}px ${push.focus.y}px` : '50% 50%',
        scale
      }}
    >
      {children}
    </div>
  )
}
