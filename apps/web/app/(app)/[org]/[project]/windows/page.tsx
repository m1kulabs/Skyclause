import { WindowsPage } from '../../../../../features/windows/windows-page'
import { t } from '../../../../../features/windows/catalogue'

export const metadata = { title: t('windows.title') }

export default async function Page({ params }: { params: Promise<{ org: string; project: string }> }) {
  const { org, project } = await params
  return <WindowsPage key={`${org}/${project}`} org={org} project={project} />
}
