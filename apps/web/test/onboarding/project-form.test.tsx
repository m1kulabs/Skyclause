// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ProjectForm } from '../../features/onboarding/project-form'
import { onboardingApi } from '../../features/onboarding/operations'

vi.mock('../../features/onboarding/operations', async (original) => ({
  ...(await original<typeof import('../../features/onboarding/operations')>()),
  onboardingApi: vi.fn()
}))

const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))

afterEach(() => {
  cleanup()
  vi.mocked(onboardingApi).mockReset()
  push.mockReset()
  refresh.mockReset()
})

test('creating a project refreshes the shell after the push, so its project switcher holds the new project', async () => {
  // An HTTP test double of createProject's answer, never application data.
  vi.mocked(onboardingApi).mockResolvedValue({ id: 'project-id', slug: 'test-project' } as never)
  render(<ProjectForm org="test-org" />)
  fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'Test project' } })
  fireEvent.change(screen.getByLabelText('Site name'), { target: { value: 'Test site' } })
  fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '3.05' } })
  fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '101.7' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create project' }))
  await waitFor(() => expect(push).toHaveBeenCalledWith('/test-org/test-project/settings/packs'))
  expect(refresh).toHaveBeenCalledTimes(1)
  // The refresh is queued behind the navigation, so it re-renders the new page's layouts from the root.
  expect(push.mock.invocationCallOrder[0]).toBeLessThan(refresh.mock.invocationCallOrder[0]!)
})
