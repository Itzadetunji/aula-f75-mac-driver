import { F75_KEYS } from './layout'
import type { MusicStyle, RGB } from './types'

/** LED grid: 16 columns (LEDs are 6 * column + row), 6 rows with row 0 at the top. */
const COLUMNS = 16
const ROWS = 6

export const MUSIC_STYLES: { id: MusicStyle; label: string; description: string }[] = [
  {
    id: 'horizontal',
    label: 'Horizontal',
    description: 'Each row is a band filling left to right: bass on the bottom row, treble on the top.',
  },
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
 * Bar motion like a regular spectrum analyser: jumps up to a new level at once,
 * then falls at a steady rate. Call `update` once per rendered frame.
 */
export class MusicMeter {
  levels: number[] = Array(COLUMNS).fill(0)
  private last: number | null = null

  update(bands: number[], t: number) {
    const dt = this.last === null ? 0 : Math.max(0, Math.min(0.25, t - this.last))
    this.last = t
    for (let i = 0; i < COLUMNS; i++) {
      // Falls the full height in about 0.6 s.
      this.levels[i] = Math.max(bands[i] ?? 0, this.levels[i] - 1.7 * dt)
    }
  }
}

/** Paint the music effect into `frame`. `gain` is the sensitivity multiplier. */
export function renderMusic(frame: RGB[], style: MusicStyle, t: number, meter: MusicMeter, brightness: number, gain: number) {
  // Horizontal: each row shows the loudest of its group of bands.
  const rowLevel = (fromBottom: number) =>
    clamp(Math.max(...meter.levels.slice(Math.floor((fromBottom * COLUMNS) / ROWS), Math.floor(((fromBottom + 1) * COLUMNS) / ROWS))) * gain)

  for (const key of F75_KEYS) {
    const column = Math.floor(key.led / ROWS)
    const fromBottom = ROWS - 1 - (key.led % ROWS)
    let color: RGB = [0, 0, 0]

    if (style === 'horizontal') {
      const fill = clamp(rowLevel(fromBottom) * COLUMNS - column)
      if (fill > 0) color = hsv(fromBottom * 55 + t * 10, 1, fill)
    } else {
      const level = clamp((meter.levels[column] ?? 0) * gain)
      const fill = clamp(level * ROWS - fromBottom)
      if (fill > 0) {
        color = scale(style === 'heat' ? HEAT_ROWS[fromBottom] : hsv((column / COLUMNS) * 300 + t * 15, 1, 1), fill)
      }
    }
    frame[key.led] = scale(color, brightness)
  }
}
