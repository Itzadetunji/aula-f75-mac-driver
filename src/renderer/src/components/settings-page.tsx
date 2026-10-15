import { useEffect, useState, type ReactNode } from 'react'
import { Loader2, Usb } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { LANGUAGES } from '@shared/i18n'
import {
  DEBOUNCE_MAX_MS,
  DEBOUNCE_MIN_MS,
  DEBOUNCE_OFFSET,
  debounceFromByte,
  debounceToByte,
  DEFAULT_DEBOUNCE_MS,
  formatDuration,
  SLEEP_OFFSET,
  SLEEP_SECONDS,
  sleepFromByte,
  sleepToByte,
} from '@shared/keyboard-settings'
import type { CloseAction, DeviceStatus, Language } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { usePreferences } from '@/hooks/use-layout'
import { modelName } from '@/lib/utils'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  )
}

function DeviceCard({ status }: { status: DeviceStatus | null }) {
  const { t } = useTranslation()
  const [version, setVersion] = useState('')
  useEffect(() => void window.f75.getAppVersion().then(setVersion), [])

  const connected = !!status?.connected
  const wireless = status?.info?.transport === 'wireless'
  const firmware = status?.info ? `0x${status.info.firmwareVersion.toString(16).padStart(4, '0')}` : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.device.title')}</CardTitle>
        <CardDescription>{t('settings.device.description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Row label={t('settings.device.model')}>
          {connected && status ? modelName(status, t) : t('settings.device.notConnected')}
        </Row>
        <Row label={t('settings.device.firmware')}>
          {!connected || !firmware
            ? t('settings.device.unknown')
            : wireless
              ? t('settings.device.firmwareDongle', { version: firmware })
              : firmware}
        </Row>
        <Row label={t('settings.device.connection')}>
          {!connected
            ? t('settings.device.notConnected')
            : t(wireless ? 'settings.device.wireless' : 'settings.device.wired')}
        </Row>
        <Row label={t('settings.device.software')}>{version}</Row>
      </CardContent>
    </Card>
  )
}

function AppCard() {
  const { t } = useTranslation()
  const { preferences, updatePreferences } = usePreferences()
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.app.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Label>{t('settings.language.title')}</Label>
          <Select value={preferences.language} onValueChange={(v) => updatePreferences({ language: v as Language })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">{t('settings.language.description')}</p>
        </div>

        <div className="flex flex-col gap-2">
          <Label className="justify-between">
            {t('settings.app.running')}
            <Switch checked={preferences.running} onCheckedChange={(running) => updatePreferences({ running })} />
          </Label>
          <p className="text-muted-foreground text-xs">{t('settings.app.runningDescription')}</p>
        </div>

        <div className="flex flex-col gap-2">
          <Label>{t('settings.app.close')}</Label>
          <Select
            value={preferences.closeAction}
            onValueChange={(v) => updatePreferences({ closeAction: v as CloseAction })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="menubar">{t('settings.app.closeMenubar')}</SelectItem>
              <SelectItem value="quit">{t('settings.app.closeQuit')}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">{t('settings.app.closeDescription')}</p>
        </div>
      </CardContent>
    </Card>
  )
}

/** Sleep and debounce live on the keyboard's settings page, which is only safe to write over the cable. */
function KeyboardCard({ status }: { status: DeviceStatus | null }) {
  const { t } = useTranslation()
  const { preferences } = usePreferences()
  const running = preferences.running
  const connected = !!status?.connected
  const wired = connected && status?.info?.transport === 'wired'
  const [page, setPage] = useState<number[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Slider positions while dragging; written on release. */
  const [sleepDrag, setSleepDrag] = useState<number | null>(null)
  const [debounceDrag, setDebounceDrag] = useState<number | null>(null)

  useEffect(() => {
    setPage(null)
    setError(null)
    if (!wired || !running) return
    let cancelled = false
    window.f75
      .readOnboard()
      .then((bytes) => !cancelled && setPage(bytes))
      .catch((err: Error) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [wired, running])

  const write = async (changes: [number, number][]) => {
    setSaving(true)
    setError(null)
    try {
      setPage(await window.f75.writeKeyboardSettings(changes))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
      setSleepDrag(null)
      setDebounceDrag(null)
    }
  }

  const sleep = page ? sleepFromByte(page[SLEEP_OFFSET]) : null
  const sleepIndex = sleepDrag ?? Math.max(0, SLEEP_SECONDS.indexOf(sleep?.seconds ?? 300))
  const debounce = page && DEBOUNCE_OFFSET !== null ? debounceFromByte(page[DEBOUNCE_OFFSET]) : null
  const debounceMs = debounceDrag ?? debounce ?? DEFAULT_DEBOUNCE_MS
  const canEdit = !!page && !saving && running

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.keyboard.title')}</CardTitle>
        <CardDescription>{t('settings.keyboard.description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {!wired && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 p-3 text-xs text-amber-300">
            <Usb className="size-4 shrink-0" />
            {t(connected ? 'settings.keyboard.cableOnly' : 'settings.keyboard.notConnected')}
          </div>
        )}
        {!running && <p className="text-xs text-amber-400">{t('app.paused.blocked')}</p>}
        {wired && running && !page && !error && (
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Loader2 className="size-3.5 animate-spin" /> {t('settings.keyboard.reading')}
          </p>
        )}

        <div className="flex flex-col gap-3">
          <Label className="justify-between">
            {t('settings.sleep.title')}
            <Switch
              disabled={!canEdit || !sleep}
              checked={!!sleep?.enabled}
              onCheckedChange={(on) => void write([[SLEEP_OFFSET, on ? sleepToByte(sleep!.seconds) : 0]])}
            />
          </Label>
          <p className="text-muted-foreground text-xs">{t('settings.sleep.description')}</p>
          <Label className="text-muted-foreground text-xs font-normal">
            {t('settings.sleep.after', { duration: formatDuration(SLEEP_SECONDS[sleepIndex], t) })}
          </Label>
          <Slider
            disabled={!canEdit || !sleep?.enabled}
            value={[sleepIndex]}
            min={0}
            max={SLEEP_SECONDS.length - 1}
            step={1}
            onValueChange={([i]) => setSleepDrag(i)}
            onValueCommit={([i]) => void write([[SLEEP_OFFSET, sleepToByte(SLEEP_SECONDS[i])]])}
          />
          {page && !sleep && <p className="text-xs text-amber-400">{t('settings.keyboard.unexpected')}</p>}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Label>{t('settings.debounce.value', { value: debounceMs })}</Label>
            <Button
              variant="ghost"
              size="sm"
              disabled={!canEdit || DEBOUNCE_OFFSET === null || debounce === DEFAULT_DEBOUNCE_MS}
              onClick={() => DEBOUNCE_OFFSET !== null && void write([[DEBOUNCE_OFFSET, debounceToByte(DEFAULT_DEBOUNCE_MS)]])}
            >
              {t('settings.debounce.default', { value: DEFAULT_DEBOUNCE_MS })}
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">{t('settings.debounce.description')}</p>
          <Slider
            disabled={!canEdit || DEBOUNCE_OFFSET === null || debounce === null}
            value={[debounceMs]}
            min={DEBOUNCE_MIN_MS}
            max={DEBOUNCE_MAX_MS}
            step={1}
            onValueChange={([v]) => setDebounceDrag(v)}
            onValueCommit={([v]) => DEBOUNCE_OFFSET !== null && void write([[DEBOUNCE_OFFSET, debounceToByte(v)]])}
          />
          {DEBOUNCE_OFFSET === null && <p className="text-xs text-amber-400">{t('settings.debounce.notVerified')}</p>}
          {DEBOUNCE_OFFSET !== null && page && debounce === null && (
            <p className="text-xs text-amber-400">{t('settings.keyboard.unexpected')}</p>
          )}
        </div>

        {error && <p className="text-destructive text-sm">{error}</p>}
        {saving && (
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Loader2 className="size-3.5 animate-spin" /> {t('settings.keyboard.saving')}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export function SettingsPage({ status }: { status: DeviceStatus | null }) {
  const { t } = useTranslation()
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <h2 className="text-xl font-semibold">{t('settings.title')}</h2>
      <div className="grid grid-cols-2 items-start gap-6">
        <div className="flex flex-col gap-6">
          <DeviceCard status={status} />
          <AppCard />
        </div>
        <KeyboardCard status={status} />
      </div>
    </div>
  )
}
