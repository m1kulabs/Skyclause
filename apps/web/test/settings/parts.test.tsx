// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { Input } from '#ui/input'
import {
  SettingsAside,
  SettingsField,
  SettingsLoading,
  SettingsPart,
  SettingsRowMenu,
  SettingsRowMenuItem,
  SettingsStatus,
  SettingsSwitchRow,
  focusPartHeading
} from '../../features/settings/parts'
import '../../features/settings/catalogue'

afterEach(cleanup)

test('a field ties its label, its visible limit and its error to the control', () => {
  render(
    <SettingsField label="Name" hint="Up to 100 characters." error="The name could not be saved.">
      {(aria) => <Input {...aria} name="name" />}
    </SettingsField>
  )
  const input = screen.getByLabelText('Name')
  expect(input.getAttribute('aria-invalid')).toBe('true')
  const described = (input.getAttribute('aria-describedby') ?? '').split(' ')
  expect(described).toHaveLength(2)
  const [hint, error] = described.map((id) => document.getElementById(id))
  expect(hint?.textContent).toBe('Up to 100 characters.')
  expect(error?.getAttribute('role')).toBe('alert')
  expect(error?.textContent).toBe('The name could not be saved.')
})

test('a field with no error and no limit is described by nothing and is not invalid', () => {
  render(<SettingsField label="Email">{(aria) => <Input {...aria} name="email" />}</SettingsField>)
  const input = screen.getByLabelText('Email')
  expect(input.hasAttribute('aria-describedby')).toBe(false)
  expect(input.hasAttribute('aria-invalid')).toBe(false)
})

test('a switch row names its switch, ties its description and prints the state in words', () => {
  render(
    <SettingsSwitchRow
      title="Keyboard shortcuts"
      description="Allow single-key actions."
      state="On"
      checked
      onCheckedChange={() => undefined}
    />
  )
  const toggle = screen.getByRole('switch', { name: 'Keyboard shortcuts' })
  expect(toggle.getAttribute('aria-checked')).toBe('true')
  expect(document.getElementById(toggle.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
    'Allow single-key actions.'
  )
  expect(screen.getByText('On')).toBeDefined()
})

test('an aside moves into the frame’s label column and renders nothing in the panel', () => {
  render(
    <>
      <div data-settings-aside />
      <div data-testid="panel">
        <SettingsAside>
          <p data-summary />
        </SettingsAside>
      </div>
    </>
  )
  expect(screen.getByTestId('panel').textContent).toBe('')
  expect(document.querySelector('[data-settings-aside] [data-summary]')).not.toBeNull()
})

test('a status region is mounted before its message so the message is announced', () => {
  const { rerender } = render(<SettingsStatus>{null}</SettingsStatus>)
  const region = screen.getByRole('status')
  expect(region.textContent).toBe('')
  const saved = ['Saved']
  rerender(<SettingsStatus>{saved}</SettingsStatus>)
  expect(screen.getByRole('status')).toBe(region)
  expect(region.textContent).toBe('Saved')
})

test('loading carries its words for assistive technology next to the skeleton', () => {
  render(
    <SettingsLoading locale="ms">
      <div data-skeleton />
    </SettingsLoading>
  )
  expect(screen.getByRole('status').textContent).toBe('Memuatkan…')
})

test('a part heading takes focus by its id, so a removed row leaves focus somewhere', () => {
  render(<SettingsPart title="Share links" id="links-heading" />)
  focusPartHeading('links-heading')
  expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Share links' }))
})

test('a row menu names its row and runs the chosen action', async () => {
  const onRemove = vi.fn()
  const removeLabel = ['Remove']
  render(
    <SettingsRowMenu label="More actions for Aisha Rahman">
      <SettingsRowMenuItem destructive onSelect={onRemove}>
        {removeLabel}
      </SettingsRowMenuItem>
    </SettingsRowMenu>
  )
  const trigger = screen.getByRole('button', { name: 'More actions for Aisha Rahman' })
  fireEvent.pointerDown(trigger, { pointerType: 'mouse' })
  fireEvent.click(trigger)
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove' }))
  expect(onRemove).toHaveBeenCalledTimes(1)
})
