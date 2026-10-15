import type { MouseEvent } from 'react'
import type { KeyDef } from '@shared/layout'
import type { RGB } from '@shared/types'
import { useLayout } from '@/hooks/use-layout'
import { cn } from '@/lib/utils'

const UNIT = 46

/** The selection ring lives in the same box-shadow as the glow; a Tailwind ring class would be overridden by it. */
function keyShadow([r, g, b]: RGB, lit: boolean, selected: boolean) {
  const layers: string[] = []
  if (selected) layers.push('0 0 0 2px #09090b', '0 0 0 4px #fff')
  if (lit) layers.push(`0 0 14px -2px rgb(${r} ${g} ${b} / 0.7)`, 'inset 0 -3px 0 rgb(0 0 0 / 0.35)')
  return layers.length ? layers.join(', ') : undefined
}

interface KeyboardViewProps {
  colors: RGB[]
  selected?: Set<number>
  highlight?: number | null
  onKeyDown?: (key: KeyDef, event: MouseEvent) => void
  onKeyEnter?: (key: KeyDef) => void
  /** Mouse down on the board itself, between or around keys. */
  onBackgroundDown?: () => void
}

export function KeyboardView({ colors, selected, highlight, onKeyDown, onKeyEnter, onBackgroundDown }: KeyboardViewProps) {
  const { rows } = useLayout()
  return (
    <div
      onMouseDown={(e) => {
        if (!(e.target as HTMLElement).closest('button')) onBackgroundDown?.()
      }}
      className="inline-flex flex-col gap-1.5 rounded-2xl border bg-zinc-950 p-4 shadow-inner"
    >
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
                onMouseDown={(e) => onKeyDown?.(key, e)}
                onMouseEnter={(e) => e.buttons === 1 && onKeyEnter?.(key)}
                style={{
                  width: UNIT * (key.w ?? 1) - 6,
                  marginLeft: key.gap ? UNIT * key.gap : undefined,
                  boxShadow: keyShadow([r, g, b], lit, !!isSelected),
                  borderColor: lit ? `rgb(${r} ${g} ${b} / 0.9)` : undefined,
                }}
                className={cn(
                  'relative flex h-10 items-start justify-start rounded-md border border-zinc-800 bg-zinc-900 px-1.5 pt-1 text-[10px] font-medium text-zinc-300 transition-[border-color,box-shadow] duration-75',
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
