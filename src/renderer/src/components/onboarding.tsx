import { useState } from 'react'
import { ArrowLeft, ArrowRight, Keyboard, Paintbrush, Sparkles, Usb } from 'lucide-react'
import { LED_SLOTS, RIGHT_COLUMN_LEDS, RIGHT_COLUMN_PRESETS } from '@shared/layout'
import type { RGB } from '@shared/types'
import { KeyboardView } from '@/components/keyboard-view'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useLayout } from '@/hooks/use-layout'
import { cn } from '@/lib/utils'

const FEATURES = [
  { icon: Sparkles, title: 'Lighting effects', text: 'Static, breathing, spectrum and wave.' },
  { icon: Paintbrush, title: 'Per-key RGB', text: 'Paint every key its own colour.' },
  { icon: Usb, title: 'Native on macOS', text: 'Talks to the keyboard directly, no Windows needed.' },
]

function previewColors(): RGB[] {
  const colors: RGB[] = Array.from({ length: LED_SLOTS }, () => [40, 40, 48])
  for (const led of RIGHT_COLUMN_LEDS) colors[led] = [0, 200, 255]
  return colors
}

function Welcome() {
  return (
    <div className="flex flex-col items-center gap-8 text-center">
      <div className="bg-primary/10 flex size-16 items-center justify-center rounded-2xl border">
        <Keyboard className="size-8" />
      </div>
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">AULA F75 Mac Driver</h1>
        <p className="text-muted-foreground mx-auto max-w-md">
          Customise your AULA F75 on your Mac, the way the Windows app does. Let's get your keyboard set up.
        </p>
      </div>
      <div className="grid w-full max-w-2xl grid-cols-3 gap-3">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <div key={title} className="bg-card flex flex-col items-center gap-2 rounded-xl border p-4">
            <Icon className="text-muted-foreground size-5" />
            <div className="text-sm font-medium">{title}</div>
            <div className="text-muted-foreground text-xs">{text}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function KeyboardType() {
  const { rightColumn, setRightColumn } = useLayout()
  const selected = RIGHT_COLUMN_PRESETS.findIndex((p) => p.order.join() === rightColumn.join())

  return (
    <div className="flex flex-col items-center gap-8">
      <div className="flex flex-col gap-3 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Which F75 do you have?</h1>
        <p className="text-muted-foreground mx-auto max-w-md">
          F75 models differ in the keys on the right-hand side. Choose the one that matches the highlighted keys on
          your keyboard, from top to bottom.
        </p>
      </div>
      <div className="flex w-full max-w-sm flex-col gap-2">
        <Label>Right-side keys</Label>
        <Select
          value={selected === -1 ? undefined : String(selected)}
          onValueChange={(v) => setRightColumn(RIGHT_COLUMN_PRESETS[Number(v)].order)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Custom layout" />
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
      <p className="text-muted-foreground text-xs">You can change this later in the Layout tab.</p>
    </div>
  )
}

const STEPS = [Welcome, KeyboardType]

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  const isLast = step === STEPS.length - 1

  return (
    <div className="flex h-screen flex-col">
      <div className="drag-region h-10 shrink-0" />
      <main className="flex flex-1 items-center justify-center overflow-y-auto px-8">
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
      <div className="flex items-center justify-between px-8 py-5">
        <Button variant="ghost" onClick={() => setStep((s) => s - 1)} className={cn(step === 0 && 'invisible')}>
          <ArrowLeft /> Back
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
          {isLast ? 'Get started' : 'Next'} <ArrowRight />
        </Button>
      </div>
      <footer className="text-muted-foreground border-t py-3 text-center text-xs">
        Built by Adetunji with love ❤️ (
        <a href="https://itzadetunji.com" target="_blank" rel="noreferrer" className="hover:text-foreground underline">
          itzadetunji.com
        </a>
        )
      </footer>
    </div>
  )
}
