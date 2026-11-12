import { headers } from 'next/headers'
import { NotFoundContent } from '../../features/public-chrome/errors'

export default async function NotFound() {
  const locale = (await headers()).get('x-skyclause-locale') === 'ms' ? 'ms' : 'en'
  return <NotFoundContent locale={locale} />
}
