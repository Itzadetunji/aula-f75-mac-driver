import { F75_KEYS, LED_SLOTS } from './layout'
import { renderMusic, type MusicMeter } from './music'
import type { LightingState, RGB } from './types'

export { MusicMeter, MUSIC_STYLES } from './music'

export function hsvToRgb(h: number, s: number, v: number): RGB {
  const f = (n: number) => {
    const k = (n + h / 60) % 6
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1))
  }
  return [Math.round(f(5) * 255), Math.round(f(3) * 255), Math.round(f(1) * 255)]
}

const scale = ([r, g, b]: RGB, factor: number): RGB => [
  Math.round(r * factor),
  Math.round(g * factor),
  Math.round(b * factor),
]

/** Normalised horizontal position (0–1) per LED, used by the wave effect. */
const ledX = new Map<number, number>(F75_KEYS.map((key) => [key.led, Math.floor(key.led / 6) / 15]))

/** Whether the effect needs to be re-rendered every tick. */
export const isAnimated = (state: LightingState) =>
  state.effect === 'breathing' || state.effect === 'spectrum' || state.effect === 'wave' || state.effect === 'music'

/**
 * Render one frame of colours (one entry per LED slot) at time `t` in seconds.
 * `meter` carries the eased audio levels for the music effect.
 */
export function renderFrame(state: LightingState, t: number, meter?: MusicMeter): RGB[] {
  const brightness = state.brightness / 100
  const rate = 0.1 + (state.speed / 100) * 1.9
  const frame: RGB[] = Array.from({ length: LED_SLOTS }, () => [0, 0, 0])

  switch (state.effect) {
    case 'static':
      for (const key of F75_KEYS) frame[key.led] = scale(state.color, brightness)
      break
    case 'breathing': {
      const level = (Math.sin(t * rate * Math.PI) + 1) / 2
      for (const key of F75_KEYS) frame[key.led] = scale(state.color, brightness * level)
      break
    }
    case 'spectrum': {
      const color = hsvToRgb((t * rate * 60) % 360, 1, brightness)
      for (const key of F75_KEYS) frame[key.led] = color
      break
    }
    case 'wave':
      for (const key of F75_KEYS) {
        const hue = ((ledX.get(key.led) ?? 0) * 360 - t * rate * 120) % 360
        frame[key.led] = hsvToRgb((hue + 360) % 360, 1, brightness)
      }
      break
    case 'music':
      // Speed acts as sensitivity.
      if (meter) renderMusic(frame, state.musicStyle, t, meter, brightness, 0.5 + state.speed / 100)
      break
    case 'custom':
      for (const key of F75_KEYS) frame[key.led] = scale(state.perKey[key.led] ?? [0, 0, 0], brightness)
      break
    case 'off':
    case 'hardware':
      break
  }
  return frame
}
