'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { captureFrame, maskedCanvas } from './frame'
import { CameraRunner, type CameraEvent } from './runner'
import { cameraTransport } from './operations'
import { prepareOffline } from './offline'
import { openCameraStore, type CameraStore } from './storage'
import type { Setup } from './model'

export function useCamera(path: string, sourceId: string, apiOrigin: string) {
  const video = useRef<HTMLVideoElement>(null)
  const preview = useRef<HTMLCanvasElement>(null)
  const store = useRef<CameraStore | null>(null)
  const runner = useRef<CameraRunner | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const wake = useRef<WakeLockSentinel | null>(null)
  const mounted = useRef(false)
  const opening = useRef(false)
  const [saved, setSaved] = useState<Setup | undefined>()
  const [loaded, setLoaded] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [isOpening, setOpening] = useState(false)
  const [queued, setQueued] = useState(0)
  const [status, setStatus] = useState<CameraEvent>({ key: 'loading' })
  const [wakeHeld, setWakeHeld] = useState(false)
  const [offlineReady, setOfflineReady] = useState(false)

  const emit = useCallback((event: CameraEvent) => {
    if (!mounted.current) return
    if (event.key === 'queue') setQueued(Number(event.vars?.n ?? 0))
    else if (event.key === 'hours')
      setSaved((current) =>
        current ? { ...current, start: String(event.vars?.start), end: String(event.vars?.end) } : current
      )
    else setStatus((previous) => (JSON.stringify(previous) === JSON.stringify(event) ? previous : event))
  }, [])

  const holdWake = useCallback(async () => {
    if (document.visibilityState !== 'visible' || (wake.current && !wake.current.released)) return
    try {
      if (!navigator.wakeLock) throw new Error('wake-lock-unavailable')
      const lock = await navigator.wakeLock.request('screen')
      if (!mounted.current) {
        await lock.release()
        return
      }
      wake.current = lock
      setWakeHeld(true)
      lock.addEventListener('release', () => {
        wake.current = null
        if (mounted.current) {
          setWakeHeld(false)
          emit({ key: 'wakeReleased' })
        }
      })
    } catch {
      emit({ key: 'wakeReleased' })
    }
  }, [emit])

  const openCamera = useCallback(async () => {
    if (opening.current) return
    if (!navigator.mediaDevices?.getUserMedia) {
      emit({ key: 'unsupported' })
      return
    }
    opening.current = true
    setOpening(true)
    try {
      stream.current?.getTracks().forEach((track) => track.stop())
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 } },
        audio: false
      })
      if (!mounted.current) {
        media.getTracks().forEach((track) => track.stop())
        return
      }
      stream.current = media
      const element = video.current!
      element.srcObject = media
      await element.play()
      setCameraReady(true)
      await holdWake()
    } catch (error) {
      setCameraReady(false)
      emit({
        key:
          error instanceof DOMException && ['NotAllowedError', 'PermissionDeniedError'].includes(error.name)
            ? 'permissionDenied'
            : 'captureError'
      })
    } finally {
      opening.current = false
      if (mounted.current) setOpening(false)
    }
  }, [emit, holdWake])

  useEffect(() => {
    mounted.current = true
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | undefined
    let paint = 0
    let lastPaint = 0
    const draw = (time: number) => {
      if (cancelled) return
      if (time - lastPaint >= 250 && video.current?.readyState && video.current.readyState >= 2 && preview.current) {
        maskedCanvas(video.current, preview.current)
        lastPaint = time
      }
      paint = requestAnimationFrame(draw)
    }
    const refresh = () => {
      if (document.visibilityState === 'visible') {
        void holdWake()
        void runner.current?.step()
      }
    }
    void openCameraStore(path)
      .then(async (db) => {
        if (cancelled) {
          db.close()
          return
        }
        store.current = db
        const setup = await db.setup()
        const frames = await db.frames()
        if (cancelled) return
        setSaved(setup)
        setQueued(frames.length)
        setLoaded(true)
        emit({ key: setup?.reference ? 'saved' : 'referenceNeeded' })
        runner.current = new CameraRunner({
          store: db,
          now: Date.now,
          online: () => navigator.onLine,
          visible: () => document.visibilityState === 'visible',
          capture: async (config) => captureFrame(video.current!, config),
          post: cameraTransport(sourceId, apiOrigin),
          emit
        })
        timer = setInterval(() => {
          void runner.current?.step()
        }, 1000)
        paint = requestAnimationFrame(draw)
        await runner.current.step()
      })
      .catch(() => emit({ key: 'storageError' }))
    void prepareOffline(path)
      .then(() => {
        if (!cancelled) setOfflineReady(true)
      })
      .catch(() => emit({ key: 'offlineUnavailable' }))
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('online', refresh)
    window.addEventListener('offline', refresh)
    return () => {
      cancelled = true
      mounted.current = false
      clearInterval(timer)
      cancelAnimationFrame(paint)
      runner.current?.stop()
      store.current?.close()
      stream.current?.getTracks().forEach((track) => track.stop())
      void wake.current?.release()
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('online', refresh)
      window.removeEventListener('offline', refresh)
    }
  }, [path, sourceId, apiOrigin, emit, holdWake, openCamera])

  const save = async (setup: Setup) => {
    if (!store.current) throw new Error('camera-store-unavailable')
    const current = await store.current.setup()
    await store.current.saveSetup({
      ...current,
      ...setup,
      ...(current?.token !== setup.token ? { rejectedToken: undefined } : {})
    })
    setSaved(setup)
    emit({ key: 'saved' })
    if (!cameraReady) await openCamera()
    void runner.current?.step()
  }
  return {
    video,
    preview,
    saved,
    loaded,
    cameraReady,
    isOpening,
    queued,
    status,
    emit,
    wakeHeld,
    offlineReady,
    openCamera,
    holdWake,
    save
  }
}
