import type { Frame, Setup } from './model'

export interface CameraStore {
  setup(): Promise<Setup | undefined>
  saveSetup(setup: Setup): Promise<void>
  frames(): Promise<Frame[]>
  put(frame: Frame): Promise<void>
  remove(id: string): Promise<void>
  close(): void
}

/** One database per complete camera path; tokens and queues never cross projects. */
export function openCameraStore(path: string): Promise<CameraStore> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(`skyclause-camera:${path}`, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('setup')
      request.result.createObjectStore('frames', { keyPath: 'capture_id' })
    }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      function transact<T>(
        store: string,
        mode: IDBTransactionMode,
        action: (store: IDBObjectStore) => IDBRequest<T>
      ): Promise<T> {
        return new Promise((done, fail) => {
          const tx = db.transaction(store, mode)
          const req = action(tx.objectStore(store))
          tx.oncomplete = () => done(req.result)
          tx.onerror = () => fail(tx.error)
          tx.onabort = () => fail(tx.error)
        })
      }
      resolve({
        setup: () => transact('setup', 'readonly', (s) => s.get('current')),
        saveSetup: async (setup) => {
          await transact('setup', 'readwrite', (s) => s.put(setup, 'current'))
        },
        frames: async () =>
          (await transact<Frame[]>('frames', 'readonly', (s) => s.getAll())).sort(
            (a, b) => a.device_time.localeCompare(b.device_time) || a.capture_id.localeCompare(b.capture_id)
          ),
        put: async (frame) => {
          await transact('frames', 'readwrite', (s) => s.put(frame))
        },
        remove: async (id) => {
          await transact('frames', 'readwrite', (s) => s.delete(id))
        },
        close: () => db.close()
      })
    }
  })
}
