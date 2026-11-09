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
  const locale = query.lang === 'ms' ? 'ms' : 'en'
  return (
    <>
      <TokenAction token={token} kind="confirm" initial={query.answer ?? query.kind} locale={locale} />
      <TokenFooter token={token} locale={locale} />
    </>
  )
}
