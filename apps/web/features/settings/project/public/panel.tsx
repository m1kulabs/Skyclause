'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Button } from '#ui/button'
import { NotBuilt } from '../../../data-components/states'
import { t } from '../../../project-settings/catalogue'

/** The public project page is not built: say so plainly and point at what exists, rather than draw a form that does nothing. */
export default function Panel({ locale = 'en' }: { locale?: 'en' | 'ms' } = {}) {
  const params = useParams<{ org: string; project: string }>()
  return (
    <div data-unbuilt="d-public-project-page" className="-m-5 grid min-w-0 [overflow-wrap:anywhere]">
      <NotBuilt thing={t('project-settings.public_page', {}, locale)} locale={locale} />
      <div className="grid min-w-0 justify-items-start gap-4 px-5 pb-5">
        <p className="type-body text-muted-foreground">{t('project-settings.public_body', {}, locale)}</p>
        <Button
          variant="outline"
          className="h-auto min-h-9 max-w-full py-2 text-left whitespace-normal"
          render={
            <Link href={`/${encodeURIComponent(params.org)}/${encodeURIComponent(params.project)}/settings/share`} />
          }
        >
          {t('project-settings.public_share', {}, locale)}
        </Button>
      </div>
    </div>
  )
}
