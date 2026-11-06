import { notFound } from 'next/navigation'
import { Set7Harness } from '../../../features/settings/set-7/test-harness'

export default function Set7TestPage() {
  if (process.env.APP_ENV !== 'test') notFound()
  return <Set7Harness />
}
