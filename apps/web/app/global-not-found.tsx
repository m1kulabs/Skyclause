import { RequestRootLayout } from '../components/request-root-layout'
import NotFound from './not-found'

export const metadata = { title: 'Skyclause' }
export const instant = false

export default function GlobalNotFound() {
  return (
    <RequestRootLayout>
      <NotFound />
    </RequestRootLayout>
  )
}
