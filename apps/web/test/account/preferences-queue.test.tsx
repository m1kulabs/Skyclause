// @vitest-environment jsdom
// SET-2: a change made while an earlier one is still being saved is saved too, after it and in order. The page
// never drops a change, never lets an earlier answer overwrite a later choice, and never reloads over one.
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useAccountPreferences } from '../../features/account/use-account-preferences'
import { LANGUAGE_COOKIE } from '../../lib/preferred-language'

const stored = {
  theme: 'dark',
  high_contrast: false,
  density: 'comfortable',
  reduced_motion: false,
  language: 'en',
  shortcuts: true
}

const patches: Record<string, unknown>[] = []
const reloaded: number[] = []
let gates: Array<() => void> = []
let failFirst = false
let serverState = stored

/** Each PATCH waits until the test lets it through, so a save stays "on its way" as long as the test wants. */
function hold() {
  return new Promise<void>((resolve) => gates.push(resolve))
}

beforeEach(() => {
  patches.length = 0
  reloaded.length = 0
  gates = []
  failFirst = false
  serverState = stored
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), window.location.origin)
      if (url.pathname !== '/api/me/preferences') return new Response(null, { status: 404 })
      if (init?.method !== 'PATCH') return Response.json(serverState)
      const update = JSON.parse(String(init.body))
      patches.push(update)
      await hold()
      if (failFirst && patches.length === 1) return Response.json({ detail: 'down' }, { status: 500 })
      // The server answers with what it holds: the first answer knows nothing of a change sent after it.
      serverState = { ...serverState, ...update }
      return Response.json(serverState)
    })
  )
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload: () => reloaded.push(patches.length) }
  })
  document.documentElement.lang = 'en'
  document.cookie = `${LANGUAGE_COOKIE}=; max-age=0; path=/`
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const release = async (count: number) => {
  await waitFor(() => expect(gates.length).toBeGreaterThanOrEqual(count))
  await act(async () => gates[count - 1]!())
}

test('a change made while another is saving is sent after it and both stay on screen', async () => {
  const { result } = renderHook(() => useAccountPreferences())
  await act(async () => void result.current.save({ theme: 'light' }))
  await waitFor(() => expect(patches).toEqual([{ theme: 'light' }]))

  await act(async () => void result.current.save({ shortcuts: false }))
  expect(result.current.preferences).toMatchObject({ theme: 'light', shortcuts: false })
  expect(patches).toEqual([{ theme: 'light' }])

  // The first answer does not know of the second change; it must not take it back off the screen.
  await release(1)
  await waitFor(() => expect(patches).toEqual([{ theme: 'light' }, { shortcuts: false }]))
  expect(result.current.preferences).toMatchObject({ theme: 'light', shortcuts: false })

  await release(2)
  await waitFor(() => expect(result.current.saved).toBe(true))
  expect(result.current.preferences).toMatchObject({ theme: 'light', shortcuts: false })
  expect(result.current.saving).toBe(false)
})

test('several changes made while one is saving go out together, the latest of each choice', async () => {
  const { result } = renderHook(() => useAccountPreferences())
  await act(async () => void result.current.save({ theme: 'light' }))
  await waitFor(() => expect(patches).toHaveLength(1))
  await act(async () => {
    void result.current.save({ density: 'compact' })
    void result.current.save({ shortcuts: false })
    void result.current.save({ shortcuts: true })
  })
  await release(1)
  await waitFor(() => expect(patches).toHaveLength(2))
  expect(patches[1]).toEqual({ density: 'compact', shortcuts: true })
  await release(2)
  await waitFor(() => expect(result.current.saved).toBe(true))
})

test('a language change loads the page again only after the changes made behind it are sent', async () => {
  const { result } = renderHook(() => useAccountPreferences())
  await act(async () => void result.current.save({ language: 'ms' }))
  await waitFor(() => expect(patches).toHaveLength(1))
  await act(async () => void result.current.save({ shortcuts: false }))
  await release(1)
  await waitFor(() => expect(patches).toHaveLength(2))
  expect(reloaded).toEqual([])
  await release(2)
  await waitFor(() => expect(reloaded).toEqual([2]))
})

test('a failed save puts back only its own change, and a later one still goes out', async () => {
  failFirst = true
  const { result } = renderHook(() => useAccountPreferences())
  await act(async () => void result.current.save({ theme: 'light' }))
  await waitFor(() => expect(patches).toHaveLength(1))
  await act(async () => void result.current.save({ shortcuts: false }))
  await release(1)
  await waitFor(() => expect(patches).toHaveLength(2))
  await release(2)
  await waitFor(() => expect(result.current.saving).toBe(false))
  expect(patches).toEqual([{ theme: 'light' }, { shortcuts: false }])
  expect(result.current.preferences).toMatchObject({ theme: 'dark', shortcuts: false })
  expect(result.current.error).not.toBeNull()
  expect(result.current.saved).toBe(false)
})
