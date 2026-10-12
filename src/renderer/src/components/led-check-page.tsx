import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { LED_SLOTS } from '@shared/layout'
import type { RGB } from '@shared/types'
import { KeyboardView } from '@/components/keyboard-view'
import { RightColumnCard } from '@/components/right-column-card'
import { useLayout } from '@/hooks/use-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

type Mode = 'keys' | 'raw'

export function LedCheckPage({ connected }: { connected: boolean }) {
  const { keys: F75_KEYS } = useLayout()
  const [mode, setMode] = useState<Mode>('keys')
  const [index, setIndex] = useState(0)
  const [rawLed, setRawLed] = useState(0)

  const key = F75_KEYS[index]
  const led = mode === 'keys' ? key.led : rawLed
  const mappedKey = F75_KEYS.find((k) => k.led === rawLed)

  useEffect(() => {
    if (connected) void window.f75.identifyLed(led)
  }, [connected, led])

  useEffect(() => () => void window.f75.identifyLed(null), [])

  const colors: RGB[] = Array.from({ length: LED_SLOTS }, () => [0, 0, 0])
  colors[led] = [255, 255, 255]

  const step = (delta: number) =>
    mode === 'keys'
      ? setIndex((i) => (i + delta + F75_KEYS.length) % F75_KEYS.length)
      : setRawLed((i) => (i + delta + LED_SLOTS) % LED_SLOTS)

  return (
    <div className="flex flex-col items-center gap-6">
      <KeyboardView
        colors={colors}
        highlight={led}
        onKeyDown={(k) => {
          if (mode === 'keys') setIndex(F75_KEYS.indexOf(k))
          else setRawLed(k.led)
        }}
      />
      <Card className="w-full max-w-xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>LED map check</CardTitle>
            <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <TabsList>
                <TabsTrigger value="keys">By key</TabsTrigger>
                <TabsTrigger value="raw">By LED index</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <CardDescription>
            {mode === 'keys'
              ? "Only one key is lit on your keyboard. If it isn't the highlighted key here, note both names so the layout can be corrected."
              : 'Steps through every LED index the keyboard accepts. Note which physical key lights up for indexes that show "unmapped".'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <Button variant="outline" size="icon" onClick={() => step(-1)}>
            <ChevronLeft />
          </Button>
          <div className="text-center">
            {mode === 'keys' ? (
              <>
                <div className="text-2xl font-semibold">{key.label || 'Space'}</div>
                <div className="text-muted-foreground font-mono text-xs">
                  LED #{key.led} · key {index + 1}/{F75_KEYS.length}
                </div>
              </>
            ) : (
              <>
                <div className="font-mono text-2xl font-semibold">#{rawLed}</div>
                <div className="text-muted-foreground text-xs">
                  {mappedKey ? `mapped to ${mappedKey.label || 'Space'}` : 'unmapped'}
                </div>
              </>
            )}
          </div>
          <Button variant="outline" size="icon" onClick={() => step(1)}>
            <ChevronRight />
          </Button>
        </CardContent>
      </Card>
      <RightColumnCard />
    </div>
  )
}
