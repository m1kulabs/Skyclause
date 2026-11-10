import { mkdir, open, readFile, rename } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface BufferedLine<T> {
  value: T
  endOffset: number
}

// Each append is one complete JSON line and is synced before append resolves.
// The offset is synced before compaction; after a crash, an acknowledged row
// may be replayed, but an unacknowledged row is never skipped.
export class FsyncJsonlBuffer<T> {
  private readonly offsetPath: string
  private initialized = false
  private serial: Promise<void> = Promise.resolve()

  constructor(private readonly path: string) {
    this.offsetPath = `${path}.offset`
  }

  append(value: T): Promise<void> {
    return this.runSerial(async () => {
      await this.initialize()
      const handle = await open(this.path, 'a', 0o600)
      try {
        await handle.writeFile(`${JSON.stringify(value)}\n`)
        await handle.sync()
      } finally {
        await handle.close()
      }
    })
  }

  peek(): Promise<BufferedLine<T> | null> {
    return this.runSerial(async () => {
      await this.initialize()
      const bytes = await this.readBuffer()
      const offset = await this.readOffset()
      if (offset > bytes.length) throw new Error('Pi buffer offset is beyond the end of the file')
      const newline = bytes.indexOf(0x0a, offset)
      if (newline < 0) return null
      const value = JSON.parse(bytes.subarray(offset, newline).toString('utf8')) as T
      return { value, endOffset: newline + 1 }
    })
  }

  acknowledge(endOffset: number): Promise<void> {
    return this.runSerial(async () => {
      await this.initialize()
      const bytes = await this.readBuffer()
      const offset = await this.readOffset()
      const newline = bytes.indexOf(0x0a, offset)
      if (newline < 0 || newline + 1 !== endOffset) throw new Error('Pi buffer acknowledgement is out of order')

      await this.writeOffset(endOffset)
      await this.writeOffset(0)
      await this.replaceBuffer(bytes.subarray(endOffset))
    })
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return
    await mkdir(dirname(this.path), { recursive: true })
    let existed = true
    try {
      const existing = await open(this.path, 'r')
      await existing.close()
    } catch (error) {
      if (!isMissing(error)) throw error
      existed = false
    }
    const handle = await open(this.path, 'a', 0o600)
    await handle.close()
    if (!existed) await this.syncDirectory()

    const bytes = await this.readBuffer()
    if (bytes.length > 0 && bytes.at(-1) !== 0x0a) {
      const lastNewline = bytes.lastIndexOf(0x0a)
      const repair = await open(this.path, 'r+')
      try {
        await repair.truncate(lastNewline + 1)
        await repair.sync()
      } finally {
        await repair.close()
      }
    }
    this.initialized = true
  }

  private async readBuffer(): Promise<Buffer> {
    try {
      return await readFile(this.path)
    } catch (error) {
      if (isMissing(error)) return Buffer.alloc(0)
      throw error
    }
  }

  private async readOffset(): Promise<number> {
    try {
      const contents = (await readFile(this.offsetPath, 'utf8')).trim()
      const offset = Number(contents)
      if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Pi buffer offset is invalid')
      return offset
    } catch (error) {
      if (isMissing(error)) return 0
      throw error
    }
  }

  private async writeOffset(offset: number): Promise<void> {
    await this.writeSyncedFile(this.offsetPath, `${offset}\n`)
  }

  private async replaceBuffer(bytes: Buffer): Promise<void> {
    const temporary = `${this.path}.tmp`
    const handle = await open(temporary, 'w', 0o600)
    try {
      await handle.writeFile(bytes)
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temporary, this.path)
    await this.syncDirectory()
  }

  private async writeSyncedFile(path: string, contents: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true })
    const temporary = `${path}.tmp`
    const handle = await open(temporary, 'w', 0o600)
    try {
      await handle.writeFile(contents)
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temporary, path)
    await this.syncDirectory()
  }

  private async syncDirectory(): Promise<void> {
    const handle = await open(dirname(this.path), 'r')
    try {
      await handle.sync()
    } finally {
      await handle.close()
    }
  }

  private runSerial<R>(operation: () => Promise<R>): Promise<R> {
    const result = this.serial.then(operation)
    this.serial = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
