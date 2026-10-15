import type { RGB } from './types'

/**
 * The keyboard's stored lighting settings page (read 0x84 / write 0x04, 128 bytes).
 * Byte 0x0A is the active effect; from 0x3A each effect has two bytes:
 * brightness, then (speed << 4) | colour.
 */
export const PAGE_LENGTH = 128
export const PER_KEY_FLAG_OFFSET = 0x09
export const EFFECT_OFFSET = 0x0a
export const EFFECT_TABLE_OFFSET = 0x3a

export const MAX_BRIGHTNESS = 9
export const MAX_SPEED = 4
/** Colour value meaning "the firmware cycles colours itself". */
export const MULTICOLOR = 7

export const OFF_EFFECT = 0
export const SELF_DEFINE_EFFECT = 21

export interface OnboardEffect {
  /** Value stored at byte 0x0A; also its key under `onboardEffects` in the locale files. */
  id: number
  hasSpeed: boolean
  hasColor: boolean
  /** Lights up in response to key presses. */
  reactive?: boolean
  /** Stays dark on the F75 (model 0xC6) even with valid settings, including via Fn. */
  unsupported?: boolean
}

export const ONBOARD_EFFECTS: OnboardEffect[] = [
  {
    id: 1,
    hasSpeed: false,
    hasColor: true,
  },
  {
    id: 2,
    hasSpeed: true,
    hasColor: true,
  },
  {
    id: 3,
    hasSpeed: true,
    hasColor: false,
  },
  {
    id: 4,
    hasSpeed: true,
    hasColor: true,
    reactive: true,
  },
  {
    id: 5,
    hasSpeed: true,
    hasColor: true,
  },
  {
    id: 6,
    unsupported: true,
    hasSpeed: true,
    hasColor: true,
  },
  {
    id: 7,
    hasSpeed: true,
    hasColor: true,
    reactive: true,
  },
  {
    id: 8,
    hasSpeed: true,
    hasColor: true,
  },
  {
    id: 9,
    hasSpeed: true,
    hasColor: true,
    reactive: true,
  },
  {
    id: 10,
    hasSpeed: true,
    hasColor: true,
  },
  {
    id: 11,
    hasSpeed: true,
    hasColor: true,
  },
  {
    id: 12,
    hasSpeed: true,
    hasColor: true,
    reactive: true,
  },
  {
    id: 13,
    hasSpeed: true,
    hasColor: true,
  },
  {
    id: 14,
    unsupported: true,
    hasSpeed: true,
    hasColor: true,
  },
  {
    id: 15,
    hasSpeed: true,
    hasColor: false,
  },
  {
    id: 16,
    hasSpeed: true,
    hasColor: false,
  },
  {
    id: 17,
    hasSpeed: true,
    hasColor: false,
  },
  {
    id: 18,
    unsupported: true,
    hasSpeed: true,
    hasColor: true,
  },
  {
    id: SELF_DEFINE_EFFECT,
    hasSpeed: false,
    hasColor: false,
  },
  {
    id: OFF_EFFECT,
    hasSpeed: false,
    hasColor: false,
  },
]

/** `id` is the key under `onboardColors` in the locale files. */
export const ONBOARD_COLORS: { id: string; rgb: RGB }[] = [
  { id: 'red', rgb: [255, 0, 0] },
  { id: 'green', rgb: [0, 255, 0] },
  { id: 'blue', rgb: [0, 0, 255] },
  { id: 'yellow', rgb: [255, 255, 0] },
  { id: 'magenta', rgb: [255, 0, 255] },
  { id: 'cyan', rgb: [0, 255, 255] },
  { id: 'white', rgb: [255, 255, 255] },
]

export interface EffectSettings {
  brightness: number
  speed: number
  color: number
}

export interface OnboardConfig {
  effect: number
  perKey: boolean
  /** Effect id -> its stored settings. */
  settings: Record<number, EffectSettings>
}

/** Effects with an entry in the per-effect table (everything except Off). */
const hasSlot = (id: number) => id > 0 && EFFECT_TABLE_OFFSET + id * 2 <= PAGE_LENGTH - 2

const slotOffset = (id: number) => EFFECT_TABLE_OFFSET + (id - 1) * 2

export function decodeOnboard(bytes: number[]): OnboardConfig {
  const settings: Record<number, EffectSettings> = {}
  for (const { id } of ONBOARD_EFFECTS) {
    if (!hasSlot(id)) continue
    const at = slotOffset(id)
    settings[id] = { brightness: bytes[at], speed: bytes[at + 1] >> 4, color: bytes[at + 1] & 0x0f }
  }
  return { effect: bytes[EFFECT_OFFSET], perKey: bytes[PER_KEY_FLAG_OFFSET] === 1, settings }
}

/** Byte changes ([offset, value]) that turn `from` into `to`. */
export function diffOnboard(from: OnboardConfig, to: OnboardConfig): [number, number][] {
  const changes: [number, number][] = []
  if (from.effect !== to.effect) {
    changes.push([EFFECT_OFFSET, to.effect])
    if (from.perKey && to.effect !== SELF_DEFINE_EFFECT) changes.push([PER_KEY_FLAG_OFFSET, 0])
  }
  for (const [key, next] of Object.entries(to.settings)) {
    const id = Number(key)
    const prev = from.settings[id]
    if (!prev || !hasSlot(id)) continue
    const at = slotOffset(id)
    if (prev.brightness !== next.brightness) changes.push([at, next.brightness])
    if (prev.speed !== next.speed || prev.color !== next.color) changes.push([at + 1, (next.speed << 4) | next.color])
  }
  return changes
}
