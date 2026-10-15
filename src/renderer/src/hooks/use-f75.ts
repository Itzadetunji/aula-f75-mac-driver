import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_LIGHTING, type DeviceStatus, type LightingState } from '@shared/types'

export function useDeviceStatus() {
  const [status, setStatus] = useState<DeviceStatus | null>(null)
  useEffect(() => {
    void window.f75.getStatus().then(setStatus)
    return window.f75.onStatus(setStatus)
  }, [])
  return status
}

export function useLighting() {
  const [lighting, setLocal] = useState<LightingState>(DEFAULT_LIGHTING)
  const pending = useRef<LightingState | null>(null)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    void window.f75.getLighting().then(setLocal)
  }, [])

  // Sliders and colour pickers fire continuously; coalesce writes to the main process.
  const update = useCallback((patch: Partial<LightingState> | ((prev: LightingState) => Partial<LightingState>)) => {
    setLocal((prev) => {
      const next = { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }
      pending.current = next
      if (timer.current === null) {
        timer.current = window.setTimeout(() => {
          timer.current = null
          if (pending.current) void window.f75.setLighting(pending.current)
        }, 30)
      }
      return next
    })
  }, [])

  return [lighting, update] as const
}

export function useAnimationTime() {
  const [t, setT] = useState(0)
  useEffect(() => {
    let raf = 0
    const start = performance.now()
    const loop = () => {
      setT((performance.now() - start) / 1000)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  return t
}
