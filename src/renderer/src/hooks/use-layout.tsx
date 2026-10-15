import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { rowsWithRightColumn, type KeyDef, type RightColumn } from '@shared/layout'
import type { Preferences } from '@shared/types'

interface PreferencesContextValue {
  preferences: Preferences
  updatePreferences: (patch: Partial<Preferences>) => void
  rows: KeyDef[][]
  keys: KeyDef[]
  rightColumn: RightColumn
  setRightColumn: (order: RightColumn) => void
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null)

/** Loads preferences from disk (via the main process) before rendering children. */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences | null>(null)

  useEffect(() => {
    void window.f75.getPreferences().then(setPreferences)
  }, [])

  const value = useMemo(() => {
    if (!preferences) return null
    const updatePreferences = (patch: Partial<Preferences>) => {
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
