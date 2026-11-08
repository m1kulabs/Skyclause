import { Easing, interpolate, useCurrentFrame } from 'remotion'
import { FPS, hazeTally } from './lib'
import { font, theme } from './theme'

const ease = (frame: number, from: number, to: number) =>
  interpolate(frame, [from, to], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  })

export const V3Haze = () => {
  const frame = useCurrentFrame()
  const chart = { left: 560, top: 360, width: 1030, rowHeight: 88 }
  const barMax = 10

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
      <div style={{ position: 'absolute', left: 112, top: 70, fontSize: 14, color: theme.secondary }}>
        Replay · {hazeTally.period}
      </div>
      <div style={{ position: 'absolute', left: 112, top: 118, fontSize: 42, fontWeight: 500 }}>October haze tally</div>
      <div style={{ position: 'absolute', left: 112, top: 178, fontSize: 16, color: theme.muted }}>
        {hazeTally.weekdays} weekdays · Cheras CA16W · 06:00
      </div>
      <div
        style={{
          position: 'absolute',
          left: 112,
          top: 256,
          width: 1696,
          height: 580,
          background: theme.card,
          border: `1px solid ${theme.border}`,
          boxSizing: 'border-box'
        }}
      />
      <svg width="1696" height="580" viewBox="0 0 1696 580" style={{ position: 'absolute', left: 112, top: 256 }}>
        {[0, 5, 10].map((tick) => {
          const position = chart.left + (tick / barMax) * chart.width - 112
          return (
            <g key={tick}>
              <line x1={position} x2={position} y1="104" y2="470" stroke={theme.grid} strokeWidth="1" />
              <text x={position - 5} y="502" fill={theme.muted} fontFamily={font.sans} fontSize="14">
                {tick}
              </text>
            </g>
          )
        })}
        <text x="448" y="76" fill={theme.muted} fontFamily={font.sans} fontSize="14">
          Count · weekdays
        </text>
        {hazeTally.categories.map((category, index) => {
          const from = index * 3 * FPS
          const progress = ease(frame, from, from + 2.2 * FPS)
          const count = Math.round(category.count * progress)
          const rowY = chart.top + index * chart.rowHeight - 256
          const width = (category.count / barMax) * chart.width * progress
          return (
            <g key={category.label}>
              <text x="44" y={rowY + 34} fill={theme.secondary} fontFamily={font.sans} fontSize="22">
                {category.glyph} {category.label}
              </text>
              <rect x={chart.left - 112} y={rowY + 12} width={chart.width} height="24" fill={theme.raised} />
              <rect x={chart.left - 112} y={rowY + 12} width={width} height="24" fill={theme.secondary} />
              <text
                x={chart.left + chart.width + 24 - 112}
                y={rowY + 34}
                fill={theme.foreground}
                fontFamily={font.sans}
                fontSize="22"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {count}
              </text>
            </g>
          )
        })}
        <text x="180" y="548" fill={theme.muted} fontFamily={font.sans} fontSize="14">
          Grade period · {hazeTally.period}
        </text>
      </svg>
      {frame >= 21 * FPS ? (
        <div
          style={{
            position: 'absolute',
            left: 112,
            top: 888,
            width: 1696,
            height: 90,
            padding: '22px 26px',
            borderBottom: `1px solid ${theme.crimsonOnDark}`,
            boxSizing: 'border-box',
            fontSize: 28,
            opacity: ease(frame, 21 * FPS, 22 * FPS)
          }}
        >
          Live grades: n=0
        </div>
      ) : null}
    </div>
  )
}
