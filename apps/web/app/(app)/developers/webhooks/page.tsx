import { settingsLocale } from '../../../../features/settings/locale'
import { WebhookFeature } from '../../../../features/webhooks'

export default async function Page() {
  return <WebhookFeature locale={await settingsLocale()} />
}
