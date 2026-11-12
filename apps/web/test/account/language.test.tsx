// @vitest-environment jsdom
// LOC-1: saving Language changes the language pages render in. The browser keeps it as the cookie proxy.ts reads in
// place of Accept-Language, and the page loads again in it.
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

const reload = vi.fn()

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), window.location.origin)
      if (url.pathname !== '/api/me/preferences') return new Response(null, { status: 404 })
      return Response.json(init?.method === 'PATCH' ? { ...stored, ...JSON.parse(String(init.body)) } : stored)
    })
  )
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, reload } })
  document.documentElement.lang = 'en'
  document.cookie = `${LANGUAGE_COOKIE}=; max-age=0; path=/`
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  reload.mockReset()
})

const savedLanguage = () => document.cookie.match(new RegExp(`(?:^|; )${LANGUAGE_COOKIE}=([^;]*)`))?.[1]

test('saving Bahasa Melayu remembers it for every request and loads the English page again in Malay', async () => {
  const { result } = renderHook(() => useAccountPreferences())
  await act(() => result.current.save({ language: 'ms' }))
  await waitFor(() => expect(result.current.saved).toBe(true))
  expect(savedLanguage()).toBe('ms')
  expect(reload).toHaveBeenCalledTimes(1)
  // The page keeps naming the language it was rendered in until it loads again.
  expect(document.documentElement.lang).toBe('en')
})

test('a page already in the saved language is not loaded again', async () => {
  const { result } = renderHook(() => useAccountPreferences())
  await act(() => result.current.save({ language: 'en' }))
  expect(savedLanguage()).toBe('en')
  expect(reload).not.toHaveBeenCalled()
})

test('saving anything else leaves the language, and the browser’s own, alone', async () => {
  const { result } = renderHook(() => useAccountPreferences())
  await act(() => result.current.save({ theme: 'light' }))
  await waitFor(() => expect(result.current.saved).toBe(true))
  expect(savedLanguage()).toBeUndefined()
  expect(reload).not.toHaveBeenCalled()
})
