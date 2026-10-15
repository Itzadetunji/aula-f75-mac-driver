import { useTranslation } from 'react-i18next'
import { MUSIC_STYLES } from '@shared/effects'
import type { MusicStyle } from '@shared/types'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export function MusicStylePicker({ value, onChange }: { value: MusicStyle; onChange: (style: MusicStyle) => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-2">
      <Label>{t('common.style')}</Label>
      <div className="grid grid-cols-3 gap-1.5">
        {MUSIC_STYLES.map((style) => (
          <button
            key={style}
            type="button"
            title={t(`musicStyles.${style}.description`)}
            onClick={() => onChange(style)}
            className={cn(
              'hover:bg-accent rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
              value === style && 'border-primary bg-accent',
            )}
          >
            {t(`musicStyles.${style}.label`)}
          </button>
        ))}
      </div>
      <p className="text-muted-foreground text-xs">{t(`musicStyles.${value}.description`)}</p>
    </div>
  )
}
