export interface Macro {
  id: string
  name: string
  /** Electron accelerator, e.g. "Command+Shift+E". Empty until recorded. */
  accelerator: string
  text: string
  pressEnter: boolean
  enabled: boolean
}

const NAMED_CODES: Record<string, string> = {
  Space: 'Space',
  Enter: 'Return',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Escape: 'Escape',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Comma: ',',
  Period: '.',
  Slash: '/',
}

/** Keys that don't type a character, so Shift alone is a safe modifier for them. */
const NON_TYPING = /^(F\d{1,2}|Up|Down|Left|Right|Home|End|PageUp|PageDown|Delete|Escape|Return|Tab|Backspace)$/

/** Maps a KeyboardEvent.code to an Electron accelerator key, or null for modifiers/unsupported keys. */
export function keyFromCode(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit\d$/.test(code)) return code.slice(5)
  if (/^F\d{1,2}$/.test(code)) return code
  return NAMED_CODES[code] ?? null
}

export interface ShortcutParts {
  command: boolean
  control: boolean
  alt: boolean
  shift: boolean
  key: string
}

export function toAccelerator({ command, control, alt, shift, key }: ShortcutParts) {
  return [command && 'Command', control && 'Control', alt && 'Alt', shift && 'Shift', key].filter(Boolean).join('+')
}

/** Returns an error message if the shortcut can't be used as a macro trigger. */
export function validateShortcut(parts: ShortcutParts): string | null {
  const strong = parts.command || parts.control || parts.alt
  if (!strong && !parts.shift) return 'Start the shortcut with ⌘, ⌥, ⌃ or ⇧.'
  if (!strong && !NON_TYPING.test(parts.key)) return '⇧ on its own only works with keys like F1–F12; ⇧ + a letter is how you type capitals.'
  return null
}

const SYMBOLS: Record<string, string> = {
  Command: '⌘',
  Control: '⌃',
  Alt: '⌥',
  Shift: '⇧',
  Return: '↩',
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
  Space: 'Space',
  Backspace: '⌫',
  Delete: '⌦',
  Escape: 'Esc',
  Tab: '⇥',
}

export function formatAccelerator(accelerator: string): string[] {
  return accelerator ? accelerator.split('+').map((part) => SYMBOLS[part] ?? part) : []
}
