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
  description: string
  hasSpeed: boolean
  hasColor: boolean
  /** Lights up in response to key presses. */
  reactive?: boolean
}

export const ONBOARD_EFFECTS: OnboardEffect[] = [
  {
    id: 1,
    name: 'Fixed on',
    description: 'Every key stays lit in one steady colour.',
    hasSpeed: false,
    hasColor: true,
  },
  {
    id: 2,
    name: 'Respire',
    description: 'The whole board slowly fades in and out of the chosen colour, like breathing.',
    hasSpeed: true,
    hasColor: true,
  },
  {
    id: 3,
    name: 'Rainbow',
    description: 'The whole board smoothly changes from one colour to the next, without fading out.',
    hasSpeed: true,
    hasColor: false,
  },
  {
    id: 4,
    name: 'Flash away',
    description: 'Pressing a key sends light along its row in both directions, fading out as it goes.',
    hasSpeed: true,
    hasColor: true,
    reactive: true,
  },
  {
    id: 5,
    name: 'Raindrops',
    description: 'Random keys light up and fade, like drops of rain landing on the board.',
    hasSpeed: true,
    hasColor: true,
  },
  {
    id: 6,
    name: 'Rainbow wheel',
    description: 'A rainbow spins around the centre of the keyboard.',
    hasSpeed: true,
    hasColor: true,
  },
  {
    id: 7,
    name: 'Ripples shining',
    description: 'Pressing a key sends a ring of light rippling outwards from it.',
    hasSpeed: true,
    hasColor: true,
    reactive: true,
  },
  {
    id: 8,
    name: 'Stars twinkle',
    description: 'Keys twinkle on and off at random, like stars.',
    hasSpeed: true,
    hasColor: true,
  },
  {
    id: 9,
    name: 'Shadow disappear',
    description: 'The board stays lit; a key you press goes dark and slowly lights back up.',
    hasSpeed: true,
    hasColor: true,
    reactive: true,
  },
  {
    id: 10,
    name: 'Retro snake',
    description: 'A short trail of light snakes back and forth across the rows.',
    hasSpeed: true,
    hasColor: true,
  },
  {
    id: 11,
    name: 'Neon stream',
    description: 'Bands of colour stream across the board from side to side.',
    hasSpeed: true,
    hasColor: true,
  },
  {
    id: 12,
    name: 'Reaction',
    description: 'Only the keys you press light up, then fade out.',
    hasSpeed: true,
    hasColor: true,
    reactive: true,
  },
  {
    id: 13,
    name: 'Sine wave',
    description: 'A wave of brightness rolls across the board.',
    hasSpeed: true,
    hasColor: true,
  },
  {
    id: 14,
    name: 'Retinue scanning',
    description: 'A bar of light sweeps left and right across the board.',
    hasSpeed: true,
    hasColor: true,
  },
  {
    id: 15,
    name: 'Rotating windmill',
    description: 'Coloured blades rotate around the centre like a windmill.',
    hasSpeed: true,
    hasColor: false,
  },
  {
    id: 16,
    name: 'Colorful waterfall',
    description: 'Colours pour down the board from the top row to the bottom.',
    hasSpeed: true,
    hasColor: false,
  },
  {
    id: 17,
    name: 'Blossoming',
    description: 'Colour blooms outwards from the middle of the keyboard.',
    hasSpeed: true,
    hasColor: false,
  },
  {
    id: 18,
    name: 'Rotating storm',
    description: 'A spiral of colour swirls around the centre.',
    hasSpeed: true,
    hasColor: true,
  },
  {
    id: SELF_DEFINE_EFFECT,
    name: 'Self-define',
    description: 'Shows the per-key colours saved on the keyboard.',
    hasSpeed: false,
    hasColor: false,
  },
  {
    id: OFF_EFFECT,
    name: 'Off',
    description: 'All lighting is turned off.',
    hasSpeed: false,
    hasColor: false,
  },
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
