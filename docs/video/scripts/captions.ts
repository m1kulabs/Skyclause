import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { segments } from '../src/lib'

type Word = { word: string; start: number; end: number }
type WordFile = { words: Word[] }
type Caption = { start: number; end: number; text: string }

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const output: Caption[] = []
let segmentOffset = 0

for (const segment of segments) {
  const path = resolve(root, 'public/voice', `${segment.id}.words.json`)
  try {
    await access(path)
  } catch {
    segmentOffset += segment.seconds
    continue
  }
  const content = JSON.parse(await readFile(path, 'utf8')) as WordFile
  const groups: Word[][] = []
  let current: Word[] = []
  for (const word of content.words) {
    const previous = current.at(-1)
    const proposed = [...current, word].map((item) => item.word).join(' ')
    const gap = previous ? word.start - previous.end : 0
    if (current.length && (proposed.length > 42 || gap > 0.65 || /[.?!;]$/.test(previous!.word))) {
      groups.push(current)
      current = []
    }
    current.push(word)
  }
  if (current.length) groups.push(current)
  for (const group of groups) {
    output.push({
      start: segmentOffset + group[0]!.start,
      end: segmentOffset + group.at(-1)!.end,
      text: group.map((word) => word.word).join(' ')
    })
  }
  segmentOffset += segment.seconds
}

const stamp = (seconds: number) => {
  const milliseconds = Math.max(0, Math.round(seconds * 1000))
  const pad = (value: number, width = 2) => String(value).padStart(width, '0')
  return `${pad(Math.floor(milliseconds / 3_600_000))}:${pad(Math.floor(milliseconds / 60_000) % 60)}:${pad(Math.floor(milliseconds / 1000) % 60)},${pad(milliseconds % 1000, 3)}`
}

process.stdout.write(
  output
    .map((caption, index) => `${index + 1}\n${stamp(caption.start)} --> ${stamp(caption.end)}\n${caption.text}\n`)
    .join('\n')
)
