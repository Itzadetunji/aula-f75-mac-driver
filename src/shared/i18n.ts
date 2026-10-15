import en from './locales/en.json'
import es from './locales/es.json'
import fr from './locales/fr.json'
import zh from './locales/zh.json'
import type { Language } from './types'

export const RESOURCES: Record<Language, typeof en> = { en, fr, es, zh }

/** Each language is listed in its own name, so it can be found whatever language is active. */
export const LANGUAGES: { id: Language; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'fr', name: 'Français' },
  { id: 'es', name: 'Español' },
  { id: 'zh', name: '中文' },
]

export const isLanguage = (value: unknown): value is Language => LANGUAGES.some((l) => l.id === value)

/** Closest supported language for a list of system locales like "fr-CA". */
export function pickLanguage(locales: string[]): Language {
  for (const locale of locales) {
    const base = locale.toLowerCase().split(/[-_]/)[0]
    if (isLanguage(base)) return base
  }
  return 'en'
}

/**
 * Minimal lookup for the main process (menu bar labels): dotted keys and
 * {{name}} placeholders, falling back to English.
 */
export function translate(language: Language, key: string, params: Record<string, string | number> = {}): string {
  const lookup = (tree: unknown) =>
    key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], tree)
  const text = lookup(RESOURCES[language]) ?? lookup(RESOURCES.en)
  if (typeof text !== 'string') return key
  return text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params[name] ?? ''))
}

/** An error whose message is a translation key, so the window can show it in the user's language. */
export class LocalizedError extends Error {
  constructor(
    readonly key: string,
    readonly params: Record<string, string | number> = {},
  ) {
    super(key)
  }
}
