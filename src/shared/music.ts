import { F75_KEYS } from './layout'
import type { MusicStyle, RGB } from './types'

/** LED grid: 16 columns (LEDs are 6 * column + row), 6 rows with row 0 at the top. */
const COLUMNS = 16
const ROWS = 6

export const MUSIC_STYLES: { id: MusicStyle; label: string; description: string }[] = [
  { id: 'glow', label: 'Column glow', description: 'Each column fades brighter and dimmer with its part of the sound.' },
  { id: 'heat', label: 'Heat bars', description: 'Bars from the bottom, green at the base through yellow to red at the top.' },
  { id: 'rainbow', label: 'Rainbow bars', description: 'Bars from the bottom, each column its own colour of the rainbow.' },
]

const HEAT_ROWS: RGB[] = [
  [0, 255, 40],
  [80, 255, 0],
  [200, 255, 0],
  [255, 200, 0],
  [255, 100, 0],
  [255, 0, 0],
]

const clamp = (v: number) => Math.max(0, Math.min(1, v))

function hsv(h: number, s: number, v: number): RGB {
  const f = (n: number) => {
    const k = (n + (((h % 360) + 360) % 360) / 60) % 6
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1))
  }
  return [Math.round(f(5) * 255), Math.round(f(3) * 255), Math.round(f(1) * 255)]
}

const scale = ([r, g, b]: RGB, f: number): RGB => [Math.round(r * f), Math.round(g * f), Math.round(b * f)]

/**
 * Eases raw spectrum bands (which arrive in uneven bursts) into smooth levels.
 * Call `update` once per rendered frame.
 */
export class MusicMeter {
  levels: number[] = Array(COLUMNS).fill(0)
  private last: number | null = null

  update(bands: number[], t: number) {
    const dt = this.last === null ? 0 : Math.max(0, Math.min(0.25, t - this.last))
    this.last = t
    for (let i = 0; i < COLUMNS; i++) {
      const target = bands[i] ?? 0
      const current = this.levels[i]
      // Per-second rates: rise fairly quickly, fall gently.
      const rate = target > current ? 9 : 3.5
      this.levels[i] = current + (target - current) * (1 - Math.exp(-rate * dt))
    }
  }
}

/** Paint the music effect into `frame`. `gain` is the sensitivity multiplier. */
export function renderMusic(frame: RGB[], style: MusicStyle, t: number, meter: MusicMeter, brightness: number, gain: number) {
  for (const key of F75_KEYS) {
    const column = Math.floor(key.led / ROWS)
    const fromBottom = ROWS - 1 - (key.led % ROWS)
    const level = clamp((meter.levels[column] ?? 0) * gain)
    const hue = (column / COLUMNS) * 300 + t * 15
    let color: RGB = [0, 0, 0]

    if (style === 'heat' || style === 'rainbow') {
      const fill = clamp(level * ROWS - fromBottom)
      if (fill > 0) color = scale(style === 'heat' ? HEAT_ROWS[fromBottom] : hsv(hue, 1, 1), fill)
    } else {
      color = hsv(hue, 1, level * level)
    }
    frame[key.led] = scale(color, brightness)
  }
}
