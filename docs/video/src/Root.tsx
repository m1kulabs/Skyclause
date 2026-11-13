import './fonts'
import { Composition } from 'remotion'
import { D3Crossing } from './D3Crossing'
import { FPS, secondsToFrames, VIDEO_FRAMES } from './lib'
import { OverlayCheck } from './OverlayCheck'
import { D3Beat } from './demo/D3Beat'
import { Demo, calculateDemoMetadata } from './demo/Demo'
import { D3_BEAT_S } from './demo/d3'
import { END_CARD_FRAMES, EndCard, SLATE_FRAMES, Slate, type EndCardProps } from './Slate'
import { TitleCard, type TitleCardProps } from './TitleCard'
import { V2Rain } from './V2Rain'
import { V3Haze } from './V3Haze'
import { VideoCut, type VideoProps } from './Video'

const size = { width: 1920, height: 1080, fps: FPS }
const defaultCapture = { captureDate: '{capture date}' }
const defaultLinks: EndCardProps = {
  ...defaultCapture,
  repoUrl: 'https://github.com/m1kulabs/Skyclause',
  videoUrl: '',
  liveUrl: 'https://skyclause.m1ku.tech'
}
const titleCard: TitleCardProps = { shotId: 'D1', title: 'The window', waitingFor: 'dev pilot recording' }

export const Root = () => (
  <>
    <Composition id="D3Crossing" component={D3Crossing} durationInFrames={secondsToFrames(30)} {...size} />
    <Composition
      id="Demo"
      component={Demo}
      durationInFrames={1}
      {...size}
      defaultProps={{ takes: {} }}
      calculateMetadata={calculateDemoMetadata}
    />
    <Composition id="D3Beat" component={D3Beat} durationInFrames={secondsToFrames(D3_BEAT_S)} {...size} />
    <Composition
      id="OverlayCheck"
      component={OverlayCheck}
      durationInFrames={90}
      {...size}
      defaultProps={{ push: false }}
    />
    <Composition id="V2Rain" component={V2Rain} durationInFrames={secondsToFrames(25)} {...size} />
    <Composition id="V3Haze" component={V3Haze} durationInFrames={secondsToFrames(25)} {...size} />
    <Composition id="Slate" component={Slate} durationInFrames={SLATE_FRAMES} {...size} defaultProps={defaultCapture} />
    <Composition
      id="EndCard"
      component={EndCard}
      durationInFrames={END_CARD_FRAMES}
      {...size}
      defaultProps={defaultLinks}
    />
    <Composition
      id="TitleCard"
      component={TitleCard}
      durationInFrames={secondsToFrames(12)}
      {...size}
      defaultProps={titleCard}
    />
    <Composition
      id="Video"
      component={VideoCut}
      durationInFrames={VIDEO_FRAMES}
      {...size}
      defaultProps={defaultLinks as VideoProps}
    />
  </>
)
