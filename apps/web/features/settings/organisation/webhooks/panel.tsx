import type { Principal } from '@skyclause/contracts'
import { WebhookFeature } from '../../../webhooks'

/** The organisation's webhooks, for the principal the settings gate resolved for this organisation. */
export default function Panel({ principal, locale = 'en' }: { principal: Principal | null; locale?: 'en' | 'ms' }) {
  return <WebhookFeature principal={principal} settings locale={locale} />
}
