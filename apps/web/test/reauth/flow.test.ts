// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { ApiProblem } from '../../lib/api-fetch'
import { cancelStepUp, ReauthCancelledError, withStepUp } from '../../features/step-up/flow'

afterEach(() => {
  cancelStepUp()
  document.body.replaceChildren()
})

function button() {
  const element = document.createElement('button')
  document.body.append(element)
  return element
}

async function cancelWriteFrom(trigger: HTMLButtonElement, dialogButton: HTMLButtonElement) {
  trigger.focus()
  const write = withStepUp(
    async () => {
      throw new ApiProblem(401, { type: 'reauth-required' })
    },
    () => {}
  )
  await Promise.resolve()
  dialogButton.focus()
  const cancelled = expect(write).rejects.toBeInstanceOf(ReauthCancelledError)
  cancelStepUp()
  await cancelled
  await vi.waitFor(() => expect(document.activeElement).toBe(trigger))
}

test('each cancelled step-up returns focus to its own trigger', async () => {
  const first = button()
  const second = button()
  const dialogButton = button()

  await cancelWriteFrom(first, dialogButton)
  await cancelWriteFrom(second, dialogButton)
})

test('a write that needs no step-up does not retain focus for the next write', async () => {
  const first = button()
  const second = button()
  const dialogButton = button()
  first.focus()
  await withStepUp(
    async () => 'completed',
    () => {}
  )

  await cancelWriteFrom(second, dialogButton)
})
