import { deflateRawSync } from 'node:zlib'

export interface ArchiveFile {
  name: string
  content: string | Buffer
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let value = n
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    table[n] = value >>> 0
  }
  return table
})()

function crc32(data: Buffer) {
  let crc = 0xffffffff
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function dosTime(date: Date) {
  return (
    ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | (Math.floor(date.getSeconds() / 2) & 0x1f)
  )
}

function dosDate(date: Date) {
  return (
    (((Math.max(date.getFullYear(), 1980) - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0xf) << 5) |
    (date.getDate() & 0x1f)
  )
}

/** A small standards-compliant ZIP writer using raw DEFLATE and no filesystem scratch files. */
export function createZip(files: ArchiveFile[], generatedAt: Date) {
  const local: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8')
    const raw = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, 'utf8')
    const compressed = deflateRawSync(raw)
    const crc = crc32(raw)
    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034b50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(0x0800, 6)
    header.writeUInt16LE(8, 8)
    header.writeUInt16LE(dosTime(generatedAt), 10)
    header.writeUInt16LE(dosDate(generatedAt), 12)
    header.writeUInt32LE(crc, 14)
    header.writeUInt32LE(compressed.length, 18)
    header.writeUInt32LE(raw.length, 22)
    header.writeUInt16LE(name.length, 26)
    header.writeUInt16LE(0, 28)
    local.push(header, name, compressed)

    const directory = Buffer.alloc(46)
    directory.writeUInt32LE(0x02014b50, 0)
    directory.writeUInt16LE(20, 4)
    directory.writeUInt16LE(20, 6)
    directory.writeUInt16LE(0x0800, 8)
    directory.writeUInt16LE(8, 10)
    directory.writeUInt16LE(dosTime(generatedAt), 12)
    directory.writeUInt16LE(dosDate(generatedAt), 14)
    directory.writeUInt32LE(crc, 16)
    directory.writeUInt32LE(compressed.length, 20)
    directory.writeUInt32LE(raw.length, 24)
    directory.writeUInt16LE(name.length, 28)
    directory.writeUInt16LE(0, 30)
    directory.writeUInt16LE(0, 32)
    directory.writeUInt16LE(0, 34)
    directory.writeUInt16LE(0, 36)
    directory.writeUInt32LE(0, 38)
    directory.writeUInt32LE(offset, 42)
    central.push(directory, name)
    offset += header.length + name.length + compressed.length
  }
  const centralDirectory = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralDirectory.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)
  return Buffer.concat([...local, centralDirectory, end])
}

const snake = (key: string) => key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`)
const cell = (value: unknown) => {
  const text =
    value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return '\n'
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))].sort((a, b) => {
    if (a === 'projectId') return -1
    if (b === 'projectId') return 1
    return a.localeCompare(b)
  })
  return (
    [keys.map(snake).join(','), ...rows.map((row) => keys.map((key) => cell(row[key])).join(','))].join('\n') + '\n'
  )
}

export function exportFiles(data: Record<string, unknown>, formats: string[], generatedAt: Date) {
  const files: ArchiveFile[] = []
  const pairs = Object.entries(data).filter(([, value]) => Array.isArray(value)) as Array<
    [string, Record<string, unknown>[]]
  >
  const manifest: Record<string, unknown> = { generated_at: generatedAt.toISOString() }
  const projects = data.projects as Array<Record<string, unknown>> | undefined
  if (projects) {
    const calls = data.calls as Array<Record<string, unknown>> | undefined
    const counts = Object.fromEntries(
      projects.map((project) => {
        const projectId = String(project.id)
        const forProject = (rows: Record<string, unknown>[] | undefined) =>
          rows?.filter((row) => row.projectId === projectId).length ?? 0
        return [
          projectId,
          {
            calls: forProject(calls),
            windows: forProject(data.windows as Record<string, unknown>[]),
            clauses: forProject(data.clauses as Record<string, unknown>[]),
            bundles: forProject(data.bundles as Record<string, unknown>[]),
            grades: forProject(data.grades as Record<string, unknown>[]),
            subscribers: forProject(data.subscribers as Record<string, unknown>[])
          }
        ]
      })
    )
    manifest.projects = counts
  }
  if (formats.includes('json')) {
    for (const [name, rows] of pairs) files.push({ name: `${name}.json`, content: JSON.stringify(rows, null, 2) })
    for (const [name, value] of Object.entries(data).filter(([, value]) => !Array.isArray(value))) {
      files.push({ name: `${name}.json`, content: JSON.stringify(value, null, 2) })
    }
    files.push({ name: 'manifest.json', content: JSON.stringify(manifest, null, 2) })
  }
  if (formats.includes('csv')) {
    for (const [name, rows] of pairs) files.push({ name: `${name}.csv`, content: toCsv(rows) })
    for (const [name, value] of Object.entries(data).filter(([, value]) => !Array.isArray(value))) {
      files.push({ name: `${name}.csv`, content: toCsv([value as Record<string, unknown>]) })
    }
    if (!formats.includes('json')) files.push({ name: 'manifest.json', content: JSON.stringify(manifest, null, 2) })
  }
  return files
}
