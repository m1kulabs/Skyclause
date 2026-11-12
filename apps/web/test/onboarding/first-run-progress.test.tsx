// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '../../features/onboarding/catalogue'
import { FirstRunProgress } from '../../features/onboarding/first-run-progress'
import { onboardingApi } from '../../features/onboarding/operations'

vi.mock('../../features/onboarding/operations', async (original) => ({
  ...(await original<typeof import('../../features/onboarding/operations')>()),
  onboardingApi: vi.fn()
}))
const replace = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }), usePathname: () => '/test-org/new' }))

const steps = ['organisation', 'project', 'sources', 'window', 'rota', 'channel'] as const
const view = (done: number, skipped: readonly string[] = []) => ({
  steps: steps.map((step, index) => ({
    step,
    href: step === 'project' ? '/test-org/new' : `/test-org/${step}`,
    completed_at: index < done ? '2026-11-12T01:00:00.000Z' : null,
    skipped: skipped.includes(step),
    result: index < done ? `${step} done` : null
  }))
})

afterEach(() => {
  cleanup()
  vi.mocked(onboardingApi).mockReset()
  replace.mockReset()
  document.body.innerHTML = ''
})

/** The project form beside the list, with or without a draft typed into it. */
function projectForm(dirty: boolean) {
  const form = document.createElement('form')
  form.setAttribute('data-project-create', '')
  if (dirty) form.setAttribute('data-dirty', 'true')
  document.body.append(form)
}

test('a bare visit to the project route after the project step resumes at the next outstanding step', async () => {
  vi.mocked(onboardingApi).mockResolvedValue(view(2) as never)
  projectForm(false)
  render(<FirstRunProgress org="test-org" redirectFromProject />)
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/test-org/sources'))
})

test('a project form with a draft in it is never replaced by the next step', async () => {
  vi.mocked(onboardingApi).mockResolvedValue(view(2) as never)
  projectForm(true)
  render(<FirstRunProgress org="test-org" redirectFromProject />)
  await screen.findByRole('list')
  await new Promise((resolve) => setTimeout(resolve, 50))
  expect(replace).not.toHaveBeenCalled()
})

test('a Create a project link, which asks for another project, stays on the form', async () => {
  vi.mocked(onboardingApi).mockResolvedValue(view(2) as never)
  projectForm(false)
  render(<FirstRunProgress org="test-org" redirectFromProject={false} />)
  await screen.findByRole('list')
  await new Promise((resolve) => setTimeout(resolve, 50))
  expect(replace).not.toHaveBeenCalled()
})

test('only the step that is next has actions: one Continue and one quiet Skip this step, none on the rest', async () => {
  vi.mocked(onboardingApi).mockResolvedValue(view(1) as never)
  render(<FirstRunProgress org="test-org" />)
  const list = await screen.findByRole('list')
  // The first run is on the project step, so there is no Continue to itself: just Skip this step.
  expect(within(list).queryAllByRole('link', { name: /^Continue/ })).toHaveLength(0)
  expect(within(list).getAllByRole('button', { name: /^Skip this step/ })).toHaveLength(1)
  expect(within(list).queryAllByRole('button', { name: /Resume/ })).toHaveLength(0)
})

test('the next step off this page offers Continue as the primary action, named by its step', async () => {
  vi.mocked(onboardingApi).mockResolvedValue(view(2) as never)
  render(<FirstRunProgress org="test-org" />)
  const link = await screen.findByRole('link', { name: /^Continue/ })
  expect(link.getAttribute('href')).toBe('/test-org/sources')
  expect(link.getAttribute('aria-describedby')).toBe('first-run-step-sources')
  expect(document.getElementById('first-run-step-sources')?.textContent).toBe('Bind sources')
  expect(screen.getAllByRole('button', { name: /^Skip this step/ })).toHaveLength(1)
})

test('a skipped step can be resumed, and skipping moves focus to the next step’s action', async () => {
  const skipped = view(1, ['sources'])
  vi.mocked(onboardingApi)
    .mockResolvedValueOnce(view(1) as never)
    .mockResolvedValueOnce(skipped as never)
  render(<FirstRunProgress org="test-org" />)
  fireEvent.click(await screen.findByRole('button', { name: /^Skip this step/ }))
  await waitFor(() => expect(screen.getByRole('button', { name: /^Resume/ })).toBeTruthy())
  expect(screen.getAllByRole('button', { name: /^Skip this step/ })).toHaveLength(1)
})

test('the steps are written in the language they are given', async () => {
  vi.mocked(onboardingApi).mockResolvedValue(view(1) as never)
  render(<FirstRunProgress org="test-org" locale="ms" />)
  expect(await screen.findByRole('button', { name: /^Langkau langkah ini/ })).toBeTruthy()
})

test('in Malay a done step reads when it was done, never the English result the API words', async () => {
  vi.mocked(onboardingApi).mockResolvedValue(view(2) as never)
  render(<FirstRunProgress org="test-org" locale="ms" />)
  const list = await screen.findByRole('list')
  expect(within(list).queryByText('organisation done')).toBeNull()
  expect(within(list).getAllByText('Selesai pada 09:00 MYT')).toHaveLength(2)
})

test('in English a done step keeps its result, unless it would print a status code', async () => {
  const answer = view(3)
  answer.steps[2]!.result = 'CA16W bound · error · HTTP 404'
  vi.mocked(onboardingApi).mockResolvedValue(answer as never)
  render(<FirstRunProgress org="test-org" />)
  const list = await screen.findByRole('list')
  expect(within(list).getByText('organisation done')).toBeTruthy()
  expect(within(list).queryByText(/HTTP/)).toBeNull()
  expect(within(list).getByText('Done at 09:00 MYT')).toBeTruthy()
})
