import { Keyboard, Lightbulb, Microscope, ScanSearch } from 'lucide-react'
import type { DeviceStatus } from '@shared/types'
import { LedCheckPage } from '@/components/led-check-page'
import { LightingPage } from '@/components/lighting-page'
import { ProtocolLabPage } from '@/components/protocol-lab-page'
import { Badge } from '@/components/ui/badge'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Onboarding } from '@/components/onboarding'
import { useDeviceStatus } from '@/hooks/use-f75'
import { usePreferences } from '@/hooks/use-layout'

function StatusBadge({ status }: { status: DeviceStatus | null }) {
  if (!status?.helperRunning) return <Badge variant="destructive">Helper offline</Badge>
  if (!status.connected) return <Badge variant="secondary">Keyboard not connected</Badge>
  const model = status.modelName ?? `F75 (model 0x${(status.modelId ?? 0).toString(16).toUpperCase()})`
  return (
    <Badge className="bg-emerald-500/15 text-emerald-300">
      <span className="size-1.5 rounded-full bg-emerald-400" />
      {model} · fw 0x{(status.info?.firmwareVersion ?? 0).toString(16)}
    </Badge>
  )
}

export function App() {
  const status = useDeviceStatus()
  const { preferences, updatePreferences } = usePreferences()
  const connected = !!status?.connected

  if (!preferences.onboarded) return <Onboarding onDone={() => updatePreferences({ onboarded: true })} />

  return (
    <Tabs defaultValue="lighting" className="h-screen gap-0">
      <header className="drag-region flex h-14 shrink-0 items-center justify-between border-b pr-4 pl-24">
        <div className="flex items-center gap-2 font-semibold">
          <Keyboard className="size-5" />
          AULA F75 Mac Driver
        </div>
        <TabsList>
          <TabsTrigger value="lighting">
            <Lightbulb /> Lighting
          </TabsTrigger>
          <TabsTrigger value="led-check">
            <ScanSearch /> Layout
          </TabsTrigger>
          <TabsTrigger value="lab">
            <Microscope /> Protocol lab
          </TabsTrigger>
        </TabsList>
        <StatusBadge status={status} />
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        {status?.error && (
          <Card className="border-destructive/50 mb-6 py-4">
            <CardHeader>
              <CardTitle className="text-destructive">Problem talking to the keyboard</CardTitle>
              <CardDescription>{status.error}</CardDescription>
            </CardHeader>
          </Card>
        )}
        <TabsContent value="lighting">
          <LightingPage connected={connected} />
        </TabsContent>
        <TabsContent value="led-check">
          <LedCheckPage connected={connected} />
        </TabsContent>
        <TabsContent value="lab">
          <ProtocolLabPage connected={connected} />
        </TabsContent>
      </main>
    </Tabs>
  )
}
