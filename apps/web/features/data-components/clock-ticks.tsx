import { stripTicks } from '@skyclause/elements'
import { formatClock } from '@skyclause/i18n/format'
import { cn } from '#lib/utils'

// A tick's level (stripTicks) says from which width its label is shown: the strip's own width, measured by the
// container query, so a narrow strip labels fewer hours and never lets two labels touch. No script.
const levelClass = ['', 'hidden @[24rem]:block', 'hidden @[40rem]:block'] as const

/** The clock under a strip: one label per tick on the MYT hour (or half or quarter hour), thinning as the strip narrows. */
export function ClockTicks({ from, to, locale }: { from: string; to: string; locale: 'en' | 'ms' }) {
  return (
    <div className="@container relative h-5 type-small text-muted-foreground">
      {stripTicks(from, to).map((tick) => (
        <time
          key={tick.at}
          dateTime={tick.at}
          className={cn('absolute top-0 whitespace-nowrap', levelClass[tick.level])}
          style={{
            left: `${(tick.share * 100).toFixed(3)}%`,
            transform: tick.share < 0.04 ? 'none' : tick.share > 0.96 ? 'translateX(-100%)' : 'translateX(-50%)'
          }}
        >
          {formatClock(tick.at, locale)}
        </time>
      ))}
    </div>
  )
}
