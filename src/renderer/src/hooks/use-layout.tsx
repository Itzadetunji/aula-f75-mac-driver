import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { rowsWithRightColumn, type KeyDef, type RightColumn } from '@shared/layout'
import type { Language, Preferences } from '@shared/types'
import i18n from '@/lib/i18n'

interface PreferencesContextValue {
  preferences: Preferences
  updatePreferences: (patch: Partial<Preferences>) => void
  rows: KeyDef[][]
  keys: KeyDef[]
  rightColumn: RightColumn
  setRightColumn: (order: RightColumn) => void
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null)

function applyLanguage(language: Language) {
  void i18n.changeLanguage(language)
  document.documentElement.lang = language
}

/** Loads preferences from disk (via the main process) before rendering children. */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences | null>(null)

  useEffect(() => {
    // Switch language before rendering, so the first frame is already translated.
    const receive = (next: Preferences) => {
      applyLanguage(next.language)
      setPreferences(next)
    }
    void window.f75.getPreferences().then(receive)
    return window.f75.onPreferences(receive)
  }, [])

  const value = useMemo(() => {
    if (!preferences) return null
    const updatePreferences = (patch: Partial<Preferences>) => {
      if (patch.language) applyLanguage(patch.language)
      setPreferences((prev) => (prev ? { ...prev, ...patch } : prev))
      void window.f75.setPreferences(patch)
    }
    const rows = rowsWithRightColumn(preferences.rightColumn)
    return {
      preferences,
      updatePreferences,
      rows,
      keys: rows.flat(),
      rightColumn: preferences.rightColumn,
      setRightColumn: (rightColumn: RightColumn) => updatePreferences({ rightColumn }),
    }
  }, [preferences])

  if (!value) return null
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}

export function useLayout() {
  const ctx = useContext(PreferencesContext)
  if (!ctx) throw new Error('useLayout must be used inside PreferencesProvider')
  return ctx
}

export const usePreferences = useLayout
