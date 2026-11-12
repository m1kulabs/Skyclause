// Generates a slide background with the OpenAI Images API: a dark photographic scene, no text, no people, no logos.
// The deck lays a black fade over it in CSS so slide text stays readable.
//   OPENAI_API_KEY=… bun docs/demo/prelim/deck/scripts/background.ts problem
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const MODEL = 'gpt-image-2.6-flare'
const OUT = join(import.meta.dirname, '..', 'assets', 'art')

const SCENES: Record<string, string> = {
  problem:
    'A cinematic photograph of a heavy tropical afternoon thunderstorm over an elevated light-rail station and modern ' +
    'university buildings in a Kuala Lumpur suburb, seen from a distance across a wide wet road. Dense rain streaks, a ' +
    'dark low cloud base, wet asphalt with faint reflections, a few small distant figures with umbrellas walking toward ' +
    'the station, too small to show any face. Very dark and moody: near-black charcoal tones, desaturated, low contrast, ' +
    'only faint cool grey highlights and one or two dim warm station lights. The left two thirds of the frame are mostly ' +
    'deep shadow and rain haze with little detail, the subject sits on the right third. No text, no signage, no logos, ' +
    'no watermarks, no brand marks. Subtle film grain.'
}

const key = process.env.OPENAI_API_KEY
if (!key) throw new Error('OPENAI_API_KEY is not set')
for (const name of process.argv.slice(2)) {
  const prompt = SCENES[name]
  if (!prompt) throw new Error(`no scene named ${name}`)
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, prompt, size: '1536x1024', quality: 'high', output_format: 'webp', n: 1 })
  })
  if (!res.ok) throw new Error(`${name}: ${res.status} ${await res.text()}`)
  const json = (await res.json()) as { data: { b64_json: string }[] }
  writeFileSync(join(OUT, `${name}-bg.webp`), Buffer.from(json.data[0]!.b64_json, 'base64'))
  console.log(`${name}-bg.webp written`)
}
