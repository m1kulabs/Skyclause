import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8')

// TRD security: base images pinned by digest. Stage names (`FROM … AS build`, `COPY --from=build`) aren't images.
test('every image the Dockerfile pulls is pinned by digest', () => {
  const stages = [...dockerfile.matchAll(/^FROM\s+\S+\s+AS\s+(\S+)/gim)].map((match) => match[1])
  const images = [
    ...[...dockerfile.matchAll(/^FROM\s+(\S+)/gim)].map((match) => match[1]),
    ...[...dockerfile.matchAll(/--from=(\S+)/g)].map((match) => match[1])
  ].filter((ref) => !stages.includes(ref))
  expect(images.length).toBeGreaterThan(0)
  for (const ref of images) expect(ref).toMatch(/^[\w./:-]+@sha256:[0-9a-f]{64}$/)
})

// Dependabot's Docker updater reads FROM lines only (#267), so an image copied from directly would never be refreshed.
test('every COPY --from names a stage, so each image is a FROM line Dependabot tracks', () => {
  const stages = [...dockerfile.matchAll(/^FROM\s+\S+\s+AS\s+(\S+)/gim)].map((match) => match[1])
  const sources = [...dockerfile.matchAll(/--from=(\S+)/g)].map((match) => match[1])
  expect(sources.length).toBeGreaterThan(0)
  for (const source of sources) expect(stages).toContain(source)
})
