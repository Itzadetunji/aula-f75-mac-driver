export interface KeyDef {
  id: string
  label: string
  /** Index into the direct-mode colour frame. LEDs are laid out as 6 * column + row. */
  led: number
  /** Width in key units (1u = standard key). */
  w?: number
  /** Leading gap in key units. */
  gap?: number
}

const k = (id: string, label: string, col: number, row: number, w?: number, gap?: number): KeyDef => ({
  id,
  label,
  led: col * 6 + row,
  w,
  gap,
})

export const F75_ROWS: KeyDef[][] = [
  [
    k('esc', 'Esc', 0, 0),
    k('f1', 'F1', 2, 0, 1, 0.25),
    k('f2', 'F2', 3, 0),
    k('f3', 'F3', 4, 0),
    k('f4', 'F4', 5, 0),
    k('f5', 'F5', 6, 0, 1, 0.25),
    k('f6', 'F6', 7, 0),
    k('f7', 'F7', 8, 0),
    k('f8', 'F8', 9, 0),
    k('f9', 'F9', 10, 0, 1, 0.25),
    k('f10', 'F10', 11, 0),
    k('f11', 'F11', 12, 0),
    k('f12', 'F12', 13, 0),
  ],
  [
    k('grave', '`', 0, 1),
    k('1', '1', 1, 1),
    k('2', '2', 2, 1),
    k('3', '3', 3, 1),
    k('4', '4', 4, 1),
    k('5', '5', 5, 1),
    k('6', '6', 6, 1),
    k('7', '7', 7, 1),
    k('8', '8', 8, 1),
    k('9', '9', 9, 1),
    k('0', '0', 10, 1),
    k('minus', '-', 11, 1),
    k('equal', '=', 12, 1),
    k('backspace', '⌫', 13, 1, 2),
    k('delete', 'Del', 15, 1, 1, 0.25),
  ],
  [
    k('tab', 'Tab', 0, 2, 1.5),
    k('q', 'Q', 1, 2),
    k('w', 'W', 2, 2),
    k('e', 'E', 3, 2),
    k('r', 'R', 4, 2),
    k('t', 'T', 5, 2),
    k('y', 'Y', 6, 2),
    k('u', 'U', 7, 2),
    k('i', 'I', 8, 2),
    k('o', 'O', 9, 2),
    k('p', 'P', 10, 2),
    k('lbracket', '[', 11, 2),
    k('rbracket', ']', 12, 2),
    k('backslash', '\\', 13, 2, 1.5),
    k('end', 'End', 15, 2, 1, 0.25),
  ],
  [
    k('caps', 'Caps', 0, 3, 1.75),
    k('a', 'A', 1, 3),
    k('s', 'S', 2, 3),
    k('d', 'D', 3, 3),
    k('f', 'F', 4, 3),
    k('g', 'G', 5, 3),
    k('h', 'H', 6, 3),
    k('j', 'J', 7, 3),
    k('k', 'K', 8, 3),
    k('l', 'L', 9, 3),
    k('semicolon', ';', 10, 3),
    k('quote', "'", 11, 3),
    k('enter', 'Enter', 13, 3, 2.25),
    k('pgup', 'PgUp', 15, 3, 1, 0.25),
  ],
  [
    k('lshift', 'Shift', 0, 4, 2.25),
    k('z', 'Z', 1, 4),
    k('x', 'X', 2, 4),
    k('c', 'C', 3, 4),
    k('v', 'V', 4, 4),
    k('b', 'B', 5, 4),
    k('n', 'N', 6, 4),
    k('m', 'M', 7, 4),
    k('comma', ',', 8, 4),
    k('period', '.', 9, 4),
    k('slash', '/', 10, 4),
    k('rshift', 'Shift', 13, 4, 1.75),
    k('up', '↑', 14, 4, 1, 0.25),
    k('pgdn', 'PgDn', 15, 4),
  ],
  [
    k('lctrl', 'Ctrl', 0, 5, 1.25),
    k('lwin', '⌘', 1, 5, 1.25),
    k('lalt', 'Alt', 2, 5, 1.25),
    k('space', '', 5, 5, 6.25),
    k('ralt', 'Alt', 8, 5),
    k('fn', 'Fn', 9, 5),
    k('rctrl', 'Ctrl', 10, 5),
    k('left', '←', 13, 5, 1, 0.25),
    k('down', '↓', 14, 5),
    k('right', '→', 15, 5),
  ],
]

export const F75_KEYS: KeyDef[] = F75_ROWS.flat()

/** Keys that F75 variants put in the right-hand column, rows 1–4 (top to bottom). */
export const RIGHT_COLUMN_KEYS = {
  delete: 'Del',
  insert: 'Ins',
  home: 'Home',
  end: 'End',
  pgup: 'PgUp',
  pgdn: 'PgDn',
  prtsc: 'PrtSc',
} as const

export type RightColumnKey = keyof typeof RIGHT_COLUMN_KEYS
export type RightColumn = [RightColumnKey, RightColumnKey, RightColumnKey, RightColumnKey]

export const RIGHT_COLUMN_PRESETS: { name: string; order: RightColumn }[] = [
  { name: 'Del · End · PgUp · PgDn', order: ['delete', 'end', 'pgup', 'pgdn'] },
  { name: 'Del · PgUp · PgDn · End', order: ['delete', 'pgup', 'pgdn', 'end'] },
  { name: 'Del · Home · PgUp · PgDn', order: ['delete', 'home', 'pgup', 'pgdn'] },
  { name: 'Home · PgUp · PgDn · End', order: ['home', 'pgup', 'pgdn', 'end'] },
]

export const DEFAULT_RIGHT_COLUMN: RightColumn = RIGHT_COLUMN_PRESETS[0].order

const RIGHT_COLUMN_LEDS = [1, 2, 3, 4].map((row) => 15 * 6 + row)

/** Relabels the right-hand column; LED positions are fixed, only the legends differ between variants. */
export function rowsWithRightColumn(order: RightColumn): KeyDef[][] {
  return F75_ROWS.map((row) =>
    row.map((key) => {
      const slot = RIGHT_COLUMN_LEDS.indexOf(key.led)
      if (slot === -1) return key
      const id = order[slot]
      return { ...key, id, label: RIGHT_COLUMN_KEYS[id] }
    }),
  )
}

export const LED_SLOTS = 126
