import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Loader2, RefreshCw, Save, Undo2 } from 'lucide-react'
import { hsvToRgb } from '@shared/effects'
import { F75_KEYS } from '@shared/layout'
import {
  decodeOnboard,
  diffOnboard,
  MAX_BRIGHTNESS,
  MAX_SPEED,
  MULTICOLOR,
  OFF_EFFECT,
  ONBOARD_COLORS,
  ONBOARD_EFFECTS,
  SELF_DEFINE_EFFECT,
  type EffectSettings,
  type OnboardConfig,
} from '@shared/onboard'
import type { RGB } from '@shared/types'
import { KeyboardView } from '@/components/keyboard-view'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { cn, rgbToHex } from '@/lib/utils'

function previewFrame(effectId: number, s: EffectSettings | undefined, hasColor: boolean): RGB[] {
  if (!s || effectId === OFF_EFFECT || effectId === SELF_DEFINE_EFFECT || s.brightness === 0) return []
  const v = 0.2 + 0.8 * (s.brightness / MAX_BRIGHTNESS)
  const frame: RGB[] = []
  for (const key of F75_KEYS) {
    if (!hasColor || s.color === MULTICOLOR) {
      frame[key.led] = hsvToRgb((Math.floor(key.led / 6) / 15) * 300, 1, v)
    } else {
      const [r, g, b] = ONBOARD_COLORS[s.color]?.rgb ?? [255, 255, 255]
      frame[key.led] = [Math.round(r * v), Math.round(g * v), Math.round(b * v)]
    }
  }
  return frame
}

export function OnboardLighting({ connected, tabs }: { connected: boolean; tabs: ReactNode }) {
  const [stored, setStored] = useState<OnboardConfig | null>(null)
  const [draft, setDraft] = useState<OnboardConfig | null>(null)
  const [busy, setBusy] = useState<'read' | 'write' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [appOverrides, setAppOverrides] = useState(false)

  const load = useCallback(async () => {
    setBusy('read')
    setError(null)
    try {
      const config = decodeOnboard(await window.f75.readOnboard())
      setStored(config)
      setDraft(config)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }, [])

  useEffect(() => {
    if (connected) void load()
    void window.f75.getLighting().then((l) => setAppOverrides(l.effect !== 'hardware'))
  }, [connected, load])

  const changes = useMemo(() => (stored && draft ? diffOnboard(stored, draft) : []), [stored, draft])

  const save = async () => {
    setBusy('write')
    setError(null)
    try {
      const config = decodeOnboard(await window.f75.writeOnboard(changes))
      setStored(config)
      setDraft(config)
      setAppOverrides(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const effect = ONBOARD_EFFECTS.find((e) => e.id === draft?.effect)
  const settings = draft ? draft.settings[draft.effect] : undefined
  const editable = !!effect && effect.id !== OFF_EFFECT && effect.id !== SELF_DEFINE_EFFECT && !!settings

  const patchSettings = (patch: Partial<EffectSettings>) =>
    setDraft((d) => d && { ...d, settings: { ...d.settings, [d.effect]: { ...d.settings[d.effect], ...patch } } })

  if (!connected) {
    return (
      <div className="text-muted-foreground flex flex-col items-center gap-6 py-16 text-sm">
        {tabs}
        Connect the keyboard with the USB cable to read its saved lighting.
      </div>
    )
  }

  if (!draft) {
    return (
      <div className="text-muted-foreground flex flex-col items-center gap-3 py-16 text-sm">
        {tabs}
        {busy === 'read' && <Loader2 className="size-5 animate-spin" />}
        {error ?? 'Reading the lighting saved on the keyboard…'}
        {error && (
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Try again
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3">
        <KeyboardView colors={previewFrame(draft.effect, settings, !!effect?.hasColor)} />
        {tabs}
        <p className="text-muted-foreground text-xs">
          Rough preview. The keyboard runs this effect itself, even when it isn't connected to this Mac.
        </p>
      </div>

      {appOverrides && (
        <Card className="border-amber-500/40 py-4">
          <CardHeader>
            <CardDescription>
              The app's live lighting is covering the keyboard's own effect right now. Saving switches the app to
              On-board so you can see the result.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid grid-cols-[1.4fr_1fr] gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-1.5">
                <CardTitle>Saved effect</CardTitle>
                <CardDescription>Stored on the keyboard. The same list you cycle through with Fn shortcuts.</CardDescription>
              </div>
              <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => void load()}>
                <RefreshCw className={cn(busy === 'read' && 'animate-spin')} /> Reload
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-4 gap-2">
            {ONBOARD_EFFECTS.map((e) => {
              const isStored = stored?.effect === e.id
              const locked = e.id === SELF_DEFINE_EFFECT && !isStored
              return (
                <button
                  key={e.id}
                  type="button"
                  disabled={locked || !!busy}
                  title={locked ? 'Per-key mode editing is coming next.' : undefined}
                  onClick={() => setDraft((d) => d && { ...d, effect: e.id })}
                  className={cn(
                    'hover:bg-accent relative flex min-h-14 items-center justify-center rounded-lg border p-2 text-center text-xs font-medium transition-colors disabled:opacity-40',
                    draft.effect === e.id && 'border-primary bg-accent',
                  )}
                >
                  {e.name}
                  {isStored && <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-emerald-400" />}
                </button>
              )
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{effect?.name ?? `Effect ${draft.effect}`}</CardTitle>
            <CardDescription>The keyboard remembers these separately for every effect.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {editable && settings ? (
              <>
                <div className="flex flex-col gap-2">
                  <Label>
                    Brightness · {settings.brightness}/{MAX_BRIGHTNESS}
                  </Label>
                  <Slider
                    value={[settings.brightness]}
                    min={0}
                    max={MAX_BRIGHTNESS}
                    step={1}
                    onValueChange={([v]) => patchSettings({ brightness: v })}
                  />
                </div>

                {effect.hasSpeed && (
                  <div className="flex flex-col gap-2">
                    <Label>
                      Speed · {settings.speed}/{MAX_SPEED}
                    </Label>
                    <Slider
                      value={[settings.speed]}
                      min={0}
                      max={MAX_SPEED}
                      step={1}
                      onValueChange={([v]) => patchSettings({ speed: v })}
                    />
                  </div>
                )}

                {effect.hasColor && (
                  <div className="flex flex-col gap-2">
                    <Label>Colour · {ONBOARD_COLORS[settings.color]?.name ?? 'Multicolour'}</Label>
                    <div className="flex flex-wrap items-center gap-2">
                      {ONBOARD_COLORS.map((c, i) => (
                        <button
                          key={c.name}
                          type="button"
                          title={c.name}
                          onClick={() => patchSettings({ color: i })}
                          className={cn(
                            'size-7 rounded-full border-2 border-transparent',
                            settings.color === i && 'border-white',
                          )}
                          style={{ background: rgbToHex(c.rgb) }}
                        />
                      ))}
                      <button
                        type="button"
                        title="Multicolour"
                        onClick={() => patchSettings({ color: MULTICOLOR })}
                        className={cn(
                          'size-7 rounded-full border-2 border-transparent bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)]',
                          settings.color === MULTICOLOR && 'border-white',
                        )}
                      />
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-muted-foreground text-sm">
                {draft.effect === SELF_DEFINE_EFFECT
                  ? 'The keyboard is showing its saved per-key colours. Editing them here is coming next.'
                  : 'No settings for this effect.'}
              </p>
            )}

            {error && <p className="text-destructive text-sm">{error}</p>}

            <div className="mt-auto flex items-center gap-2">
              <Button disabled={changes.length === 0 || !!busy} onClick={() => void save()}>
                {busy === 'write' ? <Loader2 className="animate-spin" /> : <Save />} Save to keyboard
              </Button>
              <Button variant="ghost" disabled={changes.length === 0 || !!busy} onClick={() => setDraft(stored)}>
                <Undo2 /> Discard
              </Button>
              {changes.length > 0 && <Badge variant="secondary">Unsaved</Badge>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
