import { AbsoluteFill, Img, staticFile } from 'remotion'
import { Callout, Camera, Mask } from './overlays'

// Checkpoint still for the callout, mask and camera over the real slide 6 still: never part of the cut. The Replay
// badge goes only on replayed frames, so it is not here.
export type OverlayCheckProps = { push: boolean }

const approve = { x: 646, y: 636, width: 140, height: 70 }
const url = { x: 98, y: 248, width: 238, height: 38 }

export const OverlayCheck: React.FC<OverlayCheckProps> = ({ push }) => (
  <AbsoluteFill style={{ background: '#000' }}>
    <Camera pushes={push ? [{ from: 0, to: 89, scale: 1.2, focus: { x: 738, y: 671 } }] : []}>
      <Img src={staticFile('footage/deck/slide-06.png')} style={{ width: 1920, height: 1080 }} />
      <Mask box={url} from={0} to={89} />
      <Callout box={approve} from={10} to={80} />
    </Camera>
  </AbsoluteFill>
)
