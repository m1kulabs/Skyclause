import { describe, expect, test } from 'bun:test'
import { peerCrossingReservations } from './crossing-reservations.ts'

interface PeerFile {
  name: string
  text: string
  trashed?: boolean
  failure?: 'trash' | 'name' | 'blob' | 'text'
}

function withDrive(
  entries: PeerFile[],
  action: (accesses: string[]) => void,
  failure?: 'folder' | 'files' | 'hasNext' | 'next'
) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'DriveApp')
  const accesses: string[] = []
  Object.defineProperty(globalThis, 'DriveApp', {
    configurable: true,
    value: {
      getFolderById(id: string) {
        accesses.push(id)
        if (id !== 'peer') throw new Error(`Unexpected folder: ${id}`)
        if (failure === 'folder') throw new Error('native folder failure')
        return {
          getFiles() {
            if (failure === 'files') throw new Error('native files failure')
            let index = 0
            return {
              hasNext() {
                if (failure === 'hasNext' && index > 0) throw new Error('native hasNext failure')
                return index < entries.length
              },
              next() {
                if (failure === 'next' && index > 0) throw new Error('native next failure')
                const entry = entries[index++]!
                const read = <T>(stage: PeerFile['failure'], value: T): T => {
                  if (entry.failure === stage) throw new Error(`native ${stage} failure`)
                  return value
                }
                return {
                  isTrashed: () => read('trash', entry.trashed ?? false),
                  getName: () => read('name', entry.name),
                  getBlob: () => read('blob', { getDataAsString: () => read('text', entry.text) })
                }
              }
            }
          }
        }
      }
    }
  })
  try {
    action(accesses)
  } finally {
    if (original) Object.defineProperty(globalThis, 'DriveApp', original)
    else delete (globalThis as Record<string, unknown>).DriveApp
  }
}

describe('peer crossing reservations', () => {
  test('importing the helper performs no native access', async () => {
    const keys = ['DriveApp', 'PropertiesService']
    const originals = keys.map((key) => Object.getOwnPropertyDescriptor(globalThis, key))
    for (const key of keys)
      Object.defineProperty(globalThis, key, {
        configurable: true,
        get: () => {
          throw new Error(`Unexpected import-time ${key} access`)
        }
      })
    try {
      const modulePath = './crossing-reservations.ts?import-laziness'
      const loaded = await import(modulePath)
      expect(typeof loaded.peerCrossingReservations).toBe('function')
    } finally {
      keys.forEach((key, index) => {
        const original = originals[index]
        if (original) Object.defineProperty(globalThis, key, original)
        else delete (globalThis as Record<string, unknown>)[key]
      })
    }
  })

  test('reserves physical filenames and different JSON identities independently without pack payload validation', () => {
    const physical = 'crossing-20261102-1505-01.json'
    const body = JSON.stringify({ crossing_id: 'X-20261102-1505-03', pack: 'crowd' })
    withDrive([{ name: physical, text: body }], (accesses) => {
      expect(peerCrossingReservations('own', 'peer').sort()).toEqual([
        'crossing-20261102-1505-01.json',
        'crossing-20261102-1505-03.json'
      ])
      expect(accesses).toEqual(['peer'])
    })
  })

  test('keeps physical claims through malformed and nonobject JSON and deduplicates usable IDs', () => {
    const name = 'crossing-20261102-1505-01.json'
    withDrive(
      [
        { name, text: '{broken' },
        { name, text: 'null' },
        { name, text: '[]' },
        { name, text: '42' },
        { name, text: '{}' },
        { name, text: '{"crossing_id":42}' },
        { name: 'renamed.json', text: '{"crossing_id":"X-20261102-1505-03"}' },
        { name: 'renamed-again.json', text: '{"crossing_id":"X-20261102-1505-03"}' },
        { name: 'unrelated.json', text: '{"crossing_id":"invalid"}' }
      ],
      () => {
        expect(peerCrossingReservations('own', 'peer').sort()).toEqual([name, 'crossing-20261102-1505-03.json'])
      }
    )
  })

  test('ignores trashed files before reading names or blobs', () => {
    withDrive([{ name: 'crossing-20261102-1505-09.json', text: '', trashed: true, failure: 'blob' }], () => {
      expect(peerCrossingReservations('own', 'peer')).toEqual([])
    })
  })

  test('validates the destination, permits missing peers, and rejects trimmed folder aliases without native access', () => {
    withDrive([], (accesses) => {
      expect(() => peerCrossingReservations('', null)).toThrow(/destination/i)
      expect(() => peerCrossingReservations('   ', 'peer')).toThrow(/destination/i)
      expect(peerCrossingReservations('own', null)).toEqual([])
      expect(peerCrossingReservations('own', '   ')).toEqual([])
      expect(() => peerCrossingReservations(' own ', 'own ')).toThrow(/separate|same|alias/i)
      expect(accesses).toEqual([])
    })
  })

  for (const failure of ['folder', 'files', 'hasNext', 'next'] as const) {
    test(`propagates ${failure} failure even after a partial inventory`, () => {
      withDrive(
        [
          { name: 'crossing-20261102-1505-01.json', text: '{}' },
          { name: 'crossing-20261102-1505-02.json', text: '{}' }
        ],
        () => {
          expect(() => peerCrossingReservations('own', 'peer')).toThrow(`native ${failure} failure`)
        },
        failure
      )
    })
  }

  for (const failure of ['trash', 'name', 'blob', 'text'] as const) {
    test(`does not swallow native ${failure} errors as JSON mismatch`, () => {
      withDrive([{ name: 'crossing-20261102-1505-01.json', text: '{}', failure }], () => {
        expect(() => peerCrossingReservations('own', 'peer')).toThrow(`native ${failure} failure`)
      })
    })
  }
})
