import type { Principal } from '@skyclause/contracts'
import { afterEach, expect, test, vi } from 'vitest'

const navigation = vi.hoisted(() => ({ redirect: vi.fn() }))
const principal = vi.hoisted(() => ({ getPrincipal: vi.fn() }))

vi.mock('next/navigation', () => ({ redirect: navigation.redirect }))
vi.mock('../../lib/principal', () => principal)

import DevicePage from '../../app/(auth)/device/page'

afterEach(() => {
  vi.clearAllMocks()
})

const session = (isGuest: boolean) =>
  ({
    kind: 'session',
    via: 'cookie',
    client: 'app',
    clientName: null,
    accountId: 'account-1',
    sessionId: 'session-1',
    isGuest,
    staff: false,
    orgId: null,
    role: null,
    authenticatedAt: new Date()
  }) satisfies Principal

test('a signed-out visitor returns to sign-in with /device as the next path', async () => {
  navigation.redirect.mockImplementation((path: string) => {
    throw new Error(`redirect:${path}`)
  })
  principal.getPrincipal.mockResolvedValue(null)
  await expect(DevicePage({ searchParams: Promise.resolve({}) })).rejects.toThrow('redirect:/sign-in?next=%2Fdevice')
  expect(navigation.redirect).toHaveBeenCalledWith('/sign-in?next=%2Fdevice')
})

test('sign-in preserves the code in the exact device path', async () => {
  navigation.redirect.mockImplementation((path: string) => {
    throw new Error(`redirect:${path}`)
  })
  principal.getPrincipal.mockResolvedValue(null)
  await expect(DevicePage({ searchParams: Promise.resolve({ user_code: 'ABCD2345' }) })).rejects.toThrow(
    'redirect:/sign-in?next=%2Fdevice%3Fuser_code%3DABCD2345'
  )
})

test('a guest is sent to sign-up', async () => {
  navigation.redirect.mockImplementation((path: string) => {
    throw new Error(`redirect:${path}`)
  })
  principal.getPrincipal.mockResolvedValue(session(true))
  await expect(DevicePage({ searchParams: Promise.resolve({}) })).rejects.toThrow('redirect:/sign-up')
  expect(navigation.redirect).toHaveBeenCalledWith('/sign-up')
})
