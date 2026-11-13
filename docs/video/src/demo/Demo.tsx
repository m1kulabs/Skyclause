import { Audio } from '@remotion/media'
import { AbsoluteFill, Img, Sequence, staticFile, type CalculateMetadataFunction } from 'remotion'
import { FPS } from '../lib'
import { D3Beat } from './D3Beat'
import { PLAN, segmentSeconds, type Segment } from './plan'
import { Caption, ReplayBadge } from '../overlays'
import { TakeClip, type IngestedTake } from './take'

// The demo segment: slide 6 cue, D1 to D6, with the demo narration at 1.0×. Masks, callouts and the camera come from
// each take's own tracking data (src/demo/take.tsx); the Replay badge is on D3's every frame.
// `plan` renders a subset (one beat, for review) instead of the whole PLAN.
export type DemoProps = { takes: Record<string, IngestedTake>; plan?: Segment[] }

export const calculateDemoMetadata: CalculateMetadataFunction<DemoProps> = async ({ props }) => {
  const plan = props.plan ?? PLAN
  const takes: Record<string, IngestedTake> = {}
  for (const segment of plan) {
    if (segment.kind !== 'take') continue
    const res = await fetch(staticFile(`footage/ingested/${segment.take}.json`))
    if (!res.ok) throw new Error(`${segment.id}: no ingested take ${segment.take} (HTTP ${res.status})`)
    takes[segment.take] = (await res.json()) as IngestedTake
  }
  const seconds = plan.reduce((sum, segment) => sum + segmentSeconds(segment), 0)
  return { durationInFrames: Math.round(seconds * FPS), props: { ...props, takes } }
}

const Beat: React.FC<{ segment: Segment; takes: Record<string, IngestedTake> }> = ({ segment, takes }) => {
  if (segment.kind === 'd3') return <D3Beat />
  if (segment.kind === 'still')
    return (
      <AbsoluteFill>
        <Img src={staticFile(segment.src)} style={{ width: 1920, height: 1080 }} />
        <Audio src={staticFile(segment.voice)} />
      </AbsoluteFill>
    )
  const take = takes[segment.take]
  if (!take) throw new Error(`${segment.id}: take ${segment.take} is not loaded`)
  return (
    <AbsoluteFill>
      <TakeClip
        take={take}
        steps={segment.steps}
        pushes={segment.pushes}
        callouts={segment.callouts}
        allowClose={segment.allowClose}
      />
      {segment.replay ? (
        typeof segment.replay === 'object' ? (
          <ReplayBadge x={segment.replay.x} y={segment.replay.y} />
        ) : (
          <ReplayBadge />
        )
      ) : null}
      {(segment.captions ?? []).map((c) => (
        <Caption key={c.text} text={c.text} from={Math.round(c.from * FPS)} to={Math.round(c.to * FPS)} />
      ))}
      {segment.voiceParts.map((part) => (
        <Sequence
          key={part.at}
          from={Math.round(part.at * FPS)}
          durationInFrames={part.to === undefined ? undefined : Math.round((part.to - part.from) * FPS)}
          layout="none"
        >
          <Audio src={staticFile(part.src ?? segment.voice)} trimBefore={Math.round(part.from * FPS)} />
        </Sequence>
      ))}
    </AbsoluteFill>
  )
}

export const Demo: React.FC<DemoProps> = ({ takes, plan = PLAN }) => {
  let at = 0
  return (
    <AbsoluteFill style={{ background: '#1a2039' }}>
      {plan.map((segment) => {
        const from = Math.round(at * FPS)
        at += segmentSeconds(segment)
        return (
          <Sequence key={segment.id} from={from} durationInFrames={Math.round(at * FPS) - from} name={segment.id}>
            <Beat segment={segment} takes={takes} />
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}
