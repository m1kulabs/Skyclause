import { brandMetadata } from '../features/brand/metadata'
import { RequestRootLayout } from '../components/request-root-layout'
import NotFound from './not-found'

export const metadata = { ...brandMetadata, title: 'Skyclause' }
export const instant = false

export default function GlobalNotFound() {
  return (
    <RequestRootLayout>
      <NotFound />
    </RequestRootLayout>
  )
}
