import { Audio } from '@remotion/media'
import { Sequence, staticFile, useCurrentFrame } from 'remotion'
import { D3Crossing } from '../D3Crossing'
import { FPS } from '../lib'
import { D3_VOICE, d3ClipFrame } from './d3'

// D3, decide: the replay clip retimed to the voice. The clip carries its own Replay badge on every frame.
export const D3Beat: React.FC = () => {
  const frame = useCurrentFrame()
  const split = Math.round(D3_VOICE.split * FPS)
  const gap = Math.round(D3_VOICE.silence * FPS)
  return (
    <>
      <D3Crossing clipFrame={d3ClipFrame(frame)} />
      <Sequence from={Math.round(D3_VOICE.offset * FPS)} durationInFrames={split} layout="none">
        <Audio src={staticFile('voice/D3.wav')} />
      </Sequence>
      <Sequence from={Math.round(D3_VOICE.offset * FPS) + split + gap} layout="none">
        <Audio src={staticFile('voice/D3.wav')} trimBefore={split} />
      </Sequence>
    </>
  )
}
