import type { PollContext, SourceKind } from '@skyclause/sources'
import type { SourceObjectStore, SourceExecutionResult } from './types'

// A narrow GCS boundary keeps tests offline; production creates ADC storage only on first I/O.
interface GcsFile {
  metadata: { generation?: string | number }
  getMetadata(): Promise<[{ generation?: string | number }, ...unknown[]]>
  download(): Promise<[Uint8Array, ...unknown[]]>
  save(body: Buffer, options: { resumable: false; preconditionOpts: { ifGenerationMatch: string } }): Promise<unknown>
}
export interface GcsClient {
  bucket(name: string): { file(path: string, options?: { generation: string }): GcsFile }
}
function objectGeneration(value: unknown): string {
  if ((typeof value === 'number' && !Number.isSafeInteger(value)) || !/^[1-9][0-9]*$/.test(String(value)))
    throw new Error('Invalid GCS object generation')
  return String(value)
}
export function gcsObjectStore(
  bucket: string,
  client: () => Promise<GcsClient> = async () => {
    const { Storage } = await import('@google-cloud/storage')
    return new Storage()
  }
): SourceObjectStore {
  let pending: Promise<GcsClient> | undefined
  const connection = () => (pending ??= client())
  return {
    async read(path) {
      validatePath(path)
      const bucketRef = (await connection()).bucket(bucket)
      let metadata
      try {
        ;[metadata] = await bucketRef.file(path).getMetadata()
      } catch (error) {
        if (hasCode(error, 404)) return null
        throw error
      }
      const generation = objectGeneration(metadata.generation)
      // Pin bytes to the metadata generation; a concurrent delete is an error, not absence.
      const [body] = await bucketRef.file(path, { generation }).download()
      return { body, generation }
    },
    async write(path, body, expectedGeneration) {
      validatePath(path)
      const file = (await connection()).bucket(bucket).file(path)
      await file.save(Buffer.from(body), {
        resumable: false,
        preconditionOpts: { ifGenerationMatch: expectedGeneration }
      })
      return objectGeneration(file.metadata.generation)
    }
  }
}
export function hasCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}
export function validatePath(path: string): void {
  if (
    !path ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw new Error('Invalid source object path')
}
export function adapterStorage(
  kind: SourceKind,
  sources: SourceObjectStore,
  scratch: SourceObjectStore
): PollContext['storage'] {
  const target = (path: string) => {
    validatePath(path)
    return path.startsWith('scratch/') ? { store: scratch, path } : { store: sources, path: `sources/${kind}/${path}` }
  }
  return {
    async get(path) {
      const t = target(path)
      return (await t.store.read(t.path))?.body ?? null
    },
    async put(path, body) {
      const t = target(path)
      for (;;) {
        const previous = await t.store.read(t.path)
        try {
          await t.store.write(t.path, body, previous?.generation ?? '0')
          return
        } catch (error) {
          if (!hasCode(error, 412)) throw error
        }
      }
    }
  }
}
export const encodeObject = (value: unknown): Uint8Array => Buffer.from(JSON.stringify(value))
export const decodeObject = <T>(body: Uint8Array): T => JSON.parse(Buffer.from(body).toString('utf8')) as T
/** Immutable logical result. Request bodies are explicit base64, never JSON's numeric-key objects. */
export async function saveSourceResult(
  store: SourceObjectStore,
  path: string,
  result: SourceExecutionResult
): Promise<void> {
  const body = encodeObject({
    ...result,
    requests: result.requests.map((request) => ({
      ...request,
      body: request.body === null ? null : Buffer.from(request.body).toString('base64')
    }))
  })
  try {
    await store.write(path, body, '0')
  } catch (error) {
    if (!hasCode(error, 412)) throw error
    const saved = await store.read(path)
    if (!saved || !Buffer.from(saved.body).equals(Buffer.from(body)))
      throw new Error('Conflicting immutable source result')
  }
}
export async function loadSourceResult(
  store: SourceObjectStore,
  path: string,
  validate?: (value: unknown) => unknown
): Promise<SourceExecutionResult | null> {
  const saved = await store.read(path)
  if (!saved) return null
  const result = decodeObject<
    Omit<SourceExecutionResult, 'requests'> & {
      requests: Array<Omit<SourceExecutionResult['requests'][number], 'body'> & { body: string | null }>
    }
  >(saved.body)
  validate?.(result)
  return {
    ...result,
    requests: result.requests.map((request) => ({
      ...request,
      body: request.body === null ? null : Buffer.from(request.body, 'base64')
    }))
  }
}
