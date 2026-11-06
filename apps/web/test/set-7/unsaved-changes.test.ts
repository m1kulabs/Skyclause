import { afterEach, expect, test, vi } from 'vitest'
import { createUnsavedChangesGuard } from '../../features/settings/set-7/unsaved-changes'

afterEach(() => vi.useRealTimers())

test('beforeunload is cancelled synchronously while dirty', () => {
  vi.useFakeTimers()
  const guard = createUnsavedChangesGuard(() => true, vi.fn())
  const event = { preventDefault: vi.fn(), returnValue: undefined as string | undefined }
  guard.beforeUnload(event)
  expect(event.preventDefault).toHaveBeenCalledTimes(1)
  expect(event.returnValue).toBe('')
  expect(vi.getTimerCount()).toBe(0)
})

test('clean forms neither prompt nor block navigation', () => {
  const confirm = vi.fn()
  const navigate = vi.fn()
  const guard = createUnsavedChangesGuard(() => false, confirm)
  const event = { preventDefault: vi.fn(), returnValue: undefined as string | undefined }
  guard.beforeUnload(event)
  expect(guard.navigate(navigate)).toBe(true)
  expect(navigate).toHaveBeenCalledTimes(1)
  expect(confirm).not.toHaveBeenCalled()
  expect(event.preventDefault).not.toHaveBeenCalled()
})

test('cancelling in-app navigation retains the dirty form', () => {
  const navigate = vi.fn()
  const guard = createUnsavedChangesGuard(
    () => true,
    () => false
  )
  expect(guard.navigate(navigate)).toBe(false)
  expect(navigate).not.toHaveBeenCalled()
})

test('accepting in-app navigation performs the requested action once', () => {
  const navigate = vi.fn()
  const guard = createUnsavedChangesGuard(
    () => true,
    () => true
  )
  expect(guard.navigate(navigate)).toBe(true)
  expect(navigate).toHaveBeenCalledTimes(1)
})
