// The camera probation labelling page (#61): `doGet?page=label` through the one
// doGet router. Two teammates open secret links (`slot=a|b` with `key` equal to
// `LABEL_TOKEN_A|B`); anything else gets `Team only` and no frame. Each slot sees
// one masked daylight frame at a time with its capture time, labels it visible or
// obscured, and never sees the other label or the phone flag. Once both have
// labelled a frame it settles; disagreements wait in a resolve view that shows the
// frame and both labels but never the phone flag. The verdict view prints the
// figures and records the verdict on the camera's `sources` row.
import {
  agreesWithPhone,
  formatFigures,
  isDaylight,
  isProbationLabel,
  settleLabels,
  slotColumn,
  summarizeProbation,
  type LabelSlot,
  type ProbationLabel,
  type ProbationRow
} from '../../shared/probation.ts'
import type { GetProperty } from './properties.ts'

export const LABEL_PAGE = 'label'

// The sheet reads and writes the page needs; tests use a fake.
export interface LabelStore {
  probationRows(): ProbationRow[]
  // Writes the slot's label into the existing `probation` row.
  writeLabel(captureId: string, slot: LabelSlot, label: ProbationLabel): void
  // Writes the settled label and whether the phone agrees into the existing row.
  writeSettlement(captureId: string, settled: ProbationLabel, agrees: boolean): void
  // The frame bytes as a data URL, read from Drive by `frame_file_id` under the
  // owner, never through a public link; null when the file cannot be read.
  frameDataUrl(fileId: string): string | null
  // Every settle writes these onto the camera's `sources` row.
  writeFigures(n: number, agreement: number | null): void
  // "Record verdict": `probation` stays TRUE until a passed verdict, then becomes
  // FALSE; the three-way result goes in the cell comment, not the cell value.
  recordVerdict(note: string, passed: boolean, n: number, agreement: number | null): void
}

export interface LabelDeps {
  getProperty: GetProperty
  withLock: <T>(fn: () => T) => T
  store: LabelStore
  scriptUrl: string
}

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function link(scriptUrl: string, slot: LabelSlot, key: string, extra: Record<string, string>): string {
  const query = Object.entries({ page: LABEL_PAGE, slot, key, ...extra })
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .join('&')
  return `${scriptUrl}?${query}`
}

// The slot from the secret link, or null for anything else. The web app allows
// anonymous access for device posts, so `Session.getActiveUser()` is blank for
// anonymous visitors and the slot key is the only gate.
function slotOf(params: Record<string, string>, getProperty: GetProperty): LabelSlot | null {
  const slot = params.slot
  if (slot !== 'a' && slot !== 'b') return null
  const expected = getProperty(slot === 'a' ? 'LABEL_TOKEN_A' : 'LABEL_TOKEN_B')
  if (!expected || params.key !== expected) return null
  return slot
}

function dayWindow(getProperty: GetProperty): { start: string; end: string } {
  return {
    start: getProperty('CAMERA_DAY_START') || '07:15',
    end: getProperty('CAMERA_DAY_END') || '19:00'
  }
}

function daylight(rows: ProbationRow[], getProperty: GetProperty): ProbationRow[] {
  const { start, end } = dayWindow(getProperty)
  return rows.filter((row) => isDaylight(row.device_time, start, end))
}

// Frames the two slots split on and neither settled: they wait for the resolve view.
function pending(rows: ProbationRow[]): ProbationRow[] {
  return rows.filter(
    (row) => row.label_a !== '' && row.label_b !== '' && row.label_a !== row.label_b && !isProbationLabel(row.settled)
  )
}

function word(label: string): string {
  return label === 'visible' ? 'landmark visible' : 'obscured'
}

const STYLE = [
  ':root{color-scheme:dark}',
  'body{background:#0a0a0a;color:#efefef;font-family:"Work Sans",system-ui,-apple-system,"Segoe UI",sans-serif;margin:0;padding:24px 20px;font-variant-numeric:tabular-nums}',
  'main{max-width:640px;margin:0 auto}',
  'h1{font-size:26px;font-weight:700;margin:0 0 16px;text-wrap:balance}',
  'p{font-size:17px;line-height:1.55;color:#efefef}',
  '.soft{color:#8c8c8c}',
  'figure{margin:24px 0}',
  'img.frame{display:block;max-width:100%;height:auto;border:1px solid #3a3a3e;border-radius:6px}',
  'figcaption{margin-top:8px;font-size:14px;color:#8c8c8c}',
  '.btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:44px;padding:12px 24px;margin:8px 12px 8px 0;background:#efefef;color:#0a0a0a;font:inherit;font-size:17px;border-radius:9999px;text-decoration:none;cursor:pointer}',
  '.notice{border:1px solid #3a3a3e;border-radius:6px;padding:12px 16px;margin:16px 0;background:#131217}',
  'nav{margin-top:32px;font-size:14px}',
  'nav a{color:#bdbdc0;margin-right:20px}',
  'a:focus-visible{outline:2px solid #fff;outline-offset:2px}',
  '.skip{position:absolute;left:-9999px}',
  '.skip:focus{left:20px;top:20px;background:#efefef;color:#0a0a0a;padding:12px 16px;border-radius:6px;z-index:1}'
].join('\n')

function shell(title: string, body: string): string {
  return (
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="dark">` +
    `<title>${esc(title)}</title><style>${STYLE}</style></head>` +
    `<body><a class="skip" href="#main">Skip to content</a><main id="main">${body}</main></body></html>`
  )
}

function navLinks(scriptUrl: string, slot: LabelSlot, key: string, views: string[]): string {
  if (views.length === 0) return ''
  const labels: Record<string, string> = { label: 'Label frames', resolve: 'Resolve disagreements', verdict: 'Verdict' }
  const anchors = views.map(
    (view) =>
      `<a href="${esc(link(scriptUrl, slot, key, view === 'label' ? {} : { view }))}">${labels[view] ?? view}</a>`
  )
  return `<nav>${anchors.join('')}</nav>`
}

function frameFigure(frame: string | null, captureId: string, deviceTime: string): string {
  const caption = `Frame ${esc(captureId)} · captured ${esc(deviceTime)}`
  if (!frame) {
    return `<div class="notice" role="alert"><p>The frame file is unavailable.</p></div><p class="soft">${caption}</p>`
  }
  return (
    `<figure><img class="frame" src="${esc(frame)}" alt="Masked daylight frame ${esc(captureId)}">` +
    `<figcaption>${caption}</figcaption></figure>`
  )
}

// Applies one state-changing action under the script lock; null means success.
function applyAction(params: Record<string, string>, slot: LabelSlot, deps: LabelDeps): string | null {
  const action = params.action
  if (action === 'record') {
    const summary = summarizeProbation(deps.store.probationRows())
    deps.store.recordVerdict(
      `${summary.verdict}: ${formatFigures(summary)}`,
      summary.verdict === 'pass',
      summary.n,
      summary.agreement
    )
    return null
  }
  if (action !== 'label' && action !== 'resolve') return `Unknown action ${action}.`
  const value = params.value ?? ''
  if (!isProbationLabel(value)) return 'Pick "Landmark visible" or "Obscured".'
  const captureId = params.capture_id ?? ''
  const current = deps.store.probationRows().find((row) => row.capture_id === captureId)
  if (!current) return 'That frame is not on the probation list.'
  const { start, end } = dayWindow(deps.getProperty)
  if (!isDaylight(current.device_time, start, end)) return 'That frame is outside daylight hours.'
  if (isProbationLabel(current.settled)) return 'That frame is already settled.'
  if (action === 'label') {
    const own = slotColumn(slot)
    if (current[own] !== '' && current[own] !== value) return 'This slot already labelled that frame.'
    deps.store.writeLabel(captureId, slot, value)
  } else {
    if (current.label_a === '' || current.label_b === '' || current.label_a === current.label_b) {
      return 'That frame has nothing to resolve.'
    }
    deps.store.writeSettlement(captureId, value, agreesWithPhone(current.phone_flag, value))
  }
  const updated = deps.store.probationRows().find((row) => row.capture_id === captureId)
  const settled = updated ? settleLabels(updated.label_a, updated.label_b) : null
  if (settled && updated && !isProbationLabel(updated.settled)) {
    deps.store.writeSettlement(captureId, settled, agreesWithPhone(updated.phone_flag, settled))
  }
  const summary = summarizeProbation(deps.store.probationRows())
  deps.store.writeFigures(summary.n, summary.agreement)
  return null
}

export function handleLabelPage(params: Record<string, string>, deps: LabelDeps): { html: string } {
  const slot = slotOf(params, deps.getProperty)
  if (!slot) return { html: shell('Camera probation', '<h1>Camera probation</h1><p>Team only.</p>') }
  const key = params.key ?? ''
  let notice: string | null = null
  if (params.action) {
    const error = deps.withLock(() => applyAction(params, slot, deps))
    if (error) notice = error
    else if (params.action === 'label') notice = `Recorded ${word(params.value ?? '')} for ${params.capture_id ?? ''}.`
    else if (params.action === 'resolve') notice = `Resolved ${params.capture_id ?? ''} as ${word(params.value ?? '')}.`
    else if (params.action === 'record') notice = 'Verdict recorded on the camera source.'
  }
  const rows = daylight(deps.store.probationRows(), deps.getProperty)
  const next = rows.find((row) => row[slotColumn(slot)] === '')
  const waiting = pending(rows)
  const summary = summarizeProbation(deps.store.probationRows())
  const noticeHtml = notice ? `<div class="notice" aria-live="polite"><p>${esc(notice)}</p></div>` : ''

  if (params.view === 'verdict' || (!next && waiting.length === 0)) {
    const record = link(deps.scriptUrl, slot, key, { view: 'verdict', action: 'record' })
    const body =
      '<h1>Camera probation verdict</h1>' +
      noticeHtml +
      `<div class="notice"><p>${esc(formatFigures(summary))}</p>` +
      `<p>Verdict: ${summary.verdict}. Pass needs 100 or more settled frames, ` +
      '10 or more obscured, and agreement 0.90 or more.</p></div>' +
      `<p><a class="btn" href="${esc(record)}" target="_top">Record verdict</a></p>` +
      navLinks(deps.scriptUrl, slot, key, [...(next ? ['label'] : []), ...(waiting.length > 0 ? ['resolve'] : [])])
    return { html: shell('Camera probation verdict', body) }
  }

  if (!next) {
    const row = waiting[0]
    if (!row) throw new Error('no frame waiting for resolve')
    const frame = deps.store.frameDataUrl(row.frame_file_id)
    const visible = link(deps.scriptUrl, slot, key, { action: 'resolve', capture_id: row.capture_id, value: 'visible' })
    const obscured = link(deps.scriptUrl, slot, key, {
      action: 'resolve',
      capture_id: row.capture_id,
      value: 'obscured'
    })
    const body =
      '<h1>Resolve the disagreement</h1>' +
      noticeHtml +
      frameFigure(frame, row.capture_id, row.device_time) +
      `<p>Slot a labelled ${word(row.label_a)}. Slot b labelled ${word(row.label_b)}. ` +
      'Record the label the two of you agree on.</p>' +
      `<p><a class="btn" href="${esc(visible)}" target="_top">Landmark visible</a>` +
      `<a class="btn" href="${esc(obscured)}" target="_top">Obscured</a></p>` +
      navLinks(deps.scriptUrl, slot, key, ['verdict'])
    return { html: shell('Resolve the disagreement', body) }
  }

  const frame = deps.store.frameDataUrl(next.frame_file_id)
  const visible = link(deps.scriptUrl, slot, key, { action: 'label', capture_id: next.capture_id, value: 'visible' })
  const obscured = link(deps.scriptUrl, slot, key, { action: 'label', capture_id: next.capture_id, value: 'obscured' })
  const body =
    '<h1>Label the frame</h1>' +
    noticeHtml +
    frameFigure(frame, next.capture_id, next.device_time) +
    '<p>Is the far-skyline landmark visible in this frame?</p>' +
    `<p><a class="btn" href="${esc(visible)}" target="_top">Landmark visible</a>` +
    `<a class="btn" href="${esc(obscured)}" target="_top">Obscured</a></p>` +
    navLinks(deps.scriptUrl, slot, key, [...(waiting.length > 0 ? ['resolve'] : []), 'verdict'])
  return { html: shell('Label the frame', body) }
}
