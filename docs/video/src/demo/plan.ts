import type { CalloutSpec, PushSpec, TakeStep } from './take'
import { D3_BEAT_S } from './d3'

// The demo segment in order: the slide 6 cue, then D1 to D6. A take beat joins the plan only once its take is
// ingested and its voice is cut; the composition refuses a beat whose take or voice is missing, so nothing stands in.
// Voice seconds [from, to) of `src` (default: the segment's voice) placed at beat second `at`. A part from the next
// beat's file makes a J-cut: its first line starts under this beat's last picture.
export type VoicePart = { from: number; to?: number; at: number; src?: string }
export type Segment =
  | { id: 'S06'; kind: 'still'; src: string; voice: string; seconds: number }
  | { id: 'D3'; kind: 'd3'; seconds: number }
  | {
      id: string
      kind: 'take'
      take: string
      voice: string
      voiceParts: VoicePart[]
      steps: TakeStep[]
      pushes?: PushSpec[]
      callouts?: CalloutSpec[]
      allowClose?: boolean
      /**
       * A public-site replay panel: our Replay (2 Nov 2026) badge rides on every frame, beside the site's own mark.
       * `{ x, y }` moves it off something it would cover (D5 public: under the stage bar).
       */
      replay?: boolean | { x: number; y: number }
      /** The corner caption's distance from the bottom edge for this beat, where the take puts something under it. */
      cornerBottom?: number
      /** Edit captions in beat seconds, worded as the director script gives them. */
      captions?: { text: string; from: number; to: number }[]
    }

// Slide 6's note: 'live' keeps "The rest is recorded from the live system."; 'replay' is the director script's
// wording for a cut where D4 or D5 is a replay. The Director decides by 09:30.
export const SLIDE6 = 'replay' as 'live' | 'replay' // Director, 08:13 MYT: D4 and D5 use replay fallbacks

export const PLAN: Segment[] = [
  {
    id: 'S06',
    kind: 'still',
    src: SLIDE6 === 'live' ? 'footage/deck/slide-06.png' : 'footage/deck/slide-06-replay.png',
    voice: 'voice/S06.wav',
    seconds: 3.883
  },
  // D1, declare: one 1:1 play (Director-approved placement, 08:24 MYT). Voice offset 0, no split.
  {
    id: 'D1',
    kind: 'take',
    take: 'D1',
    voice: 'voice/D1.wav',
    // J-cut (08:58 MYT): D2's "From there, Skyclause watches that window." starts at 21.8, over the new row, so the
    // gap after D1's last line stays under 1.5 s (measured: D1's voice falls below −45 dB at 20.63).
    voiceParts: [
      { from: 0, at: 0 },
      { src: 'voice/D2.wav', from: 0, to: 3.2, at: 21.8 }
    ],
    steps: [{ beat: [0, 25.0], play: 1500 }],
    pushes: [{ fromMs: 6900, toMs: 23300, scale: 1.3, cue: 'dialog', focus: { x: 960, y: 540 } }],
    // The timeline row, by its measured bar (the tracked cue matched the First-run checklist line instead).
    callouts: [
      {
        cue: 'new-row',
        staticBox: { x: 504, y: 547, width: 1056, height: 42 },
        gate: 'box +8 px static over take 24.40–26.70 s: 69 frames, max diff 18, 1 value over 16 (at 26.53 s, outside the 25.10–26.50 s span) (08:50 MYT)',
        fromMs: 25300,
        toMs: 26300
      }
    ],
    allowClose: true
  },
  // D2, watch: one 1:1 play; push and a 2 s box on the Age column on "You see this column?".
  {
    id: 'D2',
    kind: 'take',
    take: 'D2',
    voice: 'voice/D2.wav',
    // The first 3.2 s of D2's voice play under D1 (the J-cut); the picture starts 3.2 s later in the take to match.
    voiceParts: [{ from: 3.2, at: 0 }],
    steps: [{ beat: [0, 23.24], play: 7700 }],
    // Window y 56–956: the nav (y 0–48) stays wholly out, nothing sliced at an edge.
    pushes: [{ fromMs: 16600, toMs: 20000, scale: 1.2, cue: 'age-header', focus: { x: 1339, y: 336 } }],
    callouts: [{ cue: 'age-header', spanY: 'table', fromMs: 17100, toMs: 19100 }]
  },
  { id: 'D3', kind: 'd3', seconds: D3_BEAT_S },
  // D4, fallback (no bundle: the 08:11 Ask failed validation). Part 1: the live Rota summary, decision (d) at 08:34:
  // the 1920 take at a held 1.2 push (window x 300–1900, y 0–900), the shift card partly in frame with its name and
  // email masked (static, 3 px sides); no callout on the card.
  {
    id: 'D4a',
    kind: 'take',
    take: 'D4-rota',
    voice: 'voice/D4.wav',
    voiceParts: [{ from: 0, to: 3.2, at: 0 }],
    steps: [{ beat: [0, 3.2], play: 2000 }],
    pushes: [
      { fromMs: 2000, toMs: 1e9, scale: 1.2, cue: 'on-duty', focus: { x: 1800, y: 0 }, easeIn: false, easeOut: false }
    ]
  },
  // Part 2: the public worked example, replay-badged, held 1.15 push anchored top-left, hard cut.
  {
    id: 'D4b',
    kind: 'take',
    take: 'D4-public',
    voice: 'voice/D4.wav',
    voiceParts: [{ from: 3.2, at: 0 }],
    steps: [
      { beat: [0, 4.8], play: 10800 },
      { beat: [4.8, 25.8], hold: 15600 }
    ],
    pushes: [
      { fromMs: 10800, toMs: 1e9, scale: 1.15, cue: 'text-1', focus: { x: 0, y: 0 }, easeIn: false, easeOut: false }
    ],
    replay: true,
    cornerBottom: 205
  },
  // D5, fallback: the public notice (replay-badged, 1.18 held push), then Settings → Channels with the ICS caption.
  {
    id: 'D5a',
    kind: 'take',
    take: 'D5-public',
    voice: 'voice/D5.wav',
    voiceParts: [{ from: 0, to: 12.4, at: 0 }],
    steps: [
      { beat: [0, 2.2], play: 10500 },
      { beat: [2.2, 12.4], hold: 12700 }
    ],
    pushes: [
      { fromMs: 10500, toMs: 1e9, scale: 1.18, cue: 'text-0', focus: { x: 0, y: 393.3 }, easeIn: false, easeOut: false }
    ],
    replay: { x: 30, y: 150 }
  },
  {
    id: 'D5b',
    kind: 'take',
    take: 'D5-channels',
    voice: 'voice/D5.wav',
    voiceParts: [{ from: 12.4, at: 0 }],
    steps: [
      { beat: [0, 1.4], play: 1400 },
      { beat: [1.4, 4.6], hold: 2800 }
    ],
    captions: [{ text: 'ICS calendar feed · Outlook and Google Calendar', from: 0.2, to: 4.4 }]
  },
  // D6, record: hold the ledger, then 1:1 so the Check integrity click lands on "this check catches it".
  {
    id: 'D6',
    kind: 'take',
    take: 'D6',
    voice: 'voice/D6.wav',
    voiceParts: [{ from: 0, at: 0 }],
    steps: [
      { beat: [0, 11.5], hold: 2900 },
      { beat: [11.5, 23.8], play: 2900 },
      { beat: [23.8, 24.9], hold: 15100 }
    ],
    // Window y 56–956: the nav (y 0–48) stays wholly out; "Ledger" and "Chain intact…" stay whole.
    pushes: [{ fromMs: 6300, toMs: 10500, scale: 1.2, cue: 'intact', focus: { x: 460, y: 336 } }]
  }
]

export const segmentSeconds = (segment: Segment) =>
  segment.kind === 'take' ? segment.steps.at(-1)!.beat[1] : segment.seconds
