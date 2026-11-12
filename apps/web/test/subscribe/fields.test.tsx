import { renderToStaticMarkup } from 'react-dom/server'
import type { Window } from '@skyclause/contracts'
import { expect, test } from 'vitest'
import { Fields, type SubscriberFields } from '../../features/subscribe/fields'

const value: SubscriberFields = { email: '', role: '', window_ids: [], channels: ['email'], language: 'en' }
const window = (id: string, starts_at: string, ends_at: string): Window =>
  ({ id, title: `Window ${id}`, starts_at, ends_at, kind: 'class', tz: 'Asia/Kuala_Lumpur' }) as Window

const render = (locale: 'en' | 'ms', windows: Window[] = [], preferences = false) =>
  renderToStaticMarkup(
    <Fields
      value={value}
      windows={windows}
      preferences={preferences}
      disabled={false}
      locale={locale}
      onChange={() => undefined}
    />
  )

test('every field has a label, a name, an autocomplete and the keyboard its content needs (#691)', () => {
  const html = render('en')
  const input = (name: string) => html.match(new RegExp(`<(?:input|select)[^>]*name="${name}"[^>]*>`))![0]

  expect(input('email')).toMatch(/type="email"/)
  expect(input('email')).toMatch(/autoComplete="email"/i)
  expect(input('email')).toMatch(/spellCheck="false"/i)
  expect(input('email')).toMatch(/inputMode="email"/i)
  expect(input('role')).toMatch(/autoComplete="organization-title"/i)
  expect(input('language')).toMatch(/autoComplete="language"/i)
  expect(html.match(/<label for=/g)).toHaveLength(3)
})

test('a window shows its day and both times, each followed by MYT', () => {
  const same = render('en', [window('a', '2026-11-13T00:30:00Z', '2026-11-13T03:00:00Z')])
  const overnight = render('en', [window('b', '2026-11-13T15:00:00Z', '2026-11-13T17:00:00Z')])

  expect(same).toContain('08:30 MYT to 11:00 MYT')
  // 23:00 MYT to 01:00 MYT the next day: the end carries its own day.
  expect(overnight).toMatch(/23:00 MYT to .*, 01:00 MYT/)
  expect(render('ms', [window('a', '2026-11-13T00:30:00Z', '2026-11-13T03:00:00Z')])).toContain(
    '08:30 MYT hingga 11:00 MYT'
  )
})

test('channels appear only once the subscriber has preferences', () => {
  expect(render('en')).not.toContain('name="channels"')
  expect(render('en', [], true).match(/name="channels"/g)).toHaveLength(4)
})
