import { expect, test } from 'vitest'
import { adapterStorage, gcsObjectStore } from '../src/sources/storage'
import { MemoryStore } from './support/source-adapter'
test('adapter paths separate scratch from source kind and reject traversal', async () => {
  const sources = new MemoryStore(),
    scratch = new MemoryStore()
  const storage = adapterStorage('jps_rain', sources, scratch)
  await storage.put('payload.json', new Uint8Array([1]))
  await storage.put('scratch/token', new Uint8Array([2]))
  expect([...sources.objects.keys()]).toEqual(['sources/jps_rain/payload.json'])
  expect([...scratch.objects.keys()]).toEqual(['scratch/token'])
  expect(await storage.get('payload.json')).toEqual(new Uint8Array([1]))
  for (const path of ['/absolute', '../outside', 'a/../b', 'a/./b', 'a\\b', ''])
    await expect(storage.get(path)).rejects.toThrow()
})
test('GCS reads a pinned generation and returns the upload generation without a racing metadata reread', async () => {
  const accesses: unknown[] = []
  const store = gcsObjectStore('bucket', async () => ({
    bucket: () => ({
      file: (path, options) => {
        accesses.push([path, options])
        return {
          metadata: {},
          getMetadata: async () => [{ generation: '17' }],
          download: async () => [Buffer.from('body')],
          save: async function (body, options) {
            expect(body).toEqual(Buffer.from([1]))
            expect(options.preconditionOpts.ifGenerationMatch).toBe('17')
            this.metadata = { generation: '18' }
          }
        }
      }
    })
  }))
  expect(await store.read('control/x')).toEqual({ body: Buffer.from('body'), generation: '17' })
  expect(accesses).toEqual([
    ['control/x', undefined],
    ['control/x', { generation: '17' }]
  ])
  expect(await store.write('control/x', new Uint8Array([1]), '17')).toBe('18')
})
test('only GCS object 404 is absence; authentication and download failures propagate', async () => {
  for (const code of [404, 403, 500]) {
    const store = gcsObjectStore('bucket', async () => ({
      bucket: () => ({
        file: () => ({
          metadata: {},
          getMetadata: async () => {
            throw Object.assign(new Error('GCS'), { code })
          },
          download: async () => [Buffer.alloc(0)],
          save: async () => {}
        })
      })
    }))
    if (code === 404) expect(await store.read('a')).toBeNull()
    else await expect(store.read('a')).rejects.toMatchObject({ code })
  }
})

test('pinned download errors propagate even when a concurrent deletion returns 404', async () => {
  const store = gcsObjectStore('bucket', async () => ({
    bucket: () => ({
      file: () => ({
        metadata: {},
        getMetadata: async () => [{ generation: '1' }],
        download: async () => {
          throw Object.assign(new Error('deleted generation'), { code: 404 })
        },
        save: async () => {}
      })
    })
  }))
  await expect(store.read('object')).rejects.toMatchObject({ code: 404 })
})
