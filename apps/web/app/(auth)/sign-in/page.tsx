import { accountRoute } from '../../../features/sign-in/route'
import { pageMetadata } from '../../../features/share-previews/pages'
import type { AuthSearchParams } from '../../../features/sign-in/model'

export const generateMetadata = () => pageMetadata('sign-in')

export default async function Page({ searchParams }: { searchParams: Promise<AuthSearchParams> }) {
  return accountRoute('sign-in', searchParams)
}
