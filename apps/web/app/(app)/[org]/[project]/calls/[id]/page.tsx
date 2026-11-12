import { headers } from 'next/headers'
import { prefersMalay } from '../../../../../../lib/preferred-language'
import { CallDetailPage } from '../../../../../../features/calls/call-detail'
import { t } from '../../../../../../features/calls/i18n'
import { settingsLocale } from '../../../../../../features/settings/locale'

export async function generateMetadata() {
  return { title: t('calls.detail', {}, await settingsLocale()) }
}

export default async function CallRoute({ params }: { params: Promise<{ org: string; project: string; id: string }> }) {
  const [{ org, project, id }, requestHeaders] = await Promise.all([params, headers()])
  return (
    <CallDetailPage
      org={org}
      projectSlug={project}
      callId={id}
      locale={prefersMalay(requestHeaders.get('accept-language')) ? 'ms' : 'en'}
    />
  )
}
