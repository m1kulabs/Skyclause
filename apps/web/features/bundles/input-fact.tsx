import type { InputValue } from '@skyclause/contracts'
import { formatTime } from '@skyclause/i18n/format'
import { InputAgeChip } from '../data-components/input-age-chip'
import { t } from './i18n'

export function inputText(input: InputValue): string {
  return t('bundles.input', {
    name: input.name,
    value: input.value === null ? t('bundles.missing') : String(input.value),
    unit: input.unit,
    state: t(`bundles.states.${input.state}`),
    age: input.age_s === null ? t('bundles.unknown_age') : t('bundles.age', { seconds: input.age_s })
  })
}

export function InputFact({ input }: { input: InputValue }) {
  return (
    <div className="bundle-input">
      <span>{inputText(input)}</span>
      <InputAgeChip input={input} />
      {input.observed_at && <time dateTime={input.observed_at}>{formatTime(input.observed_at, 'en')}</time>}
      {input.since && input.state !== 'fresh' && (
        <p>
          {t('bundles.since', {
            input: input.name,
            state: t(`bundles.states.${input.state}`),
            time: formatTime(input.since, 'en')
          })}
        </p>
      )}
    </div>
  )
}
