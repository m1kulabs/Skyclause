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
  const locale = (await searchParams).lang === 'ms' ? 'ms' : 'en'
  return (
    <>
      <SubscriptionForm token={token} locale={locale} />
      <TokenFooter token={token} locale={locale} />
    </>
  )
}
