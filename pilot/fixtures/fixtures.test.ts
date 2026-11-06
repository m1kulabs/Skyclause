import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const repo = join(import.meta.dir, '..', '..')

const copies = {
  'rainfall-graph-75-20261105T1312Z.json': 'docs/sources/infobanjirjpskl.water.gov.my',
  'weather-warning-20261105T1313Z.json': 'docs/sources/api.data.gov.my',
  'mapcaqm-20261105T1313Z.json': 'docs/sources/eqms.doe.gov.my',
  'ridership-od-rapidrail-daily-20261106T1456Z.json': 'docs/sources/storage.data.gov.my',
  'rapidrail-sp17-extract-20261106T1456Z.json': 'docs/sources/storage.data.gov.my'
}

describe('pilot fixtures', () => {
  for (const [file, dir] of Object.entries(copies)) {
    test(`${file} is a byte-for-byte copy of ${dir}/${file}`, () => {
      const copy = readFileSync(join(import.meta.dir, file))
      const original = readFileSync(join(repo, dir, file))
      expect(copy.equals(original)).toBe(true)
    })
  }
})
