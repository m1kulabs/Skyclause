import type { InputValue } from '@skyclause/contracts'
import { formatTime } from '@skyclause/i18n/format'
import { InputAgeChip } from '../data-components/input-age-chip'
import { t } from './i18n'

/** An input as one line of text, for comparing a value before and after (the re-check dialog). */
export function inputText(input: InputValue): string {
  return t('bundles.input', {
    name: input.name,
    value: input.value === null ? t('bundles.missing') : String(input.value),
    unit: input.unit,
    state: t(`bundles.states.${input.state}`),
    age: input.age_s === null ? t('bundles.unknown_age') : t('bundles.age', { seconds: input.age_s })
  })
}

const valueText = (input: InputValue) =>
  input.value === null
    ? t('bundles.missing')
    : `${Array.isArray(input.value) ? input.value.join(', ') : String(input.value)} ${input.unit}`.trim()

/** An input as the call read it: its name, its value with the unit, and its age in words at drafting. */
export function InputFact({ input }: { input: InputValue }) {
  return (
    <div className="bundle-input" data-state={input.state}>
      <span className="bundle-input-name">{input.name}</span>
      <span className="bundle-input-value" data-numeric>
        {valueText(input)}
      </span>
      <InputAgeChip input={input} ageSeconds={input.age_s} />
      {input.observed_at && (
        <time className="bundle-input-time" dateTime={input.observed_at}>
          {formatTime(input.observed_at, 'en')}
        </time>
      )}
      {input.since && input.state !== 'fresh' && (
        <time className="bundle-input-since" dateTime={input.since}>
          {t('bundles.since', {
            input: input.name,
            state: t(`bundles.states.${input.state}`),
            time: formatTime(input.since, 'en')
          })}
        </time>
      )}
    </div>
  )
}
