import { redirect } from 'next/navigation'
import { OrgCreateForm } from '../../../features/organisations/org-create-form'
import { t } from '../../../features/organisations/catalogue'
import { getPrincipal } from '../../../lib/principal'

export const metadata = { title: t('organisations.create.title') }

/** `/new`: guests are sent to `/sign-up`; a signed-in account gets the name-and-slug form. */
export default async function Page() {
  const principal = await getPrincipal()
  if (principal?.kind !== 'session' || principal.isGuest) redirect('/sign-up')
  return (
    <div className="space-y-4">
      <h1>{t('organisations.create.title')}</h1>
      <p>{t('organisations.create.description')}</p>
      <OrgCreateForm />
    </div>
  )
}
