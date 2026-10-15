import { hsvToRgb } from '@shared/effects'
import { F75_ROWS } from '@shared/layout'
import { MAX_BRIGHTNESS, MULTICOLOR, ONBOARD_COLORS, type EffectSettings } from '@shared/onboard'
import type { RGB } from '@shared/types'

/** Approximations of the firmware effects, for previewing them in the app. */

export interface Press {
  led: number
  /** Seconds, on the same clock as the `t` passed to `renderOnboardDemo`. */
  at: number
}

interface Pos {
  led: number
  x: number
  y: number
}

/** Key centres in key units, measured from the layout's widths and gaps. */
const POSITIONS: Pos[] = F75_ROWS.flatMap((row, y) => {
  let cursor = 0
  return row.map((key) => {
    cursor += key.gap ?? 0
    const x = cursor + (key.w ?? 1) / 2
    cursor += key.w ?? 1
    return { led: key.led, x, y }
  })
})
const BY_LED = new Map(POSITIONS.map((p) => [p.led, p]))
const WIDTH = Math.max(...POSITIONS.map((p) => p.x)) + 0.5
const CX = WIDTH / 2
const CY = 2.5

/** Boustrophedon path through every key, used by the snake. */
const SNAKE_PATH = F75_ROWS.flatMap((row, y) => {
  const leds = row.map((k) => k.led)
  return y % 2 ? leds.reverse() : leds
})

const hash = (n: number) => {
  const s = Math.sin(n * 12.9898) * 43758.5453
  return s - Math.floor(s)
}

const wrap = (h: number) => ((h % 360) + 360) % 360
const triangle = (p: number) => 1 - Math.abs(((p % 2) + 2) % 2 - 1)

interface Sample {
  /** 0–1 */
  level: number
  /** Hue used when the effect is multicolour. */
  hue: number
}

function sample(effectId: number, p: Pos, t: number, rate: number, presses: Press[]): Sample {
  const dx = p.x - CX
  const dy = (p.y - CY) * 1.6
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI
  const dist = Math.hypot(dx, dy)

  switch (effectId) {
    case 1:
      return { level: 1, hue: (p.x / WIDTH) * 300 }
    case 2: {
      const phase = (t * rate) / 2
      return { level: Math.sin(phase * Math.PI) ** 2, hue: Math.floor(phase) * 60 }
    }
    case 3:
      return { level: 1, hue: t * rate * 60 }
    case 4: {
      let level = 0
      let hue = 0
      for (const press of presses) {
        const origin = BY_LED.get(press.led)
        if (!origin || origin.y !== p.y) continue
        const age = t - press.at - Math.abs(p.x - origin.x) / (rate * 14)
        if (age < 0 || age > 0.6) continue
        const l = 1 - age / 0.6
        if (l > level) [level, hue] = [l, hash(press.led) * 360]
      }
      return { level, hue }
    }
    case 5: {
      const period = 3 / rate
      const local = (t + hash(p.led) * period) % period
      const drop = Math.floor((t + hash(p.led) * period) / period)
      return { level: local < 0.6 ? 1 - local / 0.6 : 0, hue: hash(p.led * 7 + drop) * 360 }
    }
    case 6:
      return { level: 1, hue: angle + t * rate * 90 }
    case 7: {
      let level = 0
      let hue = 0
      for (const press of presses) {
        const origin = BY_LED.get(press.led)
        if (!origin) continue
        const age = t - press.at
        const d = Math.hypot(p.x - origin.x, (p.y - origin.y) * 1.6)
        const l = Math.max(0, 1 - Math.abs(d - age * rate * 8) / 1.2) * Math.max(0, 1 - age / 1.6)
        if (l > level) [level, hue] = [l, d * 25 + hash(press.led) * 360]
      }
      return { level, hue }
    }
    case 8: {
      const twinkle = Math.max(0, Math.sin((t * rate * 0.5 + hash(p.led)) * Math.PI * 2)) ** 6
      return { level: twinkle, hue: hash(p.led + 3) * 360 }
    }
    case 9: {
      let level = 1
      for (const press of presses) {
        if (press.led !== p.led) continue
        level = Math.min(level, Math.min(1, ((t - press.at) * rate) / 1.5))
      }
      return { level, hue: (p.x / WIDTH) * 300 }
    }
    case 10: {
      const head = (t * rate * 10) % SNAKE_PATH.length
      const behind = (head - SNAKE_PATH.indexOf(p.led) + SNAKE_PATH.length) % SNAKE_PATH.length
      return { level: behind < 8 ? 1 - behind / 8 : 0, hue: (head / SNAKE_PATH.length) * 360 }
    }
    case 11:
      return {
        level: 0.35 + 0.65 * ((Math.sin((p.x / WIDTH) * Math.PI * 4 - t * rate * 3) + 1) / 2),
        hue: (p.x / WIDTH) * 360 - t * rate * 120,
      }
    case 12: {
      let level = 0
      for (const press of presses) {
        if (press.led === p.led) level = Math.max(level, 1 - (t - press.at) / (2 / rate))
      }
      return { level, hue: hash(p.led) * 360 }
    }
    case 13:
      return {
        level: (Math.sin((p.x / WIDTH) * Math.PI * 3 - t * rate * 3) + 1) / 2,
        hue: (p.x / WIDTH) * 360 + t * rate * 30,
      }
    case 14: {
      const bar = triangle(t * rate * 0.35) * WIDTH
      return { level: Math.max(0, 1 - Math.abs(p.x - bar) / 1.8), hue: (bar / WIDTH) * 360 }
    }
    case 15: {
      const blades = wrap(angle + t * rate * 90)
      return { level: Math.sin((blades * Math.PI) / 45) > 0 ? 1 : 0.15, hue: Math.floor(blades / 90) * 90 }
    }
    case 16:
      return { level: 1, hue: p.y * 45 + p.x * 6 - t * rate * 120 }
    case 17:
      return { level: 1, hue: dist * 35 - t * rate * 100 }
    case 18:
      return { level: 1, hue: angle + dist * 40 - t * rate * 150 }
    default:
      return { level: 0, hue: 0 }
  }
}

export function renderOnboardDemo(
  effectId: number,
  settings: EffectSettings | undefined,
  hasColor: boolean,
  t: number,
  presses: Press[],
): RGB[] {
  if (!settings || settings.brightness === 0) return []
  const v = 0.2 + 0.8 * (settings.brightness / MAX_BRIGHTNESS)
  const rate = 0.4 + settings.speed * 0.4
  const multicolor = !hasColor || settings.color === MULTICOLOR
  const base = ONBOARD_COLORS[settings.color]?.rgb ?? [255, 255, 255]

  const frame: RGB[] = []
  for (const p of POSITIONS) {
    const { level, hue } = sample(effectId, p, t, rate, presses)
    if (level <= 0) continue
    const k = level * v
    frame[p.led] = multicolor
      ? hsvToRgb(wrap(hue), 1, k)
      : [Math.round(base[0] * k), Math.round(base[1] * k), Math.round(base[2] * k)]
  }
  return frame
}

const NAMED_CODES: Record<string, string> = {
  Escape: 'esc',
  Backquote: 'grave',
  Minus: 'minus',
  Equal: 'equal',
  Backspace: 'backspace',
  Delete: 'delete',
  Insert: 'insert',
  Home: 'home',
  End: 'end',
  PageUp: 'pgup',
  PageDown: 'pgdn',
  Tab: 'tab',
  BracketLeft: 'lbracket',
  BracketRight: 'rbracket',
  Backslash: 'backslash',
  CapsLock: 'caps',
  Semicolon: 'semicolon',
  Quote: 'quote',
  Enter: 'enter',
  ShiftLeft: 'lshift',
  ShiftRight: 'rshift',
  Comma: 'comma',
  Period: 'period',
  Slash: 'slash',
  ControlLeft: 'lctrl',
  ControlRight: 'rctrl',
  MetaLeft: 'lwin',
  MetaRight: 'lwin',
  AltLeft: 'lalt',
  AltRight: 'ralt',
  Space: 'space',
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

/** Layout key id for a `KeyboardEvent.code`, if the F75 has that key. */
export function keyIdFromCode(code: string): string | undefined {
  if (NAMED_CODES[code]) return NAMED_CODES[code]
  const letter = /^Key([A-Z])$/.exec(code)
  if (letter) return letter[1].toLowerCase()
  const digit = /^Digit(\d)$/.exec(code)
  if (digit) return digit[1]
  const fn = /^F(\d{1,2})$/.exec(code)
  if (fn && Number(fn[1]) <= 12) return `f${fn[1]}`
  return undefined
}
