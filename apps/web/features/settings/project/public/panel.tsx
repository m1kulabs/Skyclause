'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Button } from '#ui/button'
import { StatusMark } from '../../../brand/status-mark'
import { t } from '../../../project-settings/catalogue'

/** The public project page is not built: say so plainly and point at what exists, rather than draw a form that does nothing. */
export default function Panel() {
  const params = useParams<{ org: string; project: string }>()
  return (
    <div
      data-unbuilt="d-public-project-page"
      className="grid min-w-0 justify-items-start gap-4 [overflow-wrap:anywhere]"
    >
      <p className="type-card-title">
        <StatusMark state="pending" variant="plain" label={t('project-settings.public_not_built')} />
      </p>
      <p className="type-body text-muted-foreground">{t('project-settings.public_body')}</p>
      <Button
        variant="outline"
        className="h-auto min-h-9 max-w-full py-2 text-left whitespace-normal"
        render={
          <Link href={`/${encodeURIComponent(params.org)}/${encodeURIComponent(params.project)}/settings/share`} />
        }
      >
        {t('project-settings.public_share')}
      </Button>
    </div>
  )
}
