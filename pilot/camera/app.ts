// The static camera page's wiring: video, masked canvas, IndexedDB queue, daylight cadence,
// wake lock and posts to the pilot web app. Pure logic lives in ../shared/camera.ts so tests
// cover it; this file only touches the DOM and device APIs.
import {
  captureHeight,
  CONFIG_KIND,
  DEFAULT_DAY_END,
  DEFAULT_DAY_START,
  deviceTime,
  dueMark,
  formatDayMyt,
  framePostBody,
  maskLowerThird,
  nextMarkMs,
  parseCameraConfig,
  parsePostResponse,
  ratios,
  retryDelayMs,
  scoreMasked,
  setupValid,
  sortFrames,
  statusCopy,
  uuidv7,
  validRegion,
  daylight,
  type CameraFrame,
  type CameraSetup,
  type Reference,
  type Region
} from '../shared/camera.ts'

const TICK_MS = 5000
const POST_TIMEOUT_MS = 20_000
const DB_NAME = 'skyclause-camera'

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`missing element ${id}`)
  return node as T
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('setup')
      request.result.createObjectStore('frames', { keyPath: 'capture_id' })
    }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

function transact<T>(
  db: IDBDatabase,
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode)
    const request = fn(tx.objectStore(store))
    tx.oncomplete = () => resolve(request.result)
    tx.onerror = () => reject(tx.error ?? new Error('storage failed'))
    tx.onabort = () => reject(tx.error ?? new Error('storage failed'))
  })
}

async function loadSetup(db: IDBDatabase): Promise<CameraSetup | undefined> {
  return transact(db, 'setup', 'readonly', (s) => s.get('current'))
}

async function saveSetup(db: IDBDatabase, setup: CameraSetup): Promise<void> {
  await transact(db, 'setup', 'readwrite', (s) => s.put(setup, 'current'))
}

async function loadFrames(db: IDBDatabase): Promise<CameraFrame[]> {
  return sortFrames(await transact<CameraFrame[]>(db, 'frames', 'readonly', (s) => s.getAll()))
}

async function putFrame(db: IDBDatabase, frame: CameraFrame): Promise<void> {
  await transact(db, 'frames', 'readwrite', (s) => s.put(frame))
}

async function removeFrame(db: IDBDatabase, id: string): Promise<void> {
  await transact(db, 'frames', 'readwrite', (s) => s.delete(id))
}

interface Page {
  db: IDBDatabase
  video: HTMLVideoElement
  preview: HTMLCanvasElement
  status: HTMLElement
  queue: HTMLElement
  wake: HTMLElement
  daylight: HTMLElement
  formError: HTMLElement
  setup: CameraSetup | undefined
  formReference: Reference | null
  placing: 'near' | 'far' | null
  cameraReady: boolean
  cameraFatal: string | null
  stream: MediaStream | null
  wakeLock: WakeLockSentinel | null
  rejectedToken: string | null
  retryAt: number
  lastAnnounced: string
  fetchingConfig: boolean
}

let page: Page

function announce(text: string, tone: 'plain' | 'warn' | 'crit' | 'muted' = 'plain'): void {
  const key = `${tone}:${text}`
  if (key === page.lastAnnounced) return
  page.lastAnnounced = key
  page.status.textContent = text
  page.status.dataset.tone = tone
}

function renderQueue(frames: CameraFrame[]): void {
  page.queue.textContent =
    frames.length === 0
      ? 'No frames queued. Complete setup and keep this page in front.'
      : `Frames queued: n=${frames.length}. Oldest uploads first with its capture time.`
}

function renderDaylight(): void {
  const start = page.setup?.start ?? DEFAULT_DAY_START
  const end = page.setup?.end ?? DEFAULT_DAY_END
  page.daylight.textContent = `Daylight ${start}–${end} MYT (from the project server).`
}

function blankSetup(execUrl: string): CameraSetup {
  return {
    execUrl,
    token: '',
    distanceKm: NaN,
    start: DEFAULT_DAY_START,
    end: DEFAULT_DAY_END,
    near: { x: 0, y: 0, width: 0, height: 0 },
    far: { x: 0, y: 0, width: 0, height: 0 },
    reference: null,
    consent: false
  }
}

function formRegions(): { near: Region; far: Region } {
  const num = (id: string): number => Number(el<HTMLInputElement>(id).value) / 100
  const region = (name: 'near' | 'far'): Region => ({
    x: num(`${name}-x`),
    y: num(`${name}-y`),
    width: num(`${name}-width`),
    height: num(`${name}-height`)
  })
  return { near: region('near'), far: region('far') }
}

function readForm(): Omit<CameraSetup, 'start' | 'end' | 'lastMark' | 'lastConfigDay'> {
  return {
    execUrl: el<HTMLInputElement>('exec-url').value.trim(),
    token: el<HTMLInputElement>('device-token').value,
    distanceKm: Number(el<HTMLInputElement>('distance-km').value),
    ...formRegions(),
    reference: page.formReference,
    consent: el<HTMLInputElement>('camera-consent').checked
  }
}

function writeForm(setup: CameraSetup): void {
  el<HTMLInputElement>('exec-url').value = setup.execUrl
  el<HTMLInputElement>('device-token').value = setup.token
  el<HTMLInputElement>('distance-km').value = Number.isFinite(setup.distanceKm) ? String(setup.distanceKm) : ''
  const fill = (name: 'near' | 'far', region: Region): void => {
    const percent = (v: number): string => String(Math.round(v * 10000) / 100)
    el<HTMLInputElement>(`${name}-x`).value = percent(region.x)
    el<HTMLInputElement>(`${name}-y`).value = percent(region.y)
    el<HTMLInputElement>(`${name}-width`).value = percent(region.width)
    el<HTMLInputElement>(`${name}-height`).value = percent(region.height)
  }
  fill('near', setup.near)
  fill('far', setup.far)
  el<HTMLInputElement>('camera-consent').checked = setup.consent
  page.formReference = setup.reference
  renderReference()
  drawOverlays()
}

function renderReference(): void {
  const locked = page.formReference !== null
  el('reference-state').textContent = locked
    ? 'Clear-day reference captured. Save to keep it; do not recapture it during probation. Reload the page to redo it.'
    : 'No reference yet. Set both regions, then capture.'
  el<HTMLButtonElement>('capture-reference').disabled = locked || !page.cameraReady
  el<HTMLButtonElement>('place-near').disabled = locked
  el<HTMLButtonElement>('place-far').disabled = locked
  el('regions-box').inert = locked
}

function drawOverlays(): void {
  document.querySelectorAll('.region').forEach((node) => node.remove())
  const host = page.preview.parentElement
  if (!host) return
  const { near, far } = formRegions()
  for (const [name, region] of [
    ['near', near],
    ['far', far]
  ] as const) {
    if (!(region.width > 0 && region.height > 0)) continue
    const box = document.createElement('span')
    box.className = 'region'
    box.dataset.region = name
    box.setAttribute('aria-hidden', 'true')
    box.style.left = `${region.x * 100}%`
    box.style.top = `${region.y * 100}%`
    box.style.width = `${region.width * 100}%`
    box.style.height = `${region.height * 100}%`
    host.appendChild(box)
  }
}

async function holdWake(): Promise<void> {
  if (document.visibilityState !== 'visible' || (page.wakeLock && !page.wakeLock.released)) return
  try {
    if (!navigator.wakeLock) throw new Error('wake-lock-unavailable')
    const lock = await navigator.wakeLock.request('screen')
    page.wakeLock = lock
    page.wake.textContent = statusCopy.wakeHeld()
    lock.addEventListener('release', () => {
      page.wakeLock = null
      page.wake.textContent = statusCopy.wakeReleased()
      announce(statusCopy.wakeReleased(), 'warn')
    })
  } catch {
    page.wake.textContent = statusCopy.wakeReleased()
    announce(statusCopy.wakeReleased(), 'warn')
  }
}

async function openCamera(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    page.cameraFatal = statusCopy.unsupported()
    announce(page.cameraFatal, 'crit')
    return
  }
  try {
    page.stream?.getTracks().forEach((track) => track.stop())
    const media = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 } },
      audio: false
    })
    page.stream = media
    page.video.srcObject = media
    await page.video.play()
    page.cameraReady = true
    page.cameraFatal = null
    renderReference()
    await holdWake()
  } catch (error) {
    page.cameraReady = false
    renderReference()
    page.cameraFatal =
      error instanceof DOMException && ['NotAllowedError', 'PermissionDeniedError'].includes(error.name)
        ? statusCopy.permissionDenied()
        : 'Camera frame failed. Keep this page in front, then tap Allow camera again.'
    announce(page.cameraFatal, 'crit')
  }
}

// Draws the current video frame to a 640 px canvas, masks it in place, then scores the regions.
// The caller encodes its JPEG from the returned canvas, so scoring and encoding share pixels.
function maskedScores(near: Region, far: Region): { canvas: HTMLCanvasElement; near: number; far: number } {
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = captureHeight(page.video.videoWidth, page.video.videoHeight)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('canvas-unavailable')
  context.drawImage(page.video, 0, 0, canvas.width, canvas.height)
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
  maskLowerThird(pixels)
  const scored = scoreMasked(pixels, near, far)
  context.putImageData(pixels, 0, 0)
  return { canvas, ...scored }
}

// Daylight hours come from `kind=camera_config`; the setup's defaults stand only when the fetch fails.
async function fetchConfig(execUrl: string): Promise<void> {
  if (page.fetchingConfig || !execUrl) return
  page.fetchingConfig = true
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), POST_TIMEOUT_MS)
    let response: Response
    try {
      response = await fetch(`${execUrl}?kind=${CONFIG_KIND}`, { signal: controller.signal })
    } finally {
      clearTimeout(timeout)
    }
    if (!response.ok) throw { status: response.status }
    const config = parseCameraConfig(await response.json())
    const current = page.setup ?? (await loadSetup(page.db)) ?? blankSetup(execUrl)
    const next: CameraSetup = {
      ...current,
      execUrl,
      start: config.day_start,
      end: config.day_end,
      lastConfigDay: formatDayMyt(Date.now())
    }
    await saveSetup(page.db, next)
    page.setup = next
    renderDaylight()
  } catch (error) {
    const status =
      typeof error === 'object' && error !== null && 'status' in error
        ? Number((error as { status: unknown }).status) || 0
        : 0
    announce(statusCopy.configFailed(Date.now(), status), 'warn')
  } finally {
    page.fetchingConfig = false
  }
}

async function postFrame(frame: CameraFrame, token: string, execUrl: string): Promise<boolean> {
  // Persist the attempt before HTTP: a crash after sending makes the next delivery buffered.
  const stored: CameraFrame = {
    ...frame,
    buffered: frame.buffered || frame.attempts > 0,
    attempts: frame.attempts + 1
  }
  await putFrame(page.db, stored)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), POST_TIMEOUT_MS)
  const started = Date.now()
  try {
    const response = await fetch(execUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(framePostBody(stored, token)),
      redirect: 'follow',
      signal: controller.signal
    })
    const text = await response.text()
    const reply = response.ok ? parsePostResponse(text) : { ok: false as const, error: `HTTP ${response.status}` }
    if (reply.ok) {
      await removeFrame(page.db, frame.capture_id)
      page.retryAt = 0
      if (!reply.duplicate)
        announce(
          statusCopy.posted(
            Date.parse(frame.device_time),
            stored.ratio_far,
            stored.ratio_near,
            Math.max(0, Date.now() - started) / 1000
          )
        )
      return true
    }
    if (reply.error === 'bad token') {
      page.rejectedToken = token
      announce(statusCopy.tokenRejected(), 'crit')
      return false
    }
    throw { status: response.status }
  } catch (error) {
    const status =
      typeof error === 'object' && error !== null && 'status' in error
        ? Number((error as { status: unknown }).status) || 0
        : 0
    page.retryAt = Date.now() + retryDelayMs(stored.attempts)
    announce(statusCopy.uploadFailed(Date.now(), status), 'warn')
    return false
  } finally {
    clearTimeout(timeout)
  }
}

async function tick(): Promise<void> {
  if (document.visibilityState !== 'visible') return
  const now = Date.now()
  if (!page.setup || !setupValid(page.setup)) {
    announce(statusCopy.setupNeeded(), 'muted')
    return
  }
  if (page.cameraFatal) {
    announce(page.cameraFatal, 'crit')
    return
  }
  if (page.rejectedToken === page.setup.token) {
    announce(statusCopy.tokenRejected(), 'crit')
    return
  }
  if (formatDayMyt(now) !== page.setup.lastConfigDay) await fetchConfig(page.setup.execUrl)
  // Re-read: the config fetch may have updated the daylight hours.
  const setup = page.setup
  if (!setup || !setupValid(setup)) return
  if (!daylight(now, setup.start, setup.end)) {
    announce(statusCopy.afterDusk(nextMarkMs(now, setup.start, setup.end)))
    return
  }
  const frames = await loadFrames(page.db)
  renderQueue(frames)
  const mark = dueMark(now, setup.start, setup.end, setup.lastMark)
  if (mark !== null) {
    try {
      if (!setup.reference) throw new Error('setup-incomplete')
      const { canvas, ...scored } = maskedScores(setup.near, setup.far)
      const flagged = ratios(scored.near, scored.far, setup.reference.near, setup.reference.far)
      await putFrame(page.db, {
        ...flagged,
        jpeg: canvas.toDataURL('image/jpeg', 0.85),
        capture_id: uuidv7(now),
        device_time: deviceTime(now),
        distance_km: setup.distanceKm,
        buffered: !navigator.onLine || frames.length > 0,
        attempts: 0
      })
      page.setup = { ...setup, lastMark: mark }
      await saveSetup(page.db, page.setup)
    } catch {
      await openCamera()
      return
    }
  }
  const queue = await loadFrames(page.db)
  renderQueue(queue)
  if (queue.length === 0) return
  if (!navigator.onLine) {
    announce(statusCopy.offline(queue.length, Date.parse(queue[0]!.device_time)), 'warn')
    return
  }
  if (now < page.retryAt) return
  for (const frame of queue) {
    if (document.visibilityState !== 'visible' || !navigator.onLine) break
    if (!daylight(Date.now(), setup.start, setup.end)) break
    if (!(await postFrame(frame, setup.token, setup.execUrl))) break
  }
  renderQueue(await loadFrames(page.db))
}

function paintPreview(): void {
  if (!page.video.videoWidth) return
  try {
    const canvas = page.preview
    if (canvas.width !== 640) canvas.width = 640
    const height = captureHeight(page.video.videoWidth, page.video.videoHeight)
    if (canvas.height !== height) canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return
    context.drawImage(page.video, 0, 0, canvas.width, canvas.height)
    context.fillStyle = '#000000'
    context.fillRect(0, (canvas.height * 2) / 3, canvas.width, canvas.height / 3 + 1)
  } catch {
    // Preview only; capture reads the video directly.
  }
}

async function init(): Promise<void> {
  const db = await openDb()
  page = {
    db,
    video: el<HTMLVideoElement>('live'),
    preview: el<HTMLCanvasElement>('preview'),
    status: el('status'),
    queue: el('queue'),
    wake: el('wake'),
    daylight: el('daylight'),
    formError: el('form-error'),
    setup: undefined,
    formReference: null,
    placing: null,
    cameraReady: false,
    cameraFatal: null,
    stream: null,
    wakeLock: null,
    rejectedToken: null,
    retryAt: 0,
    lastAnnounced: '',
    fetchingConfig: false
  }
  try {
    const response = await fetch('./config.json')
    if (response.ok) {
      const { ingest_url } = (await response.json()) as { ingest_url?: string }
      if (typeof ingest_url === 'string' && ingest_url && !el<HTMLInputElement>('exec-url').value)
        el<HTMLInputElement>('exec-url').value = ingest_url
    }
  } catch {
    // The pasted URL is the source of truth; the bundled default is a convenience.
  }
  const saved = await loadSetup(db)
  page.setup = saved ?? blankSetup(el<HTMLInputElement>('exec-url').value)
  writeForm(page.setup)
  renderDaylight()
  renderQueue(await loadFrames(db))

  el<HTMLButtonElement>('allow-camera').addEventListener('click', () => void openCamera())
  el<HTMLButtonElement>('hold-wake').addEventListener('click', () => void holdWake())

  for (const name of ['near', 'far'] as const)
    el<HTMLButtonElement>(`place-${name}`).addEventListener('click', () => {
      page.placing = page.placing === name ? null : name
      announce(
        page.placing
          ? `Tap the preview to place the ${page.placing === 'near' ? 'near-landmark' : 'far-skyline'} region. Number fields give the keyboard path.`
          : 'Tap placement off.',
        'muted'
      )
    })

  page.preview.addEventListener('pointerdown', (event) => {
    if (!page.placing || page.formReference) return
    const rect = page.preview.getBoundingClientRect()
    const region: Region = {
      x: Math.min(0.9, Math.max(0, (event.clientX - rect.left) / rect.width - 0.05)),
      y: Math.min(2 / 3 - 0.1, Math.max(0, (event.clientY - rect.top) / rect.height - 0.05)),
      width: 0.1,
      height: 0.1
    }
    const setup = page.setup
    if (!setup) return
    page.setup = page.placing === 'near' ? { ...setup, near: region } : { ...setup, far: region }
    page.placing = null
    writeForm(page.setup)
  })

  el<HTMLFormElement>('setup-form').addEventListener('input', () => drawOverlays())

  el<HTMLButtonElement>('capture-reference').addEventListener('click', () => {
    page.formError.hidden = true
    try {
      const { near, far } = formRegions()
      if (!validRegion(near) || !validRegion(far)) throw new Error('invalid-region')
      const { canvas, ...scored } = maskedScores(near, far)
      if (!(scored.near > 0 && scored.far > 0)) throw new Error('flat-reference')
      page.formReference = { jpeg: canvas.toDataURL('image/jpeg', 0.85), near: scored.near, far: scored.far }
      renderReference()
    } catch (error) {
      page.formError.hidden = false
      page.formError.textContent =
        error instanceof Error && error.message === 'flat-reference'
          ? 'The reference needs contrast in both regions. Choose a landmark and a skyline with light and dark detail, then capture again.'
          : 'No frame yet. Set both regions, then allow the camera and keep this page in front.'
    }
  })

  el<HTMLFormElement>('setup-form').addEventListener('submit', (event) => {
    event.preventDefault()
    const setup = page.setup
    if (!setup) return
    const form = readForm()
    const next: CameraSetup = {
      ...setup,
      execUrl: form.execUrl,
      token: form.token,
      distanceKm: form.distanceKm,
      near: form.near,
      far: form.far,
      reference: form.reference,
      consent: form.consent
    }
    if (!setupValid(next)) {
      page.formError.hidden = false
      page.formError.textContent =
        'Check the /exec URL, token, a positive distance, both regions above the lower third, a captured reference and consent.'
      page.formError.focus()
      return
    }
    page.formError.hidden = true
    void (async () => {
      const current = (await loadSetup(db)) ?? next
      const savedSetup: CameraSetup = {
        ...next,
        start: current.start,
        end: current.end,
        lastMark: current.lastMark,
        lastConfigDay: current.lastConfigDay
      }
      await saveSetup(db, savedSetup)
      page.setup = savedSetup
      page.rejectedToken = null
      page.placing = null
      writeForm(savedSetup)
      announce(statusCopy.saved())
      if (!page.cameraReady) await openCamera()
      await fetchConfig(savedSetup.execUrl)
      await tick()
    })()
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void holdWake()
      void tick()
    }
  })
  window.addEventListener('online', () => void tick())
  window.addEventListener('offline', () => void tick())

  let lastPaint = 0
  const loop = (time: number): void => {
    if (time - lastPaint >= 250) {
      lastPaint = time
      paintPreview()
    }
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
  setInterval(() => void tick(), TICK_MS)

  const url = page.setup.execUrl || el<HTMLInputElement>('exec-url').value
  if (url) {
    try {
      await fetchConfig(url)
    } catch {
      // fetchConfig announces its own failure copy.
    }
  }
  if (page.setup.reference) await openCamera()
  await tick()
}

void init()
