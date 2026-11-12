import type { ReactNode } from 'react'
import { headers } from 'next/headers'
import { prefersMalay } from '../../../../lib/preferred-language'
import { DeclareWindowDialog } from '../../../../features/windows/declare-window-dialog'

export default async function ProjectLayout({
  children,
  params
}: {
  children: ReactNode
  params: Promise<{ org: string; project: string }>
}) {
  const { org, project } = await params
  const locale = prefersMalay((await headers()).get('accept-language')) ? 'ms' : 'en'
  return (
    <>
      {children}
      <DeclareWindowDialog org={org} project={project} locale={locale} />
    </>
  )
}
