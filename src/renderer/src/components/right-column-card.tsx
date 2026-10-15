import { useTranslation } from 'react-i18next'
import { RIGHT_COLUMN_KEYS, RIGHT_COLUMN_PRESETS, type RightColumn, type RightColumnKey } from '@shared/layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useLayout } from '@/hooks/use-layout'
import { cn } from '@/lib/utils'

export function RightColumnCard() {
  const { t } = useTranslation()
  const { rightColumn, setRightColumn, updatePreferences } = useLayout()

  const setSlot = (slot: number, id: RightColumnKey) => {
    const next = [...rightColumn] as RightColumn
    next[slot] = id
    setRightColumn(next)
  }

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle>{t('layout.rightColumn.title')}</CardTitle>
        <CardDescription>{t('layout.rightColumn.description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2">
          {RIGHT_COLUMN_PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => setRightColumn(preset.order)}
              className={cn(
                'hover:bg-accent rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                preset.order.join() === rightColumn.join() && 'border-primary bg-accent',
              )}
            >
              {preset.name}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-2">
          {rightColumn.map((id, slot) => (
            <div key={slot} className="flex flex-col gap-1.5">
              <Label className="text-muted-foreground text-xs">{t('layout.rightColumn.row', { number: slot + 1 })}</Label>
              <Select value={id} onValueChange={(v) => setSlot(slot, v as RightColumnKey)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(RIGHT_COLUMN_KEYS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
        <Button variant="ghost" size="sm" className="self-start" onClick={() => updatePreferences({ onboarded: false })}>
          {t('layout.rightColumn.runSetup')}
        </Button>
      </CardContent>
    </Card>
  )
}
