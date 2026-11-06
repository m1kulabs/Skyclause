import { redirect } from 'next/navigation'
import { getPrincipal } from '../../../lib/principal'
import { ConnectPanel } from '../../../features/connect/panel'
import { targets } from '../../../features/connect/operations'
import { t } from '../../../features/connect/i18n'

export const metadata = { title: t('connect.title') }

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
  return (
    <ConnectPanel
      target={target}
      transport={transport}
      mcpOrigin={process.env.MCP_ORIGIN ?? 'https://mcp.skyclause.m1ku.tech'}
      orgId={principal.orgId}
    />
  )
}
