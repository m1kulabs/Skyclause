import { Easing, interpolate, useCurrentFrame } from 'remotion'
import replayData from './data/replay-2nov.json'
import { FPS } from './lib'
import { font, theme } from './theme'

// The crux of the video: the 2 November replay of gauge 0232901RF, drawn only from replay-2nov.json.
// Beats, in seconds: 0–7 the bars rise to 14:55 and hold on Normal; 8–14 the 15:00 bar lands and the hour crosses
// Lebat, slowed; 20 the 15:05 poll flips the verdict; 24 the time left before the 15:30 wave prints.
const T = { rise: [0.6, 6], cross: [8, 14], flip: 20, lead: 24 } as const

const at = (stamp: string) => Date.parse(`${stamp}+08:00`)
const hhmm = (stamp: string) => stamp.slice(11, 16)
const start = at('2026-11-02T14:00:00')
const end = at('2026-11-02T16:00:00')
const readings = replayData.readings.filter(
  (r) => at(r.timestamp) > start && at(r.timestamp) <= at('2026-11-02T15:00:00')
)
const before = readings.filter((r) => hhmm(r.timestamp) <= '14:55')
const r1455 = readings.find((r) => hhmm(r.timestamp) === '14:55')!
const r1500 = readings.find((r) => hhmm(r.timestamp) === '15:00')!

// Chart geometry, in the chart's own pixels.
const C = { w: 1160, h: 640, left: 64, right: 24, top: 40 }
const plotW = C.w - C.left - C.right
const total = { top: C.top, h: 330 }
const bars = { top: 450, h: 140 }
const x = (t: number) => C.left + ((t - start) / (end - start)) * plotW
const yTotal = (mm: number) => total.top + total.h - (mm / 60) * total.h
const yBar = (mm: number) => bars.top + bars.h - (mm / 10) * bars.h

const ease = (frame: number, [from, to]: readonly [number, number]) =>
  interpolate(frame, [from * FPS, to * FPS], [0, 1], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  })

const label = (px: number, py: number, value: string, size = 22, fill: string = theme.secondary, weight = 400) => (
  <text x={px} y={py} fill={fill} fontFamily={font.sans} fontSize={size} fontWeight={weight}>
    {value}
  </text>
)

export const D3Crossing = () => {
  const frame = useCurrentFrame()
  const rise = ease(frame, T.rise)
  const cross = ease(frame, T.cross)
  const flipped = frame >= T.flip * FPS
  const flip = ease(frame, [T.flip, T.flip + 0.8])
  const lead = ease(frame, [T.lead, T.lead + 1])
  const intro = ease(frame, [0, 0.8])

  // Bars up to 14:55 appear in time order; the 15:00 bar grows during the crossing beat.
  const shown = before.slice(0, Math.max(1, Math.ceil(rise * before.length)))
  const growing = cross > 0 ? { ...r1500, rain_mm: r1500.rain_mm * cross } : null
  const points = shown.map((r) => [x(at(r.timestamp)), yTotal(r.rolling_60min_mm)] as const)
  if (cross > 0) {
    const t = at(r1455.timestamp) + (at(r1500.timestamp) - at(r1455.timestamp)) * cross
    points.push([x(t), yTotal(r1455.rolling_60min_mm + (r1500.rolling_60min_mm - r1455.rolling_60min_mm) * cross)])
  }
  const path = points.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ')
  const head = points[points.length - 1]!
  const inLebat = cross >= 0.62
  const clock = frame < T.cross[0] * FPS ? '14:55' : flipped ? '15:05' : '15:00'
  const hour =
    cross > 0
      ? r1455.rolling_60min_mm + (r1500.rolling_60min_mm - r1455.rolling_60min_mm) * cross
      : r1455.rolling_60min_mm
  const waveX = x(at('2026-11-02T15:30:00'))

  return (
    <div
      style={{
        width: 1920,
        height: 1080,
        position: 'relative',
        overflow: 'hidden',
        background: theme.landingBackground,
        color: theme.landingForeground,
        fontFamily: font.sans,
        fontVariantNumeric: 'tabular-nums'
      }}
    >
      {/* Header */}
      <div style={{ position: 'absolute', left: 96, top: 72, opacity: intro }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            fontFamily: font.mono,
            fontSize: 22,
            color: theme.warning,
            background: '#2a2416',
            padding: '8px 16px',
            borderRadius: 6
          }}
        >
          <span style={{ width: 9, height: 9, borderRadius: 9, background: theme.warning }} />
          Replay (2 Nov 2026)
        </div>
        <div style={{ marginTop: 26, fontSize: 64, fontWeight: 600, letterSpacing: '-0.035em', lineHeight: 1 }}>
          15:30 release wave
        </div>
        <div style={{ marginTop: 14, fontSize: 26, color: theme.landingMuted }}>
          Monday 2 November 2026 · gauge <span style={{ fontFamily: font.mono }}>0232901RF</span>, Sg. Kuyoh di LRT
          Bukit Jalil
        </div>
      </div>
      <div style={{ position: 'absolute', right: 96, top: 72, textAlign: 'right', opacity: intro }}>
        <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '0.14em', color: theme.landingMuted }}>POLL</div>
        <div style={{ fontSize: 112, fontWeight: 300, letterSpacing: '-0.045em', lineHeight: 1 }}>{clock}</div>
        <div style={{ fontSize: 22, color: theme.landingMuted }}>MYT</div>
      </div>

      {/* Chart */}
      <svg
        width={C.w}
        height={C.h}
        viewBox={`0 0 ${C.w} ${C.h}`}
        style={{ position: 'absolute', left: 96, top: 330 }}
        role="img"
        aria-label="Replay of 2 November 2026: the 60-minute rain total at gauge 0232901RF reaches the Lebat class at 15:00."
      >
        <rect
          x={C.left}
          y={yTotal(60)}
          width={plotW}
          height={yTotal(31) - yTotal(60)}
          fill={inLebat ? '#2a2416' : '#17150f'}
        />
        {label(C.left + 16, yTotal(31) - 14, 'Lebat · 31–60 mm in an hour (JPS)', 20, theme.warning)}
        {[0, 20, 40, 60].map((mm) => (
          <g key={mm}>
            <line x1={C.left} x2={C.left + plotW} y1={yTotal(mm)} y2={yTotal(mm)} stroke={theme.grid} />
            {label(C.left - 44, yTotal(mm) + 7, String(mm), 20, theme.muted)}
          </g>
        ))}
        {label(C.left, C.top - 14, 'Rain in the last 60 minutes, mm', 20, theme.muted)}
        {label(C.left, bars.top - 16, 'Rain per 5 minutes, mm (0–10)', 20, theme.muted)}
        <line x1={C.left} x2={C.left + plotW} y1={bars.top + bars.h} y2={bars.top + bars.h} stroke={theme.grid} />
        {[...shown, ...(growing ? [growing] : [])].map((r) => {
          const bw = (plotW / 24) * 0.66
          const cx = x(at(r.timestamp))
          return (
            <rect
              key={r.timestamp}
              x={cx - bw}
              y={yBar(r.rain_mm)}
              width={bw}
              height={bars.top + bars.h - yBar(r.rain_mm)}
              fill={hhmm(r.timestamp) === '15:00' ? theme.landingForeground : theme.secondary}
            />
          )
        })}
        {['14:00', '14:30', '15:00', '15:30', '16:00'].map((t) => (
          <g key={t}>{label(x(at(`2026-11-02T${t}:00`)) - 28, bars.top + bars.h + 36, t, 20, theme.muted)}</g>
        ))}
        <path d={path} fill="none" stroke={theme.landingForeground} strokeWidth="4" strokeLinejoin="round" />
        <circle cx={head[0]} cy={head[1]} r="9" fill={theme.landingForeground} />
        {cross === 0 && rise > 0.98
          ? label(
              head[0] - 300,
              head[1] + 44,
              `14:55 · ${r1455.rolling_60min_mm.toFixed(1)} mm`,
              26,
              theme.landingForeground,
              500
            )
          : null}
        {cross >= 1
          ? label(
              head[0] - 330,
              head[1] - 22,
              `15:00 · ${r1500.rolling_60min_mm.toFixed(1)} mm · Lebat`,
              28,
              theme.landingForeground,
              600
            )
          : null}
        <line x1={waveX} x2={waveX} y1={C.top} y2={bars.top + bars.h} stroke={theme.crimsonOnDark} strokeWidth="2" />
        {label(waveX + 14, C.top + 22, '15:30 · 89 sessions end', 22, theme.crimsonOnDark)}
      </svg>

      {/* Verdict */}
      <div style={{ position: 'absolute', left: 1316, top: 362, width: 508 }}>
        <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '0.14em', color: theme.landingMuted }}>
          CLAUSE ENGINE VERDICT
        </div>
        <div
          style={{
            marginTop: 22,
            fontSize: flipped ? 76 : 96,
            fontWeight: flipped ? 600 : 300,
            letterSpacing: '-0.04em',
            lineHeight: 1,
            opacity: flipped ? flip : 1,
            transform: `translateY(${flipped ? (1 - flip) * 24 : 0}px)`
          }}
        >
          <span style={{ fontSize: '0.5em', verticalAlign: '0.35em', marginRight: 18 }}>{flipped ? '▲' : '○'}</span>
          {flipped ? 'Commute disruption' : 'Normal'}
        </div>
        <div
          style={{
            marginTop: 26,
            height: 1,
            width: `${(flipped ? flip : 0) * 100}%`,
            background: theme.crimsonOnDark
          }}
        />
        <div style={{ marginTop: 24, fontSize: 26, lineHeight: 1.5, color: theme.secondary }}>
          {flipped ? (
            <span style={{ opacity: flip }}>
              Storm confirmed · gauge 39.0 mm in 60 min to 15:00 (Lebat) · 5 min old at the 15:05 poll
            </span>
          ) : (
            <span>{hour.toFixed(1)} mm in the last hour. Lebat starts at 31 mm.</span>
          )}
        </div>
        <div style={{ marginTop: 44, opacity: lead }}>
          <div style={{ fontSize: 112, fontWeight: 300, letterSpacing: '-0.045em', lineHeight: 1 }}>
            25<span style={{ fontSize: 44, marginLeft: 8, color: theme.secondary }}>min</span>
          </div>
          <div style={{ marginTop: 10, fontSize: 26, color: theme.secondary }}>before 89 sessions end at 15:30.</div>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 96,
          right: 96,
          bottom: 48,
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 20,
          color: theme.landingMuted,
          borderTop: `1px solid ${theme.border}`,
          paddingTop: 18
        }}
      >
        <span>
          JPS 5-minute series, captured 21:12 MYT on 5 November 2026. A reading stamped T covers the 5 minutes to T.
        </span>
        <span>Not reviewed, not sent: no call was made that day.</span>
      </div>
    </div>
  )
}
