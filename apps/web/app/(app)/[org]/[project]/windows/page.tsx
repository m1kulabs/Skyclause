import { WindowsPage } from '../../../../../features/windows/windows-page'

export default async function Page({ params }: { params: Promise<{ org: string; project: string }> }) {
  const { org, project } = await params
  return <WindowsPage key={`${org}/${project}`} org={org} project={project} />
}
