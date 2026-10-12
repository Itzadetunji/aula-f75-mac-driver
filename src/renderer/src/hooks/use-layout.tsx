import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_RIGHT_COLUMN, rowsWithRightColumn, type KeyDef, type RightColumn } from '@shared/layout'

const STORAGE_KEY = 'f75.rightColumn'

interface LayoutContextValue {
  rightColumn: RightColumn
  setRightColumn: (order: RightColumn) => void
  rows: KeyDef[][]
  keys: KeyDef[]
}

const LayoutContext = createContext<LayoutContextValue | null>(null)

function loadRightColumn(): RightColumn {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (Array.isArray(saved) && saved.length === 4) return saved as RightColumn
  } catch {}
  return DEFAULT_RIGHT_COLUMN
}

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [rightColumn, setState] = useState<RightColumn>(loadRightColumn)

  const value = useMemo(() => {
    const rows = rowsWithRightColumn(rightColumn)
    return {
      rightColumn,
      setRightColumn: (order: RightColumn) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(order))
        setState(order)
      },
      rows,
      keys: rows.flat(),
    }
  }, [rightColumn])

  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>
}

export function useLayout() {
  const ctx = useContext(LayoutContext)
  if (!ctx) throw new Error('useLayout must be used inside LayoutProvider')
  return ctx
}
