import { settingsLocale } from '../../../../features/settings/locale'
import { WebhookFeature } from '../../../../features/webhooks'
import { getPrincipal } from '../../../../lib/principal'

export default async function Page() {
  return <WebhookFeature principal={await getPrincipal()} locale={await settingsLocale()} />
}
