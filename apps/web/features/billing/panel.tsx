import { t } from '@skyclause/i18n'
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
    <div className="grid gap-6">
      <section aria-labelledby="billing-plan-title" className="grid gap-2">
        <h2 id="billing-plan-title" className="text-base font-semibold">
          {cell('currentPlan')}
        </h2>
        {plan ? (
          <p data-current-plan={plan} className="capitalize">
            {cell(plan)}
          </p>
        ) : (
          <p>{cell('unknownPlan')}</p>
        )}
        <p className="text-sm text-muted-foreground">{cell('betaNotice')}</p>
      </section>

      <table aria-label={cell('tableLabel')} className={styles.table}>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="py-3 pr-4 font-medium">
              {cell('planColumn')}
            </th>
            <th scope="col" className="py-3 pr-4 font-medium">
              {cell('priceColumn')}
            </th>
            <th scope="col" className="py-3 font-medium">
              {cell('availabilityColumn')}
            </th>
          </tr>
        </thead>
        <tbody>
          {plans.map(({ key, price, availability }) => (
            <tr key={key} className="border-b border-border/70 align-top last:border-b-0">
              <th scope="row" className="py-3 pr-4 font-medium">
                {cell(key)}
              </th>
              <td className="py-3 pr-4" data-label={cell('priceColumn')}>
                <p data-price>{cell(price)}</p>
              </td>
              <td className="py-3" data-label={cell('availabilityColumn')}>
                {cell(availability)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
