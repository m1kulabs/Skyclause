// Run from the repo root: bun apps/web/scripts/generate-brand-assets.ts [--check]
// Chromium rasterises the shared SVG with no image/font/network dependency.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { markSvg, modeColours, tabBadgeSvg, wordmarkSvg } from '@skyclause/elements'
import { t } from '@skyclause/i18n/brand'

const directory = resolve(import.meta.dirname, '../public')
// Raster icons and the manifest are Dusk: the pink mark on the navy ground.
const { ground, ink } = modeColours.dark
const checking = process.argv.includes('--check')
let files = 0
async function output(file: string, content: string | Uint8Array) {
  const bytes = typeof content === 'string' ? Buffer.from(content) : Buffer.from(content)
  const path = resolve(directory, file)
  if (checking) {
    if (!(await readFile(path)).equals(bytes)) throw new Error(`Regenerate brand asset: ${file}`)
  } else {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, bytes)
  }
  files++
}

await output('icon.svg', markSvg)
await output('brand/wordmark.svg', wordmarkSvg)
for (const count of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, '9+'] as const) {
  await output(`brand/tab-${count === 0 ? 'none' : count}.svg`, tabBadgeSvg(count))
}

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  for (const [name, size, markSize] of [
    ['favicon.ico', 32, 32],
    ['apple-touch-icon.png', 180, 144],
    ['icons/icon-192.png', 192, 154],
    ['icons/icon-512.png', 512, 410],
    // A 288px square fits inside the central 409px-diameter maskable safe circle.
    ['icons/maskable-512.png', 512, 288]
  ] as const) {
    const paths = markSvg
      .replace(/<style>.*?<\/style>/, '')
      .replace(/^<svg[^>]*>|<\/svg>$/g, '')
      .replaceAll('currentColor', ink)
    const offset = (size - markSize) / 2
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${ground}"/><g transform="translate(${offset} ${offset}) scale(${markSize / 16})">${paths}</g></svg>`
    const dataUrl = await page.evaluate(
      async ({ svg, size }) => {
        const image = new Image()
        image.src = `data:image/svg+xml;base64,${btoa(svg)}`
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = size
        const context = canvas.getContext('2d')!
        context.drawImage(image, 0, 0)
        return canvas.toDataURL('image/png').split(',')[1]!
      },
      { svg, size }
    )
    const png = Buffer.from(dataUrl, 'base64')
    if (name === 'favicon.ico') {
      // ICONDIR + one 32×32, 32bpp PNG image (ICO supports PNG payloads).
      const header = Buffer.alloc(22)
      header.writeUInt16LE(1, 2)
      header.writeUInt16LE(1, 4)
      header[6] = header[7] = 32
      header.writeUInt16LE(1, 10)
      header.writeUInt16LE(32, 12)
      header.writeUInt32LE(png.length, 14)
      header.writeUInt32LE(22, 18)
      await output(name, Buffer.concat([header, png]))
    } else await output(name, png)
  }
} finally {
  await browser.close()
}

await output(
  'manifest.webmanifest',
  `${JSON.stringify(
    {
      name: t('brand.name'),
      short_name: t('brand.name'),
      start_url: '/',
      display: 'standalone',
      background_color: ground,
      theme_color: ground,
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ]
    },
    null,
    2
  )}\n`
)
console.log(`${checking ? 'Verified' : 'Rendered'} ${files} brand assets from packages/elements`)
