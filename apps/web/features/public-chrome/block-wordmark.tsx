import { t } from '@skyclause/i18n/brand'
import './block-wordmark.css'

// The name, built of capsules: each letter knocked out of its own block, the blocks of different heights standing on
// one strip (a capsule on its day, at the scale of a page). One construction closes the landing and every public page.
// Narrow, the name breaks into two rows ("Sky", "clause") so each letter keeps a block wide enough to read.
const HEIGHTS = [100, 74, 88, 66, 94, 80, 62, 86, 96]
const GAP = 4
const STRIP = 8

interface Row {
  letters: string[]
  heights: number[]
}

function Blocks({
  rows,
  width,
  band,
  fontSize,
  className
}: {
  rows: Row[]
  width: number
  band: number
  fontSize: number
  className: string
}) {
  const block =
    (width - GAP * (Math.max(...rows.map((row) => row.letters.length)) - 1)) /
    Math.max(...rows.map((row) => row.letters.length))
  const rowHeight = band + GAP + STRIP
  const height = rows.length * rowHeight + (rows.length - 1) * 12
  return (
    <svg className={className} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
      {rows.map((row, r) => {
        const top = r * (rowHeight + 12)
        return (
          <g key={r}>
            {row.letters.map((letter, index) => {
              const h = (row.heights[index]! / 100) * band
              const x = index * (block + GAP)
              return (
                <g key={`${letter}-${index}`}>
                  <rect
                    x={x}
                    y={top + band - h}
                    width={block}
                    height={h}
                    rx={block / 2}
                    className="block-wordmark-block"
                  />
                  <text
                    x={x + block / 2}
                    y={top + band - h / 2}
                    fontSize={fontSize}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="block-wordmark-letter"
                  >
                    {letter}
                  </text>
                </g>
              )
            })}
            <rect
              x={0}
              y={top + band + GAP}
              width={width}
              height={STRIP}
              rx={STRIP / 2}
              className="block-wordmark-block"
            />
          </g>
        )
      })}
    </svg>
  )
}

export function BlockWordmark({ locale = 'en' }: { locale?: 'en' | 'ms' }) {
  const name = t('brand.name', {}, locale)
  const letters = Array.from(name)
  const heights = letters.map((_, index) => HEIGHTS[index % HEIGHTS.length]!)
  // "Sky" and "clause": the name's own two words, so a phone reads each letter at a size it can hold.
  const split = 3
  return (
    <div className="block-wordmark" role="img" aria-label={name} translate="no">
      <Blocks rows={[{ letters, heights }]} width={1000} band={230} fontSize={118} className="block-wordmark-wide" />
      <Blocks
        rows={[
          { letters: letters.slice(0, split), heights: heights.slice(0, split) },
          { letters: letters.slice(split), heights: heights.slice(split) }
        ]}
        width={400}
        band={112}
        fontSize={46}
        className="block-wordmark-narrow"
      />
    </div>
  )
}
