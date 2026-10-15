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

const MAX_TEXT = 20_000

/** Shape of an exported macros file; `accelerator` is accepted as an alias of `shortcut`. */
export interface MacroFileEntry {
  name?: string
  shortcut?: string
  text: string
  pressEnter?: boolean
  enabled?: boolean
}

export function exportMacros(macros: Macro[]): string {
  const entries: MacroFileEntry[] = macros.map(({ name, accelerator, text, pressEnter, enabled }) => ({
    name,
    shortcut: accelerator,
    text,
    pressEnter,
    enabled,
  }))
  return JSON.stringify({ f75Macros: 1, macros: entries }, null, 2)
}

/**
 * Turns an uploaded file into macros. JSON files hold one macro, a list, or an
 * exported `{ macros: [...] }` file; any other file becomes one macro that types
 * its contents. Throws with a readable message when nothing usable is found.
 */
export function parseMacroFile(fileName: string, content: string): Macro[] {
  const baseName = fileName.replace(/\.[^.]+$/, '') || 'Imported macro'
  const make = (entry: MacroFileEntry, fallbackName: string): Macro => ({
    id: crypto.randomUUID(),
    name: (entry.name ?? '').trim() || fallbackName,
    accelerator: typeof entry.shortcut === 'string' ? entry.shortcut.trim() : '',
    text: entry.text.slice(0, MAX_TEXT),
    pressEnter: entry.pressEnter === true,
    enabled: entry.enabled !== false,
  })

  if (!/\.json$/i.test(fileName)) {
    const text = content.replace(/\r\n/g, '\n').replace(/\n$/, '')
    if (!text.trim()) throw new Error(`${fileName} is empty.`)
    return [make({ text }, baseName)]
  }

  let data: unknown
  try {
    data = JSON.parse(content)
  } catch {
    throw new Error(`${fileName} isn't valid JSON.`)
  }
  const list = Array.isArray(data) ? data : (data as { macros?: unknown })?.macros ?? [data]
  if (!Array.isArray(list)) throw new Error(`${fileName} has no macros in it.`)

  const macros = list.flatMap((raw, i) => {
    if (!raw || typeof raw !== 'object') return []
    const entry = raw as Record<string, unknown>
    if (typeof entry.text !== 'string' || !entry.text) return []
    return [
      make(
        {
          name: typeof entry.name === 'string' ? entry.name : undefined,
          shortcut: typeof entry.shortcut === 'string' ? entry.shortcut : typeof entry.accelerator === 'string' ? entry.accelerator : undefined,
          text: entry.text,
          pressEnter: entry.pressEnter === true,
          enabled: entry.enabled !== false,
        },
        list.length > 1 ? `${baseName} ${i + 1}` : baseName,
      ),
    ]
  })
  if (macros.length === 0) throw new Error(`${fileName} has no macros with text in it.`)
  return macros
}

export function formatAccelerator(accelerator: string): string[] {
  return accelerator ? accelerator.split('+').map((part) => SYMBOLS[part] ?? part) : []
}
