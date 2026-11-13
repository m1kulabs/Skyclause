import { FPS } from '../lib'

// The D3 beat against Kelvin's D3 voice (voice/processed/D3.wav, word times in voice/kelvin/D3.words.json), locked
// with the Director at 05:55 MYT. Each step plays the clip 1:1 or holds one clip frame; nothing is reordered and no
// value changes. Step 5 resumes at clip 20.0: clip 14.0–20.0 is frozen (lossless frames 420 and 599 differ by 0 px,
// and freezedetect finds no motion between), so skipping it equals a shorter hold.
type Step = { beat: [number, number] } & ({ play: number } | { hold: number })
export const D3_STEPS: Step[] = [
  { beat: [0, 7.9], play: 0 }, // bars rise under "But what happens when the sky turns?…"
  { beat: [7.9, 15.1], hold: 7.9 }, // "14:55." (8.44) on the 29.5 mm label, through "The clause says Normal."
  { beat: [15.1, 21.2], play: 7.9 }, // rises on "Five" (15.09); the Lebat band lights at clip 9.2 = "39." (16.39)
  { beat: [21.2, 23.45], hold: 14.0 },
  { beat: [23.45, 27.45], play: 20.0 }, // the verdict flips into "flips." (23.59); "Look at the clock." on 15:05
  { beat: [27.45, 29.6], hold: 23.966 }, // through the 1 s silence and "89 sessions end at 15:30."
  { beat: [29.6, 35.6], play: 24.0 }, // "25 min" fades in by "25" (30.56)
  { beat: [35.6, 38.6], hold: 29.966 } // final frame
]
export const D3_BEAT_S = 38.6
// The voice starts at 0.0 s into the beat; 1.0 s of silence goes in at voice 26.6 s, before "89 sessions".
export const D3_VOICE = { offset: 0, split: 26.6, silence: 1.0 }

for (const [i, step] of D3_STEPS.entries()) {
  const prev = D3_STEPS[i - 1]
  if (prev && prev.beat[1] !== step.beat[0]) throw new Error(`D3 step ${i} does not start where step ${i - 1} ends`)
}
if (D3_STEPS.at(-1)!.beat[1] !== D3_BEAT_S) throw new Error('D3 steps do not fill the beat')

/** The clip frame shown at a frame of the beat. */
export function d3ClipFrame(beatFrame: number): number {
  const t = beatFrame / FPS
  const step = D3_STEPS.find((s) => t >= s.beat[0] && t < s.beat[1]) ?? D3_STEPS.at(-1)!
  const clip = 'hold' in step ? step.hold : step.play + (t - step.beat[0])
  return Math.min(Math.round(clip * FPS), 30 * FPS - 1)
}
