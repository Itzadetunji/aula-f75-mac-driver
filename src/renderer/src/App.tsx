import { Command, Keyboard, Lightbulb, Microscope, Pause, Play, ScanSearch, Settings } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { DeviceStatus } from '@shared/types'
import { LayoutPage } from '@/components/led-check-page'
import { LightingPage } from '@/components/lighting-page'
import { MacrosPage } from '@/components/macros-page'
import { ProtocolLabPage } from '@/components/protocol-lab-page'
import { SettingsPage } from '@/components/settings-page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Onboarding } from '@/components/onboarding'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useDeviceStatus } from '@/hooks/use-f75'
import { usePreferences } from '@/hooks/use-layout'
import { modelName } from '@/lib/utils'

function StatusBadge({ status }: { status: DeviceStatus | null }) {
  const { t } = useTranslation()
  if (!status?.helperRunning) return <Badge variant="destructive">{t('app.status.helperOffline')}</Badge>
  if (!status.connected) return <Badge variant="secondary">{t('app.status.notConnected')}</Badge>
  const model = modelName(status, t)
  return (
    <Badge className="bg-emerald-500/15 text-emerald-300">
      <span className="size-1.5 rounded-full bg-emerald-400" />
      {status.info?.transport === 'wireless'
        ? t('app.status.wireless', { model })
        : t('app.status.wired', { model, firmware: `0x${(status.info?.firmwareVersion ?? 0).toString(16)}` })}
    </Badge>
  )
}

/** While paused nothing may reach the keyboard, so its controls can't be used. */
function Locked({ locked, children }: { locked: boolean; children: ReactNode }) {
  return (
    <fieldset disabled={locked} inert={locked} className="min-w-0 transition-opacity disabled:opacity-40">
      {children}
    </fieldset>
  )
}

export function App() {
  const { t } = useTranslation()
  const status = useDeviceStatus()
  const { preferences, updatePreferences } = usePreferences()
  const connected = !!status?.connected
  const wireless = connected && status?.info?.transport === 'wireless'
  const running = preferences.running

  if (!preferences.onboarded) return <Onboarding onDone={() => updatePreferences({ onboarded: true })} />

  return (
    <Tabs defaultValue="lighting" className="h-screen gap-0">
      <header className="drag-region flex h-14 shrink-0 items-center justify-between border-b pr-4 pl-24">
        <div className="flex items-center gap-2 font-semibold">
          <Keyboard className="size-5" />
          {t('app.title')}
        </div>
        <TabsList>
          <TabsTrigger value="lighting">
            <Lightbulb /> {t('app.tabs.lighting')}
          </TabsTrigger>
          <TabsTrigger value="macros">
            <Command /> {t('app.tabs.macros')}
          </TabsTrigger>
          <TabsTrigger value="led-check">
            <ScanSearch /> {t('app.tabs.layout')}
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings /> {t('app.tabs.settings')}
          </TabsTrigger>
          {import.meta.env.DEV && (
            <TabsTrigger value="lab">
              <Microscope /> {t('app.tabs.lab')}
            </TabsTrigger>
          )}
        </TabsList>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => updatePreferences({ running: !running })}>
            {running ? <Pause /> : <Play />}
            {running ? t('app.paused.pause') : t('app.paused.resume')}
          </Button>
          <StatusBadge status={status} />
        </div>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <main className="p-6">
          {!running && (
            <Card className="mb-6 border-amber-500/40 py-4">
              <CardHeader className="flex items-center justify-between gap-4">
                <div className="flex flex-col gap-1.5">
                  <CardTitle>{t('app.paused.title')}</CardTitle>
                  <CardDescription>{t('app.paused.description')}</CardDescription>
                </div>
                <Button size="sm" onClick={() => updatePreferences({ running: true })}>
                  <Play /> {t('app.paused.resume')}
                </Button>
              </CardHeader>
            </Card>
          )}
          {status?.error && (
            <Card className="border-destructive/50 mb-6 py-4">
              <CardHeader>
                <CardTitle className="text-destructive">{t('app.problem')}</CardTitle>
                <CardDescription>{status.error}</CardDescription>
              </CardHeader>
            </Card>
          )}
          <TabsContent value="lighting">
            <Locked locked={!running}>
              <LightingPage connected={connected} wireless={wireless} />
            </Locked>
          </TabsContent>
          <TabsContent value="macros">
            <MacrosPage />
          </TabsContent>
          <TabsContent value="led-check">
            <Locked locked={!running}>
              <LayoutPage connected={connected} />
            </Locked>
          </TabsContent>
          <TabsContent value="settings">
            <SettingsPage status={status} />
          </TabsContent>
          {import.meta.env.DEV && (
            <TabsContent value="lab">
              <ProtocolLabPage connected={connected} />
            </TabsContent>
          )}
        </main>
      </ScrollArea>
    </Tabs>
  )
}
