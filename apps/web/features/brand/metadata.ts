import type { Metadata, Viewport } from 'next'

// Spread into every root's metadata; relative URLs work on every host in single and multi mode.
export const brandMetadata = {
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml', sizes: 'any' },
      { url: '/favicon.ico', type: 'image/x-icon', sizes: '32x32' },
      { url: '/icons/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icons/icon-512.png', type: 'image/png', sizes: '512x512' },
      { url: '/icons/maskable-512.png', type: 'image/png', sizes: '512x512' }
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }]
  },
  manifest: '/manifest.webmanifest'
} satisfies Metadata

// Spread into every root's `viewport` export: edge to edge, so the `env(safe-area-inset-*)` paddings take effect.
export const brandViewport = { viewportFit: 'cover' } satisfies Viewport
