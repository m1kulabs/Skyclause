import { SubscribeColumn } from '../../../../../features/subscribe/column'
import { subscribeLocale } from '../../../../../features/subscribe/locale'
import { TokenAction } from '../../../../../features/subscribe/token-action'
import { TokenFooter } from '../../../../../features/subscribe/token-footer'

export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ lang?: string; answer?: string; kind?: string }>
}) {
  const { token } = await params
  const query = await searchParams
  const locale = await subscribeLocale(query.lang)
  return (
    <SubscribeColumn locale={locale}>
      <TokenAction token={token} kind="confirm" initial={query.answer ?? query.kind} locale={locale} />
      <TokenFooter token={token} locale={locale} />
    </SubscribeColumn>
  )
}
