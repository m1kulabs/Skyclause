import { t } from '@skyclause/i18n'
import { formatNumber } from '@skyclause/i18n/format'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#ui/table'
import { SettingsParts } from '../settings/parts'
import '../settings/catalogue'

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
    { key: 'commons', price: 'commonsPrice', amount: null, availability: 'now' },
    { key: 'community', price: 'communityPrice', amount: null, availability: 'now' },
    { key: 'team', price: 'teamPrice', amount: 299, availability: 'fromP2' },
    { key: 'campus', price: 'campusPrice', amount: 1900, availability: 'afterGa' }
  ] as const

  const cell = (key: string, vars: Record<string, string | number> = {}): string =>
    t(`settings.billing.${key}`, vars, locale)
  // The prices are Malaysian ringgit in the reader's own format, not text typed into the catalogue.
  const ringgit = (amount: number) =>
    formatNumber(amount, locale, { style: 'currency', currency: 'MYR', maximumFractionDigits: 0 })

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

      <Table aria-label={cell('tableLabel')}>
        <TableHeader>
          <TableRow>
            <TableHead>{cell('planColumn')}</TableHead>
            <TableHead>{cell('priceColumn')}</TableHead>
            <TableHead>{cell('availabilityColumn')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {plans.map(({ key, price, amount, availability }) => (
            <TableRow key={key} selected={key === plan}>
              <TableCell className="font-medium">
                {cell(key)}
                {key === plan ? <span className="type-small block font-normal">{cell('yourPlan')}</span> : null}
              </TableCell>
              <TableCell className="whitespace-normal" phone="meta" label={cell('priceColumn')}>
                <p data-price>{cell(price, amount === null ? {} : { price: ringgit(amount) })}</p>
              </TableCell>
              <TableCell phone="meta" label={cell('availabilityColumn')}>
                {cell(availability)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </SettingsParts>
  )
}
