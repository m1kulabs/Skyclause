import { deviceAuthorizationPageData } from '@skyclause/auth'
import { redirect } from 'next/navigation'
import { getPrincipal } from '../../../lib/principal'
import { DeviceApproval } from '../../../features/device/device-approval'
import { normalizeDeviceCode, parseCliUserAgent } from '../../../features/device/model'

export default async function DevicePage({
  searchParams
}: {
  searchParams: Promise<{ user_code?: string | string[] }>
}) {
  const params = await searchParams
  const code = typeof params.user_code === 'string' ? params.user_code : ''
  const principal = await getPrincipal()
  if (!principal || principal.kind !== 'session') {
    const next = `/device${code ? `?user_code=${encodeURIComponent(code)}` : ''}`
    redirect(`/sign-in?next=${encodeURIComponent(next)}`)
  }
  if (principal.isGuest) redirect('/sign-up')

  const { state, userAgent, memberships } = code
    ? await deviceAuthorizationPageData(code, principal.accountId)
    : { state: 'empty' as const, userAgent: null, memberships: [] }

  const device = parseCliUserAgent(userAgent)
  return (
    <DeviceApproval code={normalizeDeviceCode(code)} initialState={state} device={device} memberships={memberships} />
  )
}
