# `@skyclause/sdk`

Typed ESM client for the Skyclause `/v1` API. The client and operation schemas are generated from the committed `packages/api/openapi.json` document. The package stays inside the repository workspace and is not published to a registry.

## Install in the workspace

Add the workspace dependency to an app or package:

```json
{
  "dependencies": {
    "@skyclause/sdk": "workspace:*"
  }
}
```

The SDK targets Node 22+, Bun, Deno, browsers, and edge runtimes. It uses Web Platform APIs and does not import Node built-ins.

## Create a client

```ts
import { createSdk } from '@skyclause/sdk'

const sdk = createSdk({
  token: process.env.SKYCLAUSE_TOKEN,
  organization: 'my-organization'
})

const project = await sdk.getProject({ params: { id: 'project-id' } })
```

`baseUrl` defaults to `https://api.skyclause.m1ku.tech/v1`. Pass `fetch` to use a custom transport, including an in-process client. `token` accepts an API key, guest token, OAuth access token, or session token; all are sent as bearer credentials. `organization` sets `Skyclause-Organization`. A response with `Deprecation` calls `onDeprecation({ operationId, deprecation, sunset, link })`; without a callback, the SDK warns once per deprecated operation in the process.

Each OpenAPI `operationId` is a typed SDK method. Methods accept `{ params?, query?, body?, signal? }` as appropriate. The generated `OperationRequests` and `OperationResponses` types are exported for application code. Creating POST operations receive an `Idempotency-Key`; the SDK reuses it for its own retries. GET, DELETE, and keyed POST requests retry up to three times after 429 and 5xx responses.

## Pagination and event streams

Use `paginate` with an operation that returns `{ data, next_cursor }`:

```ts
for await (const reading of sdk.paginate((cursor) =>
  sdk.listSourceReadings({ params: { id: 'source-id' }, query: { cursor } })
)) {
  consume(reading)
}
```

Use `stream` with one of the generated event-stream operation IDs. It parses SSE events, reconnects with `Last-Event-ID`, and backs off between 1 and 30 seconds with jitter:

```ts
for await (const event of sdk.stream('streamReadings', { params: { id: 'source-id' } })) {
  consume(event)
}
```

`AbortSignal` stops requests and stream reconnection. Webhook signatures can be checked with `await sdk.webhooks.verify(rawBody, headers, secret)`. The whole UTF-8 webhook secret is used as the HMAC key.

## Errors and source states

Non-success API problems throw an error class for their problem slug. Source errors use `SourceError`, with `sourceId` and `since` properties. A reading whose source failed remains structured data: inspect its `state`, `since`, and `source_id` fields rather than treating the value as a successful reading.

No operation in the SDK approves, publishes, or sends anything. It exposes only `/v1` operations from the committed OpenAPI document.

## OpenAPI and snippets

Import the committed document and operation schemas from `@skyclause/sdk/openapi` and `@skyclause/sdk/openapi/schemas/<operationId>`. `OPENAPI_SHA256` in the generated client identifies the exact source document. Import `snippets` from `@skyclause/sdk/snippets` to produce curl, TypeScript, and Python examples for an operation request. The Python snippet uses only the standard library.

After changing the API's committed `openapi.json`, run `bun run --filter @skyclause/sdk generate`, then `bun run --filter @skyclause/sdk build`. `bun run test` checks generated output for drift.
