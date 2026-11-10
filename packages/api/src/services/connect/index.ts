import type { VerificationTarget } from '@skyclause/db'

export const CONNECT_FORMAT_CHECKED_AT = '2026-11-10'

export interface ConnectConfigVariant {
  transport: 'http' | 'stdio'
  config: string
  docs_url: string
  checked_at: string
}

export interface OAuthAuthorizationMetadata {
  authorizationEndpoint: string
  tokenEndpoint: string
}

const docs = {
  claudeAi: 'https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp',
  claudeDesktopRemote:
    'https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp',
  claudeDesktopStdio:
    'https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop',
  claudeCode: 'https://code.claude.com/docs/en/mcp',
  chatgpt: 'https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt',
  geminiCli: 'https://geminicli.com/docs/tools/mcp-server/',
  geminiEnterprise:
    'https://docs.cloud.google.com/gemini/enterprise/docs/connectors/custom-mcp-server/set-up-custom-mcp-server',
  cursor: 'https://cursor.com/docs/mcp',
  vscode: 'https://code.visualstudio.com/docs/agents/reference/mcp-configuration'
} as const

const dated = (transport: ConnectConfigVariant['transport'], config: string, docsUrl: string) => ({
  transport,
  config,
  docs_url: docsUrl,
  checked_at: CONNECT_FORMAT_CHECKED_AT
})

const json = (value: unknown) => JSON.stringify(value, null, 2)

function stdioConfig(client: VerificationTarget): ConnectConfigVariant {
  const entry = { command: 'skyclause', args: ['mcp'] }
  switch (client) {
    case 'claude_desktop':
      return dated('stdio', json({ mcpServers: { skyclause: entry } }), docs.claudeDesktopStdio)
    case 'claude_code':
      return dated('stdio', 'claude mcp add --transport stdio skyclause -- skyclause mcp', docs.claudeCode)
    case 'gemini_cli':
      return dated('stdio', json({ mcpServers: { skyclause: entry } }), docs.geminiCli)
    case 'cursor':
      return dated('stdio', json({ mcpServers: { skyclause: entry } }), docs.cursor)
    case 'vscode':
      return dated('stdio', json({ servers: { skyclause: { type: 'stdio', ...entry } } }), docs.vscode)
    default:
      throw new Error(`${client} does not support stdio MCP configs`)
  }
}

function httpConfig(
  client: VerificationTarget,
  serverUrl: string,
  options: {
    appOrigin: string | undefined
    organizationRef: string
    clientId: string | null
    metadata: OAuthAuthorizationMetadata | null
  }
): ConnectConfigVariant {
  switch (client) {
    case 'claude_ai':
      // Claude's current connector UI asks for the URL and starts its OAuth flow after discovery.
      return dated('http', `Server URL: ${serverUrl}\nAuthentication: OAuth`, docs.claudeAi)
    case 'claude_desktop':
      // Remote connectors use the same account-level URL/OAuth flow as Claude.
      return dated('http', `Server URL: ${serverUrl}\nAuthentication: OAuth`, docs.claudeDesktopRemote)
    case 'claude_code':
      return dated('http', `claude mcp add --transport http skyclause ${serverUrl}`, docs.claudeCode)
    case 'chatgpt':
      return dated('http', `Server URL: ${serverUrl}\nAuthentication: OAuth`, docs.chatgpt)
    case 'gemini_cli':
      return dated('http', json({ mcpServers: { skyclause: { httpUrl: serverUrl } } }), docs.geminiCli)
    case 'gemini_enterprise': {
      if (!options.metadata) throw new Error('Gemini Enterprise OAuth metadata is required')
      const clientId = options.clientId
        ? options.clientId
        : `Set up the organisation client at ${new URL(`/${encodeURIComponent(options.organizationRef)}/settings/integrations`, options.appOrigin).toString()}`
      return dated(
        'http',
        [
          `MCP Server URL: ${serverUrl}`,
          `Authorization URL: ${options.metadata.authorizationEndpoint}`,
          `Token URL: ${options.metadata.tokenEndpoint}`,
          'Scopes: read draft',
          `Client ID: ${clientId}`
        ].join('\n'),
        docs.geminiEnterprise
      )
    }
    case 'cursor':
      return dated('http', json({ mcpServers: { skyclause: { url: serverUrl } } }), docs.cursor)
    case 'vscode':
      return dated('http', json({ servers: { skyclause: { type: 'http', url: serverUrl } } }), docs.vscode)
  }
}

/**
 * Generate copyable configs from each client's documented transport shape. Docs URLs above were checked on
 * 2026-11-10. OAuth is discovered or started in the client; no static key, bearer token, or auth header is emitted.
 * Official formats: Anthropic's remote connectors, Claude Desktop local servers, and Claude Code MCP docs; OpenAI's
 * ChatGPT custom server docs; Google's Gemini CLI and Gemini Enterprise docs; Cursor MCP docs; VS Code MCP reference.
 */
export function connectConfigVariants(input: {
  target: VerificationTarget
  mcpOrigin: string
  appOrigin: string | undefined
  organizationRef: string
  clientId: string | null
  metadata: OAuthAuthorizationMetadata | null
}): ConnectConfigVariant[] {
  const serverUrl = new URL('/mcp', input.mcpOrigin).toString()
  const variants: ConnectConfigVariant[] = [
    httpConfig(input.target, serverUrl, {
      appOrigin: input.appOrigin,
      organizationRef: input.organizationRef,
      clientId: input.clientId,
      metadata: input.metadata
    })
  ]
  if (['claude_desktop', 'claude_code', 'gemini_cli', 'cursor', 'vscode'].includes(input.target)) {
    variants.push(stdioConfig(input.target))
  }
  return variants
}

const requiredMetadataUrl = (value: unknown, key: string) => {
  if (typeof value !== 'string') throw new Error(`OAuth metadata is missing ${key}`)
  const url = new URL(value)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error(`OAuth metadata ${key} must use HTTP(S)`)
  return url.toString()
}

/** Read the live authorization-server metadata. Failure is surfaced to the route; endpoints are never defaulted. */
export async function fetchOAuthAuthorizationMetadata(
  appOrigin: string | undefined,
  fetcher: typeof fetch = fetch
): Promise<OAuthAuthorizationMetadata> {
  if (!appOrigin) throw new Error('APP_ORIGIN is not configured for OAuth metadata discovery')
  const endpoint = new URL('/.well-known/oauth-authorization-server', appOrigin)
  const response = await fetcher(endpoint, {
    headers: { accept: 'application/json', 'cache-control': 'no-cache' },
    signal: AbortSignal.timeout(10_000)
  })
  if (!response.ok) throw new Error(`OAuth metadata request failed with status ${response.status}`)
  const metadata: unknown = await response.json()
  if (!metadata || typeof metadata !== 'object') throw new Error('OAuth metadata response is not an object')
  const fields = metadata as Record<string, unknown>
  return {
    authorizationEndpoint: requiredMetadataUrl(fields.authorization_endpoint, 'authorization_endpoint'),
    tokenEndpoint: requiredMetadataUrl(fields.token_endpoint, 'token_endpoint')
  }
}

export function verificationStatus(record: { result: string; testedAt: Date } | undefined, now: Date) {
  if (!record || record.result !== 'pass') return 'not_verified' as const
  return now.getTime() - record.testedAt.getTime() <= 90 * 24 * 60 * 60 * 1000
    ? ('verified' as const)
    : ('reverify_due' as const)
}
