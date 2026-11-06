'use client'

import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from 'react'
import { formatNumber, formatTime } from '@skyclause/i18n/format'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Field, FieldGroup, FieldLabel } from '../../components/ui/field'
import { maskedCanvas, measure } from './frame'
import { validHours, validRegion, type Reference, type Region, type Setup } from './model'
import { useCamera } from './use-camera'
import { t } from './i18n'
import styles from './camera.module.css'

const emptyRegion = (): Region => ({ x: 0, y: 0, width: 0, height: 0 })

export function Camera({ path, sourceId, apiOrigin }: { path: string; sourceId: string; apiOrigin: string }) {
  const camera = useCamera(path, sourceId, apiOrigin)
  if (!camera.loaded)
    return (
      <main className={styles.camera}>
        <h1>{t('camera.title')}</h1>
        <p role="status">{t(`camera.${camera.status.key}`)}</p>
      </main>
    )
  return <CameraForm camera={camera} />
}

type Controller = ReturnType<typeof useCamera>
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
    <main className={styles.camera}>
      <header>
        <h1>{t('camera.title')}</h1>
        <p>{t('camera.intro')}</p>
      </header>
      <p role="status" aria-live="polite" aria-atomic="true" data-camera-status>
        {t(`camera.${camera.status.key}`, vars)}
      </p>
      <div className={styles.preview}>
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
        />
        {(['near', 'far'] as const).map((name) => {
          const region = name === 'near' ? near : far
          return validRegion(region) ? (
            <span
              key={name}
              aria-hidden="true"
              className={styles.region}
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
      <div className={styles.actions}>
        <Button
          variant="outline"
          disabled={camera.isOpening}
          onClick={() => {
            void camera.openCamera()
          }}
        >
          {t(camera.isOpening ? 'camera.opening' : 'camera.openCamera')}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            void camera.holdWake()
          }}
        >
          {t('camera.wakeHold')}
        </Button>
      </div>
      <p>{t(camera.wakeHeld ? 'camera.wakeHeld' : 'camera.wakeReleased')}</p>
      {camera.offlineReady && <p data-offline-ready>{t('camera.offlineReady')}</p>}
      <p data-camera-queue>{t(camera.queued ? 'camera.queue' : 'camera.emptyQueue', { n: camera.queued })}</p>
      <form onSubmit={submit} noValidate>
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
            />
          </Field>
          <div className={styles.hours}>
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
              />
            </Field>
          </div>
          <p id="camera-regions-help">{t('camera.regionsHelp')}</p>
          <RegionFields name="near" region={near} onChange={setNear} disabled={!!reference} />
          <RegionFields name="far" region={far} onChange={setFar} disabled={!!reference} />
          <div className={styles.actions}>
            <Button
              type="button"
              variant="outline"
              disabled={!!reference || !camera.cameraReady}
              onClick={() => setPlacing('near')}
            >
              {t('camera.tapNear')}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!!reference || !camera.cameraReady}
              onClick={() => setPlacing('far')}
            >
              {t('camera.tapFar')}
            </Button>
          </div>
          {placing && <p role="status">{t('camera.tapReady', { region: t(`camera.${placing}`) })}</p>}
          <div>
            <Button
              type="button"
              variant="outline"
              disabled={!!reference || !camera.cameraReady}
              onClick={captureReference}
            >
              {t('camera.reference')}
            </Button>
          </div>
          <p>{t(reference ? 'camera.referenceSaved' : 'camera.referenceNeeded')}</p>
          <p id="camera-privacy">{t('camera.privacy')}</p>
          <label className={styles.consent}>
            <input
              name="camera_consent"
              type="checkbox"
              autoComplete="off"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              aria-describedby="camera-privacy"
              required
            />
            {t('camera.consent')}
          </label>
          {error && (
            <p ref={errorRef} tabIndex={-1} className={styles.error} role="alert">
              {t(`camera.${error}`)}
            </p>
          )}
          <div>
            <Button type="submit" disabled={saving}>
              {t(saving ? 'camera.saving' : 'camera.save')}
            </Button>
          </div>
        </FieldGroup>
      </form>
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
    <fieldset disabled={disabled} className={styles.regions}>
      <legend>{t(`camera.${name}`)}</legend>
      <FieldGroup className={styles.coordinates}>
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
            />
          </Field>
        ))}
      </FieldGroup>
    </fieldset>
  )
}
