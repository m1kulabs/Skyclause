import path from 'node:path'
import type { NextConfig } from 'next'

const root = path.join(import.meta.dirname, '../..')

const config: NextConfig = {
  output: 'standalone',
  cacheComponents: true,
  partialPrefetching: true,
  // Multiple root layouts need a standalone 404 document for unmatched URLs.
  experimental: { globalNotFound: true },
  // Expose pseudo copy to both server and client only in the test build.
  env: { NEXT_PUBLIC_SKYCLAUSE_PSEUDO: process.env.APP_ENV === 'test' && process.env.I18N_PSEUDO === '1' ? '1' : '0' },
  outputFileTracingRoot: root,
  turbopack: { root },
  transpilePackages: [
    '@skyclause/api',
    '@skyclause/elements',
    '@skyclause/config',
    '@skyclause/contracts',
    '@skyclause/db',
    '@skyclause/delivery',
    '@skyclause/i18n',
    '@skyclause/auth'
  ],
  // Test builds (PLANTED_ROUTES=1, Playwright's web server) add the `page.plant.tsx` routes; production never has them.
  pageExtensions:
    process.env.PLANTED_ROUTES === '1' ? ['plant.tsx', 'tsx', 'ts', 'jsx', 'js'] : ['tsx', 'ts', 'jsx', 'js']
}

export default config
