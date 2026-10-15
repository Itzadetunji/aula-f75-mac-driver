import { useState } from 'react'
import { ArrowLeft, ArrowRight, Paintbrush, Sparkles, Usb } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { LED_SLOTS, RIGHT_COLUMN_LEDS, RIGHT_COLUMN_PRESETS } from '@shared/layout'
import type { RGB } from '@shared/types'
import { KeyboardView } from '@/components/keyboard-view'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useLayout } from '@/hooks/use-layout'
import { cn } from '@/lib/utils'
import logo from '../../../../build/logo.svg'

/** Text lives under `onboarding.features` in the locale files. */
const FEATURES = [
  { id: 'lighting', icon: Sparkles },
  { id: 'perKey', icon: Paintbrush },
  { id: 'native', icon: Usb },
]

function previewColors(): RGB[] {
  const colors: RGB[] = Array.from({ length: LED_SLOTS }, () => [40, 40, 48])
  for (const led of RIGHT_COLUMN_LEDS) colors[led] = [0, 200, 255]
  return colors
}

function Welcome() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center gap-8 text-center">
      <img src={logo} alt="" className="size-32" />
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{t('app.title')}</h1>
        <p className="text-muted-foreground mx-auto max-w-md">{t('onboarding.welcome.description')}</p>
      </div>
      <div className="grid w-full max-w-2xl grid-cols-3 gap-3">
        {FEATURES.map(({ id, icon: Icon }) => (
          <div key={id} className="bg-card flex flex-col items-center gap-2 rounded-xl border p-4">
            <Icon className="text-muted-foreground size-5" />
            <div className="text-sm font-medium">{t(`onboarding.features.${id}.title`)}</div>
            <div className="text-muted-foreground text-xs">{t(`onboarding.features.${id}.text`)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function KeyboardType() {
  const { t } = useTranslation()
  const { rightColumn, setRightColumn } = useLayout()
  const selected = RIGHT_COLUMN_PRESETS.findIndex((p) => p.order.join() === rightColumn.join())

  return (
    <div className="flex flex-col items-center gap-8">
      <div className="flex flex-col gap-3 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">{t('onboarding.keyboardType.title')}</h1>
        <p className="text-muted-foreground mx-auto max-w-md">{t('onboarding.keyboardType.description')}</p>
      </div>
      <div className="flex w-full max-w-sm flex-col gap-2">
        <Label>{t('onboarding.keyboardType.label')}</Label>
        <Select
          value={selected === -1 ? undefined : String(selected)}
          onValueChange={(v) => setRightColumn(RIGHT_COLUMN_PRESETS[Number(v)].order)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t('onboarding.keyboardType.custom')} />
          </SelectTrigger>
          <SelectContent>
            {RIGHT_COLUMN_PRESETS.map((preset, i) => (
              <SelectItem key={preset.name} value={String(i)}>
                {preset.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <KeyboardView colors={previewColors()} />
      <p className="text-muted-foreground text-xs">{t('onboarding.keyboardType.later')}</p>
    </div>
  )
}

const STEPS = [Welcome, KeyboardType]

export function Onboarding({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation()
  const [step, setStep] = useState(0)
  const isLast = step === STEPS.length - 1

  return (
    <div className="flex h-screen flex-col">
      <div className="drag-region h-10 shrink-0" />
      <ScrollArea className="min-h-0 flex-1" viewportClassName="[&>div]:min-h-full">
        <main className="flex min-h-full items-center justify-center px-8 py-4">
          {/* All steps share one grid cell so the stage keeps the tallest step's height and never re-centres mid-transition. */}
          <div className="grid">
            {STEPS.map((Step, i) => (
              <div
                key={i}
                inert={i !== step}
                aria-hidden={i !== step}
                className={cn(
                  'col-start-1 row-start-1 flex items-center justify-center transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none',
                  i === step ? 'translate-x-0 opacity-100' : i < step ? '-translate-x-6 opacity-0' : 'translate-x-6 opacity-0',
                )}
              >
                <Step />
              </div>
            ))}
          </div>
        </main>
      </ScrollArea>
      <div className="flex items-center justify-between px-8 py-5">
        <Button variant="ghost" onClick={() => setStep((s) => s - 1)} className={cn(step === 0 && 'invisible')}>
          <ArrowLeft /> {t('onboarding.back')}
        </Button>
        <div className="flex gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={cn('h-1.5 rounded-full transition-all', i === step ? 'bg-primary w-6' : 'bg-muted w-1.5')}
            />
          ))}
        </div>
        <Button onClick={() => (isLast ? onDone() : setStep((s) => s + 1))}>
          {t(isLast ? 'onboarding.start' : 'onboarding.next')} <ArrowRight />
        </Button>
      </div>
      <footer className="text-muted-foreground border-t py-3 text-center text-xs">
        {t('onboarding.credit')} (
        <a href="https://itzadetunji.com" target="_blank" rel="noreferrer" className="hover:text-foreground underline">
          itzadetunji.com
        </a>
        )
      </footer>
    </div>
  )
}
