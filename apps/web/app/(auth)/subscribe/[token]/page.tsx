import { SubscribeColumn } from '../../../../features/subscribe/column'
import { subscribeLocale } from '../../../../features/subscribe/locale'
import { SubscriptionForm } from '../../../../features/subscribe/subscription-form'
import { TokenFooter } from '../../../../features/subscribe/token-footer'

export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ lang?: string }>
}) {
  const { token } = await params
  const locale = await subscribeLocale((await searchParams).lang)
  return (
    <SubscribeColumn locale={locale}>
      <SubscriptionForm token={token} locale={locale} />
      <TokenFooter token={token} locale={locale} />
    </SubscribeColumn>
  )
}
