import { t } from '@skyclause/i18n'
import { SettingsParts } from '../settings/parts'
import '../settings/catalogue'
import styles from './panel.module.css'

export interface BillingOrganisation {
  id: string
  slug: string
  plan: string
}

export default function BillingPanel({
  organization,
  locale = 'en'
}: {
  organization: BillingOrganisation | null
  locale?: 'en' | 'ms'
}) {
  const plan = organization?.plan ?? ''
  const plans = [
    { key: 'commons', price: 'commonsPrice', availability: 'now' },
    { key: 'community', price: 'communityPrice', availability: 'now' },
    { key: 'team', price: 'teamPrice', availability: 'fromP2' },
    { key: 'campus', price: 'campusPrice', availability: 'afterGa' }
  ] as const

  const cell = (key: string): string => t(`settings.billing.${key}`, {}, locale)

  return (
    <SettingsParts className="gap-6">
      <section aria-labelledby="billing-plan-title" className="grid gap-1">
        <h3 id="billing-plan-title" className="type-small font-normal text-muted-foreground">
          {cell('currentPlan')}
        </h3>
        {plan ? (
          <p data-current-plan={plan} className="type-section">
            {cell(plan)}
          </p>
        ) : (
          <p className="type-text">{cell('unknownPlan')}</p>
        )}
        <p className="type-body text-muted-foreground">{cell('betaNotice')}</p>
      </section>

      <table aria-label={cell('tableLabel')} className={styles.table}>
        <thead className="sr-only sm:not-sr-only">
          <tr>
            <th scope="col">{cell('planColumn')}</th>
            <th scope="col">{cell('priceColumn')}</th>
            <th scope="col">{cell('availabilityColumn')}</th>
          </tr>
        </thead>
        <tbody>
          {plans.map(({ key, price, availability }) => (
            <tr key={key} aria-current={key === plan ? 'true' : undefined}>
              <th scope="row">
                {cell(key)}
                {key === plan ? <span className={styles.current}>{cell('yourPlan')}</span> : null}
              </th>
              <td data-label={cell('priceColumn')}>
                <p data-price>{cell(price)}</p>
              </td>
              <td data-label={cell('availabilityColumn')}>{cell(availability)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </SettingsParts>
  )
}
