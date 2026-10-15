import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Loader2, MousePointerClick, Music } from 'lucide-react'
import { MusicMeter, renderFrame } from '@shared/effects'
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
import { MusicStylePicker } from '@/components/music-style-picker'
import { useAnimationTime, useAudioBands, useLighting } from '@/hooks/use-f75'
import { useLayout } from '@/hooks/use-layout'
import { keyIdFromCode, renderOnboardDemo, type Press } from '@/lib/onboard-demo'
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
  // `draft` is what the controls show: the stored config plus a slider still being dragged.
  const [draft, setDraft] = useState<OnboardConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lighting, updateLighting] = useLighting()
  const stored = useRef<OnboardConfig | null>(null)
  const writing = useRef(false)
  const queued = useRef<OnboardConfig | null>(null)
  const dragging = useRef(false)

  const musicActive = lighting.effect === 'music'
  const appOverrides = lighting.effect !== 'hardware' && !musicActive
  const music = musicActive || !draft

  // Re-read the keyboard every second, so Fn changes made on it show up here.
  useEffect(() => {
    if (!connected || wireless) return
    let cancelled = false
    let reading = false
    const poll = async () => {
      if (reading || writing.current || dragging.current) return
      reading = true
      try {
        const config = decodeOnboard(await window.f75.readOnboard())
        if (cancelled || writing.current || dragging.current) return
        const prev = stored.current
        if (prev && prev.perKey === config.perKey && diffOnboard(prev, config).length === 0) return
        stored.current = config
        setDraft(config)
        setError(null)
      } catch (err) {
        if (!stored.current && !cancelled) setError((err as Error).message)
      } finally {
        reading = false
      }
    }
    void poll()
    const timer = window.setInterval(() => void poll(), 1000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [connected, wireless])

  /** Writes `next` to the keyboard straight away; rapid changes are coalesced. */
  const apply = async (next: OnboardConfig) => {
    setDraft(next)
    if (writing.current) {
      queued.current = next
      return
    }
    writing.current = true
    setSaving(true)
    setError(null)
    try {
      let target: OnboardConfig | null = next
      while (target && stored.current) {
        queued.current = null
        const changes = diffOnboard(stored.current, target)
        if (changes.length > 0) stored.current = decodeOnboard(await window.f75.writeOnboard(changes))
        target = queued.current
      }
      if (lighting.effect !== 'hardware') updateLighting({ effect: 'hardware' })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      writing.current = false
      setSaving(false)
      setDraft(stored.current)
    }
  }

  const effect = music ? undefined : ONBOARD_EFFECTS.find((e) => e.id === draft?.effect)
  const settings = draft && !music ? draft.settings[draft.effect] : undefined
  const editable = !!effect && effect.id !== OFF_EFFECT && effect.id !== SELF_DEFINE_EFFECT && !!settings

  const demo = useEffectDemo(effect, settings)
  const bands = useAudioBands(music && musicActive)
  const meter = useRef(new MusicMeter())
  const t = now()
  if (music) meter.current.update(bands.current.length > 0 ? bands.current : fakeBands(t), t)
  const frame = music
    ? renderFrame({ ...lighting, effect: 'music', brightness: Math.max(lighting.brightness, 35) }, t, meter.current)
    : demo.frame

  const withSettings = (patch: Partial<EffectSettings>): OnboardConfig | null =>
    draft && { ...draft, settings: { ...draft.settings, [draft.effect]: { ...draft.settings[draft.effect], ...patch } } }

  /** Sliders preview while dragging and write once released. */
  const dragSettings = (patch: Partial<EffectSettings>) => {
    dragging.current = true
    setDraft(withSettings(patch))
  }
  const commitSettings = (patch: Partial<EffectSettings>) => {
    dragging.current = false
    const next = withSettings(patch)
    if (next) void apply(next)
  }

  const visibleEffects = ONBOARD_EFFECTS.filter(
    (e) =>
      import.meta.env.DEV ||
      (!e.unsupported && e.id !== SELF_DEFINE_EFFECT) ||
      stored.current?.effect === e.id,
  )

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
        {!error && <Loader2 className="size-5 animate-spin" />}
        {error ? `${error} Retrying…` : 'Reading the lighting saved on the keyboard…'}
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
              : 'Demo of the Music effect. Click the Music tile to stream it to the keyboard.'
            : `${demo.reactive ? 'Demo: click keys or type to try it out. ' : 'Demo of the effect, roughly how the keyboard shows it. '}The keyboard runs this itself, even when it isn't connected to this Mac.`}
        </p>
      </div>

      {appOverrides && (
        <Card className="border-amber-500/40 py-4">
          <CardHeader>
            <CardDescription>
              The app's live lighting is covering the keyboard's own effect right now. Picking an effect here switches
              the app to On-board so you can see the result.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid grid-cols-[1.4fr_1fr] gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Saved effect</CardTitle>
            <CardDescription>
              Stored on the keyboard, the same list you cycle through with Fn shortcuts. Changes apply straight away.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-4 gap-2">
            {draft ? (
              visibleEffects.map((e) => {
                const isStored = stored.current?.effect === e.id
                const locked = (e.id === SELF_DEFINE_EFFECT || e.unsupported) && !isStored
                return (
                  <button
                    key={e.id}
                    type="button"
                    disabled={locked}
                    title={
                      e.unsupported
                        ? "This effect stays dark on this keyboard's firmware."
                        : locked
                          ? 'Per-key mode editing is coming next.'
                          : undefined
                    }
                    onClick={() => void apply({ ...draft, effect: e.id })}
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
              title="Made by this app and streamed to the keyboard"
              onClick={() => updateLighting({ effect: 'music' })}
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
                  <p>Lights that follow whatever your Mac is playing. Pick a style below.</p>
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
                <MusicStylePicker
                  value={lighting.musicStyle}
                  onChange={(musicStyle) => updateLighting({ musicStyle })}
                />
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
                    onValueChange={([v]) => dragSettings({ brightness: v })}
                    onValueCommit={([v]) => commitSettings({ brightness: v })}
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
                      onValueChange={([v]) => dragSettings({ speed: v })}
                      onValueCommit={([v]) => commitSettings({ speed: v })}
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
                          onClick={() => commitSettings({ color: i })}
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
                        onClick={() => commitSettings({ color: MULTICOLOR })}
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

            {saving && (
              <p className="text-muted-foreground mt-auto flex items-center gap-1.5 text-xs">
                <Loader2 className="size-3.5 animate-spin" /> Saving to the keyboard…
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
