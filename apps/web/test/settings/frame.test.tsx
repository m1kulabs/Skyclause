import { renderToStaticMarkup } from 'react-dom/server'
import type { Principal, Role } from '@skyclause/contracts'
import { expect, test } from 'vitest'
import { SettingsFrame } from '../../features/settings/frame'

function session(role: Role, orgId: string | null = 'org-test'): Principal {
  return {
    kind: 'session',
    client: 'app',
    clientName: null,
    via: 'cookie',
    accountId: 'account-test',
    sessionId: 'session-test',
    authenticatedAt: new Date(),
    staff: false,
    role,
    isGuest: false,
    orgId
  }
}

test('the frame sets the scope title as the h1, lists its sections quietly and marks the current one twice', () => {
  const markup = renderToStaticMarkup(
    <SettingsFrame scope="organisation" section="members" principal={session('admin')} org="org-test">
      <p />
    </SettingsFrame>
  )
  expect(markup.match(/<h1\b/g)).toHaveLength(1)
  expect(markup).toContain('Organisation settings')
  expect(markup).toContain('data-settings-nav')
  expect(markup).toContain('data-settings-columns')
  expect(markup).toContain('data-settings-label')
  expect(markup).toContain('data-settings-panel')
  expect(markup).toContain('data-settings-aside')
  // Ten sections for an admin, one of them current: by aria-current and the capsule mark, not by colour alone.
  expect(markup.match(/<li>/g)).toHaveLength(10)
  expect(markup.match(/aria-current="page"/g)).toHaveLength(1)
  expect(markup).toMatch(/aria-current="page"[^>]*>|class="[^"]*current-mark[^"]*"[^>]*aria-current="page"/)
  // No rules between sections: the frame draws none.
  expect(markup).not.toContain('data-slot="separator"')
})

test('the frame keeps role filtering: an Approver is offered only the rota', () => {
  const markup = renderToStaticMarkup(
    <SettingsFrame scope="organisation" section="rota" principal={session('approver')} org="org-test">
      <p />
    </SettingsFrame>
  )
  expect(markup.match(/<li>/g)).toHaveLength(1)
  expect(markup).toContain('/org-test/settings/rota')
  expect(markup).not.toContain('/org-test/settings/members')
})

test('the frame is written in Malay on request', () => {
  const markup = renderToStaticMarkup(
    <SettingsFrame scope="account" section="profile" principal={session('viewer', null)} locale="ms">
      <p />
    </SettingsFrame>
  )
  expect(markup).toContain('Tetapan akaun')
  expect(markup).toContain('Profil')
})

test('a wide section leaves the two columns: its title above it and the panel across the whole column', () => {
  const split = renderToStaticMarkup(
    <SettingsFrame scope="organisation" section="audit" principal={session('admin')} org="org-test">
      <p />
    </SettingsFrame>
  )
  const wide = renderToStaticMarkup(
    <SettingsFrame scope="organisation" section="audit" principal={session('admin')} org="org-test" wide>
      <p />
    </SettingsFrame>
  )
  expect(split).not.toContain('data-wide')
  expect(wide).toContain('data-wide')
  // The label, the aside and the panel are still all there, in the same order: only the layout changes.
  expect(wide.indexOf('data-settings-label')).toBeLessThan(wide.indexOf('data-settings-panel'))
  expect(wide.match(/<h2\b/g)).toHaveLength(1)
})
