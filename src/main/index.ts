import { app, BrowserWindow, globalShortcut, ipcMain, shell, systemPreferences } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { HelperClient } from './helper'
import { isAnimated, renderFrame } from '@shared/effects'
import { LED_SLOTS } from '@shared/layout'
import {
  DEFAULT_LIGHTING,
  DEFAULT_PREFERENCES,
  type DeviceInfo,
  type DeviceStatus,
  type LightingState,
  type MacroErrors,
  type Preferences,
  type RGB,
} from '@shared/types'

const helperPath = app.isPackaged
  ? join(process.resourcesPath, 'f75-helper')
  : join(app.getAppPath(), 'native/f75-helper/.build/release/f75-helper')

const lightingPath = join(app.getPath('userData'), 'lighting.json')
const preferencesPath = join(app.getPath('userData'), 'preferences.json')

function readJson<T extends object>(path: string, defaults: T): T {
  try {
    return { ...defaults, ...JSON.parse(readFileSync(path, 'utf8')) }
  } catch {
    return { ...defaults }
  }
}

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(value, null, 2))
}

const loadLighting = () => readJson(lightingPath, DEFAULT_LIGHTING)
const saveLighting = (state: LightingState) => writeJson(lightingPath, state)

let preferences: Preferences = readJson(preferencesPath, DEFAULT_PREFERENCES)

const helper = new HelperClient(helperPath)
let window: BrowserWindow | null = null
let lighting = loadLighting()
let identifyingLed: number | null = null
let animationTimer: NodeJS.Timeout | null = null
let frameInFlight = false
const startedAt = Date.now()
let audioBands: number[] = []
let audioRunning = false

let status: DeviceStatus = {
  helperRunning: false,
  connected: false,
  info: null,
  modelId: null,
  modelName: null,
  error: null,
}

function publishStatus(patch: Partial<DeviceStatus>) {
  status = { ...status, ...patch }
  window?.webContents.send('f75:status', status)
}

async function refreshDevice() {
  try {
    const s = await helper.call<{ connected: boolean; info: DeviceInfo | null }>('status')
    if (!s.connected) {
      publishStatus({ connected: false, info: null, modelId: null, modelName: null, error: null })
      return
    }
    const id = await helper.call<{ modelId: number; modelName: string | null }>('identify')
    publishStatus({ connected: true, info: s.info, modelId: id.modelId, modelName: id.modelName, error: null })
    applyLighting()
  } catch (err) {
    publishStatus({ error: (err as Error).message })
  }
}

async function sendFrame(frame: RGB[]) {
  if (frameInFlight || !status.connected) return
  frameInFlight = true
  try {
    await helper.call('setDirect', { colors: frame })
  } catch (err) {
    publishStatus({ error: (err as Error).message })
  } finally {
    frameInFlight = false
  }
}

function stopAnimation() {
  if (animationTimer) clearInterval(animationTimer)
  animationTimer = null
}

function syncAudio() {
  const wanted = lighting.effect === 'music' && identifyingLed === null
  if (wanted === audioRunning) return
  audioRunning = wanted
  if (!wanted) {
    audioBands = []
    if (status.error?.includes('audio')) publishStatus({ error: null })
  }
  void helper.call(wanted ? 'startAudio' : 'stopAudio').catch(() => {})
}

function applyLighting() {
  stopAnimation()
  syncAudio()
  if (!status.connected) return

  if (identifyingLed !== null) {
    const frame: RGB[] = Array.from({ length: LED_SLOTS }, () => [0, 0, 0])
    frame[identifyingLed] = [255, 255, 255]
    void sendFrame(frame)
    return
  }

  if (lighting.effect === 'hardware') {
    void helper.call('stopDirect').catch(() => {})
    return
  }

  const tick = () => void sendFrame(renderFrame(lighting, (Date.now() - startedAt) / 1000, audioBands))
  tick()
  // Faster than ~21 FPS starves the keyboard's key scanning (dropped/doubled keypresses);
  // the radio link needs about twice the gap.
  if (isAnimated(lighting)) animationTimer = setInterval(tick, status.info?.transport === 'wireless' ? 95 : 50)
}

function startHelper() {
  if (!existsSync(helperPath)) {
    publishStatus({ error: `Swift helper not found at ${helperPath}. Run "bun run build:helper".` })
    return
  }
  helper.start()
  publishStatus({ helperRunning: true })
}

helper.on('ready', () => void refreshDevice())
helper.on('connection', () => void refreshDevice())
helper.on('failed', (err: Error) => publishStatus({ helperRunning: false, error: err.message }))
helper.on('audio', (msg: { bands: number[] }) => {
  audioBands = msg.bands
  window?.webContents.send('f75:audio', audioBands)
})
helper.on('audioError', (msg: { message: string }) => {
  audioRunning = false
  publishStatus({ error: msg.message })
})
helper.on('exit', () => {
  stopAnimation()
  audioRunning = false
  publishStatus({ helperRunning: false, connected: false })
  setTimeout(startHelper, 2000)
})

ipcMain.handle('f75:getStatus', () => status)
ipcMain.handle('f75:getLighting', () => lighting)
ipcMain.handle('f75:setLighting', (_e, next: LightingState) => {
  lighting = next
  saveLighting(lighting)
  applyLighting()
})
ipcMain.handle('f75:identifyLed', (_e, led: number | null) => {
  identifyingLed = led
  applyLighting()
})
let macroErrors: MacroErrors = {}

function runMacro(id: string) {
  const macro = preferences.macros.find((m) => m.id === id)
  if (!macro) return
  if (!systemPreferences.isTrustedAccessibilityClient(false)) {
    macroErrors = { ...macroErrors, [id]: 'Allow Accessibility access so macros can type for you.' }
    window?.webContents.send('f75:macroErrors', macroErrors)
    return
  }
  void helper.call('typeText', { text: macro.text, pressEnter: macro.pressEnter }).catch(() => {})
}

function registerMacros() {
  globalShortcut.unregisterAll()
  macroErrors = {}
  for (const macro of preferences.macros) {
    if (!macro.enabled || !macro.accelerator || !macro.text) continue
    try {
      if (!globalShortcut.register(macro.accelerator, () => runMacro(macro.id))) {
        macroErrors[macro.id] = 'This shortcut is already used by macOS, another app, or another macro.'
      }
    } catch {
      macroErrors[macro.id] = 'This shortcut is not supported.'
    }
  }
  window?.webContents.send('f75:macroErrors', macroErrors)
}

ipcMain.handle('f75:getPreferences', () => preferences)
ipcMain.handle('f75:setPreferences', (_e, patch: Partial<Preferences>) => {
  preferences = { ...preferences, ...patch }
  writeJson(preferencesPath, preferences)
  if (patch.macros) registerMacros()
  return preferences
})
ipcMain.handle('f75:getMacroErrors', () => macroErrors)
ipcMain.handle('f75:suspendMacros', () => globalShortcut.unregisterAll())
ipcMain.handle('f75:resumeMacros', () => registerMacros())
ipcMain.handle('f75:hasAccessibility', () => systemPreferences.isTrustedAccessibilityClient(false))
ipcMain.handle('f75:requestAccessibility', () => systemPreferences.isTrustedAccessibilityClient(true))
ipcMain.handle('f75:rawRead', async (_e, args: number[]) => {
  const r = await helper.call<{ raw: string }>('read', { args })
  return r.raw
})
ipcMain.handle('f75:readOnboard', async () => {
  const r = await helper.call<{ bytes: number[] }>('readConfig')
  return r.bytes
})
ipcMain.handle('f75:writeOnboard', async (_e, changes: [number, number][]) => {
  if (lighting.effect !== 'hardware') {
    lighting = { ...lighting, effect: 'hardware' }
    saveLighting(lighting)
    applyLighting()
  }
  const r = await helper.call<{ bytes: number[] }>('patchConfig', { changes })
  return r.bytes
})

function createWindow() {
  window = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 980,
    minHeight: 640,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#09090b',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })
  window.on('closed', () => (window = null))
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void window.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  startHelper()
  createWindow()
  registerMacros()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Keep running with the window closed so software effects stay alive.
app.on('window-all-closed', () => {})

app.on('before-quit', () => {
  globalShortcut.unregisterAll()
  stopAnimation()
  helper.removeAllListeners('exit')
  helper.stop()
})
