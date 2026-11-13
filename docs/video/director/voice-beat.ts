// Voice one demo beat with ElevenLabs Kelvin, from an exact text file.
// Usage: bun video/director/voice-beat.ts <D1..D6> <text-file> [--go]
// Without --go it only prints the character count and the credits left (no credits spent).
// Writes voice/kelvin/<id>.mp3 and voice/kelvin/<id>.words.json in the shared folder.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

type Alignment = {
  characters: string[]
  character_start_times_seconds: number[]
  character_end_times_seconds: number[]
}

const VOICE_ID = 'FXMPPfJPpDj0GSwJ6ASO' // Kelvin
const MODEL = 'eleven_multilingual_v2' // 1 credit per character
const FLOOR = 300 // stop when this many credits would be left

const [id, file, go] = process.argv.slice(2)
if (!id || !/^D[1-6]$/.test(id) || !file) throw new Error('Usage: voice-beat.ts <D1..D6> <text-file> [--go]')
const key = process.env.ELEVENLABS_API_KEY
if (!key) throw new Error('Export ELEVENLABS_API_KEY from the repo .env first.')

const text = (await readFile(file, 'utf8')).trim().replace(/\s*\n\s*/g, ' ')
const sub = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': key } })
if (!sub.ok) throw new Error(`Subscription check returned ${sub.status}`)
const { character_limit, character_count } = (await sub.json()) as Record<string, number>
const left = character_limit - character_count
console.log(`${id}: ${text.length} characters; ${left} credits left; ${left - text.length} after`)
if (left - text.length < FLOOR) throw new Error(`Refusing: fewer than ${FLOOR} credits would be left.`)
if (go !== '--go') process.exit(0)

const res = await fetch(
  `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/with-timestamps?output_format=mp3_44100_128`,
  {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ text, model_id: MODEL })
  }
)
if (!res.ok) throw new Error(`ElevenLabs returned ${res.status} for ${id}: ${await res.text()}`)
const out = (await res.json()) as { audio_base64: string; alignment?: Alignment; normalized_alignment?: Alignment }
const al = out.alignment ?? out.normalized_alignment
if (!out.audio_base64 || !al) throw new Error(`No audio or alignment for ${id}`)

const words: { word: string; start: number; end: number }[] = []
let cur = '',
  start = 0,
  end = 0
al.characters.forEach((c, i) => {
  if (/\s/.test(c)) {
    if (cur) words.push({ word: cur, start, end })
    cur = ''
    return
  }
  if (!cur) start = al.character_start_times_seconds[i]!
  cur += c
  end = al.character_end_times_seconds[i]!
})
if (cur) words.push({ word: cur, start, end })

const shared = process.env.SKYCLAUSE_VIDEO_DIR ?? resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const dir = resolve(shared, 'voice/kelvin')
await mkdir(dir, { recursive: true })
await writeFile(resolve(dir, `${id}.mp3`), Buffer.from(out.audio_base64, 'base64'))
await writeFile(resolve(dir, `${id}.words.json`), `${JSON.stringify({ segment: id, text, words }, null, 1)}\n`)
console.log(`${id}: wrote voice/kelvin/${id}.mp3 and ${id}.words.json (${words.length} words)`)
