'use client'

import { Field, FieldLabel, FieldGroup, FieldError, FieldSet, FieldLegend, FieldDescription } from '#ui/field'
import { Input } from '#ui/input'
import { formatDate } from '@skyclause/i18n/format'
import { WEEKDAYS, previewOccurrences, type WindowDraft, type FieldErrors } from './model'
import { t, fieldMessage } from './catalogue'
import { VirtualRows } from './virtual-rows'
import styles from './windows.module.css'

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
      <FieldLegend>{t('windows.weekly')}</FieldLegend>
      <label className={styles.checkLabel}>
        <input
          type="checkbox"
          name="repeat"
          checked={draft.repeat}
          onChange={(event) => change('repeat', event.target.checked)}
        />
        {t('windows.weekly')}
      </label>
      {draft.repeat && (
        <FieldGroup>
          <FieldSet aria-describedby={errors.days ? 'window-days-error' : undefined}>
            <FieldLegend>{t('windows.days')}</FieldLegend>
            <div className={styles.checks}>
              {WEEKDAYS.map((day) => (
                <label key={day} className={styles.checkLabel}>
                  <input
                    id={`window-days-${day}`}
                    type="checkbox"
                    name="days"
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
            <textarea
              id="window-skips"
              name="skips"
              value={draft.skips}
              onChange={(event) => change('skips', event.target.value)}
              aria-invalid={!!errors.skips}
              aria-describedby={`window-skips-help${errors.skips ? ' window-skips-error' : ''}`}
            />
            <FieldDescription id="window-skips-help">{t('windows.skips_help')}</FieldDescription>
            {errors.skips && <FieldError id="window-skips-error">{fieldMessage(errors.skips!)}</FieldError>}
          </Field>
          <div role="status">
            <p>{t('windows.preview', { count: dates.length })}</p>
            {!dates.length && <p>{t('windows.preview_empty')}</p>}
          </div>
          {dates.length > 50 ? (
            <VirtualRows
              items={dates}
              label={t('windows.preview', { count: dates.length })}
              className={styles.preview}
              render={(date) => (
                <p>
                  <time dateTime={date}>{formatDate(`${date}T12:00:00+08:00`, 'en')}</time>
                </p>
              )}
            />
          ) : (
            <ol className={styles.preview}>
              {dates.map((date) => (
                <li key={date}>
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
