import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Loader2, MousePointerClick, Music, RefreshCw, Save, Undo2 } from 'lucide-react'
import { renderFrame } from '@shared/effects'
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
  type OnboardEffect,
} from '@shared/onboard'
import { KeyboardView } from '@/components/keyboard-view'
import { useAnimationTime, useAudioBands, useLighting } from '@/hooks/use-f75'
import { useLayout } from '@/hooks/use-layout'
import { keyIdFromCode, renderOnboardDemo, type Press } from '@/lib/onboard-demo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { cn, rgbToHex } from '@/lib/utils'

const now = () => performance.now() / 1000

/** Animated demo of the selected effect; reactive effects respond to clicks and real key presses. */
export function useEffectDemo(effect: OnboardEffect | undefined, settings: EffectSettings | undefined) {
  useAnimationTime()
  const { keys } = useLayout()
  const presses = useRef<Press[]>([])
  const reactive = !!effect?.reactive

  const press = useCallback((led: number) => {
    const t = now()
    presses.current = [...presses.current.filter((p) => t - p.at < 4), { led, at: t }]
  }, [])

  useEffect(() => {
    if (!reactive) return
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const id = keyIdFromCode(e.code)
      const key = id && keys.find((k) => k.id === id)
      if (key) press(key.led)
    }
    // Plays by itself until the user starts pressing keys.
    const auto = window.setInterval(() => {
      const last = presses.current.at(-1)
      if (!last || now() - last.at > 2.5) press(keys[Math.floor(Math.random() * keys.length)].led)
    }, 900)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.clearInterval(auto)
    }
  }, [reactive, keys, press])

  const frame =
    effect && effect.id !== OFF_EFFECT && effect.id !== SELF_DEFINE_EFFECT
      ? renderOnboardDemo(effect.id, settings, effect.hasColor, now(), presses.current)
      : []
  return { frame, press, reactive }
}

/** Stand-in spectrum so the Music tile has something to show before it is streaming. */
const fakeBands = (t: number) =>
  Array.from({ length: 16 }, (_, i) =>
    Math.max(0, Math.min(1, 0.45 + 0.3 * Math.sin(t * 4 + i * 0.8) + 0.2 * Math.sin(t * 7.3 + i * 1.9) - i * 0.015)),
  )

export function OnboardLighting({ connected, wireless, tabs }: { connected: boolean; wireless: boolean; tabs: ReactNode }) {
  const [stored, setStored] = useState<OnboardConfig | null>(null)
  const [draft, setDraft] = useState<OnboardConfig | null>(null)
  const [busy, setBusy] = useState<'read' | 'write' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lighting, updateLighting] = useLighting()

  const musicActive = lighting.effect === 'music'
  const appOverrides = lighting.effect !== 'hardware' && !musicActive
  // null follows whatever is running, so the Music tile starts selected while it streams.
  const [musicPicked, setMusicPicked] = useState<boolean | null>(null)
  const music = musicPicked ?? (musicActive || !draft)

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
    if (connected && !wireless) void load()
  }, [connected, wireless, load])

  const changes = useMemo(() => (stored && draft ? diffOnboard(stored, draft) : []), [stored, draft])
  const dirty = music ? !musicActive : changes.length > 0 || musicActive

  const save = async () => {
    setError(null)
    if (music) {
      updateLighting({ effect: 'music' })
      setMusicPicked(null)
      return
    }
    setBusy('write')
    try {
      if (changes.length > 0) {
        const config = decodeOnboard(await window.f75.writeOnboard(changes))
        setStored(config)
        setDraft(config)
      }
      updateLighting({ effect: 'hardware' })
      setMusicPicked(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const discard = () => {
    setDraft(stored)
    setMusicPicked(null)
  }

  const effect = music ? undefined : ONBOARD_EFFECTS.find((e) => e.id === draft?.effect)
  const settings = draft && !music ? draft.settings[draft.effect] : undefined
  const editable = !!effect && effect.id !== OFF_EFFECT && effect.id !== SELF_DEFINE_EFFECT && !!settings

  const demo = useEffectDemo(effect, settings)
  const bands = useAudioBands(music && musicActive)
  const t = now()
  const frame = music
    ? renderFrame(
        { ...lighting, effect: 'music', brightness: Math.max(lighting.brightness, 35) },
        t,
        bands.current.length > 0 ? bands.current : fakeBands(t),
      )
    : demo.frame

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

  if (!draft && !wireless) {
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

  const tileClass = (selected: boolean) =>
    cn(
      'hover:bg-accent relative flex min-h-14 items-center justify-center gap-1.5 rounded-lg border p-2 text-center text-xs font-medium transition-colors disabled:opacity-40',
      selected && 'border-primary bg-accent',
    )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3">
        <KeyboardView
          colors={frame}
          onKeyDown={!music && demo.reactive ? (key) => demo.press(key.led) : undefined}
        />
        {tabs}
        <p className="text-muted-foreground text-xs">
          {music
            ? musicActive
              ? 'Live: play something on your Mac and the keyboard follows it.'
              : 'Demo of the Music effect. Save to start streaming it to the keyboard.'
            : `${demo.reactive ? 'Demo: click keys or type to try it out. ' : 'Demo of the effect, roughly how the keyboard shows it. '}The keyboard runs this itself, even when it isn't connected to this Mac.`}
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
              {!wireless && (
                <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => void load()}>
                  <RefreshCw className={cn(busy === 'read' && 'animate-spin')} /> Reload
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-4 gap-2">
            {draft ? (
              ONBOARD_EFFECTS.map((e) => {
                const isStored = stored?.effect === e.id
                const locked = (e.id === SELF_DEFINE_EFFECT || e.unsupported) && !isStored
                return (
                  <button
                    key={e.id}
                    type="button"
                    disabled={locked || !!busy}
                    title={
                      e.unsupported
                        ? "This effect stays dark on this keyboard's firmware."
                        : locked
                          ? 'Per-key mode editing is coming next.'
                          : undefined
                    }
                    onClick={() => {
                      setMusicPicked(false)
                      setDraft((d) => d && { ...d, effect: e.id })
                    }}
                    className={tileClass(!music && draft.effect === e.id)}
                  >
                    {e.name}
                    {isStored && (
                      <span
                        title={musicActive ? 'Saved on the keyboard (shown when the app stops streaming)' : 'Saved on the keyboard'}
                        className={cn(
                          'absolute top-1.5 right-1.5 size-1.5 rounded-full',
                          musicActive ? 'bg-muted-foreground' : 'bg-emerald-400',
                        )}
                      />
                    )}
                  </button>
                )
              })
            ) : (
              <p className="text-muted-foreground col-span-4 text-sm">
                Connected through the 2.4 GHz dongle, which can't read or change the effects stored on the keyboard.
                Plug in the USB cable to edit them.
              </p>
            )}
            <button
              type="button"
              disabled={!!busy}
              title="Made by this app and streamed to the keyboard"
              onClick={() => setMusicPicked(true)}
              className={tileClass(music)}
            >
              <Music className="size-3.5" /> Music
              {musicActive && <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-emerald-400" />}
            </button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{music ? 'Music' : (effect?.name ?? `Effect ${draft?.effect}`)}</CardTitle>
            <CardDescription>
              {music
                ? 'Streamed by this app over the USB cable or the 2.4 GHz dongle.'
                : 'The keyboard remembers these separately for every effect.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {music && (
              <>
                <div className="bg-muted/50 flex flex-col gap-1.5 rounded-lg border p-3 text-sm">
                  <p>
                    A spectrum that follows whatever your Mac is playing: each column of keys is a bar, bass on the left
                    and treble on the right.
                  </p>
                  <p className="text-muted-foreground text-xs">
                    The keyboard has no way to hear audio, so this can't live in its memory. The app keeps it running,
                    even with the window closed, and sends it wirelessly through the dongle when the cable is unplugged.
                    When the app quits, the keyboard goes back to the effect saved on it.
                  </p>
                  <p className="text-xs text-amber-400">
                    For the dongle, the keyboard must be on Fixed on: animated effects repaint the keys and hide the
                    stream.
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Brightness · {lighting.brightness}%</Label>
                  <Slider
                    value={[lighting.brightness]}
                    min={0}
                    max={100}
                    step={1}
                    onValueChange={([v]) => updateLighting({ brightness: v })}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Sensitivity · {lighting.speed}%</Label>
                  <Slider
                    value={[lighting.speed]}
                    min={0}
                    max={100}
                    step={1}
                    onValueChange={([v]) => updateLighting({ speed: v })}
                  />
                </div>
              </>
            )}

            {effect && (
              <div className="bg-muted/50 flex flex-col gap-1.5 rounded-lg border p-3 text-sm">
                <p>{effect.description}</p>
                {effect.unsupported && (
                  <p className="text-xs text-amber-400">
                    Your keyboard's firmware doesn't seem to support this effect: it stays dark. Pick another one.
                  </p>
                )}
                {!effect.unsupported && settings?.brightness === 0 && effect.id !== OFF_EFFECT && (
                  <p className="text-xs text-amber-400">Brightness is 0, so the keyboard will be dark on this effect.</p>
                )}
                {effect.reactive && (
                  <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                    <MousePointerClick className="size-3.5" /> Reacts to typing. Click keys above or type to try it.
                  </p>
                )}
              </div>
            )}

            {editable && settings && (
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
            )}

            {!music && !editable && draft && (
              <p className="text-muted-foreground text-sm">
                {draft.effect === SELF_DEFINE_EFFECT
                  ? 'The keyboard is showing its saved per-key colours. Editing them here is coming next.'
                  : 'No settings for this effect.'}
              </p>
            )}

            {error && <p className="text-destructive text-sm">{error}</p>}

            <div className="mt-auto flex items-center gap-2">
              <Button disabled={!dirty || !!busy || (!music && wireless)} onClick={() => void save()}>
                {busy === 'write' ? <Loader2 className="animate-spin" /> : <Save />}{' '}
                {music ? 'Save & stream' : 'Save to keyboard'}
              </Button>
              <Button variant="ghost" disabled={!dirty || !!busy} onClick={discard}>
                <Undo2 /> Discard
              </Button>
              {dirty && <Badge variant="secondary">Unsaved</Badge>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
