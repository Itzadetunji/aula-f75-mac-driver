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
  /** Value stored at byte 0x0A. */
  id: number
  name: string
  hasSpeed: boolean
  hasColor: boolean
}

const effect = (id: number, name: string, hasSpeed = true, hasColor = true): OnboardEffect => ({
  id,
  name,
  hasSpeed,
  hasColor,
})

export const ONBOARD_EFFECTS: OnboardEffect[] = [
  effect(1, 'Fixed on', false),
  effect(2, 'Respire'),
  effect(3, 'Rainbow', true, false),
  effect(4, 'Flash away'),
  effect(5, 'Raindrops'),
  effect(6, 'Rainbow wheel'),
  effect(7, 'Ripples shining'),
  effect(8, 'Stars twinkle'),
  effect(9, 'Shadow disappear'),
  effect(10, 'Retro snake'),
  effect(11, 'Neon stream'),
  effect(12, 'Reaction'),
  effect(13, 'Sine wave'),
  effect(14, 'Retinue scanning'),
  effect(15, 'Rotating windmill', true, false),
  effect(16, 'Colorful waterfall', true, false),
  effect(17, 'Blossoming', true, false),
  effect(18, 'Rotating storm'),
  effect(SELF_DEFINE_EFFECT, 'Self-define', false, false),
  effect(OFF_EFFECT, 'Off', false, false),
]

export const ONBOARD_COLORS: { name: string; rgb: RGB }[] = [
  { name: 'Red', rgb: [255, 0, 0] },
  { name: 'Green', rgb: [0, 255, 0] },
  { name: 'Blue', rgb: [0, 0, 255] },
  { name: 'Yellow', rgb: [255, 255, 0] },
  { name: 'Magenta', rgb: [255, 0, 255] },
  { name: 'Cyan', rgb: [0, 255, 255] },
  { name: 'White', rgb: [255, 255, 255] },
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
