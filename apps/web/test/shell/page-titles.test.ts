import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'

let acceptLanguage = 'en'
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'accept-language': acceptLanguage })
}))

const app = new URL('../../app/(app)/', import.meta.url).pathname

function pages(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? pages(join(directory, entry.name))
      : entry.name === 'page.tsx'
        ? [join(directory, entry.name)]
        : []
  )
}

afterEach(() => {
  acceptLanguage = 'en'
})

test('every signed-in page names its screen in the tab, so two tabs of the app never read the same', () => {
  const untitled = pages(app)
    .filter(
      (path) =>
        !/export (const metadata|const generateMetadata|async function generateMetadata)\b/.test(
          readFileSync(path, 'utf8')
        )
    )
    .map((path) => relative(app, path))
  expect(untitled).toEqual([])
})

test('a settings tab names the section and its settings, in the page language', async () => {
  const { settingsMetadata } = await import('../../features/settings/metadata')
  expect(await settingsMetadata('organisation', 'members')()).toEqual({
    title: 'Members and roles · Organisation settings'
  })
  acceptLanguage = 'ms'
  const { title } = await settingsMetadata('project', 'general')()
  expect(title).toMatch(/ · Tetapan projek$/)
})
