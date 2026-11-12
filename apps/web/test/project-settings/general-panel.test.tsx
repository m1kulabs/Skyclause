// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { t } from '../../features/project-settings/catalogue'
import Panel from '../../features/settings/project/general/panel'

vi.mock('next/navigation', () => ({ useParams: () => ({ org: 'campus-org', project: 'bukit-jalil' }) }))

const project = {
  id: 'project-1',
  org_id: 'org-1',
  name: 'Bukit Jalil campus',
  slug: 'bukit-jalil',
  time_zone: 'Asia/Kuala_Lumpur',
  public: false,
  semester_ends_on: null,
  site_name: null,
  site_lat: 3.05,
  site_lon: 101.69,
  archived_at: null,
  camera_day_start: null,
  camera_day_end: null,
  warning_area_terms: [],
  packs: [
    { pack: 'sky', enabled: true, sheet_id: 'sheet-sky', schedule: null, sla_s: 600 },
    { pack: 'crowd', enabled: true, sheet_id: 'sheet-crowd', schedule: null, sla_s: 7200 }
  ]
}

const api = vi.hoisted(() => vi.fn())
vi.mock('../../features/project-settings/operations', async (original) => {
  const actual = await original<typeof import('../../features/project-settings/operations')>()
  return { ...actual, projectSettingsApi: api, resolveProject: async () => project }
})

beforeEach(() => {
  api.mockImplementation(async (operation: string, args?: { body?: { sla_s?: number } }) => {
    if (operation === 'updateProjectPack') return { pack: 'sky', enabled: true, sla_s: args?.body?.sla_s }
    throw new Error(`unexpected operation ${operation}`)
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const skyField = () => screen.findByLabelText('Sky review deadline') as Promise<HTMLInputElement>
const skySave = () => within(document.querySelector('[data-sla-pack="sky"]') as HTMLElement).getByRole('button')

test('a deadline can be cleared and retyped, and is checked on blur and on save', async () => {
  render(<Panel />)
  const field = await skyField()
  expect(field.value).toBe('10')
  fireEvent.change(field, { target: { value: '' } })
  // Nothing is put back while the field is empty: the old clamp turned a cleared field into 1 on every keystroke.
  expect(field.value).toBe('')
  fireEvent.blur(field)
  expect(screen.getByRole('alert').textContent).toBe('Enter a whole number of minutes, at least 1.')
  fireEvent.change(field, { target: { value: '2' } })
  expect(field.value).toBe('2')
  expect(screen.queryByRole('alert')).toBeNull()
  fireEvent.change(field, { target: { value: '25' } })
  expect(field.value).toBe('25')
  // The limit is printed beside the field and tied to it.
  const hint = document.getElementById(field.getAttribute('aria-describedby')!.split(' ')[0]!)
  expect(hint?.textContent).toBe('Whole minutes, at least 1.')
})

test('saving an empty or fractional deadline shows the limit, keeps focus on the field and sends nothing', async () => {
  render(<Panel />)
  const field = await skyField()
  fireEvent.change(field, { target: { value: '0.5' } })
  fireEvent.submit(field.closest('form')!)
  expect(await screen.findByRole('alert')).toBeDefined()
  expect(document.activeElement).toBe(field)
  expect(field.getAttribute('aria-invalid')).toBe('true')
  expect(api).not.toHaveBeenCalledWith('updateProjectPack', expect.anything())
})

test('Enter in a deadline field saves it in seconds', async () => {
  render(<Panel />)
  const field = await skyField()
  fireEvent.change(field, { target: { value: '15' } })
  fireEvent.submit(field.closest('form')!)
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      'updateProjectPack',
      expect.objectContaining({ body: { enabled: true, sla_s: 900 } })
    )
  )
  // The number and its unit stay together: a no-break space joins them.
  expect((await screen.findByText(/^Saved .* 15 minutes$/)).textContent).toContain('15\u00a0minutes')
  expect(skySave().hasAttribute('disabled')).toBe(true)
})

test('leaving with an unsaved deadline or an edited field asks first', async () => {
  render(<Panel />)
  const field = await skyField()
  const quiet = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(quiet)
  expect(quiet.defaultPrevented).toBe(false)
  fireEvent.change(field, { target: { value: '15' } })
  const asked = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(asked)
  expect(asked.defaultPrevented).toBe(true)
})

test('the names are not autofilled as a job title or a company, and an unset site reads "Not set"', async () => {
  render(
    <>
      <div data-settings-aside />
      <Panel />
    </>
  )
  await skyField()
  expect((screen.getByLabelText('Project name') as HTMLInputElement).autocomplete).toBe('off')
  expect((screen.getByLabelText('Site name') as HTMLInputElement).autocomplete).toBe('off')
  expect((await screen.findAllByText('Not set')).length).toBeGreaterThan(0)
  const zone = screen.getByLabelText('Time zone')
  expect(document.getElementById(zone.getAttribute('aria-describedby')!)?.textContent).toBe(
    'An IANA name, for example Asia/Kuala_Lumpur.'
  )
})

test('archiving moves focus to Undo, and Undo moves it back to Archive', async () => {
  render(<Panel />)
  await skyField()
  fireEvent.click(screen.getByRole('button', { name: 'Archive project' }))
  const dialog = await screen.findByRole('alertdialog')
  fireEvent.click(within(dialog).getByRole('button', { name: /^Archive project “Bukit Jalil campus”$/ }))
  const undo = await screen.findByRole('button', { name: 'Undo' })
  await waitFor(() => expect(document.activeElement).toBe(undo))
  fireEvent.click(undo)
  const archive = await screen.findByRole('button', { name: 'Archive project' })
  await waitFor(() => expect(document.activeElement).toBe(archive))
})

test('the Malay copy says "Buat asal" for undo and "Belum ditetapkan" for an unset value', () => {
  expect(t('project-settings.undo', {}, 'ms')).toBe('Buat asal')
  expect(t('project-settings.missing', {}, 'ms')).toBe('Belum ditetapkan')
  expect(t('project-settings.value_unit', { value: 5, unit: 'minit' }, 'ms')).toBe('5 minit')
})
