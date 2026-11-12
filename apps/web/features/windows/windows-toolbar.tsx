'use client'

import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { Button } from '#ui/button'
import { Input } from '#ui/input'
import { ToggleGroup, ToggleGroupItem } from '#ui/toggle-group'
import { validDate } from './model'
import { t } from './catalogue'

export type WindowsView = 'timeline' | 'week' | 'month'

/**
 * One quiet row: the view switch, and the period as one group (previous, the date it starts, next) with Today as a
 * ghost beside it, so the row holds three things rather than five equal capsules.
 */
export function WindowsToolbar({
  view,
  from,
  onView,
  onFrom,
  onStep,
  onToday
}: {
  view: WindowsView
  from: string
  onView: (view: WindowsView) => void
  onFrom: (date: string) => void
  onStep: (direction: -1 | 1) => void
  onToday: () => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2" data-windows-toolbar>
      <ToggleGroup
        value={[view]}
        onValueChange={(values) => {
          if (values[0]) onView(values[0] as WindowsView)
        }}
        aria-label={t('windows.view')}
      >
        <ToggleGroupItem value="timeline">{t('windows.timeline')}</ToggleGroupItem>
        <ToggleGroupItem value="week">{t('windows.view_week')}</ToggleGroupItem>
        <ToggleGroupItem value="month">{t('windows.view_month')}</ToggleGroupItem>
      </ToggleGroup>
      <div className="flex items-center gap-2">
        <div
          role="group"
          aria-label={t('windows.period_group')}
          className="flex items-center gap-1 rounded-full border-2 border-input bg-muted p-1"
        >
          <Button variant="ghost" size="icon" aria-label={t('windows.previous')} onClick={() => onStep(-1)}>
            <ChevronLeftIcon />
          </Button>
          <label className="flex items-center gap-2 pl-2 type-small text-muted-foreground">
            <span className="max-sm:sr-only">{t('windows.from')}</span>
            <Input
              type="date"
              name="from"
              autoComplete="off"
              value={from}
              className="h-9 w-40 rounded-full border-0 bg-transparent px-2 type-body text-foreground"
              onChange={(event) => {
                if (validDate(event.target.value)) onFrom(event.target.value)
              }}
            />
          </label>
          <Button variant="ghost" size="icon" aria-label={t('windows.next')} onClick={() => onStep(1)}>
            <ChevronRightIcon />
          </Button>
        </div>
        <Button variant="ghost" onClick={onToday}>
          {t('windows.today')}
        </Button>
      </div>
    </div>
  )
}
