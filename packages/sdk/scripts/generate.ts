import { format, resolveConfig } from 'prettier'

type JsonObject = Record<string, unknown>
type Operation = JsonObject & { operationId: string; parameters?: unknown[]; responses?: JsonObject }

const ALLOWED_HEADERS = new Set(['skyclause-organization', 'idempotency-key', 'last-event-id'])
const FORBIDDEN_OPERATION = /approve|publish|send/i
const JSON_SCHEMA = 'https://json-schema.org/draft/2020-12/schema'

function object(value: unknown): JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as JsonObject) : {}
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function propertyName(name: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name)
}

function literal(value: unknown): string {
  return JSON.stringify(value)
}

function schemaToType(value: unknown): string {
  const schema = object(value)
  const ref = string(schema.$ref)
  if (ref) {
    const prefix = '#/components/schemas/'
    return ref.startsWith(prefix)
      ? `OpenApiComponents['schemas'][${JSON.stringify(ref.slice(prefix.length).replaceAll('~1', '/').replaceAll('~0', '~'))}]`
      : 'unknown'
  }

  if (Array.isArray(schema.enum)) return schema.enum.map(literal).join(' | ') || 'never'
  if ('const' in schema) return literal(schema.const)

  const union = [...array(schema.anyOf), ...array(schema.oneOf)]
  if (union.length) return union.map(schemaToType).join(' | ')

  const intersection = array(schema.allOf)
  if (intersection.length) return intersection.map(schemaToType).join(' & ')

  const declaredTypes = Array.isArray(schema.type) ? schema.type : [schema.type]
  const types = declaredTypes.filter((type): type is string => typeof type === 'string')
  const nullable = types.includes('null') || schema.nullable === true
  const nonNullTypes = types.filter((type) => type !== 'null')
  let result: string

  if (nonNullTypes.includes('object') || schema.properties || schema.additionalProperties !== undefined) {
    const properties = object(schema.properties)
    const required = new Set(array(schema.required).filter((entry): entry is string => typeof entry === 'string'))
    const fields = Object.entries(properties).map(([key, property]) => {
      return `  ${propertyName(key)}${required.has(key) ? '' : '?'}: ${schemaToType(property)}`
    })
    const additional = schema.additionalProperties
    if (additional && additional !== true) {
      const record = `Record<string, ${schemaToType(additional)}>`
      result = fields.length ? `(${record} & {\n${fields.join(';\n')}\n})` : record
    } else {
      result = fields.length ? `{\n${fields.join(';\n')}\n}` : 'Record<string, unknown>'
    }
  } else if (nonNullTypes.includes('array') || schema.items || schema.prefixItems) {
    const prefixItems = array(schema.prefixItems)
    if (prefixItems.length) {
      const tuple = prefixItems.map(schemaToType)
      if (schema.items) tuple.push(`...${schemaToType(schema.items)}[]`)
      result = `[${tuple.join(', ')}]`
    } else {
      result = `Array<${schemaToType(schema.items)}>`
    }
  } else if (nonNullTypes.some((type) => type === 'string')) {
    result = 'string'
  } else if (nonNullTypes.some((type) => type === 'integer' || type === 'number')) {
    result = 'number'
  } else if (nonNullTypes.includes('boolean')) {
    result = 'boolean'
  } else if (types.includes('null') && !nonNullTypes.length) {
    result = 'null'
  } else if (!nonNullTypes.length) {
    result = 'unknown'
  } else {
    result = nonNullTypes
      .map((type) => {
        if (type === 'integer' || type === 'number') return 'number'
        if (type === 'string') return 'string'
        if (type === 'boolean') return 'boolean'
        if (type === 'null') return 'null'
        return 'unknown'
      })
      .join(' | ')
  }

  return nullable && result !== 'null' ? `${result} | null` : result
}

function resolveLocalRef(document: JsonObject, ref: string): unknown {
  if (!ref.startsWith('#/')) return undefined
  return ref
    .slice(2)
    .split('/')
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce<unknown>((value, part) => object(value)[part], document)
}

function dereferenceParameter(document: JsonObject, parameter: unknown): JsonObject {
  const value = object(parameter)
  const ref = string(value.$ref)
  return ref ? object(resolveLocalRef(document, ref)) : value
}

function operationRequestType(document: JsonObject, operation: Operation): { type: string; required: boolean } {
  const parameters = array(operation.parameters).map((parameter) => dereferenceParameter(document, parameter))
  const groups = new Map<string, Array<{ name: string; schema: unknown; required: boolean }>>()

  for (const parameter of parameters) {
    const location = string(parameter.in)
    const name = string(parameter.name)
    if (!location || !name) continue
    if (location === 'header') {
      if (!ALLOWED_HEADERS.has(name.toLowerCase())) {
        throw new Error(`OpenAPI operation ${operation.operationId} requests unsupported header ${name}`)
      }
      continue
    }
    if (location === 'cookie') throw new Error(`OpenAPI operation ${operation.operationId} requests a cookie`)
    const fields = groups.get(location) ?? []
    fields.push({ name, schema: parameter.schema, required: parameter.required === true })
    groups.set(location, fields)
  }

  const members: string[] = []
  let required = false
  for (const [location, fields] of groups) {
    const isPath = location === 'path'
    const objectSchema = {
      type: 'object',
      properties: Object.fromEntries(fields.map((field) => [field.name, field.schema ?? {}])),
      required: fields.filter((field) => field.required || isPath).map((field) => field.name),
      additionalProperties: false
    }
    const isRequired = isPath || fields.some((field) => field.required)
    members.push(
      `  ${location === 'path' ? 'params' : location}${isRequired ? '' : '?'}: ${schemaToType(objectSchema)}`
    )
    required ||= isRequired
  }

  const body = object(operation.requestBody)
  const requestContent = object(body.content)
  const bodySchemas = Object.values(requestContent)
    .map((content) => object(content).schema)
    .filter(Boolean)
  if (bodySchemas.length) {
    const bodyType = [...new Set(bodySchemas.map(schemaToType))].join(' | ')
    const isRequired = body.required === true
    members.push(`  body${isRequired ? '' : '?'}: ${bodyType}`)
    required ||= isRequired
  }

  members.push('  idempotencyKey?: string', '  signal?: AbortSignal')
  return { type: `{\n${members.join(';\n')}\n}`, required }
}

function responseType(operation: Operation): { type: string; eventStream: boolean } {
  const values: string[] = []
  let eventStream = false
  for (const [status, rawResponse] of Object.entries(object(operation.responses))) {
    const numericStatus = Number(status)
    if (numericStatus < 200 || numericStatus >= 300) continue
    const response = object(rawResponse)
    const content = object(response.content)
    if (!Object.keys(content).length) {
      values.push(numericStatus === 204 || numericStatus === 205 ? 'undefined' : 'unknown')
      continue
    }
    for (const [mediaType, rawMedia] of Object.entries(content)) {
      const schema = object(rawMedia).schema
      if (mediaType === 'text/event-stream') {
        eventStream = true
        values.push('Response')
      } else if (mediaType.includes('json')) {
        values.push(schemaToType(schema))
      } else if (mediaType.startsWith('text/')) {
        values.push('string')
      } else {
        values.push('ArrayBuffer')
      }
    }
  }
  return { type: [...new Set(values)].join(' | ') || 'undefined', eventStream }
}

function rewriteSchemaRefs(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(rewriteSchemaRefs)
  const source = object(value)
  if (!Object.keys(source).length) return value
  const result: JsonObject = {}
  for (const [key, child] of Object.entries(source)) {
    if (key === '$ref' && typeof child === 'string' && child.startsWith('#/components/')) {
      result[key] = `../openapi.json${child}`
    } else {
      result[key] = rewriteSchemaRefs(child)
    }
  }
  return result
}

function operationJsonSchema(document: JsonObject, path: string, method: string, operation: Operation): JsonObject {
  const properties: JsonObject = {}
  const required: string[] = []
  const parameters = array(operation.parameters).map((parameter) => dereferenceParameter(document, parameter))

  for (const location of ['path', 'query']) {
    const fields = parameters.filter((parameter) => parameter.in === location)
    if (!fields.length) continue
    const childProperties = Object.fromEntries(fields.map((field) => [String(field.name), field.schema ?? {}]))
    const childRequired = fields
      .filter((field) => field.required === true || location === 'path')
      .map((field) => String(field.name))
    const key = location === 'path' ? 'params' : 'query'
    properties[key] = {
      type: 'object',
      properties: childProperties,
      required: childRequired,
      additionalProperties: false
    }
    if (location === 'path' || childRequired.length) required.push(key)
  }

  const body = object(operation.requestBody)
  const bodyContent = object(body.content)
  const bodySchemas = Object.values(bodyContent)
    .map((media) => object(media).schema)
    .filter(Boolean)
  if (bodySchemas.length) {
    properties.body = bodySchemas.length === 1 ? bodySchemas[0] : { anyOf: bodySchemas }
    if (body.required === true) required.push('body')
  }

  const responseVariants: JsonObject[] = []
  for (const [status, rawResponse] of Object.entries(object(operation.responses))) {
    const numericStatus = Number(status)
    if (numericStatus < 200 || numericStatus >= 300) continue
    const content = object(object(rawResponse).content)
    if (!Object.keys(content).length) {
      responseVariants.push({ type: 'object', properties: { status: { const: numericStatus } }, required: ['status'] })
      continue
    }
    for (const [mediaType, rawMedia] of Object.entries(content)) {
      const schema = object(rawMedia).schema
      const bodySchema = schema
        ? schema
        : mediaType === 'text/event-stream'
          ? { type: 'string', contentMediaType: 'text/event-stream' }
          : { type: 'string' }
      responseVariants.push({
        type: 'object',
        properties: { status: { const: numericStatus }, body: bodySchema },
        required: ['status', 'body'],
        additionalProperties: false
      })
    }
  }

  return {
    $schema: JSON_SCHEMA,
    title: `${operation.operationId} request and response`,
    allOf: [{ $ref: '#/$defs/request' }],
    $defs: {
      request: {
        type: 'object',
        properties: rewriteSchemaRefs(properties),
        required,
        additionalProperties: false
      },
      response: { oneOf: responseVariants }
    },
    'x-operationId': operation.operationId,
    'x-method': method.toUpperCase(),
    'x-path': path
  }
}

function componentTypes(document: JsonObject): string {
  const components = object(object(document.components).schemas)
  const entries = Object.entries(components).map(([name, schema]) => {
    return `    ${propertyName(name)}: ${schemaToType(schema)}`
  })
  const schemas = entries.length ? `{\n${entries.join(';\n')}\n  }` : 'Record<string, never>'
  return `export interface OpenApiComponents {\n  schemas: ${schemas}\n}`
}

export async function generateSdkFiles(source: string): Promise<Record<string, string>> {
  const document = object(JSON.parse(source))
  if (!string(document.openapi)?.startsWith('3.1.')) throw new Error('The SDK generator requires OpenAPI 3.1.')

  const operationEntries: Array<{ path: string; method: string; operation: Operation }> = []
  const ids = new Set<string>()
  for (const [path, rawMethods] of Object.entries(object(document.paths))) {
    if (!path.startsWith('/v1/')) throw new Error(`OpenAPI path is outside /v1: ${path}`)
    for (const [method, rawOperation] of Object.entries(object(rawMethods))) {
      const operation = object(rawOperation) as Operation
      if (!operation.operationId) continue
      if (FORBIDDEN_OPERATION.test(operation.operationId)) {
        throw new Error(`OpenAPI operation ${operation.operationId} cannot approve, publish, or send.`)
      }
      if (!/^[A-Za-z_$][\w$-]*$/.test(operation.operationId)) {
        throw new Error(`Unsupported operationId: ${operation.operationId}`)
      }
      if (ids.has(operation.operationId)) throw new Error(`Duplicate operationId: ${operation.operationId}`)
      ids.add(operation.operationId)
      operationEntries.push({ path, method: method.toUpperCase(), operation })
    }
  }

  const encoder = new TextEncoder()
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(source))
  const openapiSha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  const componentOutput = componentTypes(document)
  const requestTypes: string[] = []
  const responseTypes: string[] = []
  const requiredIds: string[] = []
  const streamIds: string[] = []
  const metadata: string[] = []
  const metadataTypes: string[] = []
  const schemaImports: string[] = []
  const schemaExports: string[] = []
  const files: Record<string, string> = {}
  const tsOptions = (await resolveConfig(new URL('../src/generated.ts', import.meta.url).pathname)) ?? {}
  const jsonOptions = (await resolveConfig(new URL('../openapi/schemas/', import.meta.url).pathname)) ?? {}

  for (const { path, method, operation } of operationEntries) {
    const id = operation.operationId
    const request = operationRequestType(document, operation)
    const response = responseType(operation)
    if (request.required) requiredIds.push(id)
    if (response.eventStream) streamIds.push(id)
    requestTypes.push(`  ${JSON.stringify(id)}: ${request.type}`)
    responseTypes.push(`  ${JSON.stringify(id)}: ${response.type}`)
    const extension = object(operation['x-skyclause'])
    metadata.push(
      `  ${JSON.stringify(id)}: { method: ${JSON.stringify(method)}, path: ${JSON.stringify(path)}, idempotent: ${extension.idempotent === true}, eventStream: ${response.eventStream} }`
    )
    metadataTypes.push(
      `  ${JSON.stringify(id)}: { method: ${JSON.stringify(method)}; path: ${JSON.stringify(path)}; idempotent: ${extension.idempotent === true}; eventStream: ${response.eventStream} }`
    )
    const schemaName = `schema_${id.replace(/[^A-Za-z0-9_$]/g, '_')}`
    schemaImports.push(`import ${schemaName} from './schemas/${id}.json' with { type: 'json' }`)
    schemaExports.push(`  ${JSON.stringify(id)}: ${schemaName}`)
    files[`openapi/schemas/${id}.json`] =
      `${JSON.stringify(operationJsonSchema(document, path, method, operation), null, 2)}\n`
  }

  const idsSource = operationEntries.map(({ operation }) => `  ${JSON.stringify(operation.operationId)}`).join(',\n')
  const generatedTypes = [
    `export const OPENAPI_SHA256 = ${JSON.stringify(openapiSha256)} as const // gitleaks:allow -- a SHA-256 of openapi.json, not a secret.`,
    `export const OPERATION_IDS = [\n${idsSource}\n] as const`,
    componentOutput,
    'export type OperationId = (typeof OPERATION_IDS)[number]',
    `export type OperationRequests = {\n${requestTypes.join(';\n')}\n}`,
    `export type OperationResponses = {\n${responseTypes.join(';\n')}\n}`,
    `export type OperationMetadataById = {\n${metadataTypes.join(';\n')}\n}`,
    `export const OPERATIONS = {\n${metadata.join(',\n')}\n} as const satisfies OperationMetadataById`,
    `export type RequiredOperationId = ${requiredIds.map((id) => JSON.stringify(id)).join(' | ')}`,
    `export type EventStreamOperationId = ${streamIds.map((id) => JSON.stringify(id)).join(' | ')}`,
    'export type OperationArguments = { [Id in OperationId]: Id extends RequiredOperationId ? [input: OperationRequests[Id]] : [input?: OperationRequests[Id]] }',
    'export type OperationMethod<Id extends OperationId> = (...args: OperationArguments[Id]) => Promise<OperationResponses[Id]>',
    'export type SdkMethods = { [Id in OperationId]: OperationMethod<Id> }',
    'export type OperationMetadata = (typeof OPERATIONS)[OperationId]'
  ].join('\n\n')
  files['src/generated.ts'] = await format(`${generatedTypes}\n`, { ...tsOptions, parser: 'typescript' })
  files['openapi/index.ts'] = await format(
    [
      `import document from './openapi.json' with { type: 'json' }`,
      ...schemaImports,
      `import { OPENAPI_SHA256, OPERATION_IDS, type OperationId } from '../src/generated'`,
      '',
      'export interface OpenApiDocument { openapi: string; info: { title: string; version: string; description?: string }; paths: Record<string, unknown>; components?: Record<string, unknown> }',
      'export type JsonSchema = Record<string, unknown> | boolean',
      'export interface OperationSchema { $schema: string; title: string; allOf: Array<{ $ref: string }>; $defs: { request: JsonSchema; response: JsonSchema }; "x-operationId": string; "x-method": string; "x-path": string }',
      '',
      'export { OPENAPI_SHA256 }',
      'export const openapi: OpenApiDocument = document as OpenApiDocument',
      `export const operationSchemas: Record<OperationId, OperationSchema> = {\n${schemaExports.join(',\n')}\n}`,
      'export const operationSchemaPaths: Record<OperationId, string> = Object.fromEntries(OPERATION_IDS.map((id) => [id, `@skyclause/sdk/openapi/schemas/${id}`])) as Record<OperationId, string>',
      'export type OperationSchemaId = OperationId',
      ''
    ].join('\n'),
    { ...tsOptions, parser: 'typescript' }
  )
  files['openapi/openapi.json'] = source

  for (const key of Object.keys(files)) {
    if (key.startsWith('openapi/schemas/')) {
      files[key] = await format(files[key]!, { ...jsonOptions, parser: 'json' })
    }
  }

  return files
}

if (import.meta.main) {
  const source = await Bun.file(new URL('../../api/openapi.json', import.meta.url)).text()
  const files = await generateSdkFiles(source)
  await Bun.$`mkdir -p ${new URL('../openapi/schemas', import.meta.url).pathname}`
  for (const [path, contents] of Object.entries(files)) {
    await Bun.write(new URL(`../${path}`, import.meta.url), contents)
  }
  console.log(
    `Generated ${Object.keys(files).length} SDK files from packages/api/openapi.json (${files['src/generated.ts']!.match(/OPENAPI_SHA256 = ['"]([^'"]+)/)?.[1] ?? 'hash missing'})`
  )
}
