import path from 'node:path'
import type { NextConfig } from 'next'

const root = path.join(import.meta.dirname, '../..')

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: root,
  turbopack: { root },
  transpilePackages: ['@skyclause/config', '@skyclause/contracts', '@skyclause/db'],
  // Test builds (PLANTED_ROUTES=1, Playwright's web server) add the `page.plant.tsx` routes; production never has them.
  pageExtensions:
    process.env.PLANTED_ROUTES === '1' ? ['plant.tsx', 'tsx', 'ts', 'jsx', 'js'] : ['tsx', 'ts', 'jsx', 'js']
}

export default config
