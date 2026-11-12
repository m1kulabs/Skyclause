'use client'

import { useEffect, useRef, useState, type FormEvent, type PointerEvent, type ReactNode } from 'react'
import { formatNumber, formatTime } from '@skyclause/i18n/format'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Skeleton } from '../../components/ui/skeleton'
import { Field, FieldGroup, FieldLabel } from '../../components/ui/field'
import { maskedCanvas, measure } from './frame'
import { validHours, validRegion, type Reference, type Region, type Setup } from './model'
import { useCamera } from './use-camera'
import { t } from './i18n'

const emptyRegion = (): Region => ({ x: 0, y: 0, width: 0, height: 0 })

/** One column, centred at 760px on a wide screen; the phone's own 16px gutters and the bottom action bar's room. */
const PAGE = 'mx-auto flex w-full max-w-[760px] min-w-0 flex-col gap-8 px-4 pt-6 pb-8 [overflow-wrap:anywhere] sm:px-6'
/** Thumb-sized: 48px controls, wrapping labels, never clipped. */
const TOUCH = 'h-auto min-h-12 whitespace-normal px-5 py-2 text-center'
const FIELD = 'h-12'

export function Camera({ path, sourceId, apiOrigin }: { path: string; sourceId: string; apiOrigin: string }) {
  const camera = useCamera(path, sourceId, apiOrigin)
  if (!camera.loaded)
    return (
      <main className={PAGE}>
        <h1 className="type-title">{t('camera.title')}</h1>
        <Skeleton className="h-24 rounded-xl" aria-hidden="true" />
        <p role="status" className="type-text">
          {t(`camera.${camera.status.key}`)}
        </p>
      </main>
    )
  return <CameraForm camera={camera} />
}

type Controller = ReturnType<typeof useCamera>

function Group({ title, children, id }: { title: string; children: ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-gap">
      <h2 id={id} className="type-section">
        {title}
      </h2>
      {children}
    </section>
  )
}

function CameraForm({ camera }: { camera: Controller }) {
  const [token, setToken] = useState(camera.saved?.token ?? '')
  const [distance, setDistance] = useState(String(camera.saved?.distance_km ?? ''))
  const [start, setStart] = useState(camera.saved?.start ?? '07:15')
  const [end, setEnd] = useState(camera.saved?.end ?? '19:00')
  const [near, setNear] = useState(camera.saved?.near ?? emptyRegion())
  const [far, setFar] = useState(camera.saved?.far ?? emptyRegion())
  const [reference, setReference] = useState<Reference | null>(camera.saved?.reference ?? null)
  const [consent, setConsent] = useState(camera.saved?.consent ?? false)
  const [placing, setPlacing] = useState<'near' | 'far' | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (error) errorRef.current?.focus()
  }, [error])
  const autoStart = useRef(!!camera.saved?.reference)
  const openCamera = camera.openCamera
  useEffect(() => {
    if (autoStart.current) void openCamera()
  }, [openCamera])
  const storedStart = camera.saved?.start,
    storedEnd = camera.saved?.end
  useEffect(() => {
    if (storedStart) setStart(storedStart)
    if (storedEnd) setEnd(storedEnd)
  }, [storedStart, storedEnd])

  const fail = (key: string) => {
    setError(key)
  }
  const captureReference = () => {
    if (!validRegion(near) || !validRegion(far)) {
      fail('invalid')
      return
    }
    try {
      const canvas = document.createElement('canvas')
      maskedCanvas(camera.video.current!, canvas)
      const score = measure(canvas, near, far)
      if (!(score.near > 0 && score.far > 0)) {
        fail('invalidReference')
        return
      }
      setReference({ jpeg: canvas.toDataURL('image/jpeg', 0.85), ...score })
      setPlacing(null)
      setError(null)
    } catch {
      fail('captureError')
    }
  }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const config: Setup = {
      token: token.trim(),
      distance_km: Number(distance),
      start,
      end,
      near,
      far,
      reference,
      consent
    }
    if (
      !config.token ||
      /[\r\n]/.test(config.token) ||
      !Number.isFinite(config.distance_km) ||
      config.distance_km <= 0 ||
      !validHours(start, end) ||
      !validRegion(near) ||
      !validRegion(far) ||
      !reference ||
      !consent
    ) {
      fail('invalid')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await camera.save(config)
    } catch {
      fail('storageError')
    } finally {
      setSaving(false)
    }
  }
  const place = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!placing || reference) return
    const rect = event.currentTarget.getBoundingClientRect()
    const region = {
      x: Math.min(0.9, Math.max(0, (event.clientX - rect.left) / rect.width - 0.05)),
      y: Math.min(2 / 3 - 0.1, Math.max(0, (event.clientY - rect.top) / rect.height - 0.05)),
      width: 0.1,
      height: 0.1
    }
    if (placing === 'near') setNear(region)
    else setFar(region)
    setPlacing(null)
  }
  const vars: Record<string, string | number> = { ...camera.status.vars }
  if (typeof vars.at === 'number') {
    vars.time = formatTime(vars.at, 'en')
    delete vars.at
  }
  for (const key of ['ratio_near', 'ratio_far', 's'])
    if (typeof vars[key] === 'number') vars[key] = formatNumber(Math.round(vars[key] * 100) / 100, 'en')

  return (
    <main className={PAGE}>
      <header className="flex flex-col gap-2">
        <h1 className="type-title">{t('camera.title')}</h1>
        <p className="type-text">{t('camera.intro')}</p>
      </header>

      {/* The answer first: is this phone posting? The live line, the queue and the offline note. */}
      <section className="flex flex-col gap-2 rounded-xl bg-card p-pad">
        <p role="status" aria-live="polite" aria-atomic="true" data-camera-status className="type-section">
          {t(`camera.${camera.status.key}`, vars)}
        </p>
        <p data-camera-queue className="type-body text-muted-foreground">
          {t(camera.queued ? 'camera.queue' : 'camera.emptyQueue', { n: camera.queued })}
        </p>
        {camera.offlineReady && (
          <p data-offline-ready className="type-small text-muted-foreground">
            {t('camera.offlineReady')}
          </p>
        )}
      </section>

      <div className="flex flex-col gap-gap">
        <div className="relative overflow-hidden rounded-xl bg-raised">
          {/* The live video is never displayed or persisted; only the masked canvas is visible. */}
          <video ref={camera.video} autoPlay muted playsInline hidden aria-hidden="true" />
          <canvas
            ref={camera.preview}
            width={640}
            height={480}
            role="img"
            aria-label={t('camera.preview')}
            aria-describedby="camera-regions-help"
            onPointerDown={place}
            className="block aspect-[4/3] h-auto w-full"
          />
          {(['near', 'far'] as const).map((name) => {
            const region = name === 'near' ? near : far
            return validRegion(region) ? (
              <span
                key={name}
                aria-hidden="true"
                className="pointer-events-none absolute rounded-sm border-2 border-ink outline-1 outline-ground data-[region=far]:border-dashed"
                data-region={name}
                style={{
                  left: `${region.x * 100}%`,
                  top: `${region.y * 100}%`,
                  width: `${region.width * 100}%`,
                  height: `${region.height * 100}%`
                }}
              />
            ) : null
          })}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            size="lg"
            className={TOUCH}
            disabled={camera.isOpening}
            onClick={() => {
              void camera.openCamera()
            }}
          >
            {t(camera.isOpening ? 'camera.opening' : 'camera.openCamera')}
          </Button>
          <Button
            variant="outline"
            size="lg"
            className={TOUCH}
            onClick={() => {
              void camera.holdWake()
            }}
          >
            {t('camera.wakeHold')}
          </Button>
        </div>
        <p className="type-small text-muted-foreground">
          {t(camera.wakeHeld ? 'camera.wakeHeld' : 'camera.wakeReleased')}
        </p>
      </div>

      <form id="camera-setup" onSubmit={submit} noValidate className="flex flex-col gap-section">
        <Group id="camera-device" title={t('camera.groupDevice')}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="device-token">{t('camera.token')}</FieldLabel>
              <Input
                id="device-token"
                name="device_token"
                type="password"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                required
                className={FIELD}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="distance-km">{t('camera.distance')}</FieldLabel>
              <Input
                id="distance-km"
                name="distance_km"
                type="number"
                inputMode="decimal"
                autoComplete="off"
                min="0.001"
                step="any"
                required
                value={distance}
                onChange={(e) => setDistance(e.target.value)}
                className={FIELD}
              />
            </Field>
            <div className="grid grid-cols-2 gap-gap max-[360px]:grid-cols-1">
              <Field>
                <FieldLabel htmlFor="day-start">{t('camera.dayStart')}</FieldLabel>
                <Input
                  id="day-start"
                  name="camera_day_start"
                  type="time"
                  autoComplete="off"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  required
                  className={FIELD}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="day-end">{t('camera.dayEnd')}</FieldLabel>
                <Input
                  id="day-end"
                  name="camera_day_end"
                  type="time"
                  autoComplete="off"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  required
                  className={FIELD}
                />
              </Field>
            </div>
          </FieldGroup>
        </Group>

        <Group id="camera-regions" title={t('camera.groupRegions')}>
          <p id="camera-regions-help" className="type-body text-muted-foreground">
            {t('camera.regionsHelp')}
          </p>
          <RegionFields name="near" region={near} onChange={setNear} disabled={!!reference} />
          <RegionFields name="far" region={far} onChange={setFar} disabled={!!reference} />
          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className={TOUCH}
              disabled={!!reference || !camera.cameraReady}
              onClick={() => setPlacing('near')}
            >
              {t('camera.tapNear')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className={TOUCH}
              disabled={!!reference || !camera.cameraReady}
              onClick={() => setPlacing('far')}
            >
              {t('camera.tapFar')}
            </Button>
          </div>
          {placing && (
            <p role="status" className="type-body">
              {t('camera.tapReady', { region: t(`camera.${placing}`) })}
            </p>
          )}
        </Group>

        <Group id="camera-reference" title={t('camera.groupReference')}>
          <p className="type-body text-muted-foreground">
            {t(reference ? 'camera.referenceSaved' : 'camera.referenceNeeded')}
          </p>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className={TOUCH}
            disabled={!!reference || !camera.cameraReady}
            onClick={captureReference}
          >
            {t('camera.reference')}
          </Button>
        </Group>

        <Group id="camera-send" title={t('camera.groupSend')}>
          <p id="camera-privacy" className="type-body text-muted-foreground">
            {t('camera.privacy')}
          </p>
          <label className="flex min-h-14 cursor-pointer items-start gap-4 rounded-xl bg-card p-4 type-text">
            <input
              name="camera_consent"
              type="checkbox"
              autoComplete="off"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              aria-describedby="camera-privacy"
              required
              className="mt-0.5 size-6 shrink-0"
            />
            {t('camera.consent')}
          </label>
        </Group>
      </form>
      {/* The bar sits in the page, not the form, so it stays at the thumb's reach from the first screen; the error is right above its button. */}
      <div className="sticky bottom-0 -mx-4 flex flex-col gap-3 rounded-t-xl bg-card px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:-mx-6 sm:px-6">
        {error && (
          <p ref={errorRef} tabIndex={-1} role="alert" className="type-body font-medium outline-none">
            {t(`camera.${error}`)}
          </p>
        )}
        <Button type="submit" form="camera-setup" size="lg" className="w-full" disabled={saving}>
          {t(saving ? 'camera.saving' : 'camera.save')}
        </Button>
      </div>
    </main>
  )
}

function RegionFields({
  name,
  region,
  onChange,
  disabled
}: {
  name: 'near' | 'far'
  region: Region
  onChange(region: Region): void
  disabled: boolean
}) {
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="type-card-title mb-3 p-0">{t(`camera.${name}`)}</legend>
      <FieldGroup className="grid grid-cols-2 gap-gap rounded-xl bg-card p-pad">
        {(['x', 'y', 'width', 'height'] as const).map((key) => (
          <Field key={key}>
            <FieldLabel htmlFor={`${name}-${key}`}>{t(`camera.${key}`)}</FieldLabel>
            <Input
              id={`${name}-${key}`}
              name={`${name}_${key}`}
              type="number"
              inputMode="decimal"
              autoComplete="off"
              min={key === 'width' || key === 'height' ? 0.1 : 0}
              max={key === 'y' || key === 'height' ? 66.666666 : 100}
              step="any"
              value={Number((region[key] * 100).toFixed(4))}
              onChange={(e) => onChange({ ...region, [key]: Number(e.target.value) / 100 })}
              required
              data-numeric
              // Once the reference is captured the regions are fixed: they read as values, not as dimmed fields.
              className={`${FIELD} disabled:border-transparent disabled:bg-transparent disabled:opacity-100`}
            />
          </Field>
        ))}
      </FieldGroup>
    </fieldset>
  )
}
