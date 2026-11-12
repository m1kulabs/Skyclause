import { WebhookFeature } from '../../../webhooks'

export default function Panel({ locale = 'en' }: { locale?: 'en' | 'ms' } = {}) {
  return <WebhookFeature settings locale={locale} />
}
