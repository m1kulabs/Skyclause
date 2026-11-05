import path from 'node:path'
import type { NextConfig } from 'next'

const root = path.join(import.meta.dirname, '../..')

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: root,
  turbopack: { root },
  transpilePackages: ['@skyclause/config', '@skyclause/contracts', '@skyclause/db']
}

export default config
