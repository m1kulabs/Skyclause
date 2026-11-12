// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { ConnectPanel } from '../../features/connect/panel'

const push = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  )
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  push.mockReset()
})

function stubServer(tools: Array<{ name: string; description: string; scopes: string[] }>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('tools.json')) return Response.json({ tools })
      if (url.includes('/config'))
        return Response.json({ target: 'claude_ai', transport: 'remote', config: '{"mcpServers":{}}', tools: [] })
      return Response.json({ data: [], next_cursor: null })
    })
  )
}

const mcpOrigin = 'https://mcp.example.test'

test('changing the connection method navigates in place instead of reloading the page', async () => {
  stubServer([])
  render(<ConnectPanel target="claude_ai" transport="remote" mcpOrigin={mcpOrigin} orgId={null} />)
  const stdio = await screen.findByRole('radio', { name: 'Local stdio' })
  fireEvent.click(stdio)
  expect(push).toHaveBeenCalledWith('/connect?target=claude_ai&transport=stdio')
})

test('the tool list is the shared table, one row a tool and never more than 50', async () => {
  const tools = Array.from({ length: 60 }, (_, index) => ({
    name: `tool_${index}`,
    description: `Does thing ${index}`,
    scopes: index === 0 ? ['draft', 'read'] : ['read']
  }))
  stubServer(tools)
  render(<ConnectPanel target="claude_ai" transport="remote" mcpOrigin={mcpOrigin} orgId={null} />)
  const table = await waitFor(() => {
    const found = document.querySelector<HTMLElement>('.connect-tools')
    if (!found) throw new Error('not yet')
    return found
  })
  expect(table.getAttribute('data-slot')).toBe('table')
  expect(within(table).getAllByRole('row')).toHaveLength(51)
  expect(within(table).getByText('tool_0').closest('td')?.getAttribute('title')).toBe('tool_0')
  expect(within(table).getByText('Draft and Read')).toBeInTheDocument()
})

test('the page is written in the language it is given, dates and times included', async () => {
  stubServer([{ name: 'inspect', description: 'Inspect', scopes: ['read'] }])
  render(<ConnectPanel target="claude_ai" transport="remote" mcpOrigin={mcpOrigin} orgId={null} locale="ms" />)
  expect(await screen.findByRole('heading', { level: 1, name: 'Sambungkan AI anda' })).toBeInTheDocument()
  expect(screen.queryByText(/targets verified/)).toBeNull()
  expect(await screen.findByText('Baca')).toBeInTheDocument()
})
