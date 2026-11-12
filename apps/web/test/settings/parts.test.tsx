// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { Input } from '#ui/input'
import { SettingsAside, SettingsField, SettingsSwitchRow } from '../../features/settings/parts'

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
