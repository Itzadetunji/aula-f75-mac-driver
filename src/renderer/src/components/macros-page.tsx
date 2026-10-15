import { useEffect, useRef, useState } from 'react'
import { Download, Keyboard, Plus, ShieldAlert, Trash2, Upload } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  exportMacros,
  formatAccelerator,
  keyFromCode,
  parseMacroFile,
  toAccelerator,
  validateShortcut,
  type Macro,
} from '@shared/macros'
import type { MacroErrors } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { usePreferences } from '@/hooks/use-layout'
import { cn, errorText } from '@/lib/utils'

function Keys({ parts, muted }: { parts: string[]; muted?: boolean }) {
  return (
    <span className="flex items-center gap-1">
      {parts.map((part, i) => (
        <kbd
          key={i}
          className={cn(
            'bg-muted min-w-6 rounded border px-1.5 py-0.5 text-center font-sans text-xs font-medium',
            muted && 'text-muted-foreground',
          )}
        >
          {part}
        </kbd>
      ))}
    </span>
  )
}

function ShortcutRecorder({ value, onChange }: { value: string; onChange: (accelerator: string) => void }) {
  const { t } = useTranslation()
  const [recording, setRecording] = useState(false)
  const [held, setHeld] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!recording) return
    void window.f75.suspendMacros()

    const modifiersOf = (e: KeyboardEvent) =>
      [e.metaKey && '⌘', e.ctrlKey && '⌃', e.altKey && '⌥', e.shiftKey && '⇧'].filter(Boolean) as string[]

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const key = keyFromCode(e.code)
      const noModifiers = !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey
      if (e.code === 'Escape' && noModifiers) return setRecording(false)
      if (!key) return setHeld(modifiersOf(e))

      const parts = { command: e.metaKey, control: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, key }
      const problem = validateShortcut(parts)
      if (problem) {
        setError(problem)
        return
      }
      onChangeRef.current(toAccelerator(parts))
      setRecording(false)
    }
    const onKeyUp = (e: KeyboardEvent) => setHeld(modifiersOf(e))
    const cancel = () => setRecording(false)

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    window.addEventListener('blur', cancel)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
      window.removeEventListener('blur', cancel)
      setHeld([])
      void window.f75.resumeMacros()
    }
  }, [recording])

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => {
          setError(null)
          setRecording((r) => !r)
        }}
        className={cn(
          'border-input dark:bg-input/30 hover:bg-accent flex h-9 w-full items-center gap-2 rounded-md border px-3 text-sm transition-colors',
          recording && 'border-primary ring-ring/50 ring-[3px]',
        )}
      >
        <Keyboard className="text-muted-foreground size-4" />
        {recording ? (
          held.length ? (
            <Keys parts={[...held, '…']} />
          ) : (
            <span className="text-muted-foreground">{t('macros.recordPrompt')}</span>
          )
        ) : value ? (
          <Keys parts={formatAccelerator(value)} />
        ) : (
          <span className="text-muted-foreground">{t('macros.recordIdle')}</span>
        )}
      </button>
      {error && recording && <p className="text-destructive text-xs">{t(error)}</p>}
    </div>
  )
}

function MacroCard({
  macro,
  error,
  onChange,
  onDelete,
}: {
  macro: Macro
  error?: string
  onChange: (patch: Partial<Macro>) => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  return (
    <Card className={cn('gap-4', !macro.enabled && 'opacity-60')}>
      <CardHeader className="flex items-center justify-between">
        <Input
          value={macro.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder={t('macros.namePlaceholder')}
          className="h-8 max-w-xs border-transparent bg-transparent px-1 font-semibold shadow-none dark:bg-transparent"
        />
        <div className="flex items-center gap-3">
          <Label className="text-muted-foreground text-xs">
            {t('macros.enabled')}
            <Switch checked={macro.enabled} onCheckedChange={(enabled) => onChange({ enabled })} />
          </Label>
          <Button variant="ghost" size="icon" onClick={onDelete} aria-label={t('macros.delete')}>
            <Trash2 />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label>{t('macros.shortcut')}</Label>
          <ShortcutRecorder value={macro.accelerator} onChange={(accelerator) => onChange({ accelerator })} />
        </div>
        <div className="flex flex-col gap-2">
          <Label>{t('macros.typesThis')}</Label>
          <Textarea
            value={macro.text}
            onChange={(e) => onChange({ text: e.target.value })}
            placeholder={t('macros.textPlaceholder')}
            className="max-h-48"
          />
        </div>
        <Label className="text-muted-foreground text-xs font-normal">
          <Switch checked={macro.pressEnter} onCheckedChange={(pressEnter) => onChange({ pressEnter })} />
          {t('macros.pressEnter')}
        </Label>
        {error && <p className="text-destructive text-sm">{t(error)}</p>}
      </CardContent>
    </Card>
  )
}

export function MacrosPage() {
  const { t } = useTranslation()
  const { preferences, updatePreferences } = usePreferences()
  const [errors, setErrors] = useState<MacroErrors>({})
  const [trusted, setTrusted] = useState(true)
  const macros = preferences.macros

  useEffect(() => {
    void window.f75.getMacroErrors().then(setErrors)
    return window.f75.onMacroErrors(setErrors)
  }, [])

  useEffect(() => {
    const check = () => void window.f75.hasAccessibility().then(setTrusted)
    check()
    const timer = window.setInterval(check, 2000)
    return () => window.clearInterval(timer)
  }, [])

  const fileInput = useRef<HTMLInputElement>(null)
  const [importNote, setImportNote] = useState<{ ok: boolean; text: string } | null>(null)

  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return
    const imported: Macro[] = []
    const problems: string[] = []
    for (const file of files) {
      try {
        imported.push(...parseMacroFile(file.name, await file.text()))
      } catch (err) {
        problems.push(errorText(err, t))
      }
    }
    // A shortcut can only trigger one macro; clashing imports keep their text and need a new shortcut.
    const used = new Set(macros.map((m) => m.accelerator).filter(Boolean))
    let cleared = 0
    for (const macro of imported) {
      if (!macro.accelerator) continue
      if (used.has(macro.accelerator)) {
        macro.accelerator = ''
        cleared++
      } else {
        used.add(macro.accelerator)
      }
    }
    if (imported.length) save([...macros, ...imported])

    const parts = []
    if (imported.length) parts.push(t('macros.imported', { count: imported.length }))
    if (cleared) parts.push(t('macros.clashes', { count: cleared }))
    parts.push(...problems)
    setImportNote({ ok: problems.length === 0, text: parts.join(' ') })
  }

  const exportFile = () => {
    const url = URL.createObjectURL(new Blob([exportMacros(macros)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'f75-macros.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  const save = (next: Macro[]) => updatePreferences({ macros: next })
  const change = (id: string, patch: Partial<Macro>) => save(macros.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  const add = () =>
    save([
      ...macros,
      { id: crypto.randomUUID(), name: t('macros.defaultName', { number: macros.length + 1 }), accelerator: '', text: '', pressEnter: false, enabled: true },
    ])

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">{t('macros.title')}</h2>
          <p className="text-muted-foreground text-sm">{t('macros.description')}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            multiple
            accept=".json,.txt,.md,text/plain,application/json"
            className="hidden"
            onChange={(e) => {
              void importFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <Button variant="outline" onClick={() => fileInput.current?.click()}>
            <Upload /> {t('macros.import')}
          </Button>
          {macros.length > 0 && (
            <Button variant="outline" onClick={exportFile}>
              <Download /> {t('macros.export')}
            </Button>
          )}
          <Button onClick={add}>
            <Plus /> {t('macros.new')}
          </Button>
        </div>
      </div>

      {importNote && (
        <p className={cn('-mt-3 text-sm', importNote.ok ? 'text-muted-foreground' : 'text-destructive')}>
          {importNote.text}
        </p>
      )}

      {!trusted && (
        <Card className="border-amber-500/40 py-4">
          <CardContent className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <ShieldAlert className="size-5 shrink-0 text-amber-400" />
              <div>
                <div className="text-sm font-medium">{t('macros.accessibility.title')}</div>
                <div className="text-muted-foreground text-xs">{t('macros.accessibility.description')}</div>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => void window.f75.requestAccessibility()}>
              {t('macros.accessibility.allow')}
            </Button>
          </CardContent>
        </Card>
      )}

      {macros.length === 0 ? (
        <Card className="items-center py-12 text-center">
          <CardHeader className="w-full">
            <CardTitle>{t('macros.empty.title')}</CardTitle>
            <CardDescription>{t('macros.empty.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="secondary" onClick={add}>
              <Plus /> {t('macros.new')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        macros.map((macro) => (
          <MacroCard
            key={macro.id}
            macro={macro}
            error={errors[macro.id]}
            onChange={(patch) => change(macro.id, patch)}
            onDelete={() => save(macros.filter((m) => m.id !== macro.id))}
          />
        ))
      )}

      <p className="text-muted-foreground text-center text-xs">
        {t(preferences.running ? 'macros.footer' : 'macros.pausedFooter')}
      </p>
    </div>
  )
}
