// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { t as onboarding } from '../../features/onboarding/catalogue'
import { onboardingApi } from '../../features/onboarding/operations'
import { sourcesApi, type BoundSourceView } from '../../features/sources/operations'
import Panel from '../../features/settings/project/packs/panel'
import { ApiProblem } from '../../lib/api-fetch'

vi.mock('../../features/onboarding/operations', () => ({ onboardingApi: vi.fn() }))
vi.mock('../../features/sources/operations', () => ({ sourcesApi: vi.fn() }))
vi.mock('../../features/onboarding/first-run-progress', () => ({ FirstRunProgress: () => null }))
vi.mock('../../features/sources/source-picker', () => ({ SourcePicker: () => null }))

const source = (id: string, role: BoundSourceView['role'], externalId = id): BoundSourceView => ({
  id,
  kind: 'apims',
  external_id: externalId,
  owner_org_id: null,
  name: `Station ${externalId}`,
  lat: null,
  lon: null,
  url: 'https://source.example.test/',
  cadence_s: 900,
  stale_after_s: 7200,
  licence_id: null,
  licence_label: 'no published terms',
  project_id: 'project',
  role,
  state: null,
  latest_reading: null,
  age_s: null,
  recent_errors: []
})

let bound: BoundSourceView[] = []
const project = {
  id: 'project',
  slug: 'campus',
  name: 'Campus',
  site_lat: null,
  site_lon: null,
  packs: [
    { pack: 'sky', enabled: true },
    { pack: 'crowd', enabled: false }
  ]
}

beforeEach(() => {
  bound = []
  vi.mocked(onboardingApi).mockResolvedValue({ data: [project], next_cursor: null } as never)
  vi.mocked(sourcesApi).mockImplementation((async (operation: string) => {
    if (operation === 'listProjectSources') return { data: bound, next_cursor: null }
    if (operation === 'unbindSource') {
      bound = bound.slice(1)
      return undefined
    }
    if (operation === 'createDevice') throw new Error('not reached')
    return { pack: 'crowd', enabled: true }
  }) as never)
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

test('?pack=crowd opens the confirm every other switch uses and turns nothing on by itself', async () => {
  bound = [source('rail', 'rail_station'), source('venue', 'venue_listings')]
  render(<Panel org="org" project="campus" initialPack="crowd" />)
  const dialog = await screen.findByRole('alertdialog')
  expect(dialog.textContent).toContain('Turn on Crowd for “Campus”')
  expect(sourcesApi).not.toHaveBeenCalledWith('updateProjectPack', expect.anything())
})

test('a refused pack change is worded from the catalogue, never the API’s detail', async () => {
  const detail = 'not built: owned by d-org-api'
  bound = [source('rail', 'rail_station'), source('venue', 'venue_listings')]
  vi.mocked(sourcesApi).mockImplementation((async (operation: string) => {
    if (operation === 'listProjectSources') return { data: bound, next_cursor: null }
    if (operation === 'updateProjectPack')
      throw new ApiProblem(500, { type: 'about:blank', title: 'Server error', status: 500, detail })
    return undefined
  }) as never)
  render(<Panel org="org" project="campus" initialPack="crowd" />)
  const dialog = await screen.findByRole('alertdialog')
  fireEvent.click(within(dialog).getByRole('button', { name: /^Turn on Crowd for/ }))
  expect(await screen.findByText(onboarding('onboarding.save_error_generic'))).toBeTruthy()
  expect(document.body.textContent).not.toContain(detail)
})

test('unbinding a source puts focus on the sources heading, where the removed row was', async () => {
  bound = [source('a', 'rain_gauge', 'CA16W'), source('b', 'rain_gauge', 'CA17W')]
  render(<Panel org="org" project="campus" />)
  fireEvent.click(await screen.findByRole('button', { name: /CA16W/ }))
  const dialog = await screen.findByRole('alertdialog')
  fireEvent.click(within(dialog).getByRole('button', { name: /^Unbind source/ }))
  await waitFor(() => expect(sourcesApi).toHaveBeenCalledWith('unbindSource', expect.anything()))
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: onboarding('onboarding.sources_bound') }))
  )
})

test('bound sources are shown 50 at a time', async () => {
  bound = Array.from({ length: 60 }, (_, index) => source(`s${index}`, 'rain_gauge', `ST${index}`))
  render(<Panel org="org" project="campus" />)
  await screen.findByText('Sources 1–50 of 60')
  expect(screen.getAllByRole('button', { name: /^Unbind ST/ })).toHaveLength(50)
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
  expect(screen.getAllByRole('button', { name: /^Unbind ST/ })).toHaveLength(10)
})

test('the panel is written in the request language', async () => {
  render(<Panel org="org" project="campus" locale="ms" />)
  expect(await screen.findByRole('heading', { name: onboarding('onboarding.packs', {}, 'ms') })).toBeDefined()
})

test('without a createDevice handler the panel offers no Devices part, so nothing can fail to save', async () => {
  render(<Panel org="org" project="campus" devices={false} />)
  expect(await screen.findByRole('heading', { name: onboarding('onboarding.packs') })).toBeDefined()
  expect(screen.queryByRole('heading', { name: onboarding('onboarding.devices') })).toBeNull()
  expect(screen.queryByRole('button', { name: onboarding('onboarding.add_device') })).toBeNull()
})

test('a device needs a name: the empty submit says so, keeps the form open and focuses the field', async () => {
  render(<Panel org="org" project="campus" devices />)
  fireEvent.click(await screen.findByRole('button', { name: onboarding('onboarding.add_device') }))
  const name = (await screen.findByLabelText(onboarding('onboarding.device_name'))) as HTMLInputElement
  expect(name.maxLength).toBe(80)
  fireEvent.submit(name.closest('form')!)
  expect((await screen.findByRole('alert')).textContent).toBe('Enter a name for the device.')
  expect(document.activeElement).toBe(name)
  expect(name.getAttribute('aria-invalid')).toBe('true')
  expect(sourcesApi).not.toHaveBeenCalledWith('createDevice', expect.anything())
})
