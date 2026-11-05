import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { checkFixtures } from './fixtures'
import { plantRepo } from './test-helpers'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

const bytes = new TextEncoder().encode('{"captured":"bytes"}\n')
const entry = {
  file: 'rainfall-graph-75-20261105T1312Z.json',
  url: 'https://infobanjirjpskl.water.gov.my/Rainfall/GetRainfallGraph/75',
  captured_at: '2026-11-05T13:12:00Z',
  station_id: '0232901RF',
  sha256: sha256(bytes)
}

function repoWith(manifest: unknown, content: Uint8Array = bytes) {
  return plantRepo({
    'packages/sources/test/fixtures/fixtures.json': JSON.stringify(manifest),
    'packages/sources/test/fixtures/rainfall-graph-75-20261105T1312Z.json': content
  })
}

describe('fixtures.json', () => {
  test('every manifest in the repository lists URL, capture time, station ID and a matching SHA-256', () => {
    expect(checkFixtures(repoRoot)).toEqual([])
  })

  test('a complete entry whose hash matches passes', () => {
    expect(checkFixtures(repoWith([entry]))).toEqual([])
  })

  test('a missing capture time fails', () => {
    const { captured_at: _, ...rest } = entry
    expect(checkFixtures(repoWith([rest]))).toEqual([
      'packages/sources/test/fixtures/fixtures.json: rainfall-graph-75-20261105T1312Z.json needs captured_at as an RFC 3339 instant'
    ])
  })

  test('a missing station ID fails', () => {
    const { station_id: _, ...rest } = entry
    expect(checkFixtures(repoWith([rest]))).toEqual([
      'packages/sources/test/fixtures/fixtures.json: rainfall-graph-75-20261105T1312Z.json needs station_id'
    ])
  })

  test('a SHA-256 that does not match the file fails', () => {
    expect(checkFixtures(repoWith([{ ...entry, sha256: sha256(new Uint8Array([0])) }]))).toEqual([
      'packages/sources/test/fixtures/fixtures.json: rainfall-graph-75-20261105T1312Z.json sha256 does not match the file'
    ])
  })

  test('any captured bytes pass with their own hash and fail once a byte changes', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 1, maxLength: 256 }), fc.nat(), (content, at) => {
        const changed = content.slice()
        const i = at % changed.length
        changed[i] = (changed[i]! + 1) % 256
        const manifest = [{ ...entry, sha256: sha256(content) }]
        return (
          checkFixtures(repoWith(manifest, content)).length === 0 &&
          checkFixtures(repoWith(manifest, changed)).length === 1
        )
      }),
      { numRuns: 25 }
    )
  })
})
