import { MUSIC_STYLES } from '@shared/effects'
import type { MusicStyle } from '@shared/types'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export function MusicStylePicker({ value, onChange }: { value: MusicStyle; onChange: (style: MusicStyle) => void }) {
  const current = MUSIC_STYLES.find((s) => s.id === value) ?? MUSIC_STYLES[0]
  return (
    <div className="flex flex-col gap-2">
      <Label>Style</Label>
      <div className="grid grid-cols-3 gap-1.5">
        {MUSIC_STYLES.map((s) => (
          <button
            key={s.id}
            type="button"
            title={s.description}
            onClick={() => onChange(s.id)}
            className={cn(
              'hover:bg-accent rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
              value === s.id && 'border-primary bg-accent',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
      <p className="text-muted-foreground text-xs">{current.description}</p>
    </div>
  )
}
