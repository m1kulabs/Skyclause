import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPrincipal } from '../../../lib/principal'
import { prefersMalay } from '../../../lib/preferred-language'
import { ConnectPanel } from '../../../features/connect/panel'
import { targets } from '../../../features/connect/operations'
import { t } from '../../../features/connect/i18n'

export async function generateMetadata() {
  const locale = prefersMalay((await headers()).get('accept-language')) ? 'ms' : 'en'
  return { title: t('connect.title', {}, locale) }
}

export default async function Page({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const principal = await getPrincipal()
  if (principal?.kind !== 'session' || principal.isGuest) redirect('/sign-up')
  const query = await searchParams
  const target = targets.find((id) => id === query.target) ?? targets[0]!
  const transport = query.transport === 'stdio' ? 'stdio' : 'remote'
  if (query.target !== target) redirect(`/connect?target=${target}&transport=${transport}`)
  const locale = prefersMalay((await headers()).get('accept-language')) ? 'ms' : 'en'
  return (
    <ConnectPanel
      target={target}
      transport={transport}
      mcpOrigin={process.env.MCP_ORIGIN ?? 'https://mcp.skyclause.m1ku.tech'}
      orgId={principal.orgId}
      locale={locale}
    />
  )
}
