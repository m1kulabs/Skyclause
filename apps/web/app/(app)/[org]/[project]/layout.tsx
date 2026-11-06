import type { ReactNode } from 'react'
import { DeclareWindowDialog } from '../../../../features/windows/declare-window-dialog'

export default async function ProjectLayout({
  children,
  params
}: {
  children: ReactNode
  params: Promise<{ org: string; project: string }>
}) {
  const { org, project } = await params
  return (
    <>
      {children}
      <DeclareWindowDialog org={org} project={project} />
    </>
  )
}
