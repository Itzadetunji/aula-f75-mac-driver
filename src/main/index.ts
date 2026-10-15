import { app, BrowserWindow, globalShortcut, ipcMain, shell, systemPreferences } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { HelperClient } from './helper'
import { isAnimated, MusicMeter, MUSIC_STYLES, renderFrame } from '@shared/effects'
import { isLanguage, translate } from '@shared/i18n'
import { DEBOUNCE_OFFSET, SLEEP_OFFSET } from '@shared/keyboard-settings'
import { LED_SLOTS } from '@shared/layout'
import {
  DEFAULT_LIGHTING,
  DEFAULT_PREFERENCES,
  type DeviceInfo,
  type DeviceStatus,
  type EffectId,
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

function loadLighting(): LightingState {
  const state = readJson(lightingPath, DEFAULT_LIGHTING)
  if (!MUSIC_STYLES.includes(state.musicStyle)) state.musicStyle = DEFAULT_LIGHTING.musicStyle
  return state
}
const saveLighting = (state: LightingState) => writeJson(lightingPath, state)

function loadPreferences(): Preferences {
  const prefs = readJson(preferencesPath, DEFAULT_PREFERENCES)
  if (!isLanguage(prefs.language)) prefs.language = DEFAULT_PREFERENCES.language
  if (prefs.closeAction !== 'quit') prefs.closeAction = 'menubar'
  if (typeof prefs.running !== 'boolean') prefs.running = true
  return prefs
}

let preferences = loadPreferences()

const helper = new HelperClient(helperPath)
let window: BrowserWindow | null = null
let lighting = loadLighting()
let identifyingLed: number | null = null
let animationTimer: NodeJS.Timeout | null = null
let frameInFlight = false
const startedAt = Date.now()
let audioBands: number[] = []
const musicMeter = new MusicMeter()
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
  updateMenu()
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
  if (frameInFlight || !status.connected || !preferences.running) return
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
  const wanted = lighting.effect === 'music' && identifyingLed === null && preferences.running
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

  if (!preferences.running) {
    void helper.call('stopDirect').catch(() => {})
    return
  }

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

  const tick = () => {
    const t = (Date.now() - startedAt) / 1000
    musicMeter.update(audioBands, t)
    void sendFrame(renderFrame(lighting, t, musicMeter))
  }
  tick()
  // Faster than ~21 FPS starves the keyboard's key scanning (dropped/doubled keypresses);
  // the radio link needs a little more room (the helper also skips unchanged frames there).
  if (isAnimated(lighting)) animationTimer = setInterval(tick, status.info?.transport === 'wireless' ? 60 : 50)
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
helper.on('menu', ({ id }: { id: string }) => {
  if (id === 'toggleRunning') setRunning(!preferences.running)
  else if (id === 'open') showWindow()
  else if (id === 'quit') app.quit()
  else if (id.startsWith('effect:')) {
    setLighting({ ...lighting, effect: id.slice('effect:'.length) as EffectId })
    window?.webContents.send('f75:lighting', lighting)
    // Picking a mode from the menu means "show this", so it also resumes.
    if (!preferences.running) setRunning(true)
  }
})
helper.on('exit', () => {
  stopAnimation()
  audioRunning = false
  publishStatus({ helperRunning: false, connected: false })
  setTimeout(startHelper, 2000)
})

ipcMain.handle('f75:getStatus', () => status)
ipcMain.handle('f75:getLighting', () => lighting)
function setLighting(next: LightingState) {
  const effectChanged = next.effect !== lighting.effect
  lighting = next
  saveLighting(lighting)
  applyLighting()
  if (effectChanged) updateMenu()
}

/** Pausing hands the keyboard back to its own effect and switches macros off. */
function setRunning(running: boolean) {
  preferences = { ...preferences, running }
  writeJson(preferencesPath, preferences)
  window?.webContents.send('f75:preferences', preferences)
  applyLighting()
  registerMacros()
  updateMenu()
}

const MENU_EFFECTS: { id: EffectId; symbol: string }[] = [
  { id: 'hardware', symbol: 'cpu' },
  { id: 'static', symbol: 'sun.max' },
  { id: 'breathing', symbol: 'wind' },
  { id: 'spectrum', symbol: 'sparkles' },
  { id: 'wave', symbol: 'water.waves' },
  { id: 'music', symbol: 'music.note' },
  { id: 'custom', symbol: 'paintbrush' },
  { id: 'off', symbol: 'power' },
]

/** The menu bar icon is drawn by the helper; this sends it the current menu. */
function updateMenu() {
  if (!status.helperRunning) return
  const t = (key: string) => translate(preferences.language, key)
  const connection = !status.connected
    ? 'menu.disconnected'
    : status.info?.transport === 'wireless'
      ? 'menu.connectedWireless'
      : 'menu.connectedWired'
  const items = [
    { type: 'header', title: t(connection) },
    {
      id: 'toggleRunning',
      title: t(preferences.running ? 'menu.pause' : 'menu.resume'),
      symbol: preferences.running ? 'pause.fill' : 'play.fill',
    },
    { type: 'separator' },
    { type: 'header', title: t('menu.lighting') },
    ...MENU_EFFECTS.map(({ id, symbol }) => ({
      id: `effect:${id}`,
      title: t(`effects.${id}.label`),
      symbol,
      checked: lighting.effect === id,
    })),
    { type: 'separator' },
    { id: 'open', title: t('menu.open'), symbol: 'macwindow' },
    { id: 'quit', title: t('menu.quit'), key: 'q' },
  ]
  void helper
    .call('setMenu', {
      icon: preferences.running ? 'keyboard' : 'keyboard.badge.ellipsis',
      tooltip: t('app.title'),
      items,
    })
    .catch(() => {})
}

ipcMain.handle('f75:setLighting', (_e, next: LightingState) => setLighting(next))
ipcMain.handle('f75:identifyLed', (_e, led: number | null) => {
  identifyingLed = led
  applyLighting()
})
let macroErrors: MacroErrors = {}

function runMacro(id: string) {
  const macro = preferences.macros.find((m) => m.id === id)
  if (!macro) return
  if (!systemPreferences.isTrustedAccessibilityClient(false)) {
    macroErrors = { ...macroErrors, [id]: 'macros.errors.accessibility' }
    window?.webContents.send('f75:macroErrors', macroErrors)
    return
  }
  void helper.call('typeText', { text: macro.text, pressEnter: macro.pressEnter }).catch(() => {})
}

function registerMacros() {
  globalShortcut.unregisterAll()
  macroErrors = {}
  for (const macro of preferences.running ? preferences.macros : []) {
    if (!macro.enabled || !macro.accelerator || !macro.text) continue
    try {
      if (!globalShortcut.register(macro.accelerator, () => runMacro(macro.id))) {
        macroErrors[macro.id] = 'macros.errors.taken'
      }
    } catch {
      macroErrors[macro.id] = 'macros.errors.unsupported'
    }
  }
  window?.webContents.send('f75:macroErrors', macroErrors)
}

ipcMain.handle('f75:getPreferences', () => preferences)
ipcMain.handle('f75:setPreferences', (_e, patch: Partial<Preferences>) => {
  preferences = { ...preferences, ...patch }
  writeJson(preferencesPath, preferences)
  if (patch.running !== undefined) applyLighting()
  if (patch.macros || patch.running !== undefined) registerMacros()
  if (patch.language || patch.running !== undefined) updateMenu()
  return preferences
})
ipcMain.handle('f75:getAppVersion', () => app.getVersion())
ipcMain.handle('f75:getMacroErrors', () => macroErrors)
ipcMain.handle('f75:suspendMacros', () => globalShortcut.unregisterAll())
ipcMain.handle('f75:resumeMacros', () => registerMacros())
ipcMain.handle('f75:hasAccessibility', () => systemPreferences.isTrustedAccessibilityClient(false))
ipcMain.handle('f75:requestAccessibility', () => systemPreferences.isTrustedAccessibilityClient(true))
ipcMain.handle('f75:rawRead', async (_e, args: number[]) => {
  requireRunning()
  const r = await helper.call<{ raw: string }>('read', { args })
  return r.raw
})
ipcMain.handle('f75:readOnboard', async () => {
  requireRunning()
  const r = await helper.call<{ bytes: number[] }>('readConfig')
  return r.bytes
})
/** While paused the app must not touch the keyboard at all. */
function requireRunning() {
  if (!preferences.running) throw new Error(translate(preferences.language, 'app.paused.blocked'))
}

ipcMain.handle('f75:writeOnboard', async (_e, changes: [number, number][]) => {
  requireRunning()
  if (lighting.effect !== 'hardware') setLighting({ ...lighting, effect: 'hardware' })
  const r = await helper.call<{ bytes: number[] }>('patchConfig', { changes })
  return r.bytes
})
ipcMain.handle('f75:writeKeyboardSettings', async (_e, changes: [number, number][]) => {
  requireRunning()
  const allowed = [SLEEP_OFFSET, DEBOUNCE_OFFSET]
  if (!changes.every(([offset]) => allowed.includes(offset))) throw new Error('Not a keyboard setting')
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
  window.on('closed', () => {
    window = null
    if (preferences.closeAction === 'quit') app.quit()
    else app.dock?.hide()
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void window.loadFile(join(__dirname, '../renderer/index.html'))
}

function showWindow() {
  void app.dock?.show()
  if (window) window.show()
  else createWindow()
  app.focus({ steal: true })
}

app.whenReady().then(() => {
  startHelper()
  createWindow()
  registerMacros()
  app.on('activate', showWindow)
})

// Keep running with the window closed (menu bar mode) so lighting and macros stay alive.
app.on('window-all-closed', () => {})

app.on('before-quit', () => {
  globalShortcut.unregisterAll()
  stopAnimation()
  helper.removeAllListeners('exit')
  helper.stop()
})
