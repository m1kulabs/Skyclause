import { Easing, interpolate, useCurrentFrame } from 'remotion'
import { FPS } from './lib'
import { font, theme } from './theme'

export type CaptureProps = { captureDate?: string }

export const BrandMark: React.FC<{ size?: number }> = ({ size = 88 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" role="img" aria-label="Skyclause mark">
    <rect x="2" y="2" width="12" height="12" fill="none" stroke={theme.landingForeground} strokeWidth="2" />
    <path d="M1 10.5h14" fill="none" stroke={theme.crimson} strokeWidth="1" />
  </svg>
)

const rise = (frame: number, from: number, to: number) =>
  interpolate(frame, [from, to], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  })

export const Slate: React.FC<CaptureProps> = ({ captureDate = '{capture date}' }) => {
  const frame = useCurrentFrame()
  const outline = rise(frame, 0, 30)
  const bar = rise(frame, 24, 42)
  return (
    <div
      style={{
        width: 1920,
        height: 1080,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: theme.landingBackground,
        color: theme.landingForeground,
        fontFamily: font.sans
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: -12 }}>
        <svg width="88" height="88" viewBox="0 0 16 16" aria-label="Skyclause mark">
          <rect
            x="2"
            y="2"
            width="12"
            height="12"
            fill="none"
            stroke={theme.landingForeground}
            strokeWidth="2"
            strokeDasharray="48"
            strokeDashoffset={48 * (1 - outline)}
          />
          <path
            d="M1 10.5h14"
            fill="none"
            stroke={theme.crimson}
            strokeWidth="1"
            strokeDasharray="14"
            strokeDashoffset={14 * (1 - bar)}
          />
        </svg>
        <div style={{ marginTop: 32, fontSize: 46, lineHeight: 1, fontWeight: 500, letterSpacing: '-0.02em' }}>
          Skyclause
        </div>
        <div style={{ marginTop: 30, color: theme.landingMuted, fontSize: 18 }}>
          Recording of the live system, captured {captureDate}
        </div>
      </div>
    </div>
  )
}

export type EndCardProps = CaptureProps & { repoUrl?: string; videoUrl?: string; liveUrl?: string }

export const EndCard: React.FC<EndCardProps> = ({
  captureDate = '{capture date}',
  repoUrl = 'https://github.com/m1kulabs/Skyclause',
  videoUrl = '',
  liveUrl = 'https://skyclause.m1ku.tech'
}) => {
  const links = [
    ['Repo', repoUrl],
    ['Video', videoUrl],
    ['Live', liveUrl]
  ].filter((item): item is [string, string] => Boolean(item[1]))

  return (
    <div
      style={{
        width: 1920,
        height: 1080,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: theme.landingBackground,
        color: theme.landingForeground,
        fontFamily: font.sans
      }}
    >
      <div style={{ width: 1220, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <BrandMark size={72} />
        <div style={{ marginTop: 24, fontSize: 40, lineHeight: 1, fontWeight: 500, letterSpacing: '-0.02em' }}>
          Skyclause
        </div>
        <div style={{ marginTop: 30, color: theme.landingMuted, fontSize: 16 }}>Captured {captureDate}</div>
        <div style={{ display: 'flex', gap: 34, marginTop: 44, fontSize: 16, color: theme.landingForeground }}>
          {links.map(([label, url]) => (
            <div key={label} style={{ display: 'flex', gap: 10 }}>
              <span style={{ color: theme.landingMuted }}>{label}</span>
              <span>{url}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 120, maxWidth: 980, color: theme.landingMuted, fontSize: 16, lineHeight: 1.5 }}>
          Skyclause is not a safety or emergency service. In an emergency, call 999.
        </div>
      </div>
    </div>
  )
}

export const SLATE_FRAMES = 15 * FPS
export const END_CARD_FRAMES = 15 * FPS
