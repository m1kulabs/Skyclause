import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const [videoArg, captionsArg] = process.argv.slice(2)
const video = resolve(root, videoArg ?? 'out/video.mp4')
const captions = resolve(root, captionsArg ?? 'out/video.srt')

function run(command: string, args: string[]): string {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}: ${result.stderr.slice(-1500)}`)
  return `${result.stdout}${result.stderr}`
}

const duration = Number(
  run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video]).trim()
)
const loudnessLog = run('ffmpeg', [
  '-hide_banner',
  '-nostats',
  '-i',
  video,
  '-af',
  'loudnorm=print_format=json',
  '-f',
  'null',
  '-'
])
const jsonStart = loudnessLog.lastIndexOf('{')
const loudness = JSON.parse(loudnessLog.slice(jsonStart, loudnessLog.lastIndexOf('}') + 1)) as {
  input_i: string
  input_tp: string
}
const subtitle = await readFile(captions, 'utf8')
const directorScript = await readFile(resolve(root, 'director-script.md'), 'utf8')
const guardrails = /## Claim guardrails\n([\s\S]*?)(?=\n## |$)/.exec(directorScript)?.[1] ?? ''
const neverSay = /\*\*Never say:\*\*([^\n]+)/.exec(guardrails)?.[1] ?? ''
const banned = [...neverSay.matchAll(/"([^"]+)"/g)].map((match) => match[1]!.toLowerCase())
const problems: string[] = []

if (duration < 180 || duration > 240)
  problems.push(`Video duration is ${duration.toFixed(2)} seconds; expected 180–240 seconds`)
if (Math.abs(Number(loudness.input_i) + 14) > 0.7)
  problems.push(`Integrated loudness is ${loudness.input_i} LUFS; expected −14 ± 0.7 LUFS`)
if (Number(loudness.input_tp) > -1) problems.push(`True peak is ${loudness.input_tp} dBTP; maximum is −1 dBTP`)
for (const phrase of banned) {
  if (subtitle.toLowerCase().includes(phrase)) problems.push(`Banned phrase "${phrase}" appears in captions`)
}

console.log(`${video}: ${duration.toFixed(2)} s, ${loudness.input_i} LUFS, ${loudness.input_tp} dBTP`)
if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log('QA passed')
