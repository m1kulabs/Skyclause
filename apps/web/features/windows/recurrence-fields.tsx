'use client'

import { Field, FieldLabel, FieldGroup, FieldError, FieldSet, FieldLegend, FieldDescription } from '#ui/field'
import { Input } from '#ui/input'
import { Textarea } from '#ui/textarea'
import { formatDate } from '@skyclause/i18n/format'
import { WEEKDAYS, previewOccurrences, type WindowDraft, type FieldErrors } from './model'
import { t, fieldMessage } from './catalogue'
import { VirtualRows } from './virtual-rows'

/** A native select, which is what a phone opens its own picker for, drawn as the foundation's field. */
export const selectClass =
  'h-10 w-full rounded-md border-2 border-input bg-background px-3 type-body text-foreground outline-none aria-invalid:border-foreground'
const checkRow = 'flex min-h-11 cursor-pointer items-center gap-3 type-body'

export function RecurrenceFields({
  draft,
  change,
  errors
}: {
  draft: WindowDraft
  change: <Key extends keyof WindowDraft>(key: Key, value: WindowDraft[Key]) => void
  errors: FieldErrors
}) {
  const dates = previewOccurrences(draft)
  return (
    <FieldSet>
      <label className={checkRow}>
        <input
          type="checkbox"
          name="repeat"
          autoComplete="off"
          className="size-5 shrink-0"
          checked={draft.repeat}
          onChange={(event) => change('repeat', event.target.checked)}
        />
        {t('windows.weekly')}
      </label>
      {draft.repeat && (
        <FieldGroup>
          <FieldSet aria-describedby={errors.days ? 'window-days-error' : undefined}>
            <FieldLegend variant="label">{t('windows.days')}</FieldLegend>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((day) => (
                <label
                  key={day}
                  className="inline-flex min-h-9 cursor-pointer items-center rounded-full border-2 border-input bg-background px-3 type-body has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring"
                >
                  <input
                    id={`window-days-${day}`}
                    type="checkbox"
                    name="days"
                    autoComplete="off"
                    className="sr-only"
                    value={day}
                    checked={draft.days.includes(day)}
                    aria-invalid={!!errors.days}
                    onChange={(event) =>
                      change(
                        'days',
                        event.target.checked
                          ? WEEKDAYS.filter((value) => value === day || draft.days.includes(value))
                          : draft.days.filter((value) => value !== day)
                      )
                    }
                  />
                  {t(`windows.${day}`)}
                </label>
              ))}
            </div>
            {errors.days && <FieldError id="window-days-error">{fieldMessage(errors.days!)}</FieldError>}
          </FieldSet>
          <Field>
            <FieldLabel htmlFor="window-repeatEnd">{t('windows.repeat_end')}</FieldLabel>
            <select
              id="window-repeatEnd"
              name="repeatEnd"
              autoComplete="off"
              className={selectClass}
              value={draft.repeatEnd}
              onChange={(event) => change('repeatEnd', event.target.value === 'count' ? 'count' : 'until')}
            >
              <option value="until">{t('windows.until_option')}</option>
              <option value="count">{t('windows.count_option')}</option>
            </select>
          </Field>
          {draft.repeatEnd === 'until' ? (
            <Field data-invalid={!!errors.until}>
              <FieldLabel htmlFor="window-until">{t('windows.until')}</FieldLabel>
              <Input
                id="window-until"
                name="until"
                type="date"
                value={draft.until}
                onChange={(event) => change('until', event.target.value)}
                aria-invalid={!!errors.until}
                aria-describedby={errors.until ? 'window-until-error' : undefined}
              />
              {errors.until && <FieldError id="window-until-error">{fieldMessage(errors.until!)}</FieldError>}
            </Field>
          ) : (
            <Field data-invalid={!!errors.count}>
              <FieldLabel htmlFor="window-count">{t('windows.occurrence_count')}</FieldLabel>
              <Input
                id="window-count"
                name="count"
                type="number"
                inputMode="numeric"
                min={1}
                value={draft.count}
                onChange={(event) => change('count', event.target.value)}
                aria-invalid={!!errors.count}
                aria-describedby={errors.count ? 'window-count-error' : undefined}
              />
              {errors.count && <FieldError id="window-count-error">{fieldMessage(errors.count!)}</FieldError>}
            </Field>
          )}
          <Field data-invalid={!!errors.skips}>
            <FieldLabel htmlFor="window-skips">{t('windows.skips')}</FieldLabel>
            <Textarea
              id="window-skips"
              name="skips"
              autoComplete="off"
              spellCheck={false}
              value={draft.skips}
              onChange={(event) => change('skips', event.target.value)}
              aria-invalid={!!errors.skips}
              aria-describedby={`window-skips-help${errors.skips ? ' window-skips-error' : ''}`}
            />
            <FieldDescription id="window-skips-help">{t('windows.skips_help')}</FieldDescription>
            {errors.skips && <FieldError id="window-skips-error">{fieldMessage(errors.skips!)}</FieldError>}
          </Field>
          <div role="status" className="type-body">
            <p>{t('windows.preview', { count: dates.length })}</p>
            {!dates.length && <p className="text-muted-foreground">{t('windows.preview_empty')}</p>}
          </div>
          {dates.length > 50 ? (
            <VirtualRows
              items={dates}
              label={t('windows.preview', { count: dates.length })}
              className="max-h-64 overflow-y-auto"
              render={(date) => (
                <p className="min-h-8 type-body">
                  <time dateTime={date}>{formatDate(`${date}T12:00:00+08:00`, 'en')}</time>
                </p>
              )}
            />
          ) : (
            <ol className="flex max-h-64 flex-col overflow-y-auto">
              {dates.map((date) => (
                <li key={date} className="min-h-8 type-body">
                  <time dateTime={date}>{formatDate(`${date}T12:00:00+08:00`, 'en')}</time>
                </li>
              ))}
            </ol>
          )}
        </FieldGroup>
      )}
    </FieldSet>
  )
}
