import { useMemo, useState, type ComponentType } from 'react'
import { Cpu, Paintbrush, Power, Sparkles, Sun, Waves, Wind } from 'lucide-react'
import { renderFrame } from '@shared/effects'
import { F75_KEYS } from '@shared/layout'
import type { EffectId, RGB } from '@shared/types'
import { KeyboardView } from '@/components/keyboard-view'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { useAnimationTime, useLighting } from '@/hooks/use-f75'
import { cn, hexToRgb, rgbToHex } from '@/lib/utils'

const EFFECTS: { id: EffectId; label: string; icon: ComponentType<{ className?: string }>; hint: string }[] = [
  { id: 'hardware', label: 'On-board', icon: Cpu, hint: "The keyboard's own saved effect (Fn shortcuts)." },
  { id: 'static', label: 'Static', icon: Sun, hint: 'One colour on every key.' },
  { id: 'breathing', label: 'Breathing', icon: Wind, hint: 'Fades the colour in and out.' },
  { id: 'spectrum', label: 'Spectrum', icon: Sparkles, hint: 'Cycles the whole board through the rainbow.' },
  { id: 'wave', label: 'Wave', icon: Waves, hint: 'Rainbow sweeping across the board.' },
  { id: 'custom', label: 'Per-key', icon: Paintbrush, hint: 'Paint individual keys.' },
  { id: 'off', label: 'Off', icon: Power, hint: 'All LEDs off.' },
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

export function LightingPage({ connected }: { connected: boolean }) {
  const [lighting, update] = useLighting()
  const t = useAnimationTime()
  const [brush, setBrush] = useState<RGB>([255, 0, 170])

  const preview = useMemo(() => {
    if (lighting.effect === 'hardware') return []
    return renderFrame({ ...lighting, brightness: Math.max(lighting.brightness, 35) }, t)
  }, [lighting, t])

  const paint = (led: number) => update({ perKey: { ...lighting.perKey, [led]: brush } })
  const isCustom = lighting.effect === 'custom'
  const usesColor = lighting.effect === 'static' || lighting.effect === 'breathing'
  const usesSpeed = lighting.effect === 'breathing' || lighting.effect === 'spectrum' || lighting.effect === 'wave'
  const activeColor = isCustom ? brush : lighting.color
  const setActiveColor = (c: RGB) => (isCustom ? setBrush(c) : update({ color: c }))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3">
        <KeyboardView
          colors={preview}
          onKeyDown={isCustom ? (k) => paint(k.led) : undefined}
          onKeyEnter={isCustom ? (k) => paint(k.led) : undefined}
        />
        <p className="text-muted-foreground text-xs">
          {isCustom
            ? 'Click or drag across keys to paint them with the selected colour.'
            : lighting.effect === 'hardware'
              ? 'Showing nothing here: the keyboard is running its own built-in effect.'
              : 'Live preview of what the keyboard is showing.'}
        </p>
      </div>

      <div className="grid grid-cols-[1.4fr_1fr] gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Effect</CardTitle>
            <CardDescription>
              Effects other than On-board are driven by this app and stay active while it is running (even with the
              window closed).
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-4 gap-2">
            {EFFECTS.map(({ id, label, icon: Icon, hint }) => (
              <button
                key={id}
                type="button"
                title={hint}
                disabled={!connected}
                onClick={() => update({ effect: id })}
                className={cn(
                  'hover:bg-accent flex flex-col items-center gap-2 rounded-lg border p-3 text-xs font-medium transition-colors disabled:opacity-50',
                  lighting.effect === id && 'border-primary bg-accent',
                )}
              >
                <Icon className="size-5" />
                {label}
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{isCustom ? 'Brush' : 'Settings'}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {(usesColor || isCustom) && (
              <div className="flex flex-col gap-2">
                <Label>Colour</Label>
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

            {lighting.effect !== 'hardware' && lighting.effect !== 'off' && (
              <div className="flex flex-col gap-2">
                <Label>Brightness · {lighting.brightness}%</Label>
                <Slider value={[lighting.brightness]} min={0} max={100} step={1} onValueChange={([v]) => update({ brightness: v })} />
              </div>
            )}

            {usesSpeed && (
              <div className="flex flex-col gap-2">
                <Label>Speed · {lighting.speed}%</Label>
                <Slider value={[lighting.speed]} min={0} max={100} step={1} onValueChange={([v]) => update({ speed: v })} />
              </div>
            )}

            {isCustom && (
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => update({ perKey: Object.fromEntries(F75_KEYS.map((k) => [k.led, brush])) })}
                >
                  Fill all
                </Button>
                <Button variant="outline" size="sm" onClick={() => update({ perKey: {} })}>
                  Clear
                </Button>
              </div>
            )}

            {(lighting.effect === 'hardware' || lighting.effect === 'off') && (
              <p className="text-muted-foreground text-sm">No settings for this effect.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
