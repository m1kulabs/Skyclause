import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { markSvg, tabBadgeSvg, wordmarkSvg } from '@skyclause/elements'
import { brandMetadata } from '../../features/brand/metadata'

const publicFile = (file: string) => readFileSync(new URL(`../../public/${file}`, import.meta.url))

test('committed static and tab SVGs are the shared builders, with no app favicon convention', () => {
  expect(publicFile('icon.svg').toString()).toBe(markSvg)
  expect(publicFile('brand/wordmark.svg').toString()).toBe(wordmarkSvg)
  for (const count of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, '9+'] as const) {
    expect(publicFile(`brand/tab-${count === 0 ? 'none' : count}.svg`).toString()).toBe(tabBadgeSvg(count))
  }
  expect(() => readFileSync(new URL('../../app/favicon.ico', import.meta.url))).toThrow()
})

test('ICO contains a real 32×32 image and every PNG has its declared dimensions', () => {
  const ico = publicFile('favicon.ico')
  expect([...ico.subarray(0, 8)]).toEqual([0, 0, 1, 0, 1, 0, 32, 32])
  expect(ico.readUInt32LE(14)).toBe(ico.length - 22)
  expect(ico.readUInt32LE(18)).toBe(22)
  expect(ico.readUInt32BE(22 + 16)).toBe(32)
  for (const [file, size] of [
    ['apple-touch-icon.png', 180],
    ['icons/icon-192.png', 192],
    ['icons/icon-512.png', 512],
    ['icons/maskable-512.png', 512]
  ] as const) {
    const png = publicFile(file)
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    expect(png.readUInt32BE(16), file).toBe(size)
    expect(png.readUInt32BE(20), file).toBe(size)
  }
})

test('metadata declares SVG, explicitly sized ICO, apple and every manifest icon', () => {
  expect(brandMetadata.icons.icon.find((icon) => icon.url === '/favicon.ico')?.sizes).toBe('32x32')
  const manifest = JSON.parse(publicFile('manifest.webmanifest').toString()) as {
    icons: Array<{ src: string; sizes: string; purpose: string }>
  }
  expect(manifest.icons.map(({ sizes, purpose }) => [sizes, purpose])).toEqual([
    ['192x192', 'any'],
    ['512x512', 'any'],
    ['512x512', 'maskable']
  ])
  for (const icon of manifest.icons) expect(brandMetadata.icons.icon.some(({ url }) => url === icon.src)).toBe(true)
})
