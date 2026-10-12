import type { KeyDef } from '@shared/layout'
import type { RGB } from '@shared/types'
import { useLayout } from '@/hooks/use-layout'
import { cn } from '@/lib/utils'

const UNIT = 46

interface KeyboardViewProps {
  colors: RGB[]
  selected?: Set<number>
  highlight?: number | null
  onKeyDown?: (key: KeyDef) => void
  onKeyEnter?: (key: KeyDef) => void
}

export function KeyboardView({ colors, selected, highlight, onKeyDown, onKeyEnter }: KeyboardViewProps) {
  const { rows } = useLayout()
  return (
    <div className="inline-flex flex-col gap-1.5 rounded-2xl border bg-zinc-950 p-4 shadow-inner">
      {rows.map((row, i) => (
        <div key={i} className={cn('flex gap-1.5', i === 0 && 'mb-2')}>
          {row.map((key) => {
            const [r, g, b] = colors[key.led] ?? [0, 0, 0]
            const lit = r + g + b > 30
            const isSelected = selected?.has(key.led)
            return (
              <button
                key={key.led}
                type="button"
                onMouseDown={() => onKeyDown?.(key)}
                onMouseEnter={(e) => e.buttons === 1 && onKeyEnter?.(key)}
                style={{
                  width: UNIT * (key.w ?? 1) - 6,
                  marginLeft: key.gap ? UNIT * key.gap : undefined,
                  boxShadow: lit ? `0 0 14px -2px rgb(${r} ${g} ${b} / 0.7), inset 0 -3px 0 rgb(0 0 0 / 0.35)` : undefined,
                  borderColor: lit ? `rgb(${r} ${g} ${b} / 0.9)` : undefined,
                }}
                className={cn(
                  'relative flex h-10 items-start justify-start rounded-md border border-zinc-800 bg-zinc-900 px-1.5 pt-1 text-[10px] font-medium text-zinc-300 transition-[border-color,box-shadow] duration-75',
                  isSelected && 'ring-2 ring-white ring-offset-1 ring-offset-zinc-950',
                  highlight === key.led && 'ring-2 ring-amber-400',
                )}
              >
                {key.label}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
