import { useEffect, useMemo, useRef, useState, type ComponentType, type MouseEvent, type ReactNode } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Cpu, HardDrive, MonitorSmartphone, Music, Paintbrush, Power, Sparkles, Sun, Waves, Wind } from 'lucide-react'
import { MusicMeter, renderFrame } from '@shared/effects'
import { F75_KEYS, type KeyDef } from '@shared/layout'
import { decodeOnboard, ONBOARD_EFFECTS, type OnboardConfig } from '@shared/onboard'
import type { EffectId, RGB } from '@shared/types'
import { KeyboardView } from '@/components/keyboard-view'
import { MusicStylePicker } from '@/components/music-style-picker'
import { OnboardLighting, useEffectDemo } from '@/components/onboard-lighting'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAnimationTime, useAudioBands, useLighting } from '@/hooks/use-f75'
import { useLayout } from '@/hooks/use-layout'
import { cn, hexToRgb, rgbToHex } from '@/lib/utils'

/** Labels live under `effects` in the locale files. */
const EFFECTS: { id: EffectId; icon: ComponentType<{ className?: string }> }[] = [
  { id: 'hardware', icon: Cpu },
  { id: 'static', icon: Sun },
  { id: 'breathing', icon: Wind },
  { id: 'spectrum', icon: Sparkles },
  { id: 'wave', icon: Waves },
  { id: 'music', icon: Music },
  { id: 'custom', icon: Paintbrush },
  { id: 'off', icon: Power },
]

const SWATCHES: RGB[] = [
  [255, 255, 255],
  [255, 0, 0],
  [255, 110, 0],
  [255, 220, 0],
  [0, 255, 70],
  [0, 220, 255],
  [0, 90, 255],
  [150, 0, 255],
  [255, 0, 170],
]

function Kbd({ children }: { children?: ReactNode }) {
  return (
    <kbd className="bg-muted text-foreground mx-0.5 rounded border px-1.5 py-0.5 font-sans text-[11px] font-medium">
      {children}
    </kbd>
  )
}

export function LightingPage({ connected, wireless }: { connected: boolean; wireless: boolean }) {
  const { t } = useTranslation()
  const tabs = (
    <TabsList>
      <TabsTrigger value="live">
        <MonitorSmartphone /> {t('lighting.tabs.live')}
      </TabsTrigger>
      <TabsTrigger value="onboard">
        <HardDrive /> {t('lighting.tabs.onboard')}
      </TabsTrigger>
    </TabsList>
  )

  return (
    <Tabs defaultValue="live">
      <TabsContent value="live">
        <LiveLighting connected={connected} wireless={wireless} tabs={tabs} />
      </TabsContent>
      <TabsContent value="onboard">
        <OnboardLighting connected={connected} wireless={wireless} tabs={tabs} />
      </TabsContent>
    </Tabs>
  )
}

function LiveLighting({ connected, wireless, tabs }: { connected: boolean; wireless: boolean; tabs: ReactNode }) {
  const { t: tr } = useTranslation()
  const [lighting, update] = useLighting()
  const t = useAnimationTime()
  const [brush, setBrush] = useState<RGB>([255, 0, 170])

  const isHardware = lighting.effect === 'hardware'
  const [stored, setStored] = useState<OnboardConfig | null>(null)
  const { preferences } = useLayout()
  useEffect(() => {
    if (!connected || wireless || !isHardware || !preferences.running) return
    window.f75
      .readOnboard()
      .then((bytes) => setStored(decodeOnboard(bytes)))
      .catch(() => setStored(null))
  }, [connected, wireless, isHardware, preferences.running])
  const storedEffect = isHardware && stored ? ONBOARD_EFFECTS.find((e) => e.id === stored.effect) : undefined
  const demo = useEffectDemo(storedEffect, stored?.settings[stored.effect])

  const isMusic = lighting.effect === 'music'
  const bands = useAudioBands(isMusic)
  const meter = useRef(new MusicMeter())

  const preview = useMemo(() => {
    if (isHardware) return []
    meter.current.update(bands.current, t)
    return renderFrame({ ...lighting, brightness: Math.max(lighting.brightness, 35) }, t, meter.current)
  }, [lighting, t, isHardware])

  const isCustom = lighting.effect === 'custom'
  const usesColor = lighting.effect === 'static' || lighting.effect === 'breathing'
  const usesSpeed =
    lighting.effect === 'breathing' || lighting.effect === 'spectrum' || lighting.effect === 'wave' || isMusic

  const [selected, setSelected] = useState<Set<number>>(new Set())
  const dragMode = useRef<'add' | 'remove'>('add')

  const colorSelected = (color: RGB) => {
    if (selected.size === 0) return
    const perKey = { ...lighting.perKey }
    for (const led of selected) perKey[led] = color
    update({ perKey })
  }

  const activeColor = isCustom ? brush : lighting.color
  const setActiveColor = (c: RGB) => {
    if (!isCustom) return update({ color: c })
    setBrush(c)
    colorSelected(c)
  }

  const deselect = (led: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.delete(led)
      return next
    })
    update((prev) => {
      const { [led]: _, ...perKey } = prev.perKey
      return { perKey }
    })
  }

  const onKeyDown = (key: KeyDef, e: MouseEvent) => {
    if (selected.has(key.led)) {
      dragMode.current = 'remove'
      deselect(key.led)
    } else if (e.metaKey || e.shiftKey) {
      dragMode.current = 'add'
      setSelected((prev) => new Set(prev).add(key.led))
    } else {
      dragMode.current = 'add'
      setSelected(new Set([key.led]))
    }
  }

  const onKeyEnter = (key: KeyDef) => {
    if (dragMode.current === 'remove') {
      if (selected.has(key.led)) deselect(key.led)
    } else {
      setSelected((prev) => new Set(prev).add(key.led))
    }
  }

  useEffect(() => {
    if (!isCustom) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'Escape') setSelected(new Set())
      if (e.key === 'a' && e.metaKey) {
        e.preventDefault()
        setSelected(new Set(F75_KEYS.map((k) => k.led)))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isCustom])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3">
        <KeyboardView
          colors={isHardware ? demo.frame : preview}
          selected={isCustom ? selected : undefined}
          onKeyDown={isCustom ? onKeyDown : demo.reactive ? (key) => demo.press(key.led) : undefined}
          onKeyEnter={isCustom ? onKeyEnter : undefined}
          onBackgroundDown={isCustom ? () => setSelected(new Set()) : undefined}
        />
        {tabs}
        {isCustom && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-28 text-xs tabular-nums">
              {selected.size === 0 ? tr('lighting.selection.none') : tr('lighting.selection.count', { count: selected.size })}
            </span>
            <Button variant="outline" size="sm" onClick={() => setSelected(new Set(F75_KEYS.map((k) => k.led)))}>
              {tr('lighting.selection.selectAll')}
            </Button>
            <Button variant="outline" size="sm" disabled={selected.size === 0} onClick={() => setSelected(new Set())}>
              {tr('lighting.selection.deselect')}
            </Button>
            <Button variant="secondary" size="sm" disabled={selected.size === 0} onClick={() => colorSelected(brush)}>
              {tr('lighting.selection.applyColour')}
            </Button>
            <Button variant="outline" size="sm" disabled={selected.size === 0} onClick={() => colorSelected([0, 0, 0])}>
              {tr('lighting.selection.turnOff')}
            </Button>
          </div>
        )}
        {isCustom ? (
          <ul className="text-muted-foreground grid grid-cols-2 gap-x-8 gap-y-1.5 text-xs">
            <li>{tr('lighting.help.click')}</li>
            <li>
              <Trans i18nKey="lighting.help.multi" components={{ kbd: <Kbd /> }} />
            </li>
            <li>{tr('lighting.help.drag')}</li>
            <li>
              <Trans i18nKey="lighting.help.all" components={{ kbd: <Kbd /> }} />
            </li>
            <li className="col-span-2">{tr('lighting.help.thenPick')}</li>
          </ul>
        ) : (
          <p className="text-muted-foreground text-xs">
            {isMusic
              ? tr('lighting.preview.music')
              : !isHardware
                ? tr('lighting.preview.live')
                : storedEffect
                  ? `${tr('lighting.preview.storedEffect', { name: tr(`onboardEffects.${storedEffect.id}.name`) })}${demo.reactive ? ` ${tr('lighting.preview.tryIt')}` : ''}`
                  : tr('lighting.preview.ownEffect')}
          </p>
        )}
      </div>

      <div className="grid grid-cols-[1.4fr_1fr] gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{tr('lighting.effectCard.title')}</CardTitle>
            <CardDescription>
              {tr('lighting.effectCard.description')}
              {wireless && ` ${tr('lighting.effectCard.wireless')}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-4 gap-2">
            {EFFECTS.map(({ id, icon: Icon }) => (
              <button
                key={id}
                type="button"
                title={tr(`effects.${id}.hint`)}
                disabled={!connected}
                onClick={() => update({ effect: id })}
                className={cn(
                  'hover:bg-accent flex flex-col items-center gap-2 rounded-lg border p-3 text-xs font-medium transition-colors disabled:opacity-50',
                  lighting.effect === id && 'border-primary bg-accent',
                )}
              >
                <Icon className="size-5" />
                {tr(`effects.${id}.label`)}
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{isCustom ? tr('lighting.keyColour') : tr('common.settings')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {(usesColor || isCustom) && (
              <div className="flex flex-col gap-2">
                <Label>{tr('common.colour')}</Label>
                <div className="flex flex-wrap items-center gap-2">
                  {SWATCHES.map((c) => (
                    <button
                      key={c.join()}
                      type="button"
                      onClick={() => setActiveColor(c)}
                      className={cn(
                        'size-7 rounded-full border-2 border-transparent',
                        rgbToHex(c) === rgbToHex(activeColor) && 'border-white',
                      )}
                      style={{ background: rgbToHex(c) }}
                    />
                  ))}
                  <input
                    type="color"
                    value={rgbToHex(activeColor)}
                    onChange={(e) => setActiveColor(hexToRgb(e.target.value))}
                    className="size-7 cursor-pointer rounded-full border-0 bg-transparent p-0"
                  />
                </div>
              </div>
            )}

            {isMusic && (
              <MusicStylePicker value={lighting.musicStyle} onChange={(musicStyle) => update({ musicStyle })} />
            )}

            {lighting.effect !== 'hardware' && lighting.effect !== 'off' && (
              <div className="flex flex-col gap-2">
                <Label>{tr('common.brightness', { value: `${lighting.brightness}%` })}</Label>
                <Slider value={[lighting.brightness]} min={0} max={100} step={1} onValueChange={([v]) => update({ brightness: v })} />
              </div>
            )}

            {usesSpeed && (
              <div className="flex flex-col gap-2">
                <Label>{tr(isMusic ? 'common.sensitivity' : 'common.speed', { value: `${lighting.speed}%` })}</Label>
                <Slider value={[lighting.speed]} min={0} max={100} step={1} onValueChange={([v]) => update({ speed: v })} />
              </div>
            )}

            {isMusic && (
              <p className="text-muted-foreground text-xs">{tr('lighting.musicPrivacy')}</p>
            )}

            {isCustom && (
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => update({ perKey: Object.fromEntries(F75_KEYS.map((k) => [k.led, brush])) })}
                >
                  {tr('lighting.fillAll')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => update({ perKey: {} })}>
                  {tr('lighting.clearAll')}
                </Button>
              </div>
            )}

            {(lighting.effect === 'hardware' || lighting.effect === 'off') && (
              <p className="text-muted-foreground text-sm">{tr('common.noSettings')}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
