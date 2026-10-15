import { useEffect, useMemo, useRef, useState, type ComponentType, type MouseEvent, type ReactNode } from 'react'
import { Cpu, Paintbrush, Power, Sparkles, Sun, Waves, Wind } from 'lucide-react'
import { renderFrame } from '@shared/effects'
import { F75_KEYS, type KeyDef } from '@shared/layout'
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

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="bg-muted text-foreground mx-0.5 rounded border px-1.5 py-0.5 font-sans text-[11px] font-medium">
      {children}
    </kbd>
  )
}

export function LightingPage({ connected }: { connected: boolean }) {
  const [lighting, update] = useLighting()
  const t = useAnimationTime()
  const [brush, setBrush] = useState<RGB>([255, 0, 170])

  const preview = useMemo(() => {
    if (lighting.effect === 'hardware') return []
    return renderFrame({ ...lighting, brightness: Math.max(lighting.brightness, 35) }, t)
  }, [lighting, t])

  const isCustom = lighting.effect === 'custom'
  const usesColor = lighting.effect === 'static' || lighting.effect === 'breathing'
  const usesSpeed = lighting.effect === 'breathing' || lighting.effect === 'spectrum' || lighting.effect === 'wave'

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
          colors={preview}
          selected={isCustom ? selected : undefined}
          onKeyDown={isCustom ? onKeyDown : undefined}
          onKeyEnter={isCustom ? onKeyEnter : undefined}
          onBackgroundDown={isCustom ? () => setSelected(new Set()) : undefined}
        />
        {isCustom && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-28 text-xs tabular-nums">
              {selected.size === 0 ? 'No keys selected' : `${selected.size} key${selected.size === 1 ? '' : 's'} selected`}
            </span>
            <Button variant="outline" size="sm" onClick={() => setSelected(new Set(F75_KEYS.map((k) => k.led)))}>
              Select all
            </Button>
            <Button variant="outline" size="sm" disabled={selected.size === 0} onClick={() => setSelected(new Set())}>
              Deselect
            </Button>
            <Button variant="secondary" size="sm" disabled={selected.size === 0} onClick={() => colorSelected(brush)}>
              Apply colour
            </Button>
            <Button variant="outline" size="sm" disabled={selected.size === 0} onClick={() => colorSelected([0, 0, 0])}>
              Turn off
            </Button>
          </div>
        )}
        {isCustom ? (
          <ul className="text-muted-foreground grid grid-cols-2 gap-x-8 gap-y-1.5 text-xs">
            <li>Click a key to select it, click it again to deselect</li>
            <li>
              Hold <Kbd>⇧ Shift</Kbd> or <Kbd>⌘ Command</Kbd> and click to select multiple keys
            </li>
            <li>Drag across keys to select a group</li>
            <li>
              <Kbd>⌘ A</Kbd> selects all · <Kbd>Esc</Kbd> or click the board's edge to deselect all
            </li>
            <li className="col-span-2">Then pick a colour on the right to light the selected keys</li>
          </ul>
        ) : (
          <p className="text-muted-foreground text-xs">
            {lighting.effect === 'hardware'
              ? 'Showing nothing here: the keyboard is running its own built-in effect.'
              : 'Live preview of what the keyboard is showing.'}
          </p>
        )}
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
            <CardTitle>{isCustom ? 'Key colour' : 'Settings'}</CardTitle>
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
                  Clear all
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
