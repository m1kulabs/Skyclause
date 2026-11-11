import type { SubscriberData } from '@skyclause/contracts'
import { headers } from 'next/headers'
import { api } from '../../../../../lib/api'
import {
  SubscriberRights,
  SubscriberRightsLinkError
} from '../../../../../features/subscriber-rights/subscriber-rights'

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const incoming = await headers()
  const forwardedFor = incoming.get('x-forwarded-for')
  const host = incoming.get('x-forwarded-host') ?? incoming.get('host') ?? 'localhost'
  const protocol = incoming.get('x-forwarded-proto') ?? 'https'
  const requestHeaders = new Headers()
  if (forwardedFor) requestHeaders.set('x-forwarded-for', forwardedFor)
  const response = await api.fetch(
    new Request(`${protocol}://${host}/api/subscribe/${encodeURIComponent(token)}/data`, { headers: requestHeaders })
  )
  if (response.status === 410) return <SubscriberRightsLinkError expired />
  if (!response.ok) return <SubscriberRightsLinkError expired={false} />
  const data = (await response.json()) as SubscriberData
  return <SubscriberRights initialData={data} token={token} />
}
