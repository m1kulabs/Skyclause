// Test-only (built when PLANTED_ROUTES=1): one inline script with the request
// nonce and one without, for e2e/hardening.spec.ts.
import { headers } from 'next/headers'

export default async function PlantedCsp() {
  const nonce = (await headers()).get('x-nonce')
  return (
    <main>
      <h1>Planted CSP page</h1>
      <script nonce={nonce ?? undefined} dangerouslySetInnerHTML={{ __html: `window.__plantedCspNonce='ran'` }} />
      <script dangerouslySetInnerHTML={{ __html: `window.__plantedCsp='ran'` }} />
    </main>
  )
}
