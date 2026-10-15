import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { LED_SLOTS, RIGHT_COLUMN_LEDS } from '@shared/layout'
import type { RGB } from '@shared/types'
import { KeyboardView } from '@/components/keyboard-view'
import { RightColumnCard } from '@/components/right-column-card'
import { useLayout } from '@/hooks/use-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type Mode = 'keys' | 'raw'

function LedMapCheck({ connected }: { connected: boolean }) {
  const { t } = useTranslation()
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
            <CardTitle>{t('layout.ledMap.title')}</CardTitle>
            <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <TabsList>
                <TabsTrigger value="keys">{t('layout.ledMap.byKey')}</TabsTrigger>
                <TabsTrigger value="raw">{t('layout.ledMap.byIndex')}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <CardDescription>
            {t(mode === 'keys' ? 'layout.ledMap.keysDescription' : 'layout.ledMap.rawDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <Button variant="outline" size="icon" onClick={() => step(-1)}>
            <ChevronLeft />
          </Button>
          <div className="text-center">
            {mode === 'keys' ? (
              <>
                <div className="text-2xl font-semibold">{key.label || t('layout.ledMap.space')}</div>
                <div className="text-muted-foreground font-mono text-xs">
                  {t('layout.ledMap.position', { led: key.led, index: index + 1, total: F75_KEYS.length })}
                </div>
              </>
            ) : (
              <>
                <div className="font-mono text-2xl font-semibold">#{rawLed}</div>
                <div className="text-muted-foreground text-xs">
                  {mappedKey
                    ? t('layout.ledMap.mappedTo', { key: mappedKey.label || t('layout.ledMap.space') })
                    : t('layout.ledMap.unmapped')}
                </div>
              </>
            )}
          </div>
          <Button variant="outline" size="icon" onClick={() => step(1)}>
            <ChevronRight />
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function RightSideKeys() {
  const colors: RGB[] = Array.from({ length: LED_SLOTS }, () => [40, 40, 48])
  for (const led of RIGHT_COLUMN_LEDS) colors[led] = [0, 200, 255]

  return (
    <div className="flex flex-col items-center gap-6">
      <KeyboardView colors={colors} />
      <RightColumnCard />
    </div>
  )
}

export function LayoutPage({ connected }: { connected: boolean }) {
  const { t } = useTranslation()
  return (
    <Tabs defaultValue="led-map" className="items-center gap-6">
      <TabsList>
        <TabsTrigger value="led-map">{t('layout.tabs.ledMap')}</TabsTrigger>
        <TabsTrigger value="right-side">{t('layout.tabs.rightSide')}</TabsTrigger>
      </TabsList>
      <TabsContent value="led-map" className="w-full">
        <LedMapCheck connected={connected} />
      </TabsContent>
      <TabsContent value="right-side" className="w-full">
        <RightSideKeys />
      </TabsContent>
    </Tabs>
  )
}
