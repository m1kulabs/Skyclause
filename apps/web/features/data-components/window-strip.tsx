'use client'

import { useMemo, useState } from 'react'
import type { Window } from '@skyclause/contracts'
import { layoutStrip, stripSvg, type StripInput } from '@skyclause/elements'
import { formatTime } from '@skyclause/i18n/format'
import { Badge } from '#ui/badge'
import { Button } from '#ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '#ui/tooltip'
import { t } from './catalogue'

export interface WindowStripProps {
  windows: readonly Window[]
  strip?: StripInput
  locale?: 'en' | 'ms'
}

function emptyStrip(windows: readonly Window[]): StripInput {
  const now = new Date().toISOString()
  return {
    from: now,
    to: now,
    now,
    window: windows[0] ? { from: windows[0].starts_at, to: windows[0].ends_at } : null,
    rain5: [],
    rain60: []
  }
}

export function WindowStrip({ windows, strip, locale = 'en' }: WindowStripProps) {
  const [showTable, setShowTable] = useState(false)
  const input = useMemo(() => strip ?? emptyStrip(windows), [strip, windows])
  const layout = useMemo(() => layoutStrip({ ...input, locale }), [input, locale])
  const svg = useMemo(() => stripSvg(layout, { locale }).replace('role="img"', 'aria-hidden="true"'), [layout, locale])

  const count = input.rain5.length + input.rain60.length
  const firstCrossing = layout.crossings[0]
  const crossingText = firstCrossing
    ? t('data.strip.crossing', { time: formatTime(firstCrossing.at, locale), value: firstCrossing.value }, locale)
    : t('data.strip.no_crossing', {}, locale)
  const summary = input.replay
    ? t(
        'data.strip.summary_replay',
        {
          source: input.replay.source,
          captured: formatTime(input.replay.capturedAt, locale),
          crossing: crossingText,
          count
        },
        locale
      )
    : t('data.strip.summary_live', { to: formatTime(input.to, locale), crossing: crossingText, count }, locale)

  const win = windows[0]
  const toggleLabel = showTable ? t('data.strip.hide_table', {}, locale) : t('data.strip.show_table', {}, locale)

  if (count === 0) {
    return (
      <figure className="w-full">
        <figcaption className="text-sm text-muted-foreground">{t('data.strip.empty', {}, locale)}</figcaption>
      </figure>
    )
  }

  return (
    <figure className="w-full">
      <div className="flex flex-wrap items-center gap-2">
        {layout.isReplay ? <Badge variant="outline">{t('data.strip.replay_badge', {}, locale)}</Badge> : null}
        {win ? (
          <span className="inline-flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <span>{t('data.strip.window', {}, locale)}</span>
            <time dateTime={win.starts_at}>{formatTime(win.starts_at, locale)}</time>
          </span>
        ) : null}
      </div>
      <div className="relative w-full">
        <div
          className="w-full overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: stripSvg is deterministic geometry from readings.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        {layout.crossings.map((crossing) => (
          <Tooltip key={crossing.at}>
            <TooltipTrigger
              className="absolute top-1/3 min-h-[34px] min-w-[34px] -translate-x-1/2 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none [@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:min-w-[44px]"
              style={{ left: `${(crossing.x / layout.width) * 100}%` }}
              aria-label={crossing.label}
            >
              <span className="block h-[34px] w-[34px] [@media(pointer:coarse)]:h-[44px] [@media(pointer:coarse)]:w-[44px]" />
            </TooltipTrigger>
            <TooltipContent>
              <span className="tabular-nums">{crossing.label}</span>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      <figcaption className="mt-2 text-sm text-muted-foreground">{summary}</figcaption>
      <div className="mt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowTable((v) => !v)}
          aria-expanded={showTable}
          className="min-h-[34px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none [@media(pointer:coarse)]:min-h-[44px]"
        >
          {toggleLabel}
        </Button>
        {showTable ? (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full border-collapse text-sm tabular-nums">
              <caption className="text-left text-muted-foreground">{t('data.strip.table_caption', {}, locale)}</caption>
              <thead>
                <tr>
                  <th scope="col" className="border-b p-2 text-left">
                    {t('data.strip.table_time', {}, locale)}
                  </th>
                  <th scope="col" className="border-b p-2 text-right">
                    {t('data.strip.table_rain5', {}, locale)}
                  </th>
                  <th scope="col" className="border-b p-2 text-right">
                    {t('data.strip.table_rain60', {}, locale)}
                  </th>
                </tr>
              </thead>
              <tbody>
                {input.rain5.map((point) => {
                  const sixty = input.rain60.find((s) => s.at === point.at)
                  return (
                    <tr key={point.at}>
                      <th scope="row" className="border-b p-2 text-left font-normal">
                        <time dateTime={point.at}>{formatTime(point.at, locale)}</time>
                      </th>
                      <td className="border-b p-2 text-right tabular-nums">
                        {point.value === null ? t('data.strip.missing', {}, locale) : point.value}
                      </td>
                      <td className="border-b p-2 text-right tabular-nums">
                        {sixty?.value === null || sixty?.value === undefined
                          ? t('data.strip.missing', {}, locale)
                          : sixty.value}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
      {input.ages && input.ages.length ? (
        <div className="mt-2 md:hidden">
          <h4 className="text-xs font-medium">{t('data.strip.ages_title', {}, locale)}</h4>
          <ul className="mt-1 space-y-1 text-xs tabular-nums">
            {input.ages.map((age) => (
              <li key={age.name} className="flex flex-wrap items-center gap-1">
                <span>{age.name}</span>
                <span>{age.observedAt ? formatTime(age.observedAt, locale) : t('data.strip.missing', {}, locale)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </figure>
  )
}
