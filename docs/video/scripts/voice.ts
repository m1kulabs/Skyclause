import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

type Alignment = {
  characters: string[]
  character_start_times_seconds: number[]
  character_end_times_seconds: number[]
}
type SpeechResponse = {
  audio_base64: string
  alignment?: Alignment
  normalized_alignment?: Alignment
}
type Word = { word: string; start: number; end: number }
type ScriptSection = { id: string; title: string; lines: string[]; open: string[] }
type VoiceIndex = { segments: Record<string, { audio: string; words: string }> }

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const script = await readFile(resolve(root, 'director-script.md'), 'utf8')
const sections = new Map<string, ScriptSection>()
let active: ScriptSection | undefined
for (const line of script.split(/\r?\n/)) {
  const heading = /^### ([VD]\d): (.+)$/.exec(line)
  if (heading) {
    active = { id: heading[1]!, title: heading[2]!, lines: [], open: [] }
    sections.set(active.id, active)
    continue
  }
  if (/^## /.test(line)) {
    active = undefined
    continue
  }
  if (!active) continue
  const content = line.trim()
  if (!content) continue
  if (/^`\[.*\]`$/.test(content)) continue
  if (/^\{.*\}$/.test(content)) {
    active.open.push(content)
    continue
  }
  active.lines.push(content)
}

const requested = process.argv.slice(2).length ? process.argv.slice(2) : [...sections.keys()]
const invalid = requested.filter((id) => !sections.has(id))
if (invalid.length) throw new Error(`Unknown segment id: ${invalid.join(', ')}`)
const apiKey = process.env.ELEVENLABS_API_KEY
const voiceId = process.env.ELEVENLABS_VOICE_ID
if (!apiKey || !voiceId)
  throw new Error('Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID in the environment before running voice.')
const unresolved = requested.filter((id) => sections.get(id)!.open.length > 0)
if (unresolved.length) {
  const detail = unresolved.map((id) => `${id}: ${sections.get(id)!.open.join(' ')}`).join('\n')
  throw new Error(`Refusing to render segments with open script lines:\n${detail}`)
}

const outputDir = resolve(root, 'public/voice')
const indexPath = resolve(root, 'src/data/voice-manifest.json')
await mkdir(outputDir, { recursive: true })
const index = JSON.parse(await readFile(indexPath, 'utf8')) as VoiceIndex

function getWords(text: string, alignment: Alignment): Word[] {
  const starts = alignment.character_start_times_seconds
  const ends = alignment.character_end_times_seconds
  const characters = Array.from(text)
  if (starts.length !== characters.length || ends.length !== characters.length)
    throw new Error(`ElevenLabs alignment has ${starts.length} characters for ${characters.length} script characters`)
  const codePointAt = new Map<number, number>([[0, 0]])
  let offset = 0
  characters.forEach((character, index) => {
    offset += character.length
    codePointAt.set(offset, index + 1)
  })
  const words: Word[] = []
  for (const match of text.matchAll(/\S+/gu)) {
    const word = match[0]
    const from = codePointAt.get(match.index!)
    const to = codePointAt.get(match.index! + word.length)
    if (from === undefined || to === undefined) throw new Error(`Cannot map word boundary for "${word}"`)
    const start = starts.slice(from, to).find(Number.isFinite)
    const end = ends.slice(from, to).reverse().find(Number.isFinite)
    if (start === undefined || end === undefined || end < start)
      throw new Error(`ElevenLabs returned no usable word timing for "${word}"`)
    words.push({ word, start, end })
  }
  return words
}

for (const id of requested) {
  const section = sections.get(id)!
  const text = section.lines.join('\n')
  if (!text.trim()) throw new Error(`${id} has no spoken lines to render`)
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' })
  })
  if (!response.ok) throw new Error(`ElevenLabs returned ${response.status} for ${id}: ${await response.text()}`)
  const result = (await response.json()) as SpeechResponse
  const alignment = result.alignment ?? result.normalized_alignment
  if (!result.audio_base64 || !alignment)
    throw new Error(`ElevenLabs returned no audio or character alignment for ${id}`)

  const audio = `voice/${id}.mp3`
  const words = `voice/${id}.words.json`
  await writeFile(resolve(root, 'public', audio), Buffer.from(result.audio_base64, 'base64'))
  await writeFile(
    resolve(root, 'public', words),
    `${JSON.stringify({ segment: id, text, words: getWords(text, alignment) }, null, 2)}\n`
  )
  index.segments[id] = { audio, words }
  const temporary = `${indexPath}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(index, null, 2)}\n`, { encoding: 'utf8', flag: 'w' })
  await rename(temporary, indexPath)
  console.log(`${id}: wrote ${audio} and ${words} (${getWords(text, alignment).length} aligned words)`)
}
