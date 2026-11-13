// Builds edit/index.html (the HyperFrames film) from the Director's timing sheet, and copies the media it plays into
// edit/assets/ (ignored by git). Run from docs/video: bun scripts/edit.ts. Rerun after every timing change.
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

const SHARED = process.env.SKYCLAUSE_SHARED ?? '/mnt/c/Users/User/Downloads/skyclause-video'
const VIDEO = resolve(import.meta.dirname, '..')
const REPO = resolve(VIDEO, '../..')
const EDIT = join(VIDEO, 'edit')
// The demo segment (slide 6 cue, D1 to D6) once the Remotion Demo composition is rendered; until then, rough cut 0.
const DEMO = process.env.DEMO

type Segment = { id: string; kind: string; still?: string | null; voice?: string | null; dur_s: number }
const timing = JSON.parse(readFileSync(join(SHARED, 'logs/timing.json'), 'utf8')) as { segments: Segment[] }

const copy = (from: string, to: string) => {
  if (!existsSync(from)) throw new Error(`Missing media: ${from}`)
  mkdirSync(join(EDIT, to, '..'), { recursive: true })
  copyFileSync(from, join(EDIT, to))
  return to
}
const fromShared = (path: string) => join(SHARED, path)
const fromRepo = (path: string) => (existsSync(join(REPO, path)) ? join(REPO, path) : join(REPO, '../Skyclause', path))
const s = (n: number) => n.toFixed(3)

copy(join(REPO, 'apps/web/fonts/roundo/Roundo-Variable.woff2'), 'assets/fonts/Roundo-Variable.woff2')
for (const w of ['Regular', 'Medium'])
  copy(
    join(REPO, `apps/web/fonts/skyclause-figures/SkyclauseFigures-${w}.woff2`),
    `assets/fonts/SkyclauseFigures-${w}.woff2`
  )

const clips: string[] = []
const audio: string[] = []
// Slides 1–10 push in to 103% over their whole length, anchored at the bottom centre so the deck's footer and the
// corner caption under it never meet. Slide 6 (3.9 s) and slide 11 with its end hold stay still: the QR codes stay sharp.
const PUSH = { scale: 1.03, origin: '50% 100%', ease: 'sine.inOut' }
const pushed = new Set(['S01', 'S02', 'S03', 'S04', 'S05', 'S07', 'S08', 'S09', 'S10'])
const tweens: string[] = []
// With the Demo video in, its own length (ffprobe) replaces the timing sheet's demo rows, so nothing drifts.
const demoLength = DEMO
  ? Number(
      spawnSync('ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'csv=p=0',
        DEMO
      ]).stdout.toString()
    )
  : 0
if (DEMO && !(demoLength > 0)) throw new Error(`Cannot read the length of ${DEMO}`)
let t = 0
let d3: { start: number; end: number } | undefined
let demoStart: number | undefined
let demoEnd = 0
for (const seg of timing.segments) {
  const isDemo = seg.kind === 'demo' || seg.id === 'S06'
  if (DEMO && isDemo) {
    if (demoStart === undefined) {
      demoStart = t
      t += demoLength
      demoEnd = t
    }
    continue // the demo video carries its own picture and narration
  }
  const start = t
  t += seg.dur_s
  // A demo beat is voiced only after its take decides the version, so its voice may not exist yet.
  const voiceMissing = seg.kind === 'demo' && seg.voice && !existsSync(fromShared(seg.voice))
  if (voiceMissing) console.log(`${seg.id}: no voice yet (${seg.voice})`)
  const voice = seg.voice && !voiceMissing ? copy(fromShared(seg.voice), `assets/vo/${basename(seg.voice)}`) : null
  if (seg.id === 'D3') d3 = { start, end: t }
  const inDemo = seg.kind === 'demo' || seg.id === 'S06'
  if (inDemo) {
    demoStart ??= start
    demoEnd = t
    if (DEMO) continue // the demo video carries its own picture and narration
  }
  // D3's voice is mixed into D3Beat (its frame remap and the 1 s silence), so it gets no separate track here.
  if (voice && seg.id !== 'D3')
    audio.push(`<audio id="vo-${seg.id}" src="${voice}" data-start="${s(start)}" data-volume="1"></audio>`)
  if (seg.kind === 'slate') {
    clips.push(`<section id="slate" class="clip slate" data-start="${s(start)}" data-duration="${s(seg.dur_s)}">
        <svg class="mark" viewBox="0 0 16 16" aria-hidden="true"><rect x="0.5" y="10.25" width="15" height="2.5" rx="1.25"/><rect x="6" y="3.25" width="9.5" height="5.5" rx="2.75"/></svg>
        <p class="slate-title">Skyclause, recorded on production</p>
        <p class="slate-line" translate="no">app.skyclause.m1ku.tech</p>
        <p class="slate-line">Captured Friday 13 November 2026</p>
      </section>`)
  } else if (seg.still) {
    const src = copy(fromRepo(seg.still), `assets/slides/${basename(seg.still)}`)
    const id = seg.id.toLowerCase().replace(' ', '-')
    clips.push(
      `<div id="${id}" class="clip" data-start="${s(start)}" data-duration="${s(seg.dur_s)}"><img id="${id}-img" class="still" src="${src}" alt=""></div>`
    )
    if (pushed.has(seg.id))
      tweens.push(
        `tl.fromTo('#${id}-img', { scale: 1 }, { scale: ${PUSH.scale}, transformOrigin: '${PUSH.origin}', duration: ${s(seg.dur_s)}, ease: '${PUSH.ease}' }, ${s(start)});`
      )
  } else if (seg.id === 'D3') {
    const src = copy(fromShared('recordings/demo/D3Beat-v2.mp4'), 'assets/demo/D3Beat.mp4')
    clips.push(
      `<video id="d3" src="${src}" data-start="${s(start)}" data-duration="${s(seg.dur_s)}" data-has-audio="true" playsinline></video>`
    )
  } else {
    // Rough cut 0 only: an unrecorded beat holds the ground with its name. The Demo video replaces it.
    clips.push(
      `<section id="${seg.id.toLowerCase()}" class="clip pending" data-start="${s(start)}" data-duration="${s(seg.dur_s)}"><p>${seg.id}: take not recorded yet</p></section>`
    )
  }
}
if (DEMO && demoStart !== undefined) {
  const src = copy(DEMO, 'assets/demo/demo.mp4')
  clips.push(
    `<video id="demo" src="${src}" data-start="${s(demoStart)}" data-duration="${s(demoEnd - demoStart)}" data-has-audio="true" playsinline></video>`
  )
}
if (!d3 && !DEMO) throw new Error('The timing sheet has no D3 segment')
const total = t

// The corner caption sits under the deck's footer row (clear on all 11 slides), and lifts above D3's own footer and
// over any demo beat whose take put UI under it (ingest's cornerBusyMs inside the take time the beat uses).
const corner = (id: string, start: number, end: number, cls = '', bottom?: number) =>
  `<div id="${id}" class="clip corner${cls}" data-start="${s(start)}" data-duration="${s(end - start)}"${bottom === undefined ? '' : ` style="bottom: ${bottom}px"`}><span>Recording · 13 Nov 2026</span></div>`
const lifts: { start: number; end: number; bottom?: number }[] = DEMO || !d3 ? [] : [d3]
if (DEMO && demoStart !== undefined) {
  const { PLAN, segmentSeconds } = await import('../src/demo/plan')
  let at = demoStart
  for (const segment of PLAN) {
    const begin = at
    at += segmentSeconds(segment)
    if (segment.kind === 'd3') lifts.push({ start: begin, end: at }) // over D3's own footer
    if (segment.kind !== 'take') continue
    if (segment.cornerBottom !== undefined) {
      lifts.push({ start: begin, end: at, bottom: segment.cornerBottom })
      continue
    }
    const take = JSON.parse(readFileSync(join(VIDEO, 'public/footage/ingested', `${segment.take}.json`), 'utf8')) as {
      cornerBusyMs: number | null
    }
    const lastMs = Math.max(
      ...segment.steps.map((st) => ('hold' in st ? st.hold : st.play + (st.beat[1] - st.beat[0]) * 1000))
    )
    if (take.cornerBusyMs !== null && take.cornerBusyMs <= lastMs) lifts.push({ start: begin, end: at })
  }
}
lifts.sort((a, b) => a.start - b.start)
const corners: string[] = []
let cursor = 0
lifts.forEach((lift, i) => {
  if (lift.start > cursor) corners.push(corner(`corner-${i}`, cursor, lift.start))
  corners.push(corner(`corner-lift-${i}`, lift.start, lift.end, ' lifted', lift.bottom))
  cursor = lift.end
})
if (cursor < total) corners.push(corner('corner-tail', cursor, total))

const html = `<!doctype html>
<html lang="en-GB">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
      @font-face { font-family: 'Roundo'; src: url('assets/fonts/Roundo-Variable.woff2') format('woff2'); font-weight: 200 700; }
      @font-face { font-family: 'Skyclause Figures'; src: url('assets/fonts/SkyclauseFigures-Regular.woff2') format('woff2'); font-weight: 400; }
      @font-face { font-family: 'Skyclause Figures'; src: url('assets/fonts/SkyclauseFigures-Medium.woff2') format('woff2'); font-weight: 500; }
      /* DESIGN.md, Dusk */
      :root { --ground: #1a2039; --surface: #212846; --ink: #f9a3c0; --ink-muted: #c68da3; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1920px; height: 1080px; overflow: hidden; background: var(--ground); }
      #root { position: relative; width: 1920px; height: 1080px; overflow: hidden; background: var(--ground);
        font-family: 'Roundo', system-ui, sans-serif; color: var(--ink); isolation: isolate; }
      .clip { position: absolute; inset: 0; }
      .still, video { width: 1920px; height: 1080px; object-fit: cover; }
      .slate { display: flex; flex-direction: column; align-items: center; justify-content: center; background: var(--ground); }
      .mark { width: 96px; height: 96px; fill: var(--ink); }
      .slate-title { margin-top: 40px; font-size: 64px; font-weight: 500; letter-spacing: -0.025em; line-height: 1.05; }
      .slate-line { margin-top: 18px; font-size: 30px; color: var(--ink-muted); }
      .slate-title + .slate-line { margin-top: 28px; }
      .pending { display: grid; place-items: center; background: var(--ground); color: var(--ink-muted); font-size: 32px; }
      .corner { inset: auto 96px 7px auto; z-index: 10; }
      .corner span { display: inline-flex; align-items: center; height: 30px; padding: 0 14px; border-radius: 9999px;
        background: var(--ground); color: var(--ink); font-size: 16px; font-weight: 500; white-space: nowrap; }
      .corner.lifted { bottom: 116px; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="skyclause-prototype" data-start="0" data-duration="${s(total)}"
         data-width="1920" data-height="1080">
      ${clips.join('\n      ')}
      ${audio.join('\n      ')}
      ${corners.join('\n      ')}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      ${tweens.join('\n      ')}
      window.__timelines['skyclause-prototype'] = tl;
    </script>
  </body>
</html>
`
writeFileSync(join(EDIT, 'index.html'), html)
console.log(
  `edit/index.html: ${timing.segments.length} segments, ${total.toFixed(3)} s; demo ${DEMO ? 'video' : 'rough cut 0'}`
)
