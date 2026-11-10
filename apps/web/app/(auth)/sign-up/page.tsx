import { accountRoute } from '../../../features/sign-in/route'
import { t } from '../../../features/sign-in/i18n'
import type { AuthSearchParams } from '../../../features/sign-in/model'

export const metadata = { title: t('sign-in.sign_up_title') }

export default async function Page({ searchParams }: { searchParams: Promise<AuthSearchParams> }) {
  return accountRoute('sign-up', searchParams)
}
