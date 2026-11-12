import type { InputValue } from '@skyclause/contracts'
import { formatNumber, formatTime } from '@skyclause/i18n/format'
import { InputAgeChip } from '../data-components/input-age-chip'
import { indicatorName } from '../data-components/indicator-names'
import { t, type Locale } from './i18n'

/** An input's age when the call was drafted, in words: seconds under a minute, else minutes, else hours. */
export function ageText(seconds: number | null, locale: Locale = 'en'): string {
  if (seconds === null) return t('bundles.unknown_age', {}, locale)
  if (seconds < 60) return t('bundles.age_seconds', { count: formatNumber(seconds, locale) }, locale)
  if (seconds < 90 * 60)
    return t('bundles.age_minutes', { count: formatNumber(Math.round(seconds / 60), locale) }, locale)
  return t('bundles.age_hours', { count: formatNumber(Math.round(seconds / 3600), locale) }, locale)
}

const number = (value: InputValue['value'], locale: Locale) =>
  typeof value === 'number' ? formatNumber(value, locale) : String(value)

/** A reading with its unit, kept on one line: "39 mm / 60 min". */
const valueText = (input: InputValue, locale: Locale) =>
  input.value === null
    ? t('bundles.missing', {}, locale)
    : [
        Array.isArray(input.value)
          ? input.value.map((item) => number(item, locale)).join(', ')
          : number(input.value, locale)
      ]
        .concat(input.unit ? [input.unit] : [])
        .join('\u00a0')

/** An input as one line of text, for comparing a value before and after (the re-check dialog). */
export function inputText(input: InputValue, locale: Locale = 'en'): string {
  return t(
    'bundles.input',
    {
      name: indicatorName(input.name, locale),
      value: valueText(input, locale),
      state: t(`bundles.states.${input.state}`, {}, locale),
      age: ageText(input.age_s, locale)
    },
    locale
  )
}

/** An input as the call read it: its name, its value with the unit, and its age in words at drafting. */
export function InputFact({ input, locale = 'en' }: { input: InputValue; locale?: Locale }) {
  return (
    <div className="bundle-input" data-state={input.state}>
      <span className="bundle-input-name">{indicatorName(input.name, locale)}</span>
      <span className="bundle-input-value" data-numeric>
        {valueText(input, locale)}
      </span>
      <InputAgeChip input={input} ageSeconds={input.age_s} locale={locale} />
      {input.observed_at && (
        <time className="bundle-input-time" dateTime={input.observed_at}>
          {formatTime(input.observed_at, locale)}
        </time>
      )}
      {input.since && input.state !== 'fresh' && (
        <time className="bundle-input-since" dateTime={input.since}>
          {t(
            'bundles.since',
            {
              input: indicatorName(input.name, locale),
              state: t(`bundles.states.${input.state}`, {}, locale),
              time: formatTime(input.since, locale)
            },
            locale
          )}
        </time>
      )}
    </div>
  )
}
