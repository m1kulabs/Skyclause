import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'
import { PICTURES } from '../../features/landing/photos'

const folder = path.join(import.meta.dirname, '../../public/landing')

test('the provenance file beside the pictures records exactly what the page credits, and every file exists', () => {
  const provenance = JSON.parse(readFileSync(path.join(folder, 'provenance.json'), 'utf8')) as {
    pictures: Record<string, unknown>
  }
  expect(provenance.pictures).toEqual(PICTURES)
  for (const [key, entry] of Object.entries(PICTURES)) {
    for (const file of entry.files) expect(existsSync(path.join(folder, file)), `${key}: ${file}`).toBe(true)
    expect(entry.page, key).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/)
    expect(['CC0', 'CC BY 4.0', 'CC BY-SA 4.0'], key).toContain(entry.licence)
    expect(entry.alt.length, key).toBeGreaterThan(20)
  }
})

test('every picture in the folder is one the page credits', () => {
  const credited = new Set<string>(Object.values(PICTURES).flatMap((entry) => [...entry.files]))
  const jpegs = readdirSync(folder).filter((file) => file.endsWith('.jpg'))
  expect(jpegs.filter((file) => !credited.has(file))).toEqual([])
})
