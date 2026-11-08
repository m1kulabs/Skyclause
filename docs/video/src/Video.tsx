import { Audio, Video as MediaVideo } from '@remotion/media'
import { AbsoluteFill, Freeze, Sequence, staticFile } from 'remotion'
import { D3Crossing } from './D3Crossing'
import { V2Rain } from './V2Rain'
import { V3Haze } from './V3Haze'
import { readVoiceAssets, segments, secondsToFrames, takeFor, type Segment } from './lib'
import { EndCard, Slate, type EndCardProps } from './Slate'
import { TitleCard, waitLabel } from './TitleCard'
import { font, theme } from './theme'

const voiceAssets = readVoiceAssets()

function visual(segment: Segment, props: EndCardProps) {
  if (segment.id === 'V1') return <Slate captureDate={props.captureDate} />
  if (segment.id === 'V2') return <V2Rain />
  if (segment.id === 'D3') return <D3Crossing />
  if (segment.id === 'V3') return <V3Haze />
  if (segment.id === 'V6') return <EndCard {...props} />

  const take = takeFor(segment.id)
  if (take?.file) {
    const finalSourceFrame = Math.max(0, Math.floor((take.durationMs / 1000) * 30) - 1)
    return (
      <Freeze frame={finalSourceFrame} active={(frame) => frame >= finalSourceFrame}>
        <MediaVideo src={staticFile(take.file)} muted style={{ width: 1920, height: 1080, objectFit: 'contain' }} />
      </Freeze>
    )
  }

  return (
    <TitleCard shotId={segment.id} title={segment.title} waitingFor={segment.waitingFor ?? waitLabel(segment.needs)} />
  )
}

export type VideoProps = EndCardProps

export const VideoCut: React.FC<VideoProps> = (props) => {
  let cursor = 0
  return (
    <AbsoluteFill style={{ background: theme.background, color: theme.foreground, fontFamily: font.sans }}>
      {segments.map((segment) => {
        const from = cursor
        const duration = secondsToFrames(segment.seconds)
        cursor += duration
        const voice = voiceAssets[segment.id]
        return (
          <Sequence key={segment.id} name={`${segment.id} · ${segment.title}`} from={from} durationInFrames={duration}>
            <AbsoluteFill>{visual(segment, props)}</AbsoluteFill>
            {voice ? (
              <Sequence from={0} durationInFrames={duration} layout="none" name={`${segment.id} voice`}>
                <Audio src={staticFile(voice.audio)} />
              </Sequence>
            ) : null}
          </Sequence>
        )
      })}
      <div
        style={{
          position: 'absolute',
          right: 48,
          bottom: 30,
          color: theme.muted,
          fontSize: 14,
          lineHeight: 1.4,
          fontVariantNumeric: 'tabular-nums',
          padding: '6px 10px',
          background: 'rgba(19, 18, 23, 0.94)'
        }}
      >
        Recording · captured {props.captureDate ?? '{capture date}'}
      </div>
    </AbsoluteFill>
  )
}
