/* eslint-disable @next/next/no-img-element -- Satori draws plain <img>; next/image has no place in an ImageResponse. */
import {
  brandStates,
  glyphSvg,
  layoutStrip,
  markSvg,
  statusColours,
  stripSvg,
  type StripInput
} from '@skyclause/elements'
import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { stateWord, type Card } from './card'
import { t } from './i18n'
import type { Locale } from './i18n'

// DESIGN "Open Graph card": 1200×630 on the dark ground, Work Sans throughout. Colours are f-ui's dark tokens.
export const CARD_SIZE = { width: 1200, height: 630 }
const PAD = 56
const BAND = 220
const GROUND = '#171719'
const INK = '#ffffff'
const MUTED = '#bdbdc0'

// Roundo's static woff weights (fonts/roundo/SOURCE.txt): Satori reads neither woff2 nor variable fonts. Literal URLs,
// so the build traces each file; loaded once, as the route module loads.
const face = async (weight: 400 | 500 | 600, url: URL) => ({
  name: 'Roundo',
  weight,
  style: 'normal' as const,
  data: await readFile(url)
})
const fonts = await Promise.all([
  face(400, new URL('../../fonts/roundo/Roundo-Regular.woff', import.meta.url)),
  face(500, new URL('../../fonts/roundo/Roundo-Medium.woff', import.meta.url)),
  face(600, new URL('../../fonts/roundo/Roundo-SemiBold.woff', import.meta.url))
])

const dataUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
/** A standalone SVG has no page to inherit from: set its `currentColor`, replacing any adaptive ink style. */
const inked = (svg: string, colour: string) =>
  svg.replace(/<style>.*?<\/style>/, '').replace('<svg ', `<svg color="${colour}" `)

const TEXT = /<text ([^>]*)>([^<]*)<\/text>/g
const ATTRIBUTE = /([\w-]+)="([^"]*)"/g
const unescapeXml = (text: string) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')

/**
 * `stripSvg`'s labels lifted out of its SVG, which resvg would set in a fallback face, so Satori sets them in Roundo
 * at the same places; the rest of the strip stays one image.
 */
export function splitStrip(svg: string) {
  const labels = [...svg.matchAll(TEXT)].map(([, attributes, text]) => {
    const a = Object.fromEntries([...attributes!.matchAll(ATTRIBUTE)].map(([, name, value]) => [name, value]))
    return {
      x: Number(a.x),
      y: Number(a.y),
      size: Number(a['font-size']),
      anchor: (a['text-anchor'] ?? 'start') as 'start' | 'middle' | 'end',
      text: unescapeXml(text!)
    }
  })
  return { geometry: svg.replace(TEXT, ''), labels }
}

const SHIFT = { start: '0%', middle: '-50%', end: '-100%' }

function Strip({ strip }: { strip: StripInput }) {
  const layout = layoutStrip(strip)
  const { geometry, labels } = splitStrip(stripSvg(layout))
  const scale = Math.min((BAND - 24) / layout.height, 680 / layout.width)
  const width = layout.width * scale
  const height = layout.height * scale
  return (
    <div style={{ display: 'flex', position: 'relative', width, height, color: MUTED }}>
      <img src={dataUri(inked(geometry, MUTED))} width={width} height={height} alt="" />
      {labels.map((label, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            left: label.x * scale,
            top: (label.y - label.size * 0.8) * scale,
            fontSize: label.size * scale,
            lineHeight: 1,
            transform: `translateX(${SHIFT[label.anchor]})`
          }}
        >
          {label.text}
        </span>
      ))}
    </div>
  )
}

export function CardView({ card, locale = 'en' }: { card: Card; locale?: Locale }) {
  const level = card.state && brandStates[card.state].level
  const title = card.project
    ? t('share-previews.title', { brand: t('brand.name', {}, locale), project: card.project }, locale)
    : null
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        width: '100%',
        height: '100%',
        padding: `44px ${PAD}px 0`,
        background: GROUND,
        color: INK,
        fontFamily: 'Roundo',
        fontWeight: 400
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 30, fontWeight: 500 }}>
        <img src={dataUri(inked(markSvg, INK))} width={36} height={36} alt="" />
        <span>{title ?? t('brand.name', {}, locale)}</span>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          marginTop: 36,
          fontSize: 96,
          fontWeight: 500,
          letterSpacing: '-0.02em',
          whiteSpace: 'nowrap'
        }}
      >
        {card.state && (
          <img src={dataUri(inked(glyphSvg(card.state), statusColours.dark[level!]))} width={96} height={96} alt="" />
        )}
        <span style={{ lineHeight: 1 }}>{stateWord(card.state, locale)}</span>
      </div>
      {card.window && <span style={{ marginTop: 16, fontSize: 40 }}>{card.window}</span>}
      {card.approved && <span style={{ marginTop: 8, fontSize: 32, color: MUTED }}>{card.approved}</span>}
      {card.noCall && (
        <span style={{ marginTop: 8, fontSize: 32, color: statusColours.dark.critical }}>{card.noCall}</span>
      )}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          position: 'absolute',
          left: PAD,
          right: PAD,
          bottom: 0,
          height: BAND,
          paddingBottom: 28,
          color: MUTED
        }}
      >
        {card.strip ? (
          <Strip strip={card.strip} />
        ) : (
          <span style={{ fontSize: 40, color: INK }}>{card.range ?? ''}</span>
        )}
        {card.captured && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontSize: 24 }}>
            <span>{t('share-previews.captured', {}, locale)}</span>
            <span>{card.captured}</span>
          </div>
        )}
      </div>
    </div>
  )
}

/** The card as a 1200×630 PNG, with the route's caching. */
export function cardImage(card: Card, cacheControl: string, locale: Locale = 'en'): Response {
  // Lower case, so it replaces `next/og`'s own default rather than joining it.
  return new ImageResponse(<CardView card={card} locale={locale} />, {
    ...CARD_SIZE,
    fonts,
    headers: { 'cache-control': cacheControl, 'content-language': locale, vary: 'Accept-Language' }
  })
}
