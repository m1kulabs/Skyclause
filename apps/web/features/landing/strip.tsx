/* eslint-disable skyclause-i18n/no-literal-jsx -- Landing copy is the DESIGN copy deck verbatim (English P1; Malay LND-7 P2). Images are cropped-only Wikimedia Commons files loaded lazily. */
import { layoutStrip, stripSvg, type StripInput } from '@skyclause/elements'
import { REPLAY_SOURCE, JPS_CAPTURED_AT, JPS_SOURCE_URL } from './data'

// Server-rendered replay strip: 60-minute lane with the Lebat line, "Replay" badge, no 5-minute series.
// No client JS (budget); the SVG is data-ui so app borders/radii apply inside.
// Only the middle showcase strip carries the crimson window line (one crimson per screen); other
// replay strips are grey.
export function LandingStrip({
  from,
  to,
  rain60,
  windowSpan,
  labelledBy,
  crimsonWindow = false
}: {
  from: string
  to: string
  rain60: ReadonlyArray<{ at: string; value: number }>
  windowSpan?: { from: string; to: string } | null
  labelledBy?: string
  crimsonWindow?: boolean
}) {
  const input: StripInput = {
    from,
    to,
    now: to,
    window: windowSpan ?? null,
    rain5: [],
    rain60: rain60.map((p) => ({ at: p.at, value: p.value })),
    replay: { source: REPLAY_SOURCE, capturedAt: JPS_CAPTURED_AT }
  }
  const layout = layoutStrip({ ...input, locale: 'en' })
  const rawSvg = stripSvg(layout, { locale: 'en' }).replace('role="img"', 'aria-hidden="true"')
  const svg = crimsonWindow ? rawSvg : rawSvg.replaceAll('#b11226', '#8a8c92')
  return (
    <figure
      data-ui={crimsonWindow ? 'window-strip' : undefined}
      data-replay="true"
      data-source={JPS_SOURCE_URL}
      data-crimson={crimsonWindow ? 'showcase-window' : undefined}
      aria-labelledby={labelledBy}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center border px-2 py-0.5 text-xs font-medium">Replay</span>
      </div>
      <div className="w-full overflow-hidden" dangerouslySetInnerHTML={{ __html: svg }} />
      <figcaption className="landing-small landing-soft">
        Replay of 2 November 2026 from the JPS 5-minute series; 60-minute totals are our arithmetic. Clause engine
        verdict: not reviewed, not sent.
      </figcaption>
    </figure>
  )
}
