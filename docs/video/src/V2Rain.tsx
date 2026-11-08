import { Easing, interpolate, useCurrentFrame } from 'remotion'
import replayData from './data/replay-2nov.json'
import { FPS } from './lib'
import { font, theme } from './theme'

const start = Date.parse('2026-11-02T14:00:00+08:00')
const end = Date.parse('2026-11-02T16:00:00+08:00')
const readings = replayData.readings.filter((reading) => {
  const time = Date.parse(`${reading.timestamp}+08:00`)
  return time > start && time <= end
})
const maxValue = Math.max(...readings.map((reading) => reading.rain_mm))
const yMax = Math.max(2, Math.ceil(maxValue / 2) * 2)
const plot = { left: 286, top: 344, width: 1448, height: 376 }
const y = (value: number) => plot.top + plot.height - (value / yMax) * plot.height
const x = (time: number) => plot.left + ((time - start) / (end - start)) * plot.width
const ease = (frame: number, from: number, to: number) =>
  interpolate(frame, [from, to], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  })

export const V2Rain = () => {
  const frame = useCurrentFrame()
  const progress = ease(frame, 40, 18 * FPS)
  const totalProgress = ease(frame, 21 * FPS, 24 * FPS)
  const slot = plot.width / readings.length
  const tickStep = yMax > 6 ? 2 : 1
  const ticks = Array.from({ length: Math.floor(yMax / tickStep) + 1 }, (_, index) => index * tickStep)
  const lineX = x(Date.parse('2026-11-02T15:30:00+08:00'))
  const revealCount = progress * readings.length

  return (
    <div
      style={{
        width: 1920,
        height: 1080,
        background: theme.background,
        color: theme.foreground,
        fontFamily: font.sans
      }}
    >
      <div style={{ position: 'absolute', left: 112, top: 66, fontSize: 14, color: theme.secondary }}>
        Replay (2 Nov 2026)
      </div>
      <div style={{ position: 'absolute', left: 112, top: 115, fontSize: 42, fontWeight: 500 }}>
        Rain at the 15:30 exit wave
      </div>
      <div style={{ position: 'absolute', left: 112, top: 174, fontSize: 16, color: theme.muted }}>
        {replayData.gauge} · 2 Nov 2026 · MYT
      </div>
      <div
        style={{
          position: 'absolute',
          left: 112,
          top: 254,
          width: 1696,
          height: 646,
          background: theme.card,
          border: `1px solid ${theme.border}`,
          boxSizing: 'border-box'
        }}
      />
      <svg width={1696} height={646} viewBox="0 0 1696 646" style={{ position: 'absolute', left: 112, top: 254 }}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={plot.left - 112}
              x2={plot.left + plot.width - 112}
              y1={y(tick) - 254}
              y2={y(tick) - 254}
              stroke={theme.grid}
              strokeWidth="1"
            />
            <text x="130" y={y(tick) - 249} fill={theme.muted} fontFamily={font.sans} fontSize="14">
              {tick}
            </text>
          </g>
        ))}
        <text x="180" y="76" fill={theme.muted} fontFamily={font.sans} fontSize="14">
          Rainfall per five-minute reading · mm
        </text>
        {readings.map((reading, index) => {
          const rowTime = Date.parse(`${reading.timestamp}+08:00`)
          const reveal = Math.max(0, Math.min(1, revealCount - index))
          const height = plot.height * (reading.rain_mm / yMax) * ease(reveal * 30, 0, 30)
          const center = x(rowTime) - 112
          const barWidth = Math.max(16, slot * 0.68)
          return (
            <rect
              key={reading.timestamp}
              x={center - barWidth / 2}
              y={plot.top + plot.height - height - 254}
              width={barWidth}
              height={height}
              fill={theme.secondary}
            />
          )
        })}
        <line
          x1={lineX - 112}
          x2={lineX - 112}
          y1={plot.top - 254}
          y2={plot.top + plot.height - 254}
          stroke={theme.crimsonOnDark}
          strokeWidth="1"
        />
        <text x={lineX - 112 + 14} y="106" fill={theme.secondary} fontFamily={font.sans} fontSize="14">
          15:30 release wave
        </text>
        {['14:00', '14:30', '15:00', '15:30', '16:00'].map((label) => {
          const position = x(Date.parse(`2026-11-02T${label}:00+08:00`)) - 112
          return (
            <g key={label}>
              <line
                x1={position}
                x2={position}
                y1={plot.top + plot.height - 254}
                y2={plot.top + plot.height - 248}
                stroke={theme.muted}
                strokeWidth="1"
              />
              <text x={position - 22} y="598" fill={theme.muted} fontFamily={font.sans} fontSize="14">
                {label}
              </text>
            </g>
          )
        })}
        <text x="180" y="624" fill={theme.muted} fontFamily={font.sans} fontSize="14">
          Time · MYT
        </text>
        <text x="1392" y="76" fill={theme.muted} fontFamily={font.sans} fontSize="14">
          Date · 2 Nov 2026
        </text>
      </svg>
      {totalProgress > 0 ? (
        <div
          style={{
            position: 'absolute',
            left: 1380,
            top: 790,
            padding: '14px 20px',
            background: theme.raised,
            border: `1px solid ${theme.border}`,
            fontSize: 28,
            fontWeight: 500,
            fontVariantNumeric: 'tabular-nums',
            opacity: totalProgress
          }}
        >
          {replayData.total_14_to_16_mm.toFixed(1)} mm in 2 hours
        </div>
      ) : null}
    </div>
  )
}
