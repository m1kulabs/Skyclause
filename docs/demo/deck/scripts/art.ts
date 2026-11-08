// Generates the deck's illustrations with the OpenAI Images API. Art only: no text, numbers, charts, logos or
// interface, so nothing in a picture can be read as data. Run from the repo root with OPENAI_API_KEY set:
//   bun docs/demo/deck/scripts/art.ts [name ...]
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const MODEL = process.env.ART_MODEL ?? 'gpt-image-2.6-flare'
const OUT = join(import.meta.dirname, '..', 'assets', 'art')
const STYLE =
  'Minimal 3D clay render, matte white and pale grey materials, soft studio light from the upper left, gentle ambient occlusion, ' +
  'one single accent colour only: deep crimson #b11226, used sparingly on one element. Isolated object on a fully transparent background, ' +
  'no ground plane, no text, no letters, no numbers, no logos, no signage, no screens, no charts. Calm, premium, editorial.'

const ART: Record<string, string> = {
  window:
    'A single square window frame floating in space, thick white clay frame, fine rain streaks falling behind the glass, ' +
    'a thin glowing crimson horizontal bar crossing the frame at its lower third like a threshold line.',
  storm:
    'A miniature diorama of a low elevated light-rail station beside a large oval stadium, both in white clay, under one heavy grey storm cloud ' +
    'raining in fine streaks; small puddles; one tiny crimson train car at the platform.',
  commute:
    'Five small faceless white clay figures with umbrellas walking in a line from a campus building toward an elevated rail station in light rain, ' +
    'seen from a three-quarter view; exactly one umbrella is crimson, the rest white.',
  gauge:
    'A tall cylindrical rain gauge in white clay standing alone, with a crisp crimson ring marking a level line around the cylinder, ' +
    'a few raindrops falling into its funnel.',
  ledger:
    'A neat stack of thick white clay cards, slightly fanned, each card joined to the next by a thin chain link, the top card pressed with a round crimson wax seal.'
}

async function make(name: string): Promise<void> {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      prompt: `${ART[name]} ${STYLE}`,
      size: '1536x1024',
      quality: 'high',
      background: 'transparent',
      output_format: 'webp',
      n: 1
    })
  })
  const json = (await res.json()) as { data?: { b64_json: string }[]; error?: { message: string } }
  if (!res.ok || !json.data) throw new Error(`${name}: HTTP ${res.status} ${json.error?.message ?? ''}`)
  writeFileSync(join(OUT, `${name}.webp`), Buffer.from(json.data[0]!.b64_json, 'base64'))
  console.log(`${name}.webp written (${MODEL})`)
}

if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is unset')
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ART)
const results = await Promise.allSettled(names.map(make))
for (const r of results) if (r.status === 'rejected') console.error(String(r.reason))
process.exitCode = results.some((r) => r.status === 'rejected') ? 1 : 0
