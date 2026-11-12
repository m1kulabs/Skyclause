import { settingsLocale } from '../../../../features/settings/locale'
import { WebhookFeature } from '../../../../features/webhooks'
import { getPrincipal } from '../../../../lib/principal'
import { t } from '../../../../features/webhooks/catalogue'

export async function generateMetadata() {
  return { title: t('webhooks.title', {}, await settingsLocale()) }
}

export default async function Page() {
  return <WebhookFeature principal={await getPrincipal()} locale={await settingsLocale()} />
}
