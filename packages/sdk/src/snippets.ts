import { OPERATIONS, type OperationArguments, type OperationId, type OperationRequests } from './generated'
import { buildOperationUrl } from './client'

export interface SnippetSet {
  curl: string
  typescript: string
  python: string
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

function pythonLiteral(value: string): string {
  return JSON.stringify(value)
}

function requestTypeScript(request: RuntimeRequest): string {
  if (!Object.keys(request).length) return ''
  return `(${JSON.stringify(request)})`
}

interface RuntimeRequest {
  params?: Record<string, unknown>
  query?: Record<string, unknown>
  body?: unknown
}

export function snippets<Id extends OperationId>(
  operationId: Id,
  request: OperationRequests[Id] = {} as OperationRequests[Id]
): SnippetSet {
  const operation = OPERATIONS[operationId]
  const runtimeRequest = request as RuntimeRequest
  const url = buildOperationUrl('https://api.skyclause.m1ku.tech/v1', operation.path, runtimeRequest).toString()
  const headers: Record<string, string> = { Accept: operation.eventStream ? 'text/event-stream' : 'application/json' }
  if (runtimeRequest.body !== undefined) headers['Content-Type'] = 'application/json'
  if (operation.method === 'POST' && operation.idempotent) headers['Idempotency-Key'] = '<generated-per-request>'
  headers.Authorization = 'Bearer YOUR_SKYCLAUSE_TOKEN'

  const curlLines = [
    `curl ${operation.eventStream ? '--no-buffer ' : ''}--request ${operation.method} ${shellQuote(url)}`
  ]
  for (const [name, value] of Object.entries(headers)) curlLines.push(`  --header ${shellQuote(`${name}: ${value}`)}`)
  if (runtimeRequest.body !== undefined)
    curlLines.push(`  --data-raw ${shellQuote(JSON.stringify(runtimeRequest.body))}`)

  const methodCall = operation.eventStream
    ? `sdk.stream(${JSON.stringify(operationId)}${requestTypeScript(runtimeRequest) ? `, ${requestTypeScript(runtimeRequest)}` : ''})`
    : `sdk.${operationId}${requestTypeScript(runtimeRequest)}`
  const typescript = [
    "import { createSdk } from '@skyclause/sdk'",
    '',
    "const sdk = createSdk({ token: 'YOUR_SKYCLAUSE_TOKEN', organization: 'YOUR_ORGANIZATION' })",
    ...(operation.eventStream
      ? [`for await (const event of ${methodCall}) {`, '  console.log(event)', '}']
      : [`const result = await ${methodCall}`, 'console.log(result)']),
    ''
  ].join('\n')

  const pythonHeaders: Record<string, string> = { Accept: String(headers.Accept) }
  pythonHeaders.Authorization = String(headers.Authorization)
  pythonHeaders['Skyclause-Organization'] = 'YOUR_ORGANIZATION'
  if (runtimeRequest.body !== undefined) pythonHeaders['Content-Type'] = 'application/json'
  if (operation.method === 'POST' && operation.idempotent) {
    pythonHeaders['Idempotency-Key'] = '<generated-per-request>'
  }
  const python = [
    'import json',
    ...(operation.method === 'POST' && operation.idempotent ? ['import uuid'] : []),
    'from urllib.request import Request, urlopen',
    '',
    `url = ${pythonLiteral(url)}`,
    `headers = ${JSON.stringify(pythonHeaders, null, 2)}`,
    ...(operation.method === 'POST' && operation.idempotent ? ["headers['Idempotency-Key'] = str(uuid.uuid4())"] : []),
    `body = ${runtimeRequest.body === undefined ? 'None' : `json.dumps(json.loads(${pythonLiteral(JSON.stringify(runtimeRequest.body))})).encode('utf-8')`}`,
    `request = Request(url, data=body, headers=headers, method=${pythonLiteral(operation.method)})`,
    'with urlopen(request) as response:',
    '    print(response.read().decode("utf-8"))',
    ''
  ].join('\n')

  return { curl: curlLines.join(' \\\n') + '\n', typescript, python }
}

export type SnippetArguments<Id extends OperationId> = OperationArguments[Id]
