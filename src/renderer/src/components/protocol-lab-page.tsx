import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface Capture {
  args: string
  raw: string
  at: string
}

const parseArgs = (text: string) =>
  text
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((b) => parseInt(b, 16) & 0xff)

function HexDump({ raw, previous }: { raw: string; previous?: string }) {
  const bytes = raw.match(/../g) ?? []
  const prev = previous?.match(/../g) ?? []
  const rows: string[][] = []
  for (let i = 0; i < bytes.length; i += 16) rows.push(bytes.slice(i, i + 16))
  return (
    <div className="font-mono text-xs leading-5">
      {rows.map((row, r) => (
        <div key={r} className="flex gap-3">
          <span className="text-muted-foreground w-10">{(r * 16).toString(16).padStart(4, '0')}</span>
          <span className="flex gap-1.5">
            {row.map((b, i) => {
              const at = r * 16 + i
              const changed = prev.length > 0 && prev[at] !== b
              return (
                <span key={i} className={cn(b === '00' && 'text-zinc-600', changed && 'rounded bg-amber-500/30 text-amber-200')}>
                  {b}
                </span>
              )
            })}
          </span>
        </div>
      ))}
    </div>
  )
}

export function ProtocolLabPage({ connected }: { connected: boolean }) {
  const { t } = useTranslation()
  const [args, setArgs] = useState('01 00 01 00 06')
  const [captures, setCaptures] = useState<Capture[]>([])
  const [error, setError] = useState<string | null>(null)

  const read = async () => {
    setError(null)
    try {
      const raw = await window.f75.rawRead(parseArgs(args))
      setCaptures((c) => [{ args, raw, at: new Date().toLocaleTimeString() }, ...c].slice(0, 20))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('lab.title')}</CardTitle>
          <CardDescription>
            <Trans i18nKey="lab.description" components={{ code: <code className="font-mono" /> }} />
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input value={args} onChange={(e) => setArgs(e.target.value)} className="font-mono" placeholder={t('lab.placeholder')} />
          <Button disabled={!connected} onClick={read}>
            {t('lab.read')}
          </Button>
        </CardContent>
        {error && <CardContent className="text-destructive text-sm">{error}</CardContent>}
      </Card>

      {captures.map((c, i) => (
        <Card key={captures.length - i} className="gap-3 py-4">
          <CardHeader>
            <CardTitle className="font-mono text-sm">
              82 {c.args} <span className="text-muted-foreground font-sans font-normal">· {c.at}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <HexDump raw={c.raw} previous={captures.slice(i + 1).find((p) => p.args === c.args)?.raw} />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
