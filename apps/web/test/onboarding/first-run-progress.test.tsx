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

test('in English a done step keeps its result, unless it would print anything raw', async () => {
  // Every step done but the rota, so the list still shows.
  const answer = view(6)
  answer.steps[4]!.completed_at = null
  answer.steps[4]!.result = null
  answer.steps[3]!.result = 'Open-air lecture declared · rain_5m_mm'
  answer.steps[5]!.result = 'in app connected'
  vi.mocked(onboardingApi).mockResolvedValue(answer as never)
  render(<FirstRunProgress org="test-org" />)
  const list = await screen.findByRole('list')
  expect(within(list).getByText('organisation done')).toBeTruthy()
  // A snake_case key, and the channel's unlocalised name, never show: the step says when it was done instead.
  expect(within(list).queryByText(/rain_5m_mm|in app connected/)).toBeNull()
  expect(within(list).getAllByText('Done at 09:00 MYT')).toHaveLength(2)
})

test('the source step says it is bound, or that it needs attention, never the source ID or its error', async () => {
  const answer = view(3)
  answer.steps[2]!.result = 'CA16W bound · API 67, 13 min old'
  vi.mocked(onboardingApi).mockResolvedValue(answer as never)
  render(<FirstRunProgress org="test-org" />)
  let list = await screen.findByRole('list')
  expect(within(list).getByText('Source bound.')).toBeTruthy()
  expect(within(list).queryByText(/CA16W/)).toBeNull()
  cleanup()
  for (const result of ['CA16W bound · error · HTTP 404', '0232901RF bound · error']) {
    answer.steps[2]!.result = result
    vi.mocked(onboardingApi).mockResolvedValue(answer as never)
    render(<FirstRunProgress org="test-org" locale="ms" />)
    list = await screen.findByRole('list')
    expect(within(list).getByText('Perlu perhatian: tinjauan terakhir sumber gagal.')).toBeTruthy()
    expect(within(list).queryByText(/HTTP|CA16W|0232901RF|error/)).toBeNull()
    cleanup()
  }
})

/** The steps as the API links them, for an organisation `campus` whose first project is `bukit-jalil`. */
const linked = (done: number, skipped: readonly string[] = []) => {
  const hrefs: Record<(typeof steps)[number], string> = {
    organisation: '/new',
    project: '/campus/new',
    sources: '/campus/bukit-jalil/settings/packs',
    window: '/campus/bukit-jalil/windows?declare=window',
    rota: '/campus/settings/rota',
    channel: '/campus/bukit-jalil/settings/channels'
  }
  const answer = view(done, skipped)
  for (const item of answer.steps) item.href = hrefs[item.step]
  return answer
}

test('the rota step names the organisation’s approver rota and what completes it', async () => {
  vi.mocked(onboardingApi).mockResolvedValue(linked(4) as never)
  render(<FirstRunProgress org="campus" />)
  const list = await screen.findByRole('list')
  expect(within(list).getByRole('heading', { name: 'Set the approver rota' })).toBeTruthy()
  expect(within(list).getByText(/Organisation settings, Approver rota: add an approver to a shift/)).toBeTruthy()
  const link = within(list).getByRole('link', { name: /^Continue/ })
  expect(link.getAttribute('href')).toBe('/campus/settings/rota')
})

test('finishing the last step here offers Continue to the first project’s overview', async () => {
  vi.mocked(onboardingApi)
    .mockResolvedValueOnce(linked(5) as never)
    .mockResolvedValueOnce(linked(6) as never)
  render(<FirstRunProgress org="campus" />)
  await screen.findByRole('list')
  // The channel was connected on this page: the page says so, and the steps read again.
  window.dispatchEvent(new Event('onboarding:changed'))
  expect(await screen.findByText('6 of 6 steps complete')).toBeTruthy()
  const link = screen.getByRole('link', { name: /^Continue/ })
  expect(link.getAttribute('href')).toBe('/campus/bukit-jalil?first-run=done')
  expect(screen.queryByRole('button', { name: /^Skip this step/ })).toBeNull()
})

test('skipping the last step finishes the first run there too', async () => {
  vi.mocked(onboardingApi)
    .mockResolvedValueOnce(linked(5) as never)
    .mockResolvedValueOnce(linked(5, ['channel']) as never)
  render(<FirstRunProgress org="campus" />)
  fireEvent.click(await screen.findByRole('button', { name: /^Skip this step/ }))
  expect(await screen.findByText('6 of 6 steps complete')).toBeTruthy()
  expect(screen.getByRole('link', { name: /^Continue/ }).getAttribute('href')).toBe(
    '/campus/bukit-jalil?first-run=done'
  )
})

test('a first run finished before this page opened shows nothing, unless this is where it lands', async () => {
  vi.mocked(onboardingApi).mockResolvedValue(linked(6) as never)
  const { container } = render(<FirstRunProgress org="campus" />)
  await waitFor(() => expect(container.querySelector('[aria-busy]')).toBeNull())
  expect(container.textContent).toBe('')
  cleanup()
  render(
    <FirstRunProgress
      org="campus"
      next={{ sentence: 'Next, ask for a call.', action: <button type="button" aria-label="Ask for a call" /> }}
    />
  )
  expect(await screen.findByText('6 of 6 steps complete')).toBeTruthy()
  expect(screen.getByText(/Next, ask for a call\./)).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Ask for a call' })).toBeTruthy()
  expect(screen.queryByRole('link', { name: /^Continue/ })).toBeNull()
})
