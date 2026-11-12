import { expect, test, vi } from 'vitest'
import { readWindowNames } from '../../features/subscribers/window-names'

const window = (id: string, title: string) => ({ id, title, starts_at: '2026-11-13T00:30:00Z' })

test('windows are named from the project’s windows read, page by page, and the read stops once all are found', async () => {
  const read = vi.fn(async (cursor?: string) =>
    cursor === undefined
      ? { data: [window('a', 'Morning lecture'), window('other', 'Other')], next_cursor: 'next' }
      : { data: [window('b', 'Evening lab')], next_cursor: 'later' }
  )
  const names = await readWindowNames(read, new Set(['a', 'b']))
  expect(names.get('a')).toEqual({ title: 'Morning lecture', starts_at: '2026-11-13T00:30:00Z' })
  expect(names.get('b')?.title).toBe('Evening lab')
  expect(read).toHaveBeenCalledTimes(2)
})

test('a window the project no longer lists is left out, never named by an identifier', async () => {
  const read = vi.fn(async () => ({ data: [window('a', 'Morning lecture')], next_cursor: null }))
  const names = await readWindowNames(read, new Set(['a', 'gone']))
  expect([...names.keys()]).toEqual(['a'])
  expect(read).toHaveBeenCalledTimes(1)
})

test('a failed read of the windows is raised, not hidden', async () => {
  await expect(readWindowNames(async () => Promise.reject(new Error('503')), new Set(['a']))).rejects.toThrow('503')
})
